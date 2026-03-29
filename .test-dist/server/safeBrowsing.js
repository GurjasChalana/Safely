"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildServerSafeBrowsingError = buildServerSafeBrowsingError;
exports.normalizeServerUrl = normalizeServerUrl;
exports.queryGoogleSafeBrowsing = queryGoogleSafeBrowsing;
const GOOGLE_SAFE_BROWSING_ENDPOINT = 'https://safebrowsing.googleapis.com/v4/threatMatches:find';
const THREAT_TYPES = [
    'MALWARE',
    'SOCIAL_ENGINEERING',
    'UNWANTED_SOFTWARE',
    'POTENTIALLY_HARMFUL_APPLICATION',
];
const SOURCE = 'google-safe-browsing';
const DEFAULT_TIMEOUT_MS = 5000;
function buildServerSafeBrowsingError(error) {
    return {
        safe: true,
        matches: [],
        source: SOURCE,
        error,
    };
}
function normalizeServerUrl(url) {
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
function mapMatches(matches) {
    if (!Array.isArray(matches)) {
        return [];
    }
    return matches.map(match => ({
        threatType: match.threatType,
        platformType: match.platformType,
        threatEntryType: match.threatEntryType,
        ...(match.threat !== undefined ? { threat: match.threat } : {}),
    }));
}
async function queryGoogleSafeBrowsing(url, options) {
    const normalizedUrl = normalizeServerUrl(url);
    if (!normalizedUrl) {
        return buildServerSafeBrowsingError('invalid_url');
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    try {
        const response = await (options.fetchImpl ?? fetch)(`${GOOGLE_SAFE_BROWSING_ENDPOINT}?key=${encodeURIComponent(options.apiKey)}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                client: {
                    clientId: options.clientId ?? 'safely-backend',
                    clientVersion: options.clientVersion ?? '0.1.0',
                },
                threatInfo: {
                    threatTypes: THREAT_TYPES,
                    platformTypes: ['ANY_PLATFORM'],
                    threatEntryTypes: ['URL'],
                    threatEntries: [{ url: normalizedUrl }],
                },
            }),
            signal: controller.signal,
        });
        if (!response.ok) {
            options.logger?.error?.(`[Safely] Safe Browsing upstream failure: HTTP ${response.status}`);
            return buildServerSafeBrowsingError('upstream_failure');
        }
        const payload = await response.json();
        const matches = mapMatches(payload.matches);
        return {
            safe: matches.length === 0,
            matches,
            source: SOURCE,
        };
    }
    catch (error) {
        options.logger?.error?.('[Safely] Safe Browsing upstream request failed.', error);
        return buildServerSafeBrowsingError('upstream_failure');
    }
    finally {
        clearTimeout(timeout);
    }
}
