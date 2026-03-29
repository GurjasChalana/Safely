// ============================================================
// SAFELY — scoreFeatures.ts
//
// Phase 2: scoreFeatures()
//   Pure, synchronous scoring engine. No DOM access.
//   Takes an ExtractedFeatures object, returns a RiskAssessment.
//   Runs in < 10 ms. No AI, no async, no external deps.
// ============================================================

import type { ExtractedFeatures, RiskAssessment, SignalKey } from './types';

// ── Signal weights ────────────────────────────────────────
const SIGNAL_WEIGHTS: Record<SignalKey, number> = {
  // ── URL / Domain ──
  IP_ADDRESS_URL:                    30,
  PUNYCODE_DETECTION:                25,
  NON_STANDARD_PORT:                 20,
  LONG_URL_PATH:                     10,
  SENSITIVE_KEYWORD_DOMAIN:          25,
  SUBDOMAIN_BRAND_IMPERSONATION:     35,
  URL_CONTAINS_AT_SYMBOL:            30,
  TYPOSQUATTING_DETECTION:           30,
  EXCESSIVE_SUBDOMAINS:              20,
  DOUBLE_SLASH_IN_PATH:              10,
  UNUSUAL_HIGH_RISK_TLD:             15,
  URL_SHORTENER_REDIRECT:            15,
  // ── HTTPS ──
  HTTPS_MISSING:                     20,
  // ── Form / Field ──
  ACTION_DOMAIN_MISMATCH:            35,
  HIDDEN_SENSITIVE_FIELD:            35,
  DATA_URI_FORM_ACTION:              25,
  MULTIPLE_PASSWORD_FIELDS_ON_LOGIN: 10,
  OTP_FIELD:                         10,
  PAYMENT_FIELD:                     10,
  // ── Composite ──
  PASSWORD_ON_SUSPICIOUS_DOMAIN:     35,
  PASSWORD_ON_FAKE_BRAND:            25,
  // ── Page Behavior ──
  DEAD_LINK_RATIO:                   15,
  NO_RIGHT_CLICK_SCRIPT:             15,
  IFRAME_CONTENT_OVERLAY:            25,
  OBFUSCATED_JAVASCRIPT:             15,
  NO_EXTERNAL_LINKS:                 10,
  MISSING_PRIVACY_OR_TERMS_LINK:     10,
  PAGE_TRAPS:                        10,
  MISMATCHED_LINKS:                  15,
  // ── Content ──
  FAKE_BRAND_IN_CONTENT:             20,
  URGENCY_LANGUAGE_HIGH:             20,
  URGENCY_LANGUAGE_LOW:              10,
  // ── Domain Trust ──
  NEWLY_REGISTERED_DOMAIN:           20,
  FREE_HOSTING_IMPERSONATION:        20,
  // ── Visual ──
  FAVICON_MISMATCH:                  15,
  MISMATCHED_PAGE_TITLE_DOMAIN:      20,
};

// Sum of all weights — used to normalize displayScore 0–100
const MAX_POSSIBLE_SCORE = Object.values(SIGNAL_WEIGHTS).reduce((a, b) => a + b, 0);

const THRESHOLD_SAFE       = 30;  // 0–30  → SAFE
const THRESHOLD_SUSPICIOUS = 59;  // 31–59 → SUSPICIOUS
                                   // 60+   → HIGH RISK

