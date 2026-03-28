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
  suspiciousPath: boolean;  // URL path contains phishing-common segments
  pageSnippet: string; // first 500 chars of body text — sent to Gemini
}

// Output of the scoring engine and the value stored in chrome.storage.session.
export interface RiskAssessment {
  verdict: 'SAFE' | 'SUSPICIOUS' | 'HIGH RISK';
  score: number;          // 0–100
  reasons: string[];      // max 3, plain English
  action: string;         // one clear instruction for the user
  triggeredSignals: string[]; // internal — used by Gemini for enrichment
  domain: string;
}