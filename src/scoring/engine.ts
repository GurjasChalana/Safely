import type { ExtractedFeatures, RiskAssessment, SignalKey } from "./types";

// ── Weights ──────────────────────────────────────────────────
const SIGNAL_WEIGHTS: Record<SignalKey, number> = {
  ACTION_DOMAIN_MISMATCH:   35,
  HIDDEN_SENSITIVE_FIELD:   35,
  IP_ADDRESS_URL:           30,
  SENSITIVE_KEYWORD_DOMAIN: 25,
  PUNYCODE_DETECTION:       25,
  HTTPS_MISSING:            20,
  NON_STANDARD_PORT:        20,
  DEAD_LINK_RATIO:          15,
  FAVICON_MISMATCH:         15,
  NO_RIGHT_CLICK_SCRIPT:    15,
  LONG_URL_PATH:            10,
};

const MAX_POSSIBLE_SCORE   = 245; // sum of all weights — used for normalization
const THRESHOLD_SAFE       = 30;  // 0–30  → SAFE
const THRESHOLD_SUSPICIOUS = 59;  // 31–59 → SUSPICIOUS
                                   // 60+   → HIGH RISK

// ── Plain-English reasons ─────────────────────────────────────
const SIGNAL_REASONS: Record<SignalKey, string> = {
  ACTION_DOMAIN_MISMATCH:
    "This page would send your password to a completely different website",
  HIDDEN_SENSITIVE_FIELD:
    "This page has a hidden field designed to secretly capture what you type",
  IP_ADDRESS_URL:
    "This page is hosted on a raw number address, not a real website name",
  SENSITIVE_KEYWORD_DOMAIN:
    "This page is pretending to be a bank or trusted service but the web address is fake",
  PUNYCODE_DETECTION:
    "This web address uses trick characters to look like a site you trust",
  HTTPS_MISSING:
    "This page is not secure — your information could be seen by others",
  NON_STANDARD_PORT:
    "This page is running on an unusual server port, which is a sign of a scam site",
  DEAD_LINK_RATIO:
    "Most links on this page go nowhere — it is a fake copy of a real site",
  FAVICON_MISMATCH:
    "This page is using the logo of a trusted brand but is not that brand's website",
  NO_RIGHT_CLICK_SCRIPT:
    "This page is blocking your ability to inspect it, which is a sign it has something to hide",
  LONG_URL_PATH:
    "This web address is unusually long, which is used to hide what site you are really on",
};

// ── Actions ───────────────────────────────────────────────────
const VERDICT_ACTIONS: Record<RiskAssessment["verdict"], string> = {
  "HIGH RISK":  "Do not enter any information. Close this tab immediately.",
  "SUSPICIOUS": "Be careful. Do not enter your password or any personal details.",
  "SAFE":       "This page looks normal. You are good to proceed.",
};

// ============================================================
// SAFELY — Risk Scoring Engine
// Pure, synchronous. Runs in <10ms. No AI, no async, no deps.
// ============================================================

/**
 * Evaluate a set of extracted page features and return a verdict.
 * This is the single entry point Dev 2 and Dev 3 need.
 */
export function scoreFeatures(features: ExtractedFeatures): RiskAssessment {
  const triggeredSignals = detectTriggeredSignals(features);
  const score = calculateScore(triggeredSignals);
  const displayScore = Math.min(Math.round((score / MAX_POSSIBLE_SCORE) * 100), 100);
  const verdict = deriveVerdict(score);
  const reasons = selectTopReasons(triggeredSignals, 3);
  const action = VERDICT_ACTIONS[verdict];

  return { verdict, score, displayScore, reasons, action, triggeredSignals };
}

// ------------------------------------------------------------
// Step 1: Which signals fired?
// Each condition maps exactly to one SignalKey.
// ------------------------------------------------------------
function detectTriggeredSignals(f: ExtractedFeatures): SignalKey[] {
  const triggered: SignalKey[] = [];

  if (f.hasActionDomainMismatch)         triggered.push("ACTION_DOMAIN_MISMATCH");
  if (f.hasHiddenSensitiveField)         triggered.push("HIDDEN_SENSITIVE_FIELD");
  if (f.isIPAddressURL)                  triggered.push("IP_ADDRESS_URL");
  if (f.hasSensitiveKeywordInDomain)     triggered.push("SENSITIVE_KEYWORD_DOMAIN");
  if (f.hasPunycode)                     triggered.push("PUNYCODE_DETECTION");
  if (!f.httpsEnabled)                   triggered.push("HTTPS_MISSING");
  if (f.hasNonStandardPort)             triggered.push("NON_STANDARD_PORT");
  if (f.deadLinkRatio > 0.6)            triggered.push("DEAD_LINK_RATIO");
  if (f.hasFaviconMismatch)             triggered.push("FAVICON_MISMATCH");
  if (f.hasNoRightClickScript)          triggered.push("NO_RIGHT_CLICK_SCRIPT");
  if (f.isLongUrlPath)                  triggered.push("LONG_URL_PATH");

  return triggered;
}

// ------------------------------------------------------------
// Step 2: Sum the weights of every triggered signal
// ------------------------------------------------------------
function calculateScore(triggeredSignals: SignalKey[]): number {
  return triggeredSignals.reduce(
    (total, signal) => total + SIGNAL_WEIGHTS[signal],
    0
  );
}

// ------------------------------------------------------------
// Step 3: Map score to a verdict bucket
// ------------------------------------------------------------
function deriveVerdict(score: number): RiskAssessment["verdict"] {
  if (score <= THRESHOLD_SAFE)       return "SAFE";
  if (score <= THRESHOLD_SUSPICIOUS) return "SUSPICIOUS";
  return "HIGH RISK";
}

// ------------------------------------------------------------
// Step 4: Pick the top N reasons by signal weight (descending)
// so the most important signals surface first in the UI.
// ------------------------------------------------------------
function selectTopReasons(triggeredSignals: SignalKey[], maxReasons: number): string[] {
  const sorted = [...triggeredSignals].sort(
    (a, b) => SIGNAL_WEIGHTS[b] - SIGNAL_WEIGHTS[a]
  );

  return sorted
    .slice(0, maxReasons)
    .map((signal) => SIGNAL_REASONS[signal]);
}
