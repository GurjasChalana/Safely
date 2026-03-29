/// <reference types="chrome" />
// ──────────────────────────────────────────────────────
// Safely · background/background.ts  [service worker]
//
// Message flow:
//   content.ts  →  PAGE_SCANNED  →  here
//   popup.ts    →  SCAN_TAB      →  here → DO_SCAN → content.ts
//   here        →  SHOW_BANNER   →  content.ts
//   here        →  PLAY_AUDIO    →  offscreen document
// ──────────────────────────────────────────────────────

import { RiskAssessment }    from '../shared/types';
import { SafelyMessage }     from '../shared/messages';
import { saveAssessment, setScanStatus } from '../shared/storage';
import { checkDomain }       from './safebrowsing';
import { explainThreats }    from './gemini';
import { fetchVoiceAudio }   from './elevenlabs';
import { answerQuestion }    from './convai';

// ── Per-tab abort controllers ─────────────────────────
// Cancels any in-flight ElevenLabs fetch when a new scan
// starts on the same tab, preventing audio overlap.

const scanAbort = new Map<number, AbortController>();

function cancelPreviousScan(tabId: number): AbortSignal {
  scanAbort.get(tabId)?.abort();
  const controller = new AbortController();
  scanAbort.set(tabId, controller);
  return controller.signal;
}

// ── Offscreen audio management ────────────────────────
// Audio plays via an offscreen document which is exempt
// from Chrome's autoplay policy. One document is shared
// for the entire extension session.
//
// _offscreenReady is a singleton promise so concurrent
// callers never race into createDocument() twice.

let _offscreenReady: Promise<void> | undefined;

function ensureOffscreenDocument(): Promise<void> {
  if (!_offscreenReady) {
    _offscreenReady = (async () => {
      const exists = await (chrome.offscreen as any).hasDocument().catch(() => false);
      if (!exists) {
        await (chrome.offscreen as any).createDocument({
          url:           'dist/offscreen.html',
          reasons:       ['AUDIO_PLAYBACK'],
          justification: 'Playing audio warnings for detected phishing pages',
        });
      }
    })().catch(err => {
      console.warn('[Safely] Offscreen document creation failed:', err);
      _offscreenReady = undefined; // allow retry on next call
    });
  }
  return _offscreenReady ?? Promise.resolve();
}

// Pre-create the offscreen document when the service worker starts so
// that STOP_AUDIO works immediately even before the first PLAY_AUDIO.
ensureOffscreenDocument();

// Signal is checked AFTER the ensureOffscreenDocument await so we
// don't play audio for a scan that was superseded during that wait.
async function playAudioOffscreen(base64: string, signal?: AbortSignal): Promise<void> {
  await ensureOffscreenDocument();
  if (signal?.aborted) return;
  chrome.runtime.sendMessage({ type: 'PLAY_AUDIO', base64 }).catch(() => {});
}

function stopAudioOffscreen(): void {
  chrome.runtime.sendMessage({ type: 'STOP_AUDIO' }).catch(() => {});
}

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
          if (tabId) {
            sendToTab(tabId, { type: 'QUESTION_ANSWER', answer }).catch(() => {});
          }
          const base64 = await fetchVoiceAudio(answer);
          if (base64) await playAudioOffscreen(base64);
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
//   1. Cancel any previous in-flight scan for this tab
//   2. Safe Browsing check against Google's known phishing DB
//   3. Save initial result so popup renders immediately
//   4. Groq second opinion for pages scoring ≥ 25
//      — can upgrade verdict but never downgrades HIGH RISK
//   5. ElevenLabs voice warning on SUSPICIOUS or HIGH RISK

async function handleScan(
  tabId:       number | undefined,
  url:         string,
  assessment:  RiskAssessment,
  pageSnippet: string,
): Promise<void> {

  // Cancel previous scan's in-flight audio fetch and stop any playing clip
  const signal = tabId ? cancelPreviousScan(tabId) : undefined;
  stopAudioOffscreen();

  let final = { ...assessment };

  // Step 1 — Safe Browsing: check every page against Google's known phishing DB
  const confirmed = await checkDomain(url);
  if (confirmed) {
    final.verdict = 'HIGH RISK';
    final.score   = Math.max(final.score, 75);
    final.triggeredSignals = [...final.triggeredSignals, 'safeBrowsingConfirmed'];
  }

  // Step 2 — Save initial result so popup renders without waiting for Groq
  await saveAssessment(final, url);

  // Step 3 — Groq second opinion for pages with at least one real signal
  if (final.score >= 25) {
    const enriched = await explainThreats(
      final.triggeredSignals,
      pageSnippet,
      final.verdict,
    );

    type Verdict = 'SAFE' | 'SUSPICIOUS' | 'HIGH RISK';
    const rank: Record<Verdict, number> = { 'SAFE': 0, 'SUSPICIOUS': 1, 'HIGH RISK': 2 };
    const groqVerdict = enriched.verdict as Verdict;

    if (rank[groqVerdict] > rank[final.verdict]) {
      console.log(`[Safely] Groq upgraded: ${final.verdict} → ${groqVerdict}`);
      final.verdict = groqVerdict;
      final.score   = Math.max(final.score, rank[groqVerdict] === 2 ? 65 : 40);
      final.triggeredSignals = [...final.triggeredSignals, 'groqUpgrade'];
    }

    if (final.verdict !== 'SAFE') {
      final.reasons = enriched.reasons;
      final.action  = enriched.action;
    }

    await saveAssessment(final, url);

    if (tabId && final.verdict !== 'SAFE') {
      sendToTab(tabId, { type: 'SHOW_BANNER', assessment: final }).catch(() => {});
    }

    // Step 4 — ElevenLabs voice warning, cancellable if a newer scan arrives
    if (final.verdict === 'SUSPICIOUS' || final.verdict === 'HIGH RISK') {
      const base64 = await fetchVoiceAudio(enriched.voiceText, signal);
      if (base64) await playAudioOffscreen(base64, signal);
    }
  }
}

export {};
