import { describe, expect, it } from 'vitest';
import { requestIdentity } from './request-identity';

describe('request identity boundary', () => {
  it('allows the development identity only on loopback URLs', () => {
    expect(requestIdentity(new Request('http://localhost:3000/api'))?.authMode).toBe('local_development');
    expect(requestIdentity(new Request('http://127.0.0.1:3000/api'))?.authMode).toBe('local_development');
    expect(requestIdentity(new Request('https://evil.example/api'))).toBeNull();
  });

  it('accepts Sites-provided identity on a hosted URL', () => {
    const identity = requestIdentity(new Request('https://axiom.example/api', { headers: {
      'oai-authenticated-user-id': 'user-123',
      'oai-authenticated-user-email': 'SUDESH@example.com',
      'oai-authenticated-user-full-name': 'Sudesh%20Mehar',
      'oai-authenticated-user-full-name-encoding': 'percent-encoded-utf-8',
    } }));
    expect(identity).toMatchObject({ userId: 'user-123', email: 'sudesh@example.com', displayName: 'Sudesh Mehar', authenticated: true, authMode: 'hosted_session' });
  });

  it('allows the public demo identity only on the AXIOM Workers hostname', () => {
    expect(requestIdentity(new Request('https://axiom-v1.sudeshmehar3.workers.dev/api'))?.authMode).toBe('public_demo');
    expect(requestIdentity(new Request('https://axiom-v1.attacker.workers.dev/api'))).toBeNull();
  });

  it('does not trust partial hosted identity headers', () => {
    expect(requestIdentity(new Request('https://axiom.example/api', { headers: { 'oai-authenticated-user-email': 'user@example.com' } }))).toBeNull();
  });
});
