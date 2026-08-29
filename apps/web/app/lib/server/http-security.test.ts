import { beforeEach, describe, expect, it, vi } from 'vitest';
import { enforceRateLimit, secureJson } from './http-security';

const rateState = vi.hoisted(() => ({ count: 0 }));
vi.mock('../../../db', () => ({
  getDatabase: () => ({
    prepare: (sql: string) => ({ bind: () => sql.startsWith('DELETE')
      ? { run: async () => ({}) }
      : { first: async () => ({ request_count: ++rateState.count }) } }),
  }),
}));

describe('HTTP security boundary', () => {
  beforeEach(() => { rateState.count = 0; });
  it('adds no-store, anti-sniff and anti-frame headers to API responses', async () => {
    const response = secureJson({ ok: true });
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('x-frame-options')).toBe('DENY');
    expect(await response.json()).toEqual({ ok: true });
  });
  it('returns a structured 429 with Retry-After after the durable limit', async () => {
    const request = new Request('http://localhost:3000/api/v1/test');
    expect(await enforceRateLimit(request, 'test', 2)).toBeNull();
    expect(await enforceRateLimit(request, 'test', 2)).toBeNull();
    const blocked = await enforceRateLimit(request, 'test', 2);
    expect(blocked?.status).toBe(429);
    expect(blocked?.headers.get('retry-after')).toBeTruthy();
    expect(await blocked?.json()).toMatchObject({ code: 'rate_limit_exceeded' });
  });
});
