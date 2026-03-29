import type { SafeBrowsingMatch, SafeBrowsingResult } from '../src/shared/types';

const GOOGLE_SAFE_BROWSING_ENDPOINT =
  'https://safebrowsing.googleapis.com/v4/threatMatches:find';

const THREAT_TYPES = [
  'MALWARE',
  'SOCIAL_ENGINEERING',
  'UNWANTED_SOFTWARE',
  'POTENTIALLY_HARMFUL_APPLICATION',
] as const;

const SOURCE = 'google-safe-browsing' as const;
const DEFAULT_TIMEOUT_MS = 5000;

type ServerSafeBrowsingError = Exclude<SafeBrowsingResult['error'], 'network_error'>;

interface GoogleThreatMatch {
  threatType?: string;
  platformType?: string;
  threatEntryType?: string;
  threat?: unknown;
}

interface GoogleThreatMatchesResponse {
  matches?: GoogleThreatMatch[];
}

export interface SafeBrowsingServiceOptions {
  apiKey: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  logger?: Pick<Console, 'error' | 'warn'>;
  clientId?: string;
  clientVersion?: string;
}

export function buildServerSafeBrowsingError(
  error: ServerSafeBrowsingError,
): SafeBrowsingResult {
  return {
    safe: true,
    matches: [],
    source: SOURCE,
    error,
  };
}

export function normalizeServerUrl(url: string): string | null {
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
  } catch {
    return null;
  }
}

function mapMatches(matches: GoogleThreatMatch[] | undefined): SafeBrowsingMatch[] {
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

export async function queryGoogleSafeBrowsing(
  url: string,
  options: SafeBrowsingServiceOptions,
): Promise<SafeBrowsingResult> {
  const normalizedUrl = normalizeServerUrl(url);
  if (!normalizedUrl) {
    return buildServerSafeBrowsingError('invalid_url');
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );

  try {
    const response = await (options.fetchImpl ?? fetch)(
      `${GOOGLE_SAFE_BROWSING_ENDPOINT}?key=${encodeURIComponent(options.apiKey)}`,
      {
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
      },
    );

    if (!response.ok) {
      options.logger?.error?.(
        `[Safely] Safe Browsing upstream failure: HTTP ${response.status}`,
      );
      return buildServerSafeBrowsingError('upstream_failure');
    }

    const payload = await response.json() as GoogleThreatMatchesResponse;
    const matches = mapMatches(payload.matches);

    return {
      safe: matches.length === 0,
      matches,
      source: SOURCE,
    };
  } catch (error) {
    options.logger?.error?.('[Safely] Safe Browsing upstream request failed.', error);
    return buildServerSafeBrowsingError('upstream_failure');
  } finally {
    clearTimeout(timeout);
  }
}