// ── Plain-English reasons ─────────────────────────────────
const SIGNAL_REASONS: Record<SignalKey, string> = {
  // ── URL / Domain ──
  IP_ADDRESS_URL:
    'This page is hosted on a raw number address, not a real website name',
  PUNYCODE_DETECTION:
    'This web address uses trick characters to look like a site you trust',
  NON_STANDARD_PORT:
    'This page is running on an unusual server port, which is a sign of a scam site',
  LONG_URL_PATH:
    'This web address is unusually long, which is used to hide what site you are really on',
  SENSITIVE_KEYWORD_DOMAIN:
    'This page is pretending to be a bank or trusted service but the web address is fake',
  SUBDOMAIN_BRAND_IMPERSONATION:
    'This address puts a trusted brand name at the start to trick you — the real destination is different',
  URL_CONTAINS_AT_SYMBOL:
    'This web address contains an @ symbol which is used to disguise the true destination',
  TYPOSQUATTING_DETECTION:
    'This web address is a slight misspelling of a site you trust, designed to fool you',
  EXCESSIVE_SUBDOMAINS:
    'This web address has many layered parts designed to make it look legitimate while hiding the real site',
  DOUBLE_SLASH_IN_PATH:
    'This web address contains a double slash used to disguise the real site you are being sent to',
  UNUSUAL_HIGH_RISK_TLD:
    'This site uses a high-risk domain ending that is commonly associated with scam websites',
  URL_SHORTENER_REDIRECT:
    'This link was disguised using a URL shortener to hide where it actually sends you',
  // ── HTTPS ──
  HTTPS_MISSING:
    'This page is not secure — your information could be seen by others',
  // ── Form / Field ──
  ACTION_DOMAIN_MISMATCH:
    'This page would send your password to a completely different website',
  HIDDEN_SENSITIVE_FIELD:
    'This page has a hidden field designed to secretly capture what you type',
  DATA_URI_FORM_ACTION:
    'This page sends your information using a hidden data channel that bypasses normal security checks',
  MULTIPLE_PASSWORD_FIELDS_ON_LOGIN:
    'This login page asks you to enter your password more than once, which is a credential harvesting tactic',
  OTP_FIELD:
    'This page is asking for a one-time verification code',
  PAYMENT_FIELD:
    'This page is asking for your credit card or payment details',
  // ── Composite ──
  PASSWORD_ON_SUSPICIOUS_DOMAIN:
    'This page is asking for your password on a website that looks suspicious or fake',
  PASSWORD_ON_FAKE_BRAND:
    'This page is asking for your password while pretending to be a brand you trust',
  // ── Page Behavior ──
  DEAD_LINK_RATIO:
    'Most links on this page go nowhere — it is a fake copy of a real site',
  NO_RIGHT_CLICK_SCRIPT:
    'This page is blocking your ability to inspect it, which is a sign it has something to hide',
  IFRAME_CONTENT_OVERLAY:
    'This page has an invisible layer over it that can intercept everything you click or type',
  OBFUSCATED_JAVASCRIPT:
    'This page contains heavily disguised code that is hiding what it is doing in the background',
  NO_EXTERNAL_LINKS:
    'This page has no real outbound links — it is likely a fake shell copied from a real site',
  MISSING_PRIVACY_OR_TERMS_LINK:
    'This page has no privacy policy or terms of service, which all legitimate sites are required to have',
  PAGE_TRAPS:
    'This page is trying to prevent you from leaving',
  MISMATCHED_LINKS:
    'Links on this page are disguised to look like trusted websites',
  // ── Content ──
  FAKE_BRAND_IN_CONTENT:
    'This page is impersonating a trusted brand',
  URGENCY_LANGUAGE_HIGH:
    'This page uses repeated pressure tactics to make you act quickly without thinking',
  URGENCY_LANGUAGE_LOW:
    'This page uses pressure language to make you act quickly',
  // ── Domain Trust ──
  NEWLY_REGISTERED_DOMAIN:
    'This website was created very recently, which is a strong sign of a scam site',
  FREE_HOSTING_IMPERSONATION:
    'This page is impersonating a trusted brand but is hosted on a free website platform',
  // ── Visual ──
  FAVICON_MISMATCH:
    'This page is using the logo of a trusted brand but is not that brand\'s website',
  MISMATCHED_PAGE_TITLE_DOMAIN:
    'This page claims to be a trusted brand in its title but the web address does not match',
};

// ── Verdict actions ───────────────────────────────────────
const VERDICT_ACTIONS: Record<RiskAssessment['verdict'], string> = {
  'HIGH RISK':  'Do not enter any information. Close this tab immediately.',
  'SUSPICIOUS': 'Be careful. Do not enter your password or any personal details.',
  'SAFE':       'This page looks normal. You are good to proceed.',
};

