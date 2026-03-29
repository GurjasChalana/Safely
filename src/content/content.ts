/// <reference types="chrome" />
// ──────────────────────────────────────────────────────
// Safely · content/content.ts  [webpack entry point]
//
// Runs on every page at document_idle.
// Responsibilities:
//   1. Extract DOM signals
//   2. Score them and send to service worker for enrichment
//   3. Listen for SHOW_BANNER / DO_SCAN from service worker
//
// Audio playback is handled by the offscreen document.
// Banner rendering is handled by banner.ts.
// ──────────────────────────────────────────────────────

import { extractFeatures, scoreFeatures } from '../scoring/engine';
import { showBanner, hideBanner } from './banner';
import { showAnswer } from './conversation';
import { SafelyMessage } from '../shared/messages';

// ── One-per-document scan guard ───────────────────────
// Prevents the auto-scan from running more than once for
// the same document lifecycle. Forced rescans (DO_SCAN
// with forced=true) bypass this flag.

declare global {
  interface Window { __safely_scanned?: boolean; }
}

// ── Auto-scan on page load ────────────────────────────

function runScan(forced = false): void {
  if (!forced && window.__safely_scanned) {
    // Already auto-scanned this document — skip to avoid duplicate API calls
    // and potential duplicate narration. Popup-initiated rescans pass forced=true
    // to bypass this guard.
    return;
  }
  window.__safely_scanned = true;

  const features   = extractFeatures();
  const assessment = scoreFeatures(features);

  // Show banner immediately with rule-based result
  showBanner(assessment);

  // Each scan gets a unique ID so the background can detect and discard
  // results from scans that were superseded by a newer one.
  const scanId = crypto.randomUUID();

  // Send to service worker for API enrichment
  // (Safe Browsing + Groq + ElevenLabs)
  chrome.runtime.sendMessage({
    type: 'PAGE_SCANNED',
    assessment,
    pageSnippet: features.pageSnippet,
    scanId,
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
      // Guard against stale responses from a previous page's scan.
      // assessment.domain is set from window.location at extraction time.
      const currentDomain = window.location.hostname.toLowerCase().replace(/^www\./, '');
      if (message.assessment.domain === currentDomain) {
        showBanner(message.assessment);
      }
      sendResponse({ ok: true });
    }

    if (message.type === 'HIDE_BANNER') {
      hideBanner();
      sendResponse({ ok: true });
    }

    if (message.type === 'DO_SCAN') {
      // forced=true (set by popup manual rescan) bypasses the one-per-document guard
      // so the user can always request a fresh scan.
      runScan(message.forced ?? false);
      sendResponse({ ok: true });
    }

    if (message.type === 'QUESTION_ANSWER') {
      showAnswer(message.answer);
      sendResponse({ ok: true });
    }

    return true;
  },
);
