import { GatewayError, type ErrorCategory, type ProviderId } from './types';

type LooseError = {
  status?: number; statusCode?: number;
  code?: string | number;
  message?: string;
  headers?: Record<string, string> | Headers;
  body?: unknown;
};

function header(h: LooseError['headers'], name: string): string | undefined {
  if (!h) return undefined;
  if (h instanceof Headers) return h.get(name) ?? undefined;
  const entry = Object.entries(h).find(([k]) => k.toLowerCase() === name.toLowerCase());
  return entry?.[1];
}

/**
 * Translates raw fetch/SDK errors into typed GatewayError instances.
 * Note: the `format` error category is adapter-produced (malformed response body),
 * not translator-produced (HTTP-layer) — adapters throw it directly, not via this function.
 */
export function translateError(
  err: unknown,
  provider: ProviderId,
  opts?: { suspectCors?: boolean }
): GatewayError {
  if (err instanceof GatewayError) return err;

  // AbortError must propagate — callers need to distinguish cancelation.
  if (err instanceof DOMException && err.name === 'AbortError') throw err;
  if (err instanceof Error && err.name === 'AbortError') throw err;

  // Network / CORS: fetch() in browsers throws TypeError with "Failed to fetch"
  if (err instanceof TypeError && /failed to fetch|network/i.test(err.message)) {
    const category: ErrorCategory = opts?.suspectCors ? 'cors' : 'network';
    return new GatewayError(err.message, { category, provider, raw: err });
  }

  const le = err as LooseError;
  const status = le.status ?? le.statusCode;
  const msg = le.message || `HTTP ${status ?? '?'}`;
  const retryAfter = header(le.headers, 'retry-after');
  const retryAfterMs = retryAfter ? Math.max(0, Math.round(parseFloat(retryAfter) * 1000)) : undefined;

  if (status === 401 || /unauthor|invalid.?api.?key/i.test(msg)) {
    return new GatewayError(msg, { category: 'auth', status, provider, raw: err });
  }
  if (status === 402 || /credit|balance|insufficient.?funds/i.test(msg)) {
    return new GatewayError(msg, { category: 'credit', status, provider, raw: err });
  }
  if (status === 403 || /forbidden|access denied|permission/i.test(msg)) {
    return new GatewayError(msg, { category: 'forbidden', status, provider, raw: err });
  }
  if (status === 404 || /not.?found|does not exist/i.test(msg)) {
    return new GatewayError(msg, { category: 'not_found', status, provider, raw: err });
  }
  if (status === 429 || /rate.?limit/i.test(msg)) {
    return new GatewayError(msg, { category: 'rate_limit', status, provider, retryAfterMs, raw: err });
  }
  if (status === 502 || status === 503 || status === 504) {
    return new GatewayError(msg, { category: 'server_unavailable', status, provider, retryAfterMs, raw: err });
  }
  if (typeof status === 'number' && status >= 400 && status < 600) {
    return new GatewayError(msg, { category: 'api', status, provider, raw: err });
  }
  return new GatewayError(msg, { category: 'unknown', provider, raw: err });
}