// ============================================================
// PHASE 2 — Scoring Engine
// ============================================================

export function scoreFeatures(features: ExtractedFeatures): RiskAssessment {
  const triggeredSignals = detectTriggeredSignals(features);
  const score            = calculateScore(triggeredSignals);
  const displayScore     = Math.min(Math.round((score / MAX_POSSIBLE_SCORE) * 100), 100);
  const verdict          = deriveVerdict(score);
  const reasons          = selectTopReasons(triggeredSignals, 3);
  const action           = VERDICT_ACTIONS[verdict];

  logToConsole(features, verdict, score, triggeredSignals);

  return {
    verdict,
    score,
    displayScore,
    reasons,
    action,
    triggeredSignals,
    domain: features.domain,
  };
}

// ── Step 1: Detect which signals fired ───────────────────
function detectTriggeredSignals(f: ExtractedFeatures): SignalKey[] {
  const triggered: SignalKey[] = [];

  // ── URL / Domain ──────────────────────────────────────────
  if (f.isIPAddressURL)                  triggered.push('IP_ADDRESS_URL');
  if (f.hasPunycode)                     triggered.push('PUNYCODE_DETECTION');
  if (f.hasNonStandardPort)             triggered.push('NON_STANDARD_PORT');
  if (f.isLongUrlPath)                  triggered.push('LONG_URL_PATH');
  if (f.hasSensitiveKeywordInDomain)    triggered.push('SENSITIVE_KEYWORD_DOMAIN');
  if (f.hasSubdomainBrandImpersonation) triggered.push('SUBDOMAIN_BRAND_IMPERSONATION');
  if (f.hasAtSymbolInUrl)               triggered.push('URL_CONTAINS_AT_SYMBOL');
  if (f.hasTyposquatting)               triggered.push('TYPOSQUATTING_DETECTION');
  if (f.hasExcessiveSubdomains)         triggered.push('EXCESSIVE_SUBDOMAINS');
  if (f.hasDoubleSlashInPath)           triggered.push('DOUBLE_SLASH_IN_PATH');
  if (f.hasUnusualHighRiskTld)          triggered.push('UNUSUAL_HIGH_RISK_TLD');
  if (f.cameViaUrlShortener)            triggered.push('URL_SHORTENER_REDIRECT');

  // ── HTTPS ──────────────────────────────────────────────────
  if (!f.httpsEnabled)                  triggered.push('HTTPS_MISSING');

  // ── Form / Field ───────────────────────────────────────────
  if (f.hasActionDomainMismatch)        triggered.push('ACTION_DOMAIN_MISMATCH');
  if (f.hasHiddenSensitiveField)        triggered.push('HIDDEN_SENSITIVE_FIELD');
  if (f.hasDataUriFormAction)           triggered.push('DATA_URI_FORM_ACTION');
  if (f.hasMultiplePasswordFields)      triggered.push('MULTIPLE_PASSWORD_FIELDS_ON_LOGIN');
  if (f.hasOTPField)                    triggered.push('OTP_FIELD');
  if (f.hasPaymentField)                triggered.push('PAYMENT_FIELD');

  // ── Composite: password field + suspicious context ─────────
  const isSuspiciousDomain =
    f.isIPAddressURL ||
    f.hasTyposquatting ||
    f.hasSubdomainBrandImpersonation ||
    f.hasUnusualHighRiskTld ||
    f.hasSensitiveKeywordInDomain;

  if (f.hasPasswordField && isSuspiciousDomain) {
    triggered.push('PASSWORD_ON_SUSPICIOUS_DOMAIN');
  } else if (f.hasPasswordField && f.fakeBrandKeywords.length > 0) {
    triggered.push('PASSWORD_ON_FAKE_BRAND');
  }

  // ── Page Behavior ──────────────────────────────────────────
  if (f.deadLinkRatio > 0.6)            triggered.push('DEAD_LINK_RATIO');
  if (f.hasNoRightClickScript)          triggered.push('NO_RIGHT_CLICK_SCRIPT');
  if (f.hasIframeOverlay)               triggered.push('IFRAME_CONTENT_OVERLAY');
  if (f.hasObfuscatedJavascript)        triggered.push('OBFUSCATED_JAVASCRIPT');
  if (f.hasNoExternalLinks)             triggered.push('NO_EXTERNAL_LINKS');
  if (f.hasMissingLegalLinks)           triggered.push('MISSING_PRIVACY_OR_TERMS_LINK');
  if (f.hasPageTraps)                   triggered.push('PAGE_TRAPS');
  if (f.hasMismatchedLinks)             triggered.push('MISMATCHED_LINKS');

  // ── Content ────────────────────────────────────────────────
  if (f.fakeBrandKeywords.length > 0)   triggered.push('FAKE_BRAND_IN_CONTENT');
  if (f.urgencyKeywords.length >= 2)    triggered.push('URGENCY_LANGUAGE_HIGH');
  else if (f.urgencyKeywords.length === 1) triggered.push('URGENCY_LANGUAGE_LOW');

  // ── Domain Trust ───────────────────────────────────────────
  if (f.isNewlyRegisteredDomain)        triggered.push('NEWLY_REGISTERED_DOMAIN');
  if (f.isFreeHostingImpersonation)     triggered.push('FREE_HOSTING_IMPERSONATION');

  // ── Visual ─────────────────────────────────────────────────
  if (f.hasFaviconMismatch)             triggered.push('FAVICON_MISMATCH');
  if (f.hasMismatchedPageTitle)         triggered.push('MISMATCHED_PAGE_TITLE_DOMAIN');

  return triggered;
}

