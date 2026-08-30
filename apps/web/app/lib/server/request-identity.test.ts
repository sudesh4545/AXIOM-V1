import { afterEach, describe, expect, it, vi } from 'vitest';
import { requestIdentity } from './request-identity';

describe('request identity boundary', () => {
  afterEach(() => vi.restoreAllMocks());

  it('allows the development identity only on loopback URLs', async () => {
    expect((await requestIdentity(new Request('http://localhost:3000/api')))?.authMode).toBe('local_development');
    expect((await requestIdentity(new Request('http://127.0.0.1:3000/api')))?.authMode).toBe('local_development');
    expect(await requestIdentity(new Request('https://evil.example/api'))).toBeNull();
  });

  it('accepts Sites-provided identity on a hosted URL', async () => {
    const identity = await requestIdentity(new Request('https://axiom-v1.example.chatgpt.site/api', { headers: {
      'oai-authenticated-user-id': 'user-123',
      'oai-authenticated-user-email': 'SUDESH@example.com',
      'oai-authenticated-user-full-name': 'Sudesh%20Mehar',
      'oai-authenticated-user-full-name-encoding': 'percent-encoded-utf-8',
    } }));
    expect(identity).toMatchObject({ userId: 'user-123', email: 'sudesh@example.com', displayName: 'Sudesh Mehar', authenticated: true, authMode: 'hosted_session' });
  });

  it('accepts only Firebase-verified bearer identities on production', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ users: [{ localId: 'firebase-user-1', email: 'verified@example.com', emailVerified: true, displayName: 'Verified User', providerUserInfo: [{ providerId: 'google.com', email: 'verified@example.com' }] }] }));
    const identity = await requestIdentity(new Request('https://axiom-v1.sudeshmehar3.workers.dev/api', { headers: { authorization: 'Bearer signed-firebase-token' } }));
    expect(identity).toMatchObject({ userId: 'firebase:firebase-user-1', email: 'verified@example.com', authenticated: true, authMode: 'firebase' });
    expect(await requestIdentity(new Request('https://axiom-v1.sudeshmehar3.workers.dev/api'))).toBeNull();
  });

  it('does not trust partial hosted identity headers', async () => {
    expect(await requestIdentity(new Request('https://axiom.example/api', { headers: { 'oai-authenticated-user-email': 'user@example.com' } }))).toBeNull();
    expect(await requestIdentity(new Request('https://axiom-v1.sudeshmehar3.workers.dev/api', { headers: { 'oai-authenticated-user-id': 'spoofed', 'oai-authenticated-user-email': 'spoofed@example.com' } }))).toBeNull();
  });
});
