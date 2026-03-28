// ──────────────────────────────────────────────────────
// Safely · shared/storage.ts
//
// All reads and writes to chrome.storage.session go
// through these helpers. Only the service worker writes.
// The popup reads. Nobody else touches storage directly.
// ──────────────────────────────────────────────────────

import { RiskAssessment } from './types';

export type ScanStatus = 'idle' | 'scanning' | 'done' | 'error';

const KEYS = {
  assessment: 'assessment',
  scannedUrl: 'scannedUrl',
  scanStatus: 'scanStatus',
} as const;

// Called by service worker after processing a scan result.
export async function saveAssessment(
  assessment: RiskAssessment,
  url: string,
): Promise<void> {
  await chrome.storage.session.set({
    [KEYS.assessment]: assessment,
    [KEYS.scannedUrl]: url,
    [KEYS.scanStatus]: 'done' as ScanStatus,
  });
}

// Called by the popup to read the latest cached result.
export async function getAssessment(): Promise<{
  assessment: RiskAssessment | null;
  scannedUrl: string;
}> {
  const data = await chrome.storage.session.get([
    KEYS.assessment,
    KEYS.scannedUrl,
  ]);
  return {
    assessment: (data[KEYS.assessment] as RiskAssessment) ?? null,
    scannedUrl: (data[KEYS.scannedUrl] as string) ?? '',
  };
}

// Called by service worker to update scan progress.
export async function setScanStatus(status: ScanStatus): Promise<void> {
  await chrome.storage.session.set({ [KEYS.scanStatus]: status });
}