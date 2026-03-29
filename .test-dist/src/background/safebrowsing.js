"use strict";
// ──────────────────────────────────────────────────────
// Safely · background/safebrowsing.ts
//
// Calls the Safely backend for Google Safe Browsing checks.
// The Google API key never lives in the extension bundle.
// ──────────────────────────────────────────────────────
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildSafeBrowsingErrorResult = buildSafeBrowsingErrorResult;
exports.normalizeSafeBrowsingUrl = normalizeSafeBrowsingUrl;
exports.checkSafeBrowsing = checkSafeBrowsing;
const config_1 = require("../config");
const SOURCE = 'google-safe-browsing';
const TIMEOUT_MS = 4000;
function buildSafeBrowsingErrorResult(error) {
    return {
        safe: true,
        matches: [],
        source: SOURCE,
        error,
    };
}
function normalizeSafeBrowsingUrl(url) {
    const trimmed = url.trim();
    if (!trimmed) {
        return null;
    }
    try {
        const parsed = new URL(trimmed);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            return null;
        }
        return parsed.toString();
    }
    catch {
        return null;
    }
}
function sanitizeMatches(matches) {
    if (!Array.isArray(matches)) {
        return [];
    }
    return matches.map(match => {
        const candidate = (match ?? {});
        return {
            threatType: typeof candidate.threatType === 'string' ? candidate.threatType : undefined,
            platformType: typeof candidate.platformType === 'string' ? candidate.platformType : undefined,
            threatEntryType: typeof candidate.threatEntryType === 'string'
                ? candidate.threatEntryType
                : undefined,
            ...(candidate.threat !== undefined ? { threat: candidate.threat } : {}),
        };
    });
}
function parseSafeBrowsingPayload(payload) {
    if (!payload || typeof payload !== 'object') {
        return null;
    }
    const candidate = payload;
    const source = candidate.source === SOURCE ? SOURCE : SOURCE;
    const error = typeof candidate.error === 'string'
        ? candidate.error
        : undefined;
    return {
        safe: candidate.safe !== false,
        matches: sanitizeMatches(candidate.matches),
        source,
        error,
    };
}
async function checkSafeBrowsing(url, options = {}) {
    const normalizedUrl = normalizeSafeBrowsingUrl(url);
    if (!normalizedUrl) {
        return buildSafeBrowsingErrorResult('invalid_url');
    }
    const backendBaseUrl = (options.backendUrl ?? config_1.SAFE_BROWSING_BACKEND_URL).trim().replace(/\/+$/, '');
    if (!backendBaseUrl) {
        return buildSafeBrowsingErrorResult('network_error');
    }
    const fetchImpl = options.fetchImpl ?? fetch;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? TIMEOUT_MS);
    try {
        const response = await fetchImpl(`${backendBaseUrl}/api/safe-browsing/check`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ url: normalizedUrl }),
            signal: controller.signal,
        });
        const payload = await response.json().catch(() => null);
        const parsed = parseSafeBrowsingPayload(payload);
        if (!response.ok) {
            return parsed ?? buildSafeBrowsingErrorResult('upstream_failure');
        }
        return parsed ?? buildSafeBrowsingErrorResult('network_error');
    }
    catch (err) {
        console.warn('[Safely] Safe Browsing check failed:', err);
        return buildSafeBrowsingErrorResult('network_error');
    }
    finally {
        clearTimeout(timeout);
    }
}
