// ──────────────────────────────────────────────────────
// Safely · background/elevenlabs.ts
//
// Converts text to speech via ElevenLabs and plays it
// in the active tab. Only fires on HIGH RISK verdicts.
//
// Service workers cannot play audio directly — we send
// the audio as base64 to the content script via
// chrome.scripting.executeScript and play it there.
// ──────────────────────────────────────────────────────

import { ELEVENLABS_API_KEY, ELEVENLABS_VOICE_ID } from '../config';

const ENDPOINT = `https://api.elevenlabs.io/v1/text-to-speech`;

export async function playVoiceWarning(
  text: string,
  tabId: number | undefined,
): Promise<void> {
  if (!ELEVENLABS_API_KEY || !ELEVENLABS_VOICE_ID) {
    console.warn('[Safely] ElevenLabs keys not set — skipping voice warning.');
    return;
  }

  if (!tabId) return;

  try {
    const response = await fetch(`${ENDPOINT}/${ELEVENLABS_VOICE_ID}`, {
      method: 'POST',
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_monolingual_v1',
        voice_settings: { stability: 0.75, similarity_boost: 0.75 },
      }),
    });

    if (!response.ok) {
      console.warn('[Safely] ElevenLabs returned', response.status);
      return;
    }

    const buffer = await response.arrayBuffer();
    const base64 = btoa(
      String.fromCharCode(...new Uint8Array(buffer)),
    );

    // Play audio in the content script context (SW can't play audio)
    await chrome.scripting.executeScript({
      target: { tabId },
      func: (b64: string) => {
        const audio = new Audio(`data:audio/mpeg;base64,${b64}`);
        audio.play().catch(() => {
          // Autoplay blocked — browser requires a user gesture first.
          // For demo: clicking the extension icon counts as a gesture.
        });
      },
      args: [base64],
    });
  } catch (err) {
    // Voice failed silently — visual banner is still showing
    console.warn('[Safely] ElevenLabs playback failed:', err);
  }
}