// ──────────────────────────────────────────────────────
// Safely · background/elevenlabs.ts
//
// Converts Gemini's voiceText to speech and plays it in
// the active tab. Service workers can't play audio, so
// we encode the response as base64 and inject a player
// via chrome.scripting.executeScript.
// ──────────────────────────────────────────────────────

import { ELEVENLABS_API_KEY, ELEVENLABS_VOICE_ID } from '../config';

const ENDPOINT = 'https://api.elevenlabs.io/v1/text-to-speech';

export async function playVoiceWarning(
  text: string,
  tabId: number | undefined,
): Promise<void> {
  if (!ELEVENLABS_API_KEY || !ELEVENLABS_VOICE_ID) {
    console.warn('[Safely] ElevenLabs keys not configured — skipping voice.');
    return;
  }

  if (!tabId) {
    console.warn('[Safely] No tabId — cannot inject audio.');
    return;
  }

  if (!text?.trim()) {
    console.warn('[Safely] Empty voiceText — skipping ElevenLabs call.');
    return;
  }

  console.log(`[Safely] ElevenLabs → sending to TTS: "${text.slice(0, 80)}..."`);

  try {
    const response = await fetch(`${ENDPOINT}/${ELEVENLABS_VOICE_ID}`, {
      method: 'POST',
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY,
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg',
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_turbo_v2_5',
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '(no body)');
      console.error(`[Safely] ElevenLabs API error ${response.status}:`, errorBody);
      return;
    }

    const buffer = await response.arrayBuffer();
    const bytes  = new Uint8Array(buffer);

    // Build base64 in chunks — spreading a large Uint8Array into btoa crashes
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64 = btoa(binary);

    console.log(`[Safely] ElevenLabs audio ready — ${(bytes.byteLength / 1024).toFixed(1)} KB`);

    await chrome.scripting.executeScript({
      target: { tabId },
      func: (b64: string) => {
        const audio = new Audio(`data:audio/mpeg;base64,${b64}`);
        audio.play().catch((err: Error) => {
          console.warn('[Safely] Autoplay blocked:', err.message,
            '— click anywhere on the page first, then re-scan.');
        });
      },
      args: [base64],
    });

  } catch (err) {
    console.error('[Safely] ElevenLabs failed:', err);
  }
}