// ──────────────────────────────────────────────────────
// Safely · scoring/engine.ts
//
// Two-phase phishing detection:
//   1. extractFeatures() — reads live DOM, returns signals
//   2. scoreFeatures()   — weights signals, returns verdict
//
// Both run in the content script context (has DOM access).
// Must stay synchronous and fast (< 15ms combined).
// ──────────────────────────────────────────────────────

import { ExtractedFeatures, RiskAssessment } from './types';

// ── Known brand → real domain mapping ────────────────
// If a brand name appears on-page but the domain isn't
// the real one, it's likely impersonation.
const BRAND_DOMAINS: Record<string, string> = {
  paypal:          'paypal.com',
  amazon:          'amazon.com',
  google:          'google.com',
  microsoft:       'microsoft.com',
  apple:           'apple.com',
  netflix:         'netflix.com',
  facebook:        'facebook.com',
  instagram:       'instagram.com',
  twitter:         'twitter.com',
  chase:           'chase.com',
  wellsfargo:      'wellsfargo.com',
  bankofamerica:   'bankofamerica.com',
  citibank:        'citi.com',
  americanexpress: 'americanexpress.com',
  ebay:            'ebay.com',
  linkedin:        'linkedin.com',
  dropbox:         'dropbox.com',
  icloud:          'icloud.com',
  outlook:         'outlook.com',
  steam:           'steampowered.com',
  coinbase:        'coinbase.com',
  binance:         'binance.com',
  robinhood:       'robinhood.com',
  venmo:           'venmo.com',
  zelle:           'zellepay.com',
  cashapp:         'cash.app',
  usps:            'usps.com',
  fedex:           'fedex.com',
  ups:             'ups.com',
  irs:             'irs.gov',
  socialsecurity:  'ssa.gov',
};

// ── Urgency / pressure language patterns ─────────────
const URGENCY_PATTERNS: RegExp[] = [
  /\burgent\b/i,
  /\bimmediately\b/i,
  /\bact now\b/i,
  /\blimited time\b/i,
  /\bexpir(e|ed|es|ing)\b/i,
  /\bverify (your )?(account|identity|information|email|details)\b/i,
  /\b(account|access).{0,20}(suspend|lock|disable|block)/i,
  /\b(suspend|lock|disable|block).{0,20}(account|access)/i,
  /\bunusual (activity|sign.?in|login|access)\b/i,
  /\bconfirm (your )?(details|information|account|identity|password)\b/i,
  /\byour account (has been|will be|is being)\b/i,
  /\b(click|tap) here (immediately|now|to verify|to confirm)\b/i,
  /\bwithin 24 hours?\b/i,
  /\bfinal (warning|notice|reminder)\b/i,
  /\bsecurity (alert|warning|breach|notice)\b/i,
  /\bunauthorized (access|activity|login|use)\b/i,
  /\bpassword.{0,20}(compromised|leaked|stolen|exposed)\b/i,
  /\bupdate (your )?(payment|billing|credit card|account)\b/i,
  /\byou have (won|been selected|been chosen)\b/i,
  /\bclaim (your )?(prize|reward|gift|refund)\b/i,
  /\byour (package|parcel|delivery).{0,30}(hold|pending|failed)\b/i,
];

// ── Free/abused TLDs commonly used in phishing ───────
const SUSPICIOUS_TLDS = new Set([
  'tk', 'ml', 'ga', 'cf', 'gq',
  'xyz', 'top', 'click', 'link', 'work',
  'date', 'faith', 'review', 'trade', 'stream',
  'science', 'party', 'racing', 'win', 'download',
  'accountant', 'loan', 'bid', 'webcam', 'men',
  'info', 'online', 'site', 'biz', 'website',
  'space', 'pw', 'cc', 'vip', 'live', 'club', 'pro',
]);

// ═══════════════════════════════════════════════════════
// PHASE 1 — Feature extraction
// ═══════════════════════════════════════════════════════

