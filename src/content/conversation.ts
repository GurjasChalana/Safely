// ──────────────────────────────────────────────────────
// Safely · content/conversation.ts
//
// Inline voice conversation panel — lives inside the
// banner card. User taps the mic, speaks, transcript is
// sent to Groq, answer is shown + spoken by ElevenLabs.
// ──────────────────────────────────────────────────────

import type { RiskAssessment } from '../shared/types';
import type { SafelyMessage, ConvTurn } from '../shared/messages';

const AREA_ID     = 'safely-conv-area';
const MESSAGES_ID = 'safely-conv-messages';
const THINKING_ID = 'safely-conv-thinking';
const MIC_BTN_ID  = 'safely-conv-mic';
const MIC_HINT_ID = 'safely-conv-hint';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const SR: (new () => any) | undefined =
  (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;

let history:      ConvTurn[]   = [];
let _active       = false;
let _listening    = false;
let _micStream:   MediaStream | null = null;  // kept alive to persist permission
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _recognition: any = null;

// ── Public API ────────────────────────────────────────

export function openConversation(
  banner: HTMLElement,
  assessment: RiskAssessment,
): void {
  if (_active) return;
  _active  = true;
  history  = [];

  const area = document.createElement('div');
  area.id        = AREA_ID;
  area.className = 'safely-conv';

  // Messages
  const messages = document.createElement('div');
  messages.id        = MESSAGES_ID;
  messages.className = 'safely-conv__messages';
  appendMessage(messages, 'agent', getGreeting(assessment));

  // Mic section
  const micSection = document.createElement('div');
  micSection.className = 'safely-conv__mic-section';

  const micBtn = document.createElement('button');
  micBtn.id          = MIC_BTN_ID;
  micBtn.className   = 'safely-conv__mic';
  micBtn.setAttribute('aria-label', 'Tap to speak');
  micBtn.innerHTML   = micSVG();

  const hint = document.createElement('span');
  hint.id        = MIC_HINT_ID;
  hint.className = 'safely-conv__hint';
  hint.textContent = SR ? 'Tap to speak' : 'Voice not available';

  micBtn.addEventListener('click', () => {
    if (_listening) {
      stopListening();
    } else {
      startListening(assessment, messages);
    }
  });

  if (!SR) micBtn.disabled = true;

  micSection.appendChild(micBtn);
  micSection.appendChild(hint);
  area.appendChild(messages);
  area.appendChild(micSection);
  banner.appendChild(area);

  // Request mic permission immediately so SpeechRecognition won't ask again
  // on every tap. Keep the stream alive (silent) for the whole conversation.
  if (SR && !_micStream) {
    navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      .then(stream => {
        _micStream = stream;
        // Stream stays open silently — this caches the permission for this origin
      })
      .catch(() => {
        // Permission denied — SpeechRecognition will show its own error
      });
  }
}

export function closeConversation(banner: HTMLElement): void {
  stopListening();
  _micStream?.getTracks().forEach(t => t.stop());
  _micStream = null;
  banner.querySelector(`#${AREA_ID}`)?.remove();
  _active  = false;
  history  = [];
}

export function isActive(): boolean { return _active; }

// Called by content.ts when QUESTION_ANSWER arrives
export function showAnswer(answer: string): void {
  const messages = document.getElementById(MESSAGES_ID);
  if (!messages) return;
  document.getElementById(THINKING_ID)?.remove();
  appendMessage(messages, 'agent', answer);
  history.push({ role: 'model', text: answer });
  setMicReady();
}

// ── Voice capture ─────────────────────────────────────

function startListening(
  assessment: RiskAssessment,
  messages: HTMLElement,
): void {
  if (!SR || _listening) return;

  _recognition = new SR();
  _recognition.continuous     = false;
  _recognition.interimResults = true;
  _recognition.lang           = 'en-US';

  _listening = true;
  setMicState('listening', 'Listening…');

  let finalTranscript = '';

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _recognition.onresult = (e: any) => {
    let interim = '';
    finalTranscript = '';
    for (let i = 0; i < e.results.length; i++) {
      if (e.results[i].isFinal) finalTranscript += e.results[i][0].transcript;
      else interim += e.results[i][0].transcript;
    }
    setHint(finalTranscript || interim || 'Listening…');
  };

  _recognition.onend = () => {
    _listening   = false;
    _recognition = null;
    if (finalTranscript.trim()) {
      handleQuestion(finalTranscript.trim(), assessment, messages);
    } else {
      setMicReady();
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _recognition.onerror = (e: any) => {
    _listening   = false;
    _recognition = null;
    if (e.error === 'not-allowed') {
      setMicState('idle', 'Microphone blocked — check browser settings');
    } else if (e.error === 'no-speech') {
      setMicState('idle', 'No speech detected. Tap to try again.');
    } else {
      setMicState('idle', 'Tap to try again');
    }
  };

  try {
    _recognition.start();
  } catch {
    _listening = false;
    setMicReady();
  }
}

function stopListening(): void {
  _recognition?.stop();
  _recognition = null;
  _listening   = false;
  setMicReady();
}

// ── Q&A ───────────────────────────────────────────────

function handleQuestion(
  question: string,
  assessment: RiskAssessment,
  messages: HTMLElement,
): void {
  appendMessage(messages, 'user', question);
  history.push({ role: 'user', text: question });

  // Thinking indicator
  const dots = document.createElement('div');
  dots.id        = THINKING_ID;
  dots.className = 'safely-conv__thinking';
  dots.textContent = '•••';
  messages.appendChild(dots);
  messages.scrollTop = messages.scrollHeight;

  setMicState('thinking', 'Thinking…');

  chrome.runtime.sendMessage({
    type:       'ASK_QUESTION',
    question,
    assessment,
    history:    history.slice(0, -1),
  } satisfies SafelyMessage).catch(() => {
    document.getElementById(THINKING_ID)?.remove();
    appendMessage(messages, 'agent', "Sorry, something went wrong.");
    history.pop();
    setMicReady();
  });
}

// ── UI helpers ────────────────────────────────────────

function appendMessage(
  container: HTMLElement,
  speaker: 'user' | 'agent',
  text: string,
): void {
  const msg = document.createElement('div');
  msg.className   = `safely-conv__msg safely-conv__msg--${speaker}`;
  msg.textContent = text;
  container.appendChild(msg);
  container.scrollTop = container.scrollHeight;
}

function setMicState(
  state: 'idle' | 'listening' | 'thinking',
  hint: string,
): void {
  const btn = document.getElementById(MIC_BTN_ID);
  if (btn) {
    btn.classList.remove(
      'safely-conv__mic--listening',
      'safely-conv__mic--thinking',
    );
    if (state !== 'idle') {
      btn.classList.add(`safely-conv__mic--${state}`);
    }
  }
  setHint(hint);
}

function setMicReady(): void {
  setMicState('idle', 'Tap to speak');
}

function setHint(text: string): void {
  const el = document.getElementById(MIC_HINT_ID);
  if (el) el.textContent = text;
}

function getGreeting(a: RiskAssessment): string {
  if (a.verdict === 'HIGH RISK')
    return "I've checked this page and I'm worried about it. What would you like to know?";
  if (a.verdict === 'SUSPICIOUS')
    return "I found a few things worth knowing about this page. Ask me anything.";
  return "This page looks fine. Is there anything you'd like to ask?";
}

// Inline mic SVG — no emoji, renders crisply at any DPI
function micSVG(): string {
  return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none"
    xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <rect x="9" y="2" width="6" height="11" rx="3" fill="currentColor"/>
    <path d="M5 10a7 7 0 0 0 14 0" stroke="currentColor" stroke-width="2"
      stroke-linecap="round" fill="none"/>
    <line x1="12" y1="17" x2="12" y2="21" stroke="currentColor"
      stroke-width="2" stroke-linecap="round"/>
    <line x1="9" y1="21" x2="15" y2="21" stroke="currentColor"
      stroke-width="2" stroke-linecap="round"/>
  </svg>`;
}