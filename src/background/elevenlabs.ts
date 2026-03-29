// ──────────────────────────────────────────────────────
// Safely · background/elevenlabs.ts
//
// Converts voiceText to base64 MP3 audio.
// Returns the encoded audio so the caller can route it
// to the offscreen document for playback.
//
// Accepts an AbortSignal so the caller can cancel an
// in-flight request (e.g. when a new scan starts).
// ──────────────────────────────────────────────────────

import { ELEVENLABS_API_KEY, ELEVENLABS_VOICE_ID } from '../config';

const ENDPOINT = 'https://api.elevenlabs.io/v1/text-to-speech';

export async function fetchVoiceAudio(
  text:    string,
  signal?: AbortSignal,
): Promise<string | null> {
  if (!ELEVENLABS_API_KEY || !ELEVENLABS_VOICE_ID) {
    console.warn('[Safely] ElevenLabs keys not configured — skipping voice.');
    return null;
  }

  if (!text?.trim()) {
    console.warn('[Safely] Empty voiceText — skipping ElevenLabs call.');
    return null;
  }

  if (signal?.aborted) return null;

  console.log(`[Safely] ElevenLabs → TTS: "${text.slice(0, 80)}..."`);

  try {
    const response = await fetch(`${ENDPOINT}/${ELEVENLABS_VOICE_ID}`, {
      method: 'POST',
      signal,
      headers: {
        'xi-api-key':   ELEVENLABS_API_KEY,
        'Content-Type': 'application/json',
        'Accept':       'audio/mpeg',
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_turbo_v2_5',
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    });

    if (signal?.aborted) return null;

    if (!response.ok) {
      const err = await response.text().catch(() => '(no body)');
      console.error(`[Safely] ElevenLabs API error ${response.status}:`, err);
      return null;
    }

    const buffer = await response.arrayBuffer();

    if (signal?.aborted) return null;

    const bytes = new Uint8Array(buffer);

    // Build base64 in chunks — spreading a large Uint8Array into btoa crashes
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64 = btoa(binary);

    console.log(`[Safely] ElevenLabs audio ready — ${(bytes.byteLength / 1024).toFixed(1)} KB`);
    return base64;

  } catch (err: any) {
    if (err?.name === 'AbortError') {
      console.log('[Safely] ElevenLabs request cancelled — new scan started.');
      return null;
    }
    console.error('[Safely] ElevenLabs failed:', err);
    return null;
  }
}
