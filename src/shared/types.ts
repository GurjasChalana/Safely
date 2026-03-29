// ──────────────────────────────────────────────────────
// Safely · shared/types.ts
//
// SINGLE SOURCE OF TRUTH for all shared interfaces.
// Every file in this project imports from here.
// Do not redefine these types locally.
// ──────────────────────────────────────────────────────

// Signals extracted from the DOM by the content script.
// Extraction + scoring logic lives in src/scoring/engine.ts
export interface ExtractedFeatures {
  domain: string;
  pageUrl: string;
  hasPasswordField: boolean;
  hasOTPField: boolean;
  hasPaymentField: boolean;
  urgencyKeywords: string[];
  suspiciousDomain: boolean;
  fakeBrandKeywords: string[];
  hasLoginForm: boolean;
  httpsEnabled: boolean;
  mismatchedLinks: boolean;
  excessivePopups: boolean;
  pageSnippet: string; // first 500 chars of body text — sent to Gemini
}

export interface SafeBrowsingMatch {
  threatType?: string;
  platformType?: string;
  threatEntryType?: string;
  threat?: unknown;
}

export type SafeBrowsingSource = 'google-safe-browsing';

export type SafeBrowsingError =
  | 'invalid_url'
  | 'upstream_failure'
  | 'network_error';

export interface SafeBrowsingResult {
  safe: boolean;
  matches: SafeBrowsingMatch[];
  source: SafeBrowsingSource;
  error?: SafeBrowsingError;
}

// Output of the scoring engine and the value stored in chrome.storage.session.
export interface RiskAssessment {
  verdict: 'SAFE' | 'SUSPICIOUS' | 'HIGH RISK';
  score: number;          // 0–100
  displayScore: number;   // normalized 0–100 shown in the UI
  reasons: string[];      // max 3, plain English
  action: string;         // one clear instruction for the user
  triggeredSignals: string[]; // internal — used by Gemini for enrichment
  domain: string;
  safeBrowsing?: SafeBrowsingResult;
}
