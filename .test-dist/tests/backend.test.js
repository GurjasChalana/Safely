"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const createServer_1 = require("../server/createServer");
function createOptions(fetchImpl) {
    return {
        apiKey: 'test-key',
        fetchImpl,
        logger: {
            error: () => { },
            info: () => { },
            warn: () => { },
        },
    };
}
(0, node_test_1.default)('backend rejects invalid URLs', async () => {
    const response = await (0, createServer_1.handleSafeBrowsingHttpRequest)({
        method: 'POST',
        url: '/api/safe-browsing/check',
        body: { url: '   ' },
    }, createOptions(async () => {
        throw new Error('fetch should not be called for invalid URLs');
    }));
    strict_1.default.equal(response.statusCode, 400);
    strict_1.default.deepEqual(response.body, {
        safe: true,
        matches: [],
        source: 'google-safe-browsing',
        error: 'invalid_url',
    });
});
(0, node_test_1.default)('backend returns a safe response with no matches', async () => {
    const response = await (0, createServer_1.handleSafeBrowsingHttpRequest)({
        method: 'POST',
        url: '/api/safe-browsing/check',
        body: { url: 'https://example.com' },
    }, createOptions(async () => new Response(JSON.stringify({ matches: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
    })));
    strict_1.default.equal(response.statusCode, 200);
    strict_1.default.deepEqual(response.body, {
        safe: true,
        matches: [],
        source: 'google-safe-browsing',
    });
});
(0, node_test_1.default)('backend returns matches for an unsafe URL', async () => {
    const response = await (0, createServer_1.handleSafeBrowsingHttpRequest)({
        method: 'POST',
        url: '/api/safe-browsing/check',
        body: { url: 'https://bad.example.com' },
    }, createOptions(async () => new Response(JSON.stringify({
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
    })));
    strict_1.default.equal(response.statusCode, 200);
    strict_1.default.deepEqual(response.body, {
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
(0, node_test_1.default)('backend returns a structured upstream failure when Google fails', async () => {
    const response = await (0, createServer_1.handleSafeBrowsingHttpRequest)({
        method: 'POST',
        url: '/api/safe-browsing/check',
        body: { url: 'https://example.com' },
    }, createOptions(async () => new Response('upstream failed', { status: 503 })));
    strict_1.default.equal(response.statusCode, 502);
    strict_1.default.deepEqual(response.body, {
        safe: true,
        matches: [],
        source: 'google-safe-browsing',
        error: 'upstream_failure',
    });
});
