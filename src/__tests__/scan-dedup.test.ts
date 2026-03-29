// ──────────────────────────────────────────────────────
// Tests for the scan deduplication and freshness system
// introduced to prevent duplicate AI narration.
//
// These tests exercise the logic that was extracted from
// background.ts in isolation to keep tests fast and free
// of Chrome API dependencies.
// ──────────────────────────────────────────────────────

// ── Helpers mirroring background.ts internals ────────
// (Duplicated here so tests don't import the real module,
// which depends on chrome.* globals.)

const DEDUP_WINDOW_MS = 2000;

function makeScanIdRegistry() {
  const latestScanId = new Map<number, string>();

  function registerLatestScan(tabId: number, scanId: string) {
    latestScanId.set(tabId, scanId);
  }

  function isScanCurrent(tabId: number | undefined, scanId: string): boolean {
    if (tabId === undefined) return true;
    return latestScanId.get(tabId) === scanId;
  }

  return { registerLatestScan, isScanCurrent };
}

function makeDedupRegistry() {
  interface LastScanInfo { url: string; time: number; }
  const lastScanInfo = new Map<number, LastScanInfo>();

  function isDuplicateScan(tabId: number, url: string, forced: boolean, now = Date.now()): boolean {
    if (forced) return false;
    const last = lastScanInfo.get(tabId);
    if (!last) return false;
    return last.url === url && now - last.time < DEDUP_WINDOW_MS;
  }

  function recordScanStart(tabId: number, url: string, now = Date.now()) {
    lastScanInfo.set(tabId, { url, time: now });
  }

  return { isDuplicateScan, recordScanStart };
}

// ─────────────────────────────────────────────────────
// 1. Auto-scan fires on first document lifecycle
// ─────────────────────────────────────────────────────

describe('content script one-per-document guard', () => {
  it('auto-scan runs once when __safely_scanned is unset', () => {
    const win: any = {};
    let scanCount = 0;

    function runScan(forced = false) {
      if (!forced && win.__safely_scanned) return;
      win.__safely_scanned = true;
      scanCount++;
    }

    runScan(); // page load
    expect(scanCount).toBe(1);
  });

  it('second auto-scan is suppressed by the guard', () => {
    const win: any = { __safely_scanned: true };
    let scanCount = 0;

    function runScan(forced = false) {
      if (!forced && win.__safely_scanned) return;
      win.__safely_scanned = true;
      scanCount++;
    }

    runScan(); // would-be duplicate
    expect(scanCount).toBe(0);
  });

  it('forced=true bypasses the guard for manual rescans', () => {
    const win: any = { __safely_scanned: true };
    let scanCount = 0;

    function runScan(forced = false) {
      if (!forced && win.__safely_scanned) return;
      win.__safely_scanned = true;
      scanCount++;
    }

    runScan(true); // explicit user rescan
    expect(scanCount).toBe(1);
  });
});

// ─────────────────────────────────────────────────────
// 2. Scan identity: newer scan supersedes older one
// ─────────────────────────────────────────────────────

describe('scan identity / freshness', () => {
  it('the latest registered scan is current', () => {
    const { registerLatestScan, isScanCurrent } = makeScanIdRegistry();
    registerLatestScan(1, 'scan-a');
    expect(isScanCurrent(1, 'scan-a')).toBe(true);
  });

  it('a newer scan supersedes the old one', () => {
    const { registerLatestScan, isScanCurrent } = makeScanIdRegistry();
    registerLatestScan(1, 'scan-a');
    registerLatestScan(1, 'scan-b'); // newer scan arrives
    expect(isScanCurrent(1, 'scan-a')).toBe(false); // stale
    expect(isScanCurrent(1, 'scan-b')).toBe(true);  // current
  });

  it('scans on different tabs are independent', () => {
    const { registerLatestScan, isScanCurrent } = makeScanIdRegistry();
    registerLatestScan(1, 'scan-tab1');
    registerLatestScan(2, 'scan-tab2');
    expect(isScanCurrent(1, 'scan-tab1')).toBe(true);
    expect(isScanCurrent(2, 'scan-tab2')).toBe(true);
    // Superseding tab 2 does not affect tab 1
    registerLatestScan(2, 'scan-tab2-v2');
    expect(isScanCurrent(1, 'scan-tab1')).toBe(true);
    expect(isScanCurrent(2, 'scan-tab2')).toBe(false);
  });

  it('undefined tabId is always considered current (no tab to track)', () => {
    const { isScanCurrent } = makeScanIdRegistry();
    expect(isScanCurrent(undefined, 'any-id')).toBe(true);
  });
});

// ─────────────────────────────────────────────────────
// 3. Stale scan must not play audio
// ─────────────────────────────────────────────────────

