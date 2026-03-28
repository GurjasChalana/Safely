// ──────────────────────────────────────────────────────
// Safely Popup · popup.ts
//
// Reads RiskAssessment from chrome.storage.session
// (written by the background service worker after a scan).
//
// Dev 2 integration surface:
//   • Write { assessment, scannedUrl, scanStatus } to
//     chrome.storage.session from your background script.
//   • The popup listens for storage changes and re-renders
//     automatically — no extra wiring needed.
// ──────────────────────────────────────────────────────

// ── Types ─────────────────────────────────────────────

interface RiskAssessment {
  verdict: 'SAFE' | 'SUSPICIOUS' | 'HIGH RISK';
  score: number;
  reasons: string[];
  action: string;
}

// chrome.storage.session schema
interface SessionData {
  assessment?: RiskAssessment;
  scannedUrl?: string;
  scanStatus?: 'idle' | 'scanning' | 'done' | 'error';
}

type UIState = 'loading' | 'idle' | 'result' | 'error';

// ── Mock fallback (dev only) ──────────────────────────
// Change DEV_MOCK to preview different states when the
// backend is not yet connected.
const DEV_MOCK_STATE = 'highRisk' as const;

const DEV_MOCKS: Record<string, RiskAssessment> = {
  safe: {
    verdict: 'SAFE',
    score: 4,
    reasons: [
      'This is a well-known, trusted website',
      'Your connection is secure and encrypted',
      'No suspicious activity was detected',
    ],
    action: 'This page looks safe. You can continue browsing.',
  },
  suspicious: {
    verdict: 'SUSPICIOUS',
    score: 58,
    reasons: [
      'This page claims you have won a prize',
      'This website was created very recently',
    ],
    action: 'Be careful. Do not enter your personal details on this page.',
  },
  highRisk: {
    verdict: 'HIGH RISK',
    score: 94,
    reasons: [
      'This page is pretending to be PayPal',
      'You are being asked to enter your password',
    ],
    action: 'Do not enter any information. Close this tab immediately.',
  },
};

// ── Verdict presentation config ───────────────────────

const VERDICT_CONFIG = {
  SAFE: {
    bg: '#27AE60',
    cls: 'safe',
    icon: '✓',
    phrase: 'This page looks safe',
  },
  SUSPICIOUS: {
    bg: '#E67E22',
    cls: 'suspicious',
    icon: '⚠',
    phrase: 'This page looks suspicious',
  },
  'HIGH RISK': {
    bg: '#C0392B',
    cls: 'high-risk',
    icon: '⚠',
    phrase: 'Warning: This page may be a scam',
  },
} as const;

// ── DOM helpers ───────────────────────────────────────

function el<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

function showState(state: UIState): void {
  const ids = ['stateLoading', 'stateIdle', 'stateResult', 'stateError'];
  const map: Record<UIState, string> = {
    loading: 'stateLoading',
    idle:    'stateIdle',
    result:  'stateResult',
    error:   'stateError',
  };
  ids.forEach(id => el(id).classList.add('hidden'));
  el(map[state]).classList.remove('hidden');
}

// ── Render ────────────────────────────────────────────

function renderResult(assessment: RiskAssessment, scannedUrl = ''): void {
  const cfg = VERDICT_CONFIG[assessment.verdict] ?? VERDICT_CONFIG['SAFE'];

  // Verdict header
  const header = el('verdictHeader');
  header.style.backgroundColor = cfg.bg;
  el('verdictIcon').textContent  = cfg.icon;
  el('verdictLabel').textContent = cfg.phrase;
  el('verdictDomain').textContent = scannedUrl;

  // Reasons
  const list = el('reasonsList');
  list.innerHTML = '';
  assessment.reasons.forEach(reason => {
    const li = document.createElement('li');
    li.textContent = reason;
    list.appendChild(li);
  });

  // Hide reasons section for safe (optional: show positive signals)
  const reasonsSection = el('reasonsSection');
  reasonsSection.style.display = assessment.reasons.length ? '' : 'none';

  // Action
  const actionSection = el('actionSection');
  actionSection.className = `action-section action-section--${cfg.cls}`;
  el('actionText').textContent = assessment.action;

  showState('result');
}

// ── Scan trigger ──────────────────────────────────────

function triggerScan(): void {
  showState('loading');

  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    const tab = tabs[0];
    if (!tab?.id || !tab.url) {
      showState('error');
      return;
    }

    // Clear previous result so storage listener fires on re-scan
    chrome.storage.session.set({ scanStatus: 'scanning', assessment: null });

    // Ask background to run a scan.
    // Dev 2: background handles 'SCAN_TAB' and writes result to storage.
    chrome.runtime.sendMessage(
      { type: 'SCAN_TAB', tabId: tab.id, url: tab.url },
      (response) => {
        if (chrome.runtime.lastError || !response) {
          // Backend not wired yet — fall back to mock
          console.warn('[Safely] No result from background — using mock data.');
          setTimeout(() => {
            const domain = (() => { try { return new URL(tab.url!).hostname; } catch { return tab.url ?? ''; } })();
            renderResult(DEV_MOCKS[DEV_MOCK_STATE], domain);
          }, 1000);
        }
        // If backend is wired, result arrives via storage change listener below
      },
    );
  });
}

// ── Storage listener ──────────────────────────────────
// Background writes { assessment, scannedUrl, scanStatus: 'done' }
// and the popup re-renders automatically.

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'session') return;

  const statusChange = changes['scanStatus'];
  const assessmentChange = changes['assessment'];

  if (statusChange?.newValue === 'scanning') {
    showState('loading');
    return;
  }

  if (statusChange?.newValue === 'error') {
    showState('error');
    return;
  }

  if (assessmentChange?.newValue) {
    chrome.storage.session.get(['scannedUrl'], data => {
      renderResult(assessmentChange.newValue, (data as SessionData).scannedUrl ?? '');
    });
  }
});

// ── Boot ──────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  // Wire up scan buttons
  el('rescanBtn')?.addEventListener('click', triggerScan);
  el('scanNowBtn')?.addEventListener('click', triggerScan);
  el('errorRescanBtn')?.addEventListener('click', triggerScan);

  // Read any cached result from the current session
  chrome.storage.session.get(['assessment', 'scannedUrl', 'scanStatus'], raw => {
    const data = raw as SessionData;

    if (data.scanStatus === 'scanning') {
      showState('loading');
    } else if (data.assessment) {
      renderResult(data.assessment, data.scannedUrl ?? '');
    } else {
      // No cached result — auto-scan immediately
      triggerScan();
    }
  });
});
