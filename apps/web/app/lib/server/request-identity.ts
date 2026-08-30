export type RequestIdentity = {
  userId: string;
  email: string;
  displayName: string;
  authenticated: boolean;
  authMode: 'firebase' | 'hosted_session' | 'local_development';
};

const FIREBASE_WEB_API_KEY = 'AIzaSyAZOnlh8-IBMtySXVWu9Vtc9nO0QP3Yf8o';

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
type FirebaseAccount = {
  localId?: string;
  email?: string;
  emailVerified?: boolean;
  displayName?: string;
  phoneNumber?: string;
  providerUserInfo?: Array<{ providerId?: string; displayName?: string; email?: string; phoneNumber?: string }>;
};

async function firebaseIdentity(request: Request): Promise<RequestIdentity | null> {
  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) return null;
  const idToken = authorization.slice(7).trim();
  if (!idToken || idToken.length > 8_192) return null;
  try {
    const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_WEB_API_KEY}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ idToken }),
    });
    if (!response.ok) return null;
    const payload = await response.json() as { users?: FirebaseAccount[] };
    const account = payload.users?.[0];
    if (!account?.localId) return null;
    if (account.email && !account.emailVerified) return null;
    const email = account.email?.toLowerCase() ?? account.providerUserInfo?.find((provider) => provider.email)?.email?.toLowerCase();
    const phone = account.phoneNumber ?? account.providerUserInfo?.find((provider) => provider.phoneNumber)?.phoneNumber;
    const displayName = account.displayName
      ?? account.providerUserInfo?.find((provider) => provider.displayName)?.displayName
      ?? email?.split('@')[0]
      ?? phone
      ?? 'AXIOM user';
    return {
      userId: `firebase:${account.localId}`,
      email: email ?? `${account.localId}@phone-user.axiom`,
      displayName,
      authenticated: true,
      authMode: 'firebase',
    };
  } catch {
    return null;
  }
}

export async function requestIdentity(request: Request): Promise<RequestIdentity | null> {
  const hostname = new URL(request.url).hostname;
  const userId = request.headers.get('oai-authenticated-user-id');
  const email = request.headers.get('oai-authenticated-user-email');
  if (userId && email && hostname.endsWith('.chatgpt.site')) {
    return {
      userId,
      email: email.toLowerCase(),
      displayName: decodeFullName(request) ?? email.split('@')[0],
      authenticated: true,
      authMode: 'hosted_session',
    };
  }

  const verifiedFirebaseIdentity = await firebaseIdentity(request);
  if (verifiedFirebaseIdentity) return verifiedFirebaseIdentity;

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
