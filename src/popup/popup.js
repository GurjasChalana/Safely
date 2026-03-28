// ──────────────────────────────────────────────────────
// Safely Popup · popup.js  (compiled from popup.ts)
//
// Reads RiskAssessment from chrome.storage.session.
// Dev 2: write { assessment, scannedUrl, scanStatus }
// to chrome.storage.session from your background script.
// ──────────────────────────────────────────────────────

// ── Dev mock fallback ─────────────────────────────────
// Change DEV_MOCK_STATE to 'safe' | 'suspicious' | 'highRisk'
// to preview each state while the backend is not wired up.

const DEV_MOCK_STATE = 'highRisk';

const DEV_MOCKS = {
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

// ── Verdict config ────────────────────────────────────

const VERDICT_CONFIG = {
  'SAFE':      { bg: '#27AE60', cls: 'safe',      icon: '✓', phrase: 'This page looks safe' },
  'SUSPICIOUS':{ bg: '#E67E22', cls: 'suspicious', icon: '⚠', phrase: 'This page looks suspicious' },
  'HIGH RISK': { bg: '#C0392B', cls: 'high-risk',  icon: '⚠', phrase: 'Warning: This page may be a scam' },
};

// ── DOM helpers ───────────────────────────────────────

function el(id) {
  return document.getElementById(id);
}

function showState(state) {
  const map = {
    loading: 'stateLoading',
    idle:    'stateIdle',
    result:  'stateResult',
    error:   'stateError',
  };
  ['stateLoading', 'stateIdle', 'stateResult', 'stateError'].forEach(id => {
    el(id).classList.add('hidden');
  });
  el(map[state]).classList.remove('hidden');
}

// ── Render ────────────────────────────────────────────
// Dev 2: you can also call renderResult() directly from
// the background via chrome.runtime.sendMessage if preferred.

function renderResult(assessment, scannedUrl = '') {
  const cfg = VERDICT_CONFIG[assessment.verdict] || VERDICT_CONFIG['SAFE'];

  // Verdict header
  el('verdictHeader').style.backgroundColor = cfg.bg;
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
  el('reasonsSection').style.display = assessment.reasons.length ? '' : 'none';

  // Action
  const actionSection = el('actionSection');
  actionSection.className = `action-section action-section--${cfg.cls}`;
  el('actionText').textContent = assessment.action;

  showState('result');
}

// ── Scan trigger ──────────────────────────────────────

function triggerScan() {
  showState('loading');

  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    const tab = tabs[0];
    if (!tab || !tab.id || !tab.url) {
      showState('error');
      return;
    }

    chrome.storage.session.set({ scanStatus: 'scanning', assessment: null });

    chrome.runtime.sendMessage(
      { type: 'SCAN_TAB', tabId: tab.id, url: tab.url },
      (response) => {
        // Fallback when: background not reachable (lastError) OR backend
        // not yet implemented (response is null)
        if (chrome.runtime.lastError || !response) {
          console.warn('[Safely] No result from background — using mock data.');
          let domain = tab.url;
          try { domain = new URL(tab.url).hostname; } catch {}
          setTimeout(() => renderResult(DEV_MOCKS[DEV_MOCK_STATE], domain), 1000);
        }
        // If backend is wired: result arrives via storage change listener
      },
    );
  });
}

// ── Storage change listener ───────────────────────────
// Background writes { assessment, scannedUrl, scanStatus: 'done' }

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'session') return;

  const statusChange    = changes['scanStatus'];
  const assessmentChange = changes['assessment'];

  if (statusChange && statusChange.newValue === 'scanning') { showState('loading'); return; }
  if (statusChange && statusChange.newValue === 'error')    { showState('error');   return; }

  if (assessmentChange && assessmentChange.newValue) {
    chrome.storage.session.get(['scannedUrl'], data => {
      renderResult(assessmentChange.newValue, data.scannedUrl || '');
    });
  }
});

// ── Boot ──────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  el('rescanBtn')     && el('rescanBtn').addEventListener('click', triggerScan);
  el('scanNowBtn')    && el('scanNowBtn').addEventListener('click', triggerScan);
  el('errorRescanBtn')&& el('errorRescanBtn').addEventListener('click', triggerScan);

  // Show any cached result from this session, else auto-scan
  chrome.storage.session.get(['assessment', 'scannedUrl', 'scanStatus'], data => {
    if (data.scanStatus === 'scanning') {
      showState('loading');
    } else if (data.assessment) {
      renderResult(data.assessment, data.scannedUrl || '');
    } else {
      triggerScan();
    }
  });
});
