// ──────────────────────────────────────────────────────
// Safely · background/gemini.ts
//
// Two jobs:
//   1. Second-opinion verdict for borderline pages
//      (can upgrade SAFE → SUSPICIOUS or SUSPICIOUS → HIGH RISK,
//       but never downgrades a HIGH RISK verdict)
//   2. Plain-English explanations + voice script for ElevenLabs
// ──────────────────────────────────────────────────────

import { GEMINI_API_KEY } from '../config';

const ENDPOINT =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

export interface GeminiEnrichment {
  verdict:   'SAFE' | 'SUSPICIOUS' | 'HIGH RISK';  // second-opinion verdict
  reasons:   string[];   // max 3 plain-English reasons
  action:    string;     // one clear instruction
  voiceText: string;     // calm 2–3 sentence spoken warning for ElevenLabs
}

export async function explainThreats(
  signals:       string[],
  pageSnippet:   string,
  rulesVerdict:  string,
): Promise<GeminiEnrichment> {
  if (!GEMINI_API_KEY) {
    console.warn('[Safely] Gemini API key not set — using fallback.');
    return fallback(rulesVerdict);
  }

  const prompt = `
You are a security expert reviewing a webpage for signs of phishing or scams.
Your audience is an elderly person who may not be tech-savvy.

The rule-based engine flagged this page as: ${rulesVerdict}
Signals detected by the rules engine: ${signals.length > 0 ? signals.join(', ') : 'none'}
Page text excerpt: "${pageSnippet.slice(0, 600)}"

Your job:
1. Form your own independent verdict on whether this page is safe or dangerous.
2. Write plain, calm explanations.

Return a JSON object with exactly these fields:
- "verdict": one of "SAFE", "SUSPICIOUS", or "HIGH RISK" — your independent assessment
- "reasons": array of exactly 3 short plain-English sentences (max 15 words each) explaining what looks suspicious, or why the page is safe
- "action": one sentence telling the user what to do right now
- "voiceText": a calm 2–3 sentence spoken warning or reassurance suitable for text-to-speech for an elderly person

Rules for your response:
- Use simple everyday language. No jargon.
- Be calm and reassuring, not alarming.
- Never use words like "phishing", "malware", or "SSL".
- Do not start sentences with "I".
- If the page looks safe, say so clearly and briefly.
- If unsure, lean toward SUSPICIOUS rather than SAFE.
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

    if (
      ['SAFE', 'SUSPICIOUS', 'HIGH RISK'].includes(parsed.verdict) &&
      Array.isArray(parsed.reasons) &&
      typeof parsed.action === 'string' &&
      typeof parsed.voiceText === 'string'
    ) {
      return parsed;
    }

    return fallback(rulesVerdict);
  } catch (err) {
    console.warn('[Safely] Gemini call failed:', err);
    return fallback(rulesVerdict);
  }
}

function fallback(verdict: string): GeminiEnrichment {
  if (verdict === 'HIGH RISK') {
    return {
      verdict: 'HIGH RISK',
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
  if (verdict === 'SUSPICIOUS') {
    return {
      verdict: 'SUSPICIOUS',
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
  return {
    verdict: 'SAFE',
    reasons: [],
    action: 'This page looks safe. You can continue browsing.',
    voiceText: 'This page appears to be safe.',
  };
}