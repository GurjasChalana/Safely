"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const safeBrowsingRisk_1 = require("../src/background/safeBrowsingRisk");
const safebrowsing_1 = require("../src/background/safebrowsing");
function createAssessment(overrides = {}) {
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
(0, node_test_1.default)('extension helper reports backend failure without escalating', async () => {
    const result = await (0, safebrowsing_1.checkSafeBrowsing)('https://example.com', {
        backendUrl: 'http://127.0.0.1:65535',
        timeoutMs: 50,
    });
    strict_1.default.deepEqual(result, {
        safe: true,
        matches: [],
        source: 'google-safe-browsing',
        error: 'network_error',
    });
});
(0, node_test_1.default)('risk pipeline adds a Safe Browsing reason and upgrades to high risk', () => {
    const updated = (0, safeBrowsingRisk_1.applySafeBrowsingResult)(createAssessment(), {
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
    strict_1.default.equal(updated.verdict, 'HIGH RISK');
    strict_1.default.equal(updated.score, 85);
    strict_1.default.equal(updated.displayScore, 90);
    strict_1.default.match(updated.reasons[0], /Google Safe Browsing flagged this URL for social engineering\./);
    strict_1.default.equal(updated.action, 'Do not enter any information. Close this tab immediately.');
    strict_1.default.ok(updated.triggeredSignals.includes('SAFE_BROWSING_SOCIAL_ENGINEERING'));
    strict_1.default.deepEqual(updated.safeBrowsing, {
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
