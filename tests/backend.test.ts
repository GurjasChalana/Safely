import test from 'node:test';
import assert from 'node:assert/strict';

import { handleSafeBrowsingHttpRequest } from '../server/createServer';

function createOptions(fetchImpl: typeof fetch) {
  return {
    apiKey: 'test-key',
    fetchImpl,
    logger: {
      error: () => {},
      info: () => {},
      warn: () => {},
    },
  };
}

test('backend rejects invalid URLs', async () => {
  const response = await handleSafeBrowsingHttpRequest({
    method: 'POST',
    url: '/api/safe-browsing/check',
    body: { url: '   ' },
  }, createOptions(async () => {
    throw new Error('fetch should not be called for invalid URLs');
  }));

  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.body, {
    safe: true,
    matches: [],
    source: 'google-safe-browsing',
    error: 'invalid_url',
  });
});

test('backend returns a safe response with no matches', async () => {
  const response = await handleSafeBrowsingHttpRequest({
    method: 'POST',
    url: '/api/safe-browsing/check',
    body: { url: 'https://example.com' },
  }, createOptions(async () =>
    new Response(JSON.stringify({ matches: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  ));

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, {
    safe: true,
    matches: [],
    source: 'google-safe-browsing',
  });
});

test('backend returns matches for an unsafe URL', async () => {
  const response = await handleSafeBrowsingHttpRequest({
    method: 'POST',
    url: '/api/safe-browsing/check',
    body: { url: 'https://bad.example.com' },
  }, createOptions(async () =>
    new Response(JSON.stringify({
      matches: [
        {
          threatType: 'SOCIAL_ENGINEERING',
          platformType: 'ANY_PLATFORM',
          threatEntryType: 'URL',
        },
      ],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  ));

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, {
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

test('backend returns a structured upstream failure when Google fails', async () => {
  const response = await handleSafeBrowsingHttpRequest({
    method: 'POST',
    url: '/api/safe-browsing/check',
    body: { url: 'https://example.com' },
  }, createOptions(async () =>
    new Response('upstream failed', { status: 503 }),
  ));

  assert.equal(response.statusCode, 502);
  assert.deepEqual(response.body, {
    safe: true,
    matches: [],
    source: 'google-safe-browsing',
    error: 'upstream_failure',
  });
});
