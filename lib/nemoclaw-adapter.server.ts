import 'server-only';

const FORWARDED_REQUEST_HEADERS = ['accept', 'content-type', 'content-disposition'] as const;
const FORWARDED_RESPONSE_HEADERS = ['cache-control', 'content-disposition', 'content-type', 'etag', 'last-modified'] as const;

export class NemoClawConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NemoClawConfigurationError';
  }
}

export class NemoClawUnavailableError extends Error {
  constructor(message = 'NemoClaw backend unavailable') {
    super(message);
    this.name = 'NemoClawUnavailableError';
  }
}

export function buildNemoClawGenerateUrl(baseUrl: string | undefined = process.env.NEMOCLAW_BACKEND_URL) {
  const configured = baseUrl?.trim();
  if (!configured) throw new NemoClawConfigurationError('NEMOCLAW_BACKEND_URL is not configured on the Forma server.');
  const normalized = configured.replace(/\/+$/, '');
  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new NemoClawConfigurationError('NEMOCLAW_BACKEND_URL is not a valid URL.');
  }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.search || parsed.hash) {
    throw new NemoClawConfigurationError('NEMOCLAW_BACKEND_URL must be an HTTP(S) base URL without a query or fragment.');
  }
  return `${normalized}/generate`;
}

/**
 * Isolates the still-evolving NemoClaw request mapping. For now Forma forwards
 * the existing generation body and its representation metadata unchanged.
 */
export async function buildNemoClawGenerateRequest(request: Request): Promise<RequestInit> {
  const headers = new Headers();
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  return {
    method: 'POST',
    headers,
    body: await request.arrayBuffer(),
    cache: 'no-store',
  };
}

export async function generateWithNemoClawBackend(request: Request): Promise<Response> {
  const endpoint = buildNemoClawGenerateUrl();
  const init = await buildNemoClawGenerateRequest(request);
  let upstream: Response;
  try {
    // Generation may be long-running. Deliberately rely on the deployment's
    // request lifetime instead of imposing a short adapter timeout.
    upstream = await fetch(endpoint, init);
  } catch {
    throw new NemoClawUnavailableError();
  }

  const headers = new Headers();
  for (const name of FORWARDED_RESPONSE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  });
}
