// ──────────────────────────────────────────────────────
// Safely · mock.ts
//
// Three screenshot-ready mock states for development.
// Dev 2: write one of these to chrome.storage.session
// to test the popup without a live scan.
//
//   chrome.storage.session.set({ assessment: MOCK_HIGH_RISK, scannedUrl: 'paypa1-secure.net' });
// ──────────────────────────────────────────────────────

export interface RiskAssessment {
  verdict: 'SAFE' | 'SUSPICIOUS' | 'HIGH RISK';
  /** Risk score 0–100. Higher = more dangerous. */
  score: number;
  /** Max 3 reasons, plain English. */
  reasons: string[];
  /** One clear instruction for the user. */
  action: string;
}

// ── State 1: SAFE ─────────────────────────────────────
// Scenario: User visits google.com

export const MOCK_SAFE: RiskAssessment = {
  verdict: 'SAFE',
  score: 4,
  reasons: [
    'This is a well-known, trusted website',
    'Your connection is secure and encrypted',
    'No suspicious activity was detected',
  ],
  action: 'This page looks safe. You can continue browsing.',
};

// ── State 2: SUSPICIOUS ──────────────────────────────
// Scenario: Fake prize or lottery page

export const MOCK_SUSPICIOUS: RiskAssessment = {
  verdict: 'SUSPICIOUS',
  score: 58,
  reasons: [
    'This page claims you have won a prize',
    'This website was created very recently',
  ],
  action: 'Be careful. Do not enter your personal details on this page.',
};

// ── State 3: HIGH RISK ───────────────────────────────
// Scenario: Fake PayPal login page

export const MOCK_HIGH_RISK: RiskAssessment = {
  verdict: 'HIGH RISK',
  score: 94,
  reasons: [
    'This page is pretending to be PayPal',
    'You are being asked to enter your password',
  ],
  action: 'Do not enter any information. Close this tab immediately.',
};
