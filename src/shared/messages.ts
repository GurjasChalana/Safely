// ──────────────────────────────────────────────────────
// Safely · shared/messages.ts
//
// All message types for communication between:
//   content script ↔ service worker ↔ popup
//
// Import this wherever you send or receive messages.
// Do not invent message formats outside this file.
// ──────────────────────────────────────────────────────

import { RiskAssessment } from './types';

export type SafelyMessage =
  // Content script → service worker: page has been scanned
  | { type: 'PAGE_SCANNED'; assessment: RiskAssessment; pageSnippet: string }

  // Popup → service worker: user clicked "Scan Again"
  | { type: 'SCAN_TAB'; tabId: number; url: string }

  // Service worker → content script: show/update the banner
  | { type: 'SHOW_BANNER'; assessment: RiskAssessment }

  // Service worker → content script: re-run extraction (triggered by popup re-scan)
  | { type: 'DO_SCAN' }

  // Service worker → content script: hide the banner
  | { type: 'HIDE_BANNER' };