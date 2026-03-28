// ──────────────────────────────────────────────────────
// Safely · scoring/engine.ts
//
// DEV 1 OWNS THIS FILE.
//
// Two functions to implement:
//   extractFeatures() — reads the DOM, returns signals
//   scoreFeatures()   — scores signals, returns verdict
//
// Both are called by the content script on every page load.
// Both must be synchronous and fast (< 10ms combined).
// ──────────────────────────────────────────────────────

import { ExtractedFeatures, RiskAssessment } from './types';

// ── Feature extraction ────────────────────────────────
// Reads the live DOM and returns a structured signal object.
// Dev 1: replace this stub with real extraction logic.

export function extractFeatures(): ExtractedFeatures {
  const domain = window.location.hostname;

  // TODO Dev 1: implement real extraction
  return {
    domain,
    pageUrl: window.location.href,
    hasPasswordField: false,
    hasOTPField: false,
    hasPaymentField: false,
    urgencyKeywords: [],
    suspiciousDomain: false,
    fakeBrandKeywords: [],
    hasLoginForm: false,
    httpsEnabled: window.location.protocol === 'https:',
    mismatchedLinks: false,
    excessivePopups: false,
    pageSnippet: document.body?.innerText?.slice(0, 500) ?? '',
  };
}

// ── Scoring engine ────────────────────────────────────
// Accepts extracted signals, returns a risk verdict.
// Dev 1: replace this stub with real scoring logic.
//
// Scoring weights (implement these):
//   suspicious/lookalike domain:             +35
//   password field + suspicious domain:      +30
//   fake brand keyword in content:           +20
//   2+ urgency keywords:                     +20
//   no HTTPS:                                +15
//   mismatched links:                        +15
//   OTP or payment form:                     +10
//   excessive popups / beforeunload traps:   +10
//
// Thresholds:
//   0–30   → SAFE
//   31–59  → SUSPICIOUS
//   60+    → HIGH RISK

export function scoreFeatures(features: ExtractedFeatures): RiskAssessment {
  // TODO Dev 1: implement real scoring logic
  return {
    verdict: 'SAFE',
    score: 0,
    reasons: [],
    action: 'This page looks safe. You can continue browsing.',
    triggeredSignals: [],
    domain: features.domain,
  };
}