export function extractFeatures(): ExtractedFeatures {
  const domain   = window.location.hostname.toLowerCase().replace(/^www\./, '');
  const pageUrl  = window.location.href;
  const bodyText = document.body?.innerText ?? '';
  const pageSnippet = bodyText.slice(0, 500);

  const inputs   = Array.from(document.querySelectorAll<HTMLInputElement>('input'));
  const allLinks = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href]'));

  // ── Form field signals ────────────────────────────────
  const hasPasswordField = inputs.some(i =>
    i.type === 'password' ||
    /\b(password|passwd|pass)\b/i.test(`${i.name} ${i.id} ${i.placeholder}`)
  );

  const hasOTPField = inputs.some(i => {
    const fingerprint = `${i.name} ${i.id} ${i.placeholder} ${i.autocomplete ?? ''}`;
    return /\b(otp|one.?time|verif(y|ication).?code|auth.?code|2fa|mfa|passcode|sms.?code)\b/i
      .test(fingerprint);
  });

  const hasPaymentField =
    inputs.some(i => {
      const fingerprint = `${i.name} ${i.id} ${i.placeholder} ${i.autocomplete ?? ''}`;
      return /\b(card.?number|credit.?card|debit.?card|cvv|cvc|ccv|card.?expir|billing|card.?holder|pan\b)/i
        .test(fingerprint);
    }) ||
    !!document.querySelector(
      '[data-stripe], [data-braintree], iframe[src*="stripe"], iframe[src*="braintree"]'
    );

  // ── Login form ────────────────────────────────────────
  const hasLoginForm =
    hasPasswordField &&
    inputs.some(i =>
      i.type === 'email' ||
      /\b(user(name)?|email|login|account)\b/i.test(`${i.name} ${i.id} ${i.type}`)
    );

  // ── Urgency language ──────────────────────────────────
  const urgencyKeywords = URGENCY_PATTERNS.reduce<string[]>((acc, re) => {
    const m = bodyText.match(re);
    if (m) acc.push(m[0].toLowerCase().slice(0, 60));
    return acc;
  }, []);

  // ── Security signals ──────────────────────────────────
  const httpsEnabled     = window.location.protocol === 'https:';
  const suspiciousDomain  = checkSuspiciousDomain(domain);
  const fakeBrandKeywords = detectFakeBrands(domain, bodyText, document.title);
  const mismatchedLinks   = detectMismatchedLinks(allLinks, domain);
  const excessivePopups   = detectPageTraps();
  const suspiciousPath    = checkSuspiciousPath(pageUrl);

  return {
    domain,
    pageUrl,
    hasPasswordField,
    hasOTPField,
    hasPaymentField,
    urgencyKeywords,
    suspiciousDomain,
    fakeBrandKeywords,
    hasLoginForm,
    httpsEnabled,
    mismatchedLinks,
    excessivePopups,
    suspiciousPath,
    pageSnippet,
  };
}

// ── Domain suspicion heuristics ───────────────────────

function checkSuspiciousDomain(domain: string): boolean {
  const parts = domain.split('.');
  const tld   = parts[parts.length - 1] ?? '';
  const sld   = parts[parts.length - 2] ?? '';

  // Bare IP address
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(domain)) return true;

  // Punycode / IDN homograph attack (xn-- encoded unicode lookalikes)
  if (domain.includes('xn--')) return true;

  // Free/abused TLD
  if (SUSPICIOUS_TLDS.has(tld)) return true;

  // Excessive hyphens in second-level domain (e.g. paypal-secure-login-verify)
  if ((sld.match(/-/g) ?? []).length >= 2) return true;

  // Digit substitution (l33t): paypa1, amaz0n, micr0soft
  if (/[a-z]\d[a-z]/i.test(sld)) return true;

  // Abnormally long SLD — brand name plus junk words
  if (sld.length > 30) return true;

  // Deep subdomain chain: login.secure.paypal.verify.com
  // Allow +1 depth for ccTLD double-suffixes like .co.uk / .com.au
  const isCcTld = tld.length === 2;
  if (parts.length > (isCcTld ? 5 : 4)) return true;

  // Brand in domain but not on the brand's real registrar
  for (const [brand, realDomain] of Object.entries(BRAND_DOMAINS)) {
    const isRealDomain =
      domain === realDomain ||
      domain.endsWith(`.${realDomain}`);

    if (!isRealDomain) {
      // Brand keyword stuffed into domain (e.g. paypal-secure.net)
      if (domain.includes(brand) && brand.length >= 4) return true;

      // Typosquatting: one character away from a known brand SLD
      const brandSld = realDomain.split('.')[0];
      if (
        sld.length >= 4 &&
        Math.abs(sld.length - brandSld.length) <= 2 &&
        levenshtein(sld, brandSld) === 1
      ) return true;
    }
  }

  return false;
}

