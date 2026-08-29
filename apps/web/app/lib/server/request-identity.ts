export type RequestIdentity = {
  userId: string;
  email: string;
  displayName: string;
  authenticated: boolean;
  authMode: 'hosted_session' | 'local_development' | 'public_demo';
};

function decodeFullName(request: Request): string | null {
  const encoding = request.headers.get('oai-authenticated-user-full-name-encoding');
  const encoded = request.headers.get('oai-authenticated-user-full-name');
  if (!encoded || encoding !== 'percent-encoded-utf-8') return null;
  try { return decodeURIComponent(encoded); } catch { return null; }
}

/**
 * Hosted AXIOM trusts only identity headers injected by its hosting runtime.
 * The local fallback is deliberately restricted to loopback hosts so it can
 * never become an authentication bypass on a deployed hostname.
 */
export function requestIdentity(request: Request): RequestIdentity | null {
  const userId = request.headers.get('oai-authenticated-user-id');
  const email = request.headers.get('oai-authenticated-user-email');
  if (userId && email) {
    return {
      userId,
      email: email.toLowerCase(),
      displayName: decodeFullName(request) ?? email.split('@')[0],
      authenticated: true,
      authMode: 'hosted_session',
    };
  }

  const hostname = new URL(request.url).hostname;
  if (hostname === 'axiom-v1.sudeshmehar3.workers.dev') {
    return {
      userId: 'public-demo-user',
      email: 'demo@axiom.dev',
      displayName: 'Sudesh',
      authenticated: false,
      authMode: 'public_demo',
    };
  }

  if (['localhost', '127.0.0.1', '::1'].includes(hostname)) {
    return {
      userId: 'local-development-user',
      email: 'local@axiom.dev',
      displayName: 'Sudesh',
      authenticated: false,
      authMode: 'local_development',
    };
  }
  return null;
}

export function firstName(identity: RequestIdentity): string {
  return identity.displayName.trim().split(/\s+/)[0] || identity.email.split('@')[0] || 'there';
}
