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
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

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
You are a calm, friendly safety assistant talking directly to an elderly person browsing the web.

You have been given information about the page they are currently looking at:
- Our safety engine rated it as: ${rulesVerdict}
- Specific warning signals found: ${signals.length > 0 ? signals.join(', ') : 'none'}
- What the page actually says (excerpt): "${pageSnippet.slice(0, 600)}"

Your job is to:
1. Decide whether this page is truly safe, suspicious, or dangerous.
2. Write a short spoken message that feels like a real person gently talking to them — not a formal announcement.

Return a JSON object with exactly these fields:
- "verdict": one of "SAFE", "SUSPICIOUS", or "HIGH RISK"
- "reasons": array of exactly 3 short plain-English sentences (max 15 words each) for the visual overlay
- "action": one sentence telling them what to do right now
- "voiceText": a natural, conversational 2–3 sentence message spoken directly to the person.
  The voiceText must:
  - Reference something specific about THIS page (what it's asking for, what it claims, who it pretends to be)
  - Sound like a caring friend warning them, not a security alert
  - Use "you" and "this page" naturally
  - Be calm and gentle — never panicked
  - End with one clear thing they should do

Examples of good voiceText tone:
  "Hey, just a heads up — this page is asking for your bank password, but it doesn't look like your real bank's website. It's probably safer to close this tab and go directly to your bank's app instead."
  "This page looks fine. It's a well-known website and nothing unusual was found. You're safe to continue."

Rules:
- Simple everyday language only. No jargon.
- Never use words like "phishing", "malware", "SSL", or "credentials".
- Do not start sentences with "I".
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