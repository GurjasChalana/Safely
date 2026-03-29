/// <reference types="chrome" />
// ──────────────────────────────────────────────────────
// Safely · content/content.ts  [webpack entry point]
//
// Runs on every page at document_idle.
// Responsibilities:
//   1. Extract DOM signals (Dev 1's engine)
//   2. Score them (Dev 1's engine)
//   3. Send result to service worker for API enrichment
//   4. Listen for SHOW_BANNER / DO_SCAN from service worker
//
// Banner rendering is handled by banner.ts.
// ──────────────────────────────────────────────────────

import { extractFeatures } from '../scoring/engine';
import { scoreFeatures } from '../scoring/scoreFeatures';
import { showBanner, hideBanner } from './banner';
import { showAnswer } from './conversation';
import { SafelyMessage } from '../shared/messages';

// ── Auto-scan on page load ────────────────────────────

function runScan(): void {
  const features = extractFeatures();
  const assessment = scoreFeatures(features);

  // Show banner immediately with rule-based result
  showBanner(assessment);

  // Send to service worker for API enrichment
  // (Safe Browsing + Gemini + ElevenLabs)
  chrome.runtime.sendMessage({
    type: 'PAGE_SCANNED',
    assessment,
    pageSnippet: features.pageSnippet,
  } satisfies SafelyMessage).catch(() => {
    // Service worker was inactive — result is still shown from rule-based engine above
  });
}

runScan();

// ── Message listener ──────────────────────────────────
// Service worker sends SHOW_BANNER when enrichment is done.
// Popup sends DO_SCAN to trigger a re-scan.

chrome.runtime.onMessage.addListener(
  (message: SafelyMessage, _sender, sendResponse) => {
    if (message.type === 'SHOW_BANNER') {
      showBanner(message.assessment);
      sendResponse({ ok: true });
    }

    if (message.type === 'HIDE_BANNER') {
      hideBanner();
      sendResponse({ ok: true });
    }

    if (message.type === 'DO_SCAN') {
      runScan();
      sendResponse({ ok: true });
    }

    if (message.type === 'QUESTION_ANSWER') {
      showAnswer(message.answer);
      sendResponse({ ok: true });
    }

    return true;
  },
);