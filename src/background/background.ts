/// <reference types="chrome" />
// ──────────────────────────────────────────────────────
// Safely · background/background.ts  [service worker]
//
// Dev 2 owns this file.
//
// Message flow:
//   content.ts  →  PAGE_SCANNED  →  here
//   popup.ts    →  SCAN_TAB      →  here → DO_SCAN → content.ts
//   here        →  SHOW_BANNER   →  content.ts
// ──────────────────────────────────────────────────────

import { RiskAssessment }    from '../shared/types';
import { SafelyMessage }     from '../shared/messages';
import { saveAssessment, setScanStatus } from '../shared/storage';
import { checkDomain }       from './safebrowsing';
import { explainThreats }    from './gemini';
import { playVoiceWarning }  from './elevenlabs';

// ── Message router ────────────────────────────────────

chrome.runtime.onMessage.addListener(
  (message: SafelyMessage, _sender, sendResponse) => {

    // Content script finished extraction + scoring
    if (message.type === 'PAGE_SCANNED') {
      handleScan(message.assessment, message.pageSnippet)
        .then(() => sendResponse({ ok: true }))
        .catch(() => sendResponse({ ok: false }));
      return true;
    }

    // Popup requested a re-scan — tell content script to re-run
    if (message.type === 'SCAN_TAB') {
      setScanStatus('scanning');
      chrome.tabs.sendMessage(message.tabId, { type: 'DO_SCAN' } satisfies SafelyMessage);
      sendResponse({ ok: true });
      return true;
    }
  },
);

// ── Scan handler ──────────────────────────────────────

async function handleScan(
  assessment: RiskAssessment,
  pageSnippet: string,
): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const tabId = tab?.id;
  const url   = tab?.url ?? assessment.domain;

  let final = { ...assessment };

  // Step 1 — verify suspicious domains with Google Safe Browsing
  if (assessment.verdict === 'SUSPICIOUS') {
    const confirmed = await checkDomain(url);
    if (confirmed) {
      final.verdict = 'HIGH RISK';
      final.score   = Math.max(final.score, 75);
      final.triggeredSignals = [...final.triggeredSignals, 'safeBrowsingConfirmed'];
    }
  }

  // Step 2 — save initial result so popup updates immediately
  await saveAssessment(final, url);

  // Step 3 — enrich with Gemini (better reasons + voice text)
  if (final.verdict !== 'SAFE') {
    const enriched = await explainThreats(
      final.triggeredSignals,
      pageSnippet,
      final.verdict,
    );
    final.reasons = enriched.reasons;
    final.action  = enriched.action;

    // Update storage with enriched result
    await saveAssessment(final, url);

    // Push updated banner to content script
    if (tabId) {
      chrome.tabs.sendMessage(tabId, {
        type: 'SHOW_BANNER',
        assessment: final,
      } satisfies SafelyMessage);
    }

    // Step 4 — play voice warning on HIGH RISK
    if (final.verdict === 'HIGH RISK') {
      await playVoiceWarning(enriched.voiceText, tabId);
    }
  }
}

export {};