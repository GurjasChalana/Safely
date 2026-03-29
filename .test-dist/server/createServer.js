"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createSafeBrowsingServer = createSafeBrowsingServer;
exports.handleSafeBrowsingHttpRequest = handleSafeBrowsingHttpRequest;
const node_http_1 = require("node:http");
const safeBrowsing_1 = require("./safeBrowsing");
function setJsonHeaders(response, statusCode) {
    response.statusCode = statusCode;
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}
function sendJson(response, statusCode, payload) {
    setJsonHeaders(response, statusCode);
    response.end(JSON.stringify(payload));
}
function readJsonBody(request) {
    return new Promise((resolve, reject) => {
        let rawBody = '';
        request.on('data', chunk => {
            rawBody += chunk;
            if (rawBody.length > 1000000) {
                reject(new Error('request_too_large'));
                request.destroy();
            }
        });
        request.on('end', () => {
            if (!rawBody.trim()) {
                resolve({});
                return;
            }
            try {
                resolve(JSON.parse(rawBody));
            }
            catch {
                reject(new Error('invalid_json'));
            }
        });
        request.on('error', reject);
    });
}
function createSafeBrowsingServer(options) {
    const logger = options.logger ?? console;
    return (0, node_http_1.createServer)(async (request, response) => {
        if (request.method === 'OPTIONS') {
            setJsonHeaders(response, 204);
            response.end();
            return;
        }
        try {
            const body = await readJsonBody(request);
            const result = await handleSafeBrowsingHttpRequest({
                method: request.method,
                url: request.url ?? undefined,
                body,
            }, options);
            sendJson(response, result.statusCode, result.body);
        }
        catch (error) {
            if (error instanceof Error && (error.message === 'invalid_json' || error.message === 'request_too_large')) {
                sendJson(response, 400, (0, safeBrowsing_1.buildServerSafeBrowsingError)('invalid_url'));
                return;
            }
            logger.error('[Safely] Server request handler failed.', error);
            sendJson(response, 500, (0, safeBrowsing_1.buildServerSafeBrowsingError)('upstream_failure'));
        }
    });
}
async function handleSafeBrowsingHttpRequest(request, options) {
    if (request.method !== 'POST' || request.url !== '/api/safe-browsing/check') {
        return {
            statusCode: 404,
            body: { error: 'not_found' },
        };
    }
    const body = (request.body ?? {});
    const rawUrl = typeof body.url === 'string' ? body.url : '';
    const normalizedUrl = (0, safeBrowsing_1.normalizeServerUrl)(rawUrl);
    if (!normalizedUrl) {
        return {
            statusCode: 400,
            body: (0, safeBrowsing_1.buildServerSafeBrowsingError)('invalid_url'),
        };
    }
    const result = await (0, safeBrowsing_1.queryGoogleSafeBrowsing)(normalizedUrl, options);
    return {
        statusCode: result.error === 'upstream_failure' ? 502 : 200,
        body: result,
    };
}
