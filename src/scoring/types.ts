// ============================================================
// SAFELY — Shared Type Contracts
// Lock these in first. All 4 devs import from this file.
// ============================================================

export interface ExtractedFeatures {
  // --- Domain / URL signals ---
  domain: string;
  fullUrl: string;
  isIPAddressURL: boolean;              // IP_ADDRESS_URL
  hasPunycode: boolean;                 // PUNYCODE_DETECTION
  hasNonStandardPort: boolean;          // NON_STANDARD_PORT
  isLongUrlPath: boolean;               // LONG_URL_PATH (>75 chars)
  hasSensitiveKeywordInDomain: boolean; // SENSITIVE_KEYWORD_DOMAIN

  // --- HTTPS ---
  httpsEnabled: boolean;                // HTTPS_MISSING (inverted: false = flag)

  // --- Form / field signals ---
  hasActionDomainMismatch: boolean;     // ACTION_DOMAIN_MISMATCH
  hasHiddenSensitiveField: boolean;     // HIDDEN_SENSITIVE_FIELD

  // --- Page behavior signals ---
  deadLinkRatio: number;                // DEAD_LINK_RATIO (0.0–1.0, flag if >0.6)
  hasNoRightClickScript: boolean;       // NO_RIGHT_CLICK_SCRIPT

  // --- Visual signals ---
  hasFaviconMismatch: boolean;          // FAVICON_MISMATCH
}

export interface RiskAssessment {
  verdict: "SAFE" | "SUSPICIOUS" | "HIGH RISK";
  score: number;
  reasons: string[];           // max 3, plain English
  action: string;              // one clear instruction sentence
  triggeredSignals: SignalKey[];
}

// Every rule ID — used as keys across weight/reason/action maps
export type SignalKey =
  | "ACTION_DOMAIN_MISMATCH"
  | "HIDDEN_SENSITIVE_FIELD"
  | "IP_ADDRESS_URL"
  | "SENSITIVE_KEYWORD_DOMAIN"
  | "PUNYCODE_DETECTION"
  | "HTTPS_MISSING"
  | "NON_STANDARD_PORT"
  | "DEAD_LINK_RATIO"
  | "FAVICON_MISMATCH"
  | "LONG_URL_PATH"
  | "NO_RIGHT_CLICK_SCRIPT";
