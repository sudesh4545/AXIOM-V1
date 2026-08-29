const securityHeaders: Record<string, string> = {
  'Cache-Control': 'no-store',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
};

export function secureJson(body: unknown, status = 200, extra: HeadersInit = {}): Response {
  return Response.json(body, { status, headers: { ...securityHeaders, ...Object.fromEntries(new Headers(extra)) } });
}

function subjectKey(request: Request): string {
  return request.headers.get('oai-authenticated-user-id')
    ?? request.headers.get('cf-connecting-ip')
    ?? (new URL(request.url).hostname === 'localhost' ? 'local-development' : 'anonymous');
}

export async function enforceRateLimit(request: Request, scope: string, limit: number, windowSeconds = 60): Promise<Response | null> {
  const { getDatabase } = await import('../../../db');
  await getDatabase().prepare('DELETE FROM rate_limit_windows WHERE updated_at < ?')
    .bind(new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()).run();
  const nowSeconds = Math.floor(Date.now() / 1000);
  const windowStartedAt = Math.floor(nowSeconds / windowSeconds) * windowSeconds;
  const updatedAt = new Date().toISOString();
  const row = await getDatabase().prepare(`INSERT INTO rate_limit_windows
    (subject_key, scope, window_started_at, request_count, updated_at) VALUES (?, ?, ?, 1, ?)
    ON CONFLICT(subject_key, scope, window_started_at) DO UPDATE SET
      request_count = rate_limit_windows.request_count + 1, updated_at = excluded.updated_at
    RETURNING request_count`).bind(subjectKey(request), scope, windowStartedAt, updatedAt).first<{ request_count: number }>();
  const remaining = Math.max(0, limit - Number(row?.request_count ?? 1));
  if (Number(row?.request_count ?? 1) <= limit) return null;
  const retryAfter = Math.max(1, windowStartedAt + windowSeconds - nowSeconds);
  return secureJson({ code: 'rate_limit_exceeded', message: 'Too many requests. Please retry shortly.', details: { scope, retryAfter } }, 429, {
    'Retry-After': String(retryAfter), 'X-RateLimit-Limit': String(limit), 'X-RateLimit-Remaining': String(remaining),
  });
}