describe('stale scan audio suppression', () => {
  it('stale scan does not play audio when a newer scan registered', async () => {
    const { registerLatestScan, isScanCurrent } = makeScanIdRegistry();
    const audioPlayed: string[] = [];

    async function simulateScanTail(tabId: number, scanId: string, verdict: string) {
      // Groq would run here (await omitted for simplicity)
      if (!isScanCurrent(tabId, scanId)) return; // freshness gate
      if (verdict === 'SUSPICIOUS' || verdict === 'HIGH RISK') {
        // ElevenLabs + play audio
        if (!isScanCurrent(tabId, scanId)) return; // freshness gate before TTS
        audioPlayed.push(scanId);
      }
    }

    registerLatestScan(1, 'scan-a');
    // Scan B arrives while scan A hasn't played yet
    registerLatestScan(1, 'scan-b');

    await simulateScanTail(1, 'scan-a', 'SUSPICIOUS'); // stale — should not play
    await simulateScanTail(1, 'scan-b', 'SUSPICIOUS'); // current — should play

    expect(audioPlayed).toEqual(['scan-b']);
  });
});

// ─────────────────────────────────────────────────────
// 4. Banner updates only for the latest scan
// ─────────────────────────────────────────────────────

describe('banner update freshness', () => {
  it('stale scan does not send SHOW_BANNER', () => {
    const { registerLatestScan, isScanCurrent } = makeScanIdRegistry();
    const bannersSent: string[] = [];

    function maybeSendBanner(tabId: number, scanId: string, verdict: string) {
      if (!isScanCurrent(tabId, scanId)) return;
      if (verdict !== 'SAFE') bannersSent.push(scanId);
    }

    registerLatestScan(1, 'scan-a');
    registerLatestScan(1, 'scan-b'); // supersedes A

    maybeSendBanner(1, 'scan-a', 'SUSPICIOUS'); // stale
    maybeSendBanner(1, 'scan-b', 'SUSPICIOUS'); // current

    expect(bannersSent).toEqual(['scan-b']);
  });
});

// ─────────────────────────────────────────────────────
// 5. Same-page dedup window
// ─────────────────────────────────────────────────────

describe('same-page dedup window', () => {
  it('suppresses a duplicate scan for the same tab+URL within the window', () => {
    const { isDuplicateScan, recordScanStart } = makeDedupRegistry();
    const t0 = 1_000_000;
    recordScanStart(1, 'https://example.com', t0);
    // Second scan arrives 500ms later — within the 2s window
    expect(isDuplicateScan(1, 'https://example.com', false, t0 + 500)).toBe(true);
  });

  it('allows a scan after the dedup window expires', () => {
    const { isDuplicateScan, recordScanStart } = makeDedupRegistry();
    const t0 = 1_000_000;
    recordScanStart(1, 'https://example.com', t0);
    expect(isDuplicateScan(1, 'https://example.com', false, t0 + 3000)).toBe(false);
  });

  it('does not suppress scans for a different URL on the same tab', () => {
    const { isDuplicateScan, recordScanStart } = makeDedupRegistry();
    const t0 = 1_000_000;
    recordScanStart(1, 'https://example.com', t0);
    expect(isDuplicateScan(1, 'https://other.com', false, t0 + 100)).toBe(false);
  });

  it('forced=true bypasses the dedup window (manual rescan)', () => {
    const { isDuplicateScan, recordScanStart } = makeDedupRegistry();
    const t0 = 1_000_000;
    recordScanStart(1, 'https://example.com', t0);
    // Even within the window, forced scan should not be suppressed
    expect(isDuplicateScan(1, 'https://example.com', true, t0 + 100)).toBe(false);
  });

  it('first scan for a tab is never suppressed', () => {
    const { isDuplicateScan } = makeDedupRegistry();
    expect(isDuplicateScan(99, 'https://new-tab.com', false)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────
// 6. Manual rescan still works end-to-end
// ─────────────────────────────────────────────────────

describe('manual rescan flow', () => {
  it('popup manual rescan passes forced=true, which bypasses guard and dedup', () => {
    const win: any = { __safely_scanned: true }; // already auto-scanned
    let scanCount = 0;

    function runScan(forced = false) {
      if (!forced && win.__safely_scanned) return;
      win.__safely_scanned = true;
      scanCount++;
    }

    const { isDuplicateScan, recordScanStart } = makeDedupRegistry();
    const t0 = 1_000_000;
    recordScanStart(1, 'https://example.com', t0);

    // Popup sends DO_SCAN with forced=true
    const forced = true;

    runScan(forced); // content script: guard bypassed
    const isDup = isDuplicateScan(1, 'https://example.com', forced, t0 + 100);

    expect(scanCount).toBe(1);     // scan ran
    expect(isDup).toBe(false);     // not suppressed by dedup
  });
});