// ── Step 2: Sum weights ───────────────────────────────────
function calculateScore(triggeredSignals: SignalKey[]): number {
  return triggeredSignals.reduce(
    (total, signal) => total + SIGNAL_WEIGHTS[signal],
    0
  );
}

// ── Step 3: Map score to verdict ──────────────────────────
function deriveVerdict(score: number): RiskAssessment['verdict'] {
  if (score <= THRESHOLD_SAFE)       return 'SAFE';
  if (score <= THRESHOLD_SUSPICIOUS) return 'SUSPICIOUS';
  return 'HIGH RISK';
}

// ── Step 4: Top N reasons by weight (descending) ─────────
function selectTopReasons(triggeredSignals: SignalKey[], maxReasons: number): string[] {
  return [...triggeredSignals]
    .sort((a, b) => SIGNAL_WEIGHTS[b] - SIGNAL_WEIGHTS[a])
    .slice(0, maxReasons)
    .map(signal => SIGNAL_REASONS[signal]);
}

// ── Console debug report ──────────────────────────────────
function logToConsole(
  features: ExtractedFeatures,
  verdict: RiskAssessment['verdict'],
  score: number,
  triggeredSignals: SignalKey[]
): void {
  const color =
    verdict === 'HIGH RISK'  ? 'color:#c0392b;font-weight:bold' :
    verdict === 'SUSPICIOUS' ? 'color:#e67e22;font-weight:bold' :
                               'color:#27ae60;font-weight:bold';

  console.groupCollapsed(
    `%c[Safely] ${verdict} — score ${score}%c  ${features.domain}`,
    color,
    'color:#888;font-weight:normal',
  );
  console.log('%cTriggered signals', 'font-weight:bold;text-decoration:underline');
  console.table(
    triggeredSignals.map(s => ({ signal: s, weight: SIGNAL_WEIGHTS[s] }))
  );
  if (features.fakeBrandKeywords.length > 0)
    console.log('Fake brands detected:', features.fakeBrandKeywords);
  if (features.urgencyKeywords.length > 0)
    console.log('Urgency phrases matched:', features.urgencyKeywords);
  console.log('%cThresholds:  0–30 SAFE  |  31–59 SUSPICIOUS  |  60+ HIGH RISK', 'color:#888');
  console.groupEnd();
}
