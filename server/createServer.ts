import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

import {
  buildServerSafeBrowsingError,
  normalizeServerUrl,
  queryGoogleSafeBrowsing,
  type SafeBrowsingServiceOptions,
} from './safeBrowsing';

type ServerLogger = Pick<Console, 'error' | 'info' | 'warn'>;

interface SafeBrowsingRequestBody {
  url?: unknown;
}

export interface CreateSafeBrowsingServerOptions extends SafeBrowsingServiceOptions {
  logger?: ServerLogger;
}

export interface SafeBrowsingHttpRequest {
  method?: string;
  url?: string;
  body?: unknown;
}

export interface SafeBrowsingHttpResponse {
  statusCode: number;
  body: unknown;
}

function setJsonHeaders(response: ServerResponse, statusCode: number): void {
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function sendJson(response: ServerResponse, statusCode: number, payload: unknown): void {
  setJsonHeaders(response, statusCode);
  response.end(JSON.stringify(payload));
}

function readJsonBody(request: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let rawBody = '';

    request.on('data', chunk => {
      rawBody += chunk;
      if (rawBody.length > 1_000_000) {
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
      } catch {
        reject(new Error('invalid_json'));
      }
    });

    request.on('error', reject);
  });
}

export function createSafeBrowsingServer(
  options: CreateSafeBrowsingServerOptions,
): Server {
  const logger = options.logger ?? console;

  return createServer(async (request, response) => {
    if (request.method === 'OPTIONS') {
      setJsonHeaders(response, 204);
      response.end();
      return;
    }

    try {
      const body = await readJsonBody(request);
      const result = await handleSafeBrowsingHttpRequest(
        {
          method: request.method,
          url: request.url ?? undefined,
          body,
        },
        options,
      );
      sendJson(response, result.statusCode, result.body);
    } catch (error) {
      if (error instanceof Error && (error.message === 'invalid_json' || error.message === 'request_too_large')) {
        sendJson(response, 400, buildServerSafeBrowsingError('invalid_url'));
        return;
      }

      logger.error('[Safely] Server request handler failed.', error);
      sendJson(response, 500, buildServerSafeBrowsingError('upstream_failure'));
    }
  });
}

export async function handleSafeBrowsingHttpRequest(
  request: SafeBrowsingHttpRequest,
  options: CreateSafeBrowsingServerOptions,
): Promise<SafeBrowsingHttpResponse> {
  if (request.method !== 'POST' || request.url !== '/api/safe-browsing/check') {
    return {
      statusCode: 404,
      body: { error: 'not_found' },
    };
  }

  const body = (request.body ?? {}) as SafeBrowsingRequestBody;
  const rawUrl = typeof body.url === 'string' ? body.url : '';
  const normalizedUrl = normalizeServerUrl(rawUrl);

  if (!normalizedUrl) {
    return {
      statusCode: 400,
      body: buildServerSafeBrowsingError('invalid_url'),
    };
  }

  const result = await queryGoogleSafeBrowsing(normalizedUrl, options);

  return {
    statusCode: result.error === 'upstream_failure' ? 502 : 200,
    body: result,
  };
}
