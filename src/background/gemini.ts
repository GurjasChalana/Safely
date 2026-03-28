// ──────────────────────────────────────────────────────
// Safely · background/gemini.ts
//
// Uses Gemini to generate plain-English explanations of
// why a page was flagged. Called after rule-based scoring
// on SUSPICIOUS and HIGH RISK verdicts.
//
// The result enriches the banner reasons and provides
// the voice script for ElevenLabs.
// ──────────────────────────────────────────────────────

import { GEMINI_API_KEY } from '../config';

const ENDPOINT =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

export interface GeminiEnrichment {
  reasons: string[];   // max 3 plain-English reasons
  action: string;      // one clear instruction
  voiceText: string;   // calm 2–3 sentence spoken warning for ElevenLabs
}

export async function explainThreats(
  signals: string[],
  pageSnippet: string,
  verdict: string,
): Promise<GeminiEnrichment> {
  if (!GEMINI_API_KEY) {
    console.warn('[Safely] Gemini API key not set — using fallback reasons.');
    return fallback(verdict);
  }

  const prompt = `
You are a safety assistant helping an elderly person understand why a webpage may be dangerous.

The page was flagged as: ${verdict}
Detected signals: ${signals.join(', ')}
Page excerpt: "${pageSnippet.slice(0, 500)}"

Return a JSON object with exactly these fields:
- "reasons": array of exactly 3 short plain-English sentences (max 15 words each) explaining what is suspicious
- "action": one clear sentence telling the user what to do right now
- "voiceText": a calm 2–3 sentence spoken warning suitable for text-to-speech for an elderly person

Rules:
- Use simple everyday language. No jargon.
- Be calm and reassuring, not alarming.
- Do not mention technical terms like "phishing", "malware", or "SSL".
- Do not start sentences with "I".
`;

  try {
    const response = await fetch(`${ENDPOINT}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json' },
      }),
    });

    const data = await response.json();
    const text: string = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    const parsed = JSON.parse(text) as GeminiEnrichment;

    // Validate shape before returning
    if (
      Array.isArray(parsed.reasons) &&
      typeof parsed.action === 'string' &&
      typeof parsed.voiceText === 'string'
    ) {
      return parsed;
    }

    return fallback(verdict);
  } catch (err) {
    console.warn('[Safely] Gemini enrichment failed:', err);
    return fallback(verdict);
  }
}

function fallback(verdict: string): GeminiEnrichment {
  if (verdict === 'HIGH RISK') {
    return {
      reasons: [
        'This page may be pretending to be a trusted website.',
        'You are being asked to enter personal information.',
        'This page is trying to pressure you into acting quickly.',
      ],
      action: 'Do not enter any information. Close this tab immediately.',
      voiceText:
        'Warning. This page may be a scam. ' +
        'Do not enter your password or any personal information. ' +
        'Please close this tab now.',
    };
  }
  return {
    reasons: [
      'This page has some unusual features.',
      'Be careful before entering any personal details.',
    ],
    action: 'Be careful. Do not enter your personal details on this page.',
    voiceText:
      'This page looks suspicious. ' +
      'Please be careful and do not enter any personal information.',
  };
}