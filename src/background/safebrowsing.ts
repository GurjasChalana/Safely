// ──────────────────────────────────────────────────────
// Safely · background/safebrowsing.ts
//
// Checks a URL against Google's known phishing/malware
// database. Called on every page scan.
//
// Returns true  → domain is confirmed malicious (escalate to HIGH RISK)
// Returns false → domain is clean or API unavailable
// ──────────────────────────────────────────────────────

import { SAFE_BROWSING_API_KEY } from '../config';

const ENDPOINT = 'https://safebrowsing.googleapis.com/v4/threatMatches:find';

export async function checkDomain(url: string): Promise<boolean> {
  if (!SAFE_BROWSING_API_KEY) {
    console.warn('[Safely] Safe Browsing API key not set — skipping check.');
    return false;
  }

  try {
    const body = JSON.stringify({
      client: { clientId: 'safely-extension', clientVersion: '0.1.0' },
      threatInfo: {
        threatTypes: ['MALWARE', 'SOCIAL_ENGINEERING', 'UNWANTED_SOFTWARE', 'POTENTIALLY_HARMFUL_APPLICATION'],
        platformTypes: ['ANY_PLATFORM'],
        threatEntryTypes: ['URL'],
        threatEntries: [{ url }],
      },
    });

    console.log('[Safely] Safe Browsing → checking URL:', url);

    const response = await fetch(`${ENDPOINT}?key=${SAFE_BROWSING_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });

    const rawBody = await response.text();
    console.log('[Safely] Safe Browsing ← status:', response.status, '| body:', rawBody.slice(0, 300));

    if (!response.ok) return false;

    const data = JSON.parse(rawBody);
    const matched = Array.isArray(data.matches) && data.matches.length > 0;
    if (matched) console.log('[Safely] Safe Browsing ✓ THREAT FOUND:', data.matches);
    return matched;
  } catch (err) {
    console.warn('[Safely] Safe Browsing check failed:', err);
    return false; // fail safe — never escalate on API error
  }
}