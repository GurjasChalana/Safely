/// <reference types="chrome" />
// ──────────────────────────────────────────────────────
// Safely · background/background.ts  [service worker]
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
import { answerQuestion } from './convai';

// ── Helpers ───────────────────────────────────────────

function sendToTab(tabId: number, message: SafelyMessage): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, () => {
      if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
      else resolve();
    });
  });
}

// ── Message router ────────────────────────────────────

chrome.runtime.onMessage.addListener(
  (message: SafelyMessage, sender, sendResponse) => {

    // Content script finished extraction + scoring
    if (message.type === 'PAGE_SCANNED') {
      const tabId = sender.tab?.id;
      const url   = sender.tab?.url ?? message.assessment.domain;
      handleScan(tabId, url, message.assessment, message.pageSnippet)
        .then(() => sendResponse({ ok: true }))
        .catch(() => sendResponse({ ok: false }));
      return true;
    }

    // User asked a question via the banner chat
    if (message.type === 'ASK_QUESTION') {
      const tabId = sender.tab?.id;
      answerQuestion(message.question, message.assessment, message.history)
        .then(async answer => {
          // Send text answer back to content script
          if (tabId) {
            sendToTab(tabId, { type: 'QUESTION_ANSWER', answer }).catch(() => {});
          }
          // Speak the answer via ElevenLabs TTS
          await playVoiceWarning(answer, tabId);
          sendResponse({ ok: true });
        })
        .catch(() => sendResponse({ ok: false }));
      return true;
    }

    // Popup requested a re-scan — tell content script to re-run
    if (message.type === 'SCAN_TAB') {
      setScanStatus('scanning').catch(() => {});

      sendToTab(message.tabId, { type: 'DO_SCAN' })
        .catch(() =>
          // Content script not present — inject it.
          // The injected script calls runScan() automatically on load.
          chrome.scripting
            .executeScript({ target: { tabId: message.tabId }, files: ['dist/content.js'] })
            .catch(() => setScanStatus('error').catch(() => {}))
        );

      sendResponse({ ok: true });
      return true;
    }
  },
);

// ── Scan handler ──────────────────────────────────────
//
// Verdict pipeline:
//   1. Rule-based verdict (from content script)
//   2. Safe Browsing upgrade for SUSPICIOUS → HIGH RISK
//   3. Save initial result so popup renders immediately
//   4. Gemini second opinion for any page with score ≥ 20
//      — Gemini can upgrade verdict but never downgrade HIGH RISK
//   5. ElevenLabs voice warning on HIGH RISK

async function handleScan(
  tabId:       number | undefined,
  url:         string,
  assessment:  RiskAssessment,
  pageSnippet: string,
): Promise<void> {

  let final = { ...assessment };

  // Step 1 — Safe Browsing: upgrade SUSPICIOUS to HIGH RISK if confirmed
  if (assessment.verdict === 'SUSPICIOUS') {
    const confirmed = await checkDomain(url);
    if (confirmed) {
      final.verdict = 'HIGH RISK';
      final.score   = Math.max(final.score, 75);
      final.triggeredSignals = [...final.triggeredSignals, 'safeBrowsingConfirmed'];
    }
  }

  // Step 2 — Save initial rule-based result so popup renders without waiting for Gemini
  await saveAssessment(final, url);

  // Step 3 — Gemini second opinion
  // Runs for any page scoring ≥ 20 (borderline or above) so AI can catch
  // what the rules miss, and can upgrade a SAFE verdict if needed.
  if (final.score >= 20) {
    const enriched = await explainThreats(
      final.triggeredSignals,
      pageSnippet,
      final.verdict,
    );

    // Apply Gemini's verdict — it can upgrade but never downgrade HIGH RISK
    type Verdict = 'SAFE' | 'SUSPICIOUS' | 'HIGH RISK';
    const rank: Record<Verdict, number> = { 'SAFE': 0, 'SUSPICIOUS': 1, 'HIGH RISK': 2 };
    const geminiVerdict = enriched.verdict as Verdict;

    if (rank[geminiVerdict] > rank[final.verdict]) {
      console.log(`[Safely] Gemini upgraded: ${final.verdict} → ${geminiVerdict}`);
      final.verdict = geminiVerdict;
      final.score   = Math.max(final.score, rank[geminiVerdict] === 2 ? 65 : 40);
      final.triggeredSignals = [...final.triggeredSignals, 'geminiUpgrade'];
    }

    // Always use Gemini's reasons and action for better readability
    if (final.verdict !== 'SAFE') {
      final.reasons = enriched.reasons;
      final.action  = enriched.action;
    }

    // Save enriched result and push updated banner
    await saveAssessment(final, url);

    if (tabId && final.verdict !== 'SAFE') {
      sendToTab(tabId, { type: 'SHOW_BANNER', assessment: final }).catch(() => {});
    }

    // Step 4 — ElevenLabs voice warning on SUSPICIOUS or HIGH RISK
    if (final.verdict === 'SUSPICIOUS' || final.verdict === 'HIGH RISK') {
      await playVoiceWarning(enriched.voiceText, tabId);
    }
  }
}

export {};