// ── Brand impersonation on page content ───────────────

// Brands that legitimately appear as SSO buttons on almost every site.
// For these, require 3+ occurrences before flagging — one mention is normal.
const SSO_BRANDS = new Set(['google', 'facebook', 'apple', 'instagram', 'twitter', 'linkedin']);

function detectFakeBrands(domain: string, bodyText: string, title: string): string[] {
  const bodyLower  = bodyText.toLowerCase();
  const titleLower = title.toLowerCase();
  const found: string[] = [];

  for (const [brand, realDomain] of Object.entries(BRAND_DOMAINS)) {
    const onRealDomain =
      domain === realDomain ||
      domain.endsWith(`.${realDomain}`);

    if (onRealDomain) continue;

    const escaped = brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`\\b${escaped}\\b`, 'gi');

    if (SSO_BRANDS.has(brand)) {
      // SSO brands (google, apple etc.) appear legitimately as login buttons —
      // only flag on 3+ combined occurrences (phishing pages repeat them heavily).
      const combined = `${bodyLower} ${titleLower}`;
      if ((combined.match(re) ?? []).length >= 3) found.push(brand);
    } else {
      // For non-SSO brands: a single mention in <title> is a strong signal
      // (phishing pages typically set the brand as the page title once).
      // Also flag on 2+ occurrences anywhere in the page body.
      const inTitle = re.test(titleLower);
      re.lastIndex = 0;
      const bodyCount = (bodyLower.match(re) ?? []).length;
      if (inTitle || bodyCount >= 2) found.push(brand);
    }
  }

  return found;
}

// ── Suspicious URL path segments ─────────────────────
// Phishing pages commonly use paths like /login, /secure,
// /verify, /account to appear legitimate.

const SUSPICIOUS_PATH_RE =
  /\/(login|signin|sign-in|verify|verification|secure|account|update|confirm|validate|auth|webscr|wp-admin|banking|support)\b/i;

function checkSuspiciousPath(url: string): boolean {
  try {
    const path = new URL(url).pathname;
    return SUSPICIOUS_PATH_RE.test(path);
  } catch {
    return false;
  }
}

// ── Mismatched / disguised links ─────────────────────
// Detects links where visible text looks like a URL
// but the actual href points somewhere else.

function detectMismatchedLinks(links: HTMLAnchorElement[], _pageDomain: string): boolean {
  let mismatches = 0;

  for (const a of links) {
    const rawHref = a.href;
    const text    = (a.textContent ?? '').trim();
    if (!rawHref || !text || text.length > 100) continue;

    // Text looks like a URL (has a dot, no spaces, no newlines)
    const textLooksLikeUrl =
      /^https?:\/\//i.test(text) ||
      (/\.[a-z]{2,6}(\/|$)/i.test(text) && !/\s/.test(text));

    if (!textLooksLikeUrl) continue;

    try {
      const hrefHost = new URL(rawHref).hostname.toLowerCase().replace(/^www\./, '');
      const textHost = text
        .replace(/^https?:\/\//i, '')
        .split('/')[0]
        .toLowerCase()
        .replace(/^www\./, '');

      if (hrefHost && textHost && hrefHost !== textHost && !hrefHost.endsWith(`.${textHost}`)) {
        mismatches++;
      }
    } catch {
      // malformed URL — skip
    }
  }

  return mismatches >= 2;
}

// ── Page-trap detection ───────────────────────────────
// Detects beforeunload hooks and excessive iframes used
// to trap users or simulate popups.

function detectPageTraps(): boolean {
  if (window.onbeforeunload !== null) return true;
  if (document.querySelectorAll('iframe').length > 6) return true;
  return false;
}

// ── Levenshtein distance (short strings only) ────────

function levenshtein(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 3) return 99;
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) =>
      i === 0 ? j : j === 0 ? i : 0
    )
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

