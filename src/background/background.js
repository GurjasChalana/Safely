// ──────────────────────────────────────────────────────
// Safely Background Service Worker · background.js
//
// Dev 2: implement analyzeUrl() to call your AI API.
// Everything else (storage writes, banner messaging)
// is already wired up below.
//
// Storage contract (chrome.storage.session):
//   scanStatus : 'idle' | 'scanning' | 'done' | 'error'
//   assessment : RiskAssessment | null
//   scannedUrl : string
// ──────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'SCAN_TAB') {
    handleScan(message.url, message.tabId)
      .then(assessment => {
        // Write result to session storage — popup re-renders automatically
        chrome.storage.session.set({
          scanStatus: 'done',
          assessment,
          scannedUrl: extractDomain(message.url),
        });

        // Push banner to the active tab
        chrome.tabs.sendMessage(message.tabId, { type: 'SHOW_BANNER', assessment });

        sendResponse({ assessment });
      })
      .catch(err => {
        console.warn('[Safely] Scan failed (backend not wired?):', err.message);
        // Don't write 'error' to storage — let the popup's mock fallback handle it
        // when Dev 2 wires up analyzeUrl(), swap this for the storage write below:
        //   chrome.storage.session.set({ scanStatus: 'error', assessment: null });
        sendResponse(null);
      });

    return true; // keep channel open for async response
  }
});

// ── analyzeUrl ────────────────────────────────────────
// Dev 2: replace this stub with your real API call.
// Must return a Promise<RiskAssessment>.

async function analyzeUrl(_url) {
  // TODO: call your AI analysis API, e.g.:
  //
  // const res = await fetch('https://your-api/analyze', {
  //   method: 'POST',
  //   headers: { 'Content-Type': 'application/json' },
  //   body: JSON.stringify({ url }),
  // });
  // if (!res.ok) throw new Error(`API error: ${res.status}`);
  // return res.json();

  throw new Error('[Safely] analyzeUrl() not yet implemented');
}

async function handleScan(url, _tabId) {
  return analyzeUrl(url);
}

function extractDomain(url) {
  try { return new URL(url).hostname; } catch { return url; }
}
