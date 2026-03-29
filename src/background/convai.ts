// ──────────────────────────────────────────────────────
// Safely · background/convai.ts
//
// Conversational Q&A using Groq (Llama 3.1 8B Instant).
// Free tier: ~14,400 req/day, very fast responses.
// Uses OpenAI-compatible chat completions format.
// ──────────────────────────────────────────────────────

import { GROQ_API_KEY } from '../config';
import type { RiskAssessment } from '../shared/types';
import type { ConvTurn } from '../shared/messages';

const ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL    = 'llama-3.1-8b-instant';

export async function answerQuestion(
  question: string,
  assessment: RiskAssessment,
  history: ConvTurn[],
): Promise<string> {
  if (!GROQ_API_KEY) {
    console.warn('[Safely] ConvAI: no Groq API key — add GROQ_API_KEY to config.ts');
    return "Sorry, I can't answer questions right now.";
  }

  // System message: persona only, no risk language
  const systemMessage = {
    role: 'system',
    content:
      'You are Safely, a warm and friendly helper who answers questions about websites. ' +
      'Talk like a patient, knowledgeable family member. ' +
      'Keep every answer to 2–3 short sentences. ' +
      'Use simple everyday language — no tech jargon. ' +
      'Answer the specific question asked. Never repeat the same phrasing twice.',
  };

  // First assistant message establishes the page context naturally
  const contextMessages = [
    { role: 'user',      content: 'What can you tell me about this website?' },
    { role: 'assistant', content: buildContextMessage(assessment) },
  ];

  // Prior turns — map internal 'model' role to OpenAI/Groq 'assistant'
  const historyMessages = history.map(t => ({
    role:    t.role === 'model' ? 'assistant' : 'user',
    content: t.text,
  }));

  const messages = [
    systemMessage,
    ...contextMessages,
    ...historyMessages,
    { role: 'user', content: question },
  ];

  console.log('[Safely] ConvAI → Groq, turns:', messages.length, '| Q:', question);

  try {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages,
        max_tokens: 200,
        temperature: 0.75,
      }),
    });

    const rawBody = await response.text();

    if (!response.ok) {
      console.error(`[Safely] ConvAI Groq HTTP ${response.status}:`, rawBody.slice(0, 400));
      return `[Error ${response.status}] ${rawBody.slice(0, 120)}`;
    }

    let data: Record<string, unknown>;
    try {
      data = JSON.parse(rawBody);
    } catch {
      console.error('[Safely] ConvAI JSON parse failed:', rawBody.slice(0, 200));
      return "Got an unexpected response — please try again.";
    }

    const text: string =
      (data.choices as any)?.[0]?.message?.content ?? '';

    if (!text.trim()) {
      console.warn('[Safely] ConvAI empty response:', rawBody.slice(0, 300));
      return "Could you try asking that again?";
    }

    console.log('[Safely] ConvAI ← answer:', text.slice(0, 100));
    return text.trim();

  } catch (err) {
    console.error('[Safely] ConvAI fetch error:', err);
    return `[Fetch error] ${String(err).slice(0, 100)}`;
  }
}

function buildContextMessage(a: RiskAssessment): string {
  const domain  = a.domain || 'this website';
  const reasons = a.reasons.filter(r => r?.trim()).join(' ');

  const intro = 'My name is Safely and I help people understand the websites they visit. ';

  if (a.verdict === 'HIGH RISK') {
    return (
      intro +
      `Just looked at ${domain} for you, and honestly a few things are worrying me. ` +
      (reasons ? reasons + ' ' : '') +
      `What would you like to know?`
    );
  }
  if (a.verdict === 'SUSPICIOUS') {
    return (
      intro +
      `Just had a look at ${domain}. There are a couple of things that seem a little off — ` +
      (reasons ? reasons + ' ' : '') +
      `Happy to walk you through it!`
    );
  }
  return (
    intro +
    `Just checked ${domain} for you. Everything looks perfectly normal — nothing unusual here. ` +
    `Let me know if you have any questions!`
  );
}