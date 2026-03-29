import test from 'node:test';
import assert from 'node:assert/strict';

import { applySafeBrowsingResult } from '../src/background/safeBrowsingRisk';
import { checkSafeBrowsing } from '../src/background/safebrowsing';
import type { RiskAssessment } from '../src/shared/types';

function createAssessment(overrides: Partial<RiskAssessment> = {}): RiskAssessment {
  return {
    verdict: 'SUSPICIOUS',
    score: 42,
    displayScore: 33,
    reasons: ['This page is asking for personal information.'],
    action: 'Be careful. Do not enter your password or any personal details.',
    triggeredSignals: ['PASSWORD_ON_SUSPICIOUS_DOMAIN'],
    domain: 'example.com',
    ...overrides,
  };
}

test('extension helper reports backend failure without escalating', async () => {
  const result = await checkSafeBrowsing('https://example.com', {
    backendUrl: 'http://127.0.0.1:65535',
    timeoutMs: 50,
  });

  assert.deepEqual(result, {
    safe: true,
    matches: [],
    source: 'google-safe-browsing',
    error: 'network_error',
  });
});

test('risk pipeline adds a Safe Browsing reason and upgrades to high risk', () => {
  const updated = applySafeBrowsingResult(createAssessment(), {
    safe: false,
    matches: [
      {
        threatType: 'SOCIAL_ENGINEERING',
        platformType: 'ANY_PLATFORM',
        threatEntryType: 'URL',
      },
    ],
    source: 'google-safe-browsing',
  });

  assert.equal(updated.verdict, 'HIGH RISK');
  assert.equal(updated.score, 85);
  assert.equal(updated.displayScore, 90);
  assert.match(updated.reasons[0], /Google Safe Browsing flagged this URL for social engineering\./);
  assert.equal(updated.action, 'Do not enter any information. Close this tab immediately.');
  assert.ok(updated.triggeredSignals.includes('SAFE_BROWSING_SOCIAL_ENGINEERING'));
  assert.deepEqual(updated.safeBrowsing, {
    safe: false,
    matches: [
      {
        threatType: 'SOCIAL_ENGINEERING',
        platformType: 'ANY_PLATFORM',
        threatEntryType: 'URL',
      },
    ],
    source: 'google-safe-browsing',
  });
});
