// ──────────────────────────────────────────────────────
// Safely Background Service Worker · background.ts
//
// Dev 2: This is your main integration point.
// Replace the stub in handleScan() with your real
// AI analysis API call.
// ──────────────────────────────────────────────────────

interface AssessmentResult {
  verdict: 'SAFE' | 'SUSPICIOUS' | 'HIGH RISK';
  score: number;
  reasons: string[];
  action: string;
}

interface ScanMessage {
  type: 'SCAN_TAB';
  tabId: number;
  url: string;
}

// ── Message router ────────────────────────────────────

chrome.runtime.onMessage.addListener(
  (message: ScanMessage, _sender, sendResponse) => {
    if (message.type === 'SCAN_TAB') {
      handleScan(message.url, message.tabId)
        .then((result) => {
          sendResponse({ result });
          // Also push banner to the content script
          chrome.tabs.sendMessage(message.tabId, { type: 'SHOW_BANNER', result });
        })
        .catch(() => sendResponse(null));
      return true; // keep message channel open for async response
    }
  },
);

// ── Scan handler ──────────────────────────────────────
// Dev 2: replace this stub with your real API call.
// Expected return: Promise<AssessmentResult>

async function handleScan(url: string, _tabId: number): Promise<AssessmentResult> {
  // ── TODO: call your analysis API ─────────────────────
  // Example:
  //   const response = await fetch('https://your-api/analyze', {
  //     method: 'POST',
  //     headers: { 'Content-Type': 'application/json' },
  //     body: JSON.stringify({ url }),
  //   });
  //   return response.json();
  // ─────────────────────────────────────────────────────

  // Stub — signals "not implemented" so popup falls back to mock
  throw new Error(`[Safely] handleScan not yet implemented for: ${url}`);
}

export {};