// ═══════════════════════════════════════════════════════
// PHASE 2 — Scoring engine
// ═══════════════════════════════════════════════════════
//
// Weights:
//   suspicious/lookalike domain:             +35
//   password field on suspicious domain:     +30
//   password field + fake brand:             +25
//   fake brand keyword in content:           +20
//   2+ urgency keywords:                     +20
//   1 urgency keyword:                       +10
//   no HTTPS:                                +15
//   mismatched links:                        +15
//   OTP field:                               +10
//   payment field:                           +10
//   excessive popups / beforeunload traps:   +10
//
// Thresholds:
//   0–30   → SAFE
//   31–59  → SUSPICIOUS
//   60+    → HIGH RISK

export function scoreFeatures(features: ExtractedFeatures): RiskAssessment {
  let score = 0;
  const triggeredSignals: string[] = [];
  const reasons: string[] = [];

  // ── Suspicious domain (+35) ───────────────────────────
  if (features.suspiciousDomain) {
    score += 35;
    triggeredSignals.push('suspiciousDomain');
    reasons.push('The website address looks like it may be impersonating a trusted site.');
  }

  // ── Password on suspicious domain (+30) OR fake brand (+25)
  if (features.hasPasswordField) {
    if (features.suspiciousDomain) {
      score += 30;
      triggeredSignals.push('passwordOnSuspiciousDomain');
      reasons.push('This page is asking for your password on an untrustworthy website.');
    } else if (features.fakeBrandKeywords.length > 0) {
      score += 25;
      triggeredSignals.push('passwordOnFakeBrand');
      const brand = capitalise(features.fakeBrandKeywords[0]);
      reasons.push(`This page is asking for your password while pretending to be ${brand}.`);
    }
  }

  // ── Fake brand impersonation (+20) ───────────────────
  if (features.fakeBrandKeywords.length > 0) {
    score += 20;
    triggeredSignals.push('fakeBrandDetected');
    const brands = features.fakeBrandKeywords.slice(0, 2).map(capitalise).join(' and ');
    if (!reasons.some(r => r.includes('pretending'))) {
      reasons.push(`This page appears to be impersonating ${brands}.`);
    }
  }

  // ── Urgency language (+20 / +10) ─────────────────────
  if (features.urgencyKeywords.length >= 2) {
    score += 20;
    triggeredSignals.push('urgencyLanguage');
    reasons.push('This page uses pressure tactics to make you act quickly.');
  } else if (features.urgencyKeywords.length === 1) {
    score += 10;
    triggeredSignals.push('urgencyLanguage');
  }

  // ── No HTTPS (+15) ────────────────────────────────────
  if (!features.httpsEnabled) {
    score += 15;
    triggeredSignals.push('noHttps');
    reasons.push('Your connection to this page is not encrypted or secure.');
  }

  // ── Mismatched links (+15) ────────────────────────────
  if (features.mismatchedLinks) {
    score += 15;
    triggeredSignals.push('mismatchedLinks');
    reasons.push('Links on this page are disguised to look like trusted websites.');
  }

  // ── OTP field (+10) ───────────────────────────────────
  if (features.hasOTPField) {
    score += 10;
    triggeredSignals.push('otpField');
    if (!reasons.some(r => r.includes('password'))) {
      reasons.push('This page is asking for a one-time verification code.');
    }
  }

  // ── Login form — credential harvesting form (+10) ─────
  // Only score when not already caught by suspicious-domain or fake-brand combos
  // to avoid double-counting. Nudges borderline pages into SUSPICIOUS.
  if (
    features.hasLoginForm &&
    !features.suspiciousDomain &&
    features.fakeBrandKeywords.length === 0
  ) {
    score += 10;
    triggeredSignals.push('loginForm');
    if (!reasons.some(r => r.includes('password'))) {
      reasons.push('This page has a login form that could be collecting your credentials.');
    }
  }

  // ── Suspicious URL path (+10) ─────────────────────────
  if (features.suspiciousPath) {
    score += 10;
    triggeredSignals.push('suspiciousPath');
  }

  // ── Payment field (+10) ───────────────────────────────
  if (features.hasPaymentField) {
    score += 10;
    triggeredSignals.push('paymentField');
    reasons.push('This page is asking for your credit card or payment details.');
  }

  // ── Page traps (+10) ──────────────────────────────────
  if (features.excessivePopups) {
    score += 10;
    triggeredSignals.push('pageTraps');
    reasons.push('This page is trying to prevent you from leaving.');
  }

  // ── Cap and classify ──────────────────────────────────
  score = Math.min(score, 100);

  let verdict: 'SAFE' | 'SUSPICIOUS' | 'HIGH RISK';
  let action: string;

  if (score >= 60) {
    verdict = 'HIGH RISK';
    action  = 'Do not enter any information. Close this tab immediately.';
  } else if (score >= 31) {
    verdict = 'SUSPICIOUS';
    action  = 'Be careful. Do not enter your personal details on this page.';
  } else {
    verdict = 'SAFE';
    action  = 'This page looks safe. You can continue browsing.';
    reasons.length = 0;
  }

  // ── Scoring report ────────────────────────────────────
  const verdictColor =
    verdict === 'HIGH RISK'  ? 'color:#c0392b;font-weight:bold' :
    verdict === 'SUSPICIOUS' ? 'color:#e67e22;font-weight:bold' :
                               'color:#27ae60;font-weight:bold';

  console.groupCollapsed(
    `%c[Safely] ${verdict} — score ${score}/100%c  ${features.domain}`,
    verdictColor,
    'color:#888;font-weight:normal',
  );

  console.log('%cSignal breakdown', 'font-weight:bold;text-decoration:underline');
  console.table([
    { signal: 'Suspicious/lookalike domain',    weight: 35,  triggered: features.suspiciousDomain },
    { signal: 'Password on suspicious domain',  weight: 30,  triggered: features.hasPasswordField && features.suspiciousDomain },
    { signal: 'Password + fake brand',          weight: 25,  triggered: features.hasPasswordField && features.fakeBrandKeywords.length > 0 && !features.suspiciousDomain },
    { signal: 'Fake brand in page content',     weight: 20,  triggered: features.fakeBrandKeywords.length > 0 },
    { signal: 'Urgency language (2+)',          weight: 20,  triggered: features.urgencyKeywords.length >= 2 },
    { signal: 'Urgency language (1)',           weight: 10,  triggered: features.urgencyKeywords.length === 1 },
    { signal: 'No HTTPS',                       weight: 15,  triggered: !features.httpsEnabled },
    { signal: 'Mismatched/disguised links',     weight: 15,  triggered: features.mismatchedLinks },
    { signal: 'OTP field',                      weight: 10,  triggered: features.hasOTPField },
    { signal: 'Login form (no other signals)',  weight: 10,  triggered: features.hasLoginForm && !features.suspiciousDomain && features.fakeBrandKeywords.length === 0 },
    { signal: 'Suspicious URL path',            weight: 10,  triggered: features.suspiciousPath },
    { signal: 'Payment/card field',             weight: 10,  triggered: features.hasPaymentField },
    { signal: 'Page traps (beforeunload)',       weight: 10,  triggered: features.excessivePopups },
  ]);

  if (features.fakeBrandKeywords.length > 0)
    console.log('Fake brands detected:', features.fakeBrandKeywords);
  if (features.urgencyKeywords.length > 0)
    console.log('Urgency phrases matched:', features.urgencyKeywords);

  console.log('%cThresholds:  0–30 SAFE  |  31–59 SUSPICIOUS  |  60+ HIGH RISK', 'color:#888');
  console.groupEnd();

  return {
    verdict,
    score,
    reasons: reasons.slice(0, 3),
    action,
    triggeredSignals,
    domain: features.domain,
  };
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}