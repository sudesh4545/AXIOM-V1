'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import Image from 'next/image';
import type { ConfirmationResult, User } from 'firebase/auth';
import {
  browserLocalPersistence, browserSessionPersistence, createUserWithEmailAndPassword,
  GithubAuthProvider, GoogleAuthProvider, RecaptchaVerifier, sendEmailVerification,
  sendPasswordResetEmail, setPersistence, signInWithEmailAndPassword, signInWithPhoneNumber,
  signInWithPopup, updateProfile,
} from 'firebase/auth';
import {
  ArrowLeft, ArrowRight, Check, CheckCircle2, Eye, EyeOff, KeyRound,
  LockKeyhole, Mail, Moon, Phone, ShieldCheck, Sparkles, Sun, UserRound, Zap,
} from 'lucide-react';

import { firebaseAuth } from './lib/firebase-client';

type AuthTheme = 'light' | 'dark' | 'neon';
type AuthMode = 'signin' | 'signup' | 'forgot' | 'phone';

function GoogleIcon() {
  return <svg className="google-mark" viewBox="0 0 24 24" aria-hidden="true">
    <path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.4-.18-2.07H12v3.91h5.38a4.6 4.6 0 0 1-2 3.02v2.54h3.24c1.9-1.75 2.98-4.33 2.98-7.4Z" />
    <path fill="#34A853" d="M12 22c2.7 0 4.97-.9 6.62-2.42l-3.24-2.54c-.9.6-2.05.96-3.38.96-2.61 0-4.82-1.76-5.61-4.13H3.05v2.62A10 10 0 0 0 12 22Z" />
    <path fill="#FBBC05" d="M6.39 13.87A6 6 0 0 1 6.08 12c0-.65.11-1.28.31-1.87V7.51H3.05A10 10 0 0 0 2 12c0 1.61.38 3.14 1.05 4.49l3.34-2.62Z" />
    <path fill="#EA4335" d="M12 6c1.47 0 2.79.5 3.83 1.5l2.87-2.87A9.63 9.63 0 0 0 12 2a10 10 0 0 0-8.95 5.51l3.34 2.62C7.18 7.76 9.39 6 12 6Z" />
  </svg>;
}

function GithubIcon({ className = '' }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 2C6.48 2 2 6.58 2 12.23c0 4.52 2.87 8.35 6.84 9.71.5.1.68-.22.68-.49 0-.24-.01-1.04-.02-1.89-2.78.62-3.37-1.2-3.37-1.2-.46-1.18-1.11-1.5-1.11-1.5-.91-.64.07-.62.07-.62 1 .07 1.53 1.06 1.53 1.06.89 1.57 2.34 1.11 2.91.85.09-.67.35-1.11.63-1.37-2.22-.26-4.56-1.14-4.56-5.06 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.71 0 0 .84-.28 2.75 1.05A9.3 9.3 0 0 1 12 6.97a9.2 9.2 0 0 1 2.5.35c1.91-1.33 2.75-1.05 2.75-1.05.55 1.41.2 2.45.1 2.71.64.72 1.03 1.63 1.03 2.75 0 3.93-2.34 4.8-4.57 5.06.36.32.68.95.68 1.91 0 1.38-.01 2.49-.01 2.83 0 .27.18.59.69.49A10.2 10.2 0 0 0 22 12.23C22 6.58 17.52 2 12 2Z" />
  </svg>;
}

type AuthScreenProps = {
  theme: AuthTheme;
  user: User | null;
  onThemeChange: (theme: AuthTheme) => void;
};

function friendlyAuthError(cause: unknown): string {
  const code = cause && typeof cause === 'object' && 'code' in cause ? String(cause.code) : '';
  const detail = cause instanceof Error ? cause.message : '';
  if (detail.includes('SMS unable to be sent until this region enabled')) {
    return 'India (+91) is blocked in Firebase SMS region policy. Enable India, then retry.';
  }
  const messages: Record<string, string> = {
    'auth/invalid-credential': 'Email or password is incorrect.',
    'auth/email-already-in-use': 'This email already has an AXIOM account. Sign in instead.',
    'auth/invalid-email': 'Enter a valid email address.',
    'auth/weak-password': 'Use at least 8 characters with a number and symbol.',
    'auth/popup-closed-by-user': 'Sign-in window was closed before completion.',
    'auth/popup-blocked': 'Your browser blocked the sign-in window. Allow popups and retry.',
    'auth/account-exists-with-different-credential': 'This email already uses another provider. Continue with its original Google or GitHub button.',
    'auth/invalid-phone-number': 'Enter a valid phone number with country code.',
    'auth/invalid-verification-code': 'That verification code is incorrect or expired.',
    'auth/too-many-requests': 'Too many attempts. Please wait and try again.',
    'auth/quota-exceeded': 'The daily SMS limit has been reached. Try another sign-in method.',
    'auth/network-request-failed': 'Network connection failed. Check your internet and retry.',
    'auth/invalid-api-key': 'Firebase web configuration is invalid. Update the project API key and retry.',
    'auth/configuration-not-found': 'Firebase Authentication is not configured for this web app.',
    'auth/operation-not-allowed': 'This sign-in method is not enabled in Firebase Authentication.',
    'auth/unauthorized-domain': 'This website domain is not authorised in Firebase Authentication.',
    'auth/internal-error': 'Firebase could not complete the request. Please retry in a moment.',
    'auth/argument-error': 'Firebase web configuration is invalid. Refresh the project SDK configuration.',
  };
  return messages[code] ?? 'Authentication could not be completed. Please try again.';
}

function isPasswordUser(user: User | null): boolean {
  return Boolean(user?.providerData.some((provider) => provider.providerId === 'password'));
}

export function AuthScreen({ theme, user, onThemeChange }: AuthScreenProps) {
  const [mode, setMode] = useState<AuthMode>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState(user?.email ?? '');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [phone, setPhone] = useState('+91 ');
  const [otp, setOtp] = useState('');
  const [remember, setRemember] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [loading, setLoading] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [confirmation, setConfirmation] = useState<ConfirmationResult | null>(null);
  const recaptchaRef = useRef<RecaptchaVerifier | null>(null);
  const needsVerification = isPasswordUser(user) && !user?.emailVerified;

  useEffect(() => () => { recaptchaRef.current?.clear(); recaptchaRef.current = null; }, []);
  useEffect(() => {
    const page = document.querySelector<HTMLElement>('.auth-page');
    if (page) page.scrollTop = 0;
  }, [mode]);

  const passwordChecks = useMemo(() => [
    { label: '8+ characters', passed: password.length >= 8 },
    { label: 'Number', passed: /\d/.test(password) },
    { label: 'Symbol', passed: /[^A-Za-z0-9]/.test(password) },
  ], [password]);

  const preparePersistence = () => setPersistence(firebaseAuth, remember ? browserLocalPersistence : browserSessionPersistence);
  const resetFeedback = () => { setError(''); setMessage(''); };

  const oauthSignIn = async (provider: GoogleAuthProvider | GithubAuthProvider, label: string) => {
    resetFeedback(); setLoading(label);
    try {
      await preparePersistence();
      if (provider instanceof GoogleAuthProvider) provider.setCustomParameters({ prompt: 'select_account' });
      if (provider instanceof GithubAuthProvider) provider.setCustomParameters({ allow_signup: 'true' });
      await signInWithPopup(firebaseAuth, provider);
    }
    catch (cause) { setError(friendlyAuthError(cause)); }
    finally { setLoading(''); }
  };

  const submitEmail = async (event: FormEvent) => {
    event.preventDefault(); resetFeedback(); setLoading('email');
    try {
      await preparePersistence();
      if (mode === 'forgot') {
        await sendPasswordResetEmail(firebaseAuth, email.trim());
        setMessage('Password reset link sent. Check your inbox and spam folder.');
      } else if (mode === 'signup') {
        if (!name.trim()) throw new Error('name_required');
        if (password !== confirmPassword) throw new Error('password_mismatch');
        if (!passwordChecks.every((check) => check.passed)) throw new Error('password_requirements');
        if (!acceptedTerms) throw new Error('terms_required');
        const credential = await createUserWithEmailAndPassword(firebaseAuth, email.trim(), password);
        await updateProfile(credential.user, { displayName: name.trim() });
        await sendEmailVerification(credential.user);
        setMessage('Verification email sent. Verify your address to enter AXIOM.');
      } else {
        await signInWithEmailAndPassword(firebaseAuth, email.trim(), password);
      }
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : '';
      if (reason === 'name_required') setError('Enter your full name.');
      else if (reason === 'password_mismatch') setError('Passwords do not match.');
      else if (reason === 'password_requirements') setError('Complete all password security requirements.');
      else if (reason === 'terms_required') setError('Accept the Terms and Privacy Policy to continue.');
      else setError(friendlyAuthError(cause));
    } finally { setLoading(''); }
  };

  const sendOtp = async (event: FormEvent) => {
    event.preventDefault(); resetFeedback(); setLoading('phone');
    try {
      await preparePersistence();
      recaptchaRef.current?.clear();
      recaptchaRef.current = new RecaptchaVerifier(firebaseAuth, 'axiom-recaptcha', { size: 'invisible' });
      const result = await signInWithPhoneNumber(firebaseAuth, phone.replace(/\s+/g, ''), recaptchaRef.current);
      setConfirmation(result); setMessage('6-digit verification code sent by SMS.');
    } catch (cause) {
      recaptchaRef.current?.clear(); recaptchaRef.current = null;
      const code = cause && typeof cause === 'object' && 'code' in cause ? String(cause.code) : '';
      setError(code === 'auth/operation-not-allowed'
        ? 'India (+91) is blocked in Firebase SMS region policy. Enable India, then retry.'
        : friendlyAuthError(cause));
    } finally { setLoading(''); }
  };

  const verifyOtp = async (event: FormEvent) => {
    event.preventDefault(); resetFeedback(); setLoading('otp');
    try { await confirmation?.confirm(otp.trim()); }
    catch (cause) { setError(friendlyAuthError(cause)); }
    finally { setLoading(''); }
  };

  const resendVerification = async () => {
    if (!user) return;
    resetFeedback(); setLoading('verify');
    try { await sendEmailVerification(user); setMessage('A fresh verification link has been sent.'); }
    catch (cause) { setError(friendlyAuthError(cause)); }
    finally { setLoading(''); }
  };

  if (needsVerification) {
    return <main className={`auth-page theme-${theme}`} data-theme={theme}>
      <div className="auth-grid" aria-hidden="true" /><div className="auth-orb auth-orb-one" /><div className="auth-orb auth-orb-two" />
      <section className="verify-card"><div className="verify-emblem"><Mail /></div><span>IDENTITY CHECK</span><h1>Verify your email</h1><p>We sent a secure link to <b>{user?.email}</b>. Open it, then return here to continue.</p>{message && <div className="auth-message success"><CheckCircle2 />{message}</div>}{error && <div className="auth-message error"><ShieldCheck />{error}</div>}<button type="button" onClick={() => window.location.reload()}>I’ve verified my email <ArrowRight /></button><button className="text-action" type="button" disabled={loading === 'verify'} onClick={resendVerification}>{loading === 'verify' ? 'Sending…' : 'Resend verification email'}</button></section>
    </main>;
  }

  return <main className={`auth-page theme-${theme}`} data-theme={theme}>
    <div className="auth-grid" aria-hidden="true" /><div className="auth-orb auth-orb-one" /><div className="auth-orb auth-orb-two" />
    <header className="auth-topbar"><div className="auth-brand"><i><Image src="/brand/axiom-core-mark-v1-256.png" width={36} height={36} alt="" priority /></i><strong>AXIOM</strong><em>V1</em></div><div className="auth-theme" role="group" aria-label="Login appearance"><button className={theme === 'light' ? 'active' : ''} onClick={() => onThemeChange('light')} title="Light theme"><Sun /></button><button className={theme === 'dark' ? 'active' : ''} onClick={() => onThemeChange('dark')} title="Dark theme"><Moon /></button><button className={theme === 'neon' ? 'active' : ''} onClick={() => onThemeChange('neon')} title="Neon theme"><Sparkles /></button></div></header>
    <section className="auth-experience">
      <aside className="auth-story"><div className="auth-story-copy"><span className="auth-kicker"><Zap /> GOVERNED GROWTH INTELLIGENCE</span><h1><span>Enter the operating</span><span>system for</span><em>decisive growth.</em></h1><p>One secure identity unlocks experiments, causal evidence, recommendations and decision memory.</p></div><div className="auth-visual auth-universe-visual" data-backup-src="/brand/axiom-core-art-v1.webp" aria-hidden="true"><div className="auth-universe-stage"><div className="auth-universe-aura" /><div className="auth-universe-orbit orbit-back" /><Image className="auth-universe-image auth-universe-image-dark" src="/brand/axiom-quantum-core-v7.png" alt="" fill sizes="(max-width: 1000px) 0px, 30vw" priority /><Image className="auth-universe-image auth-universe-image-light" src="/brand/axiom-quantum-core-light-v9.png" alt="" fill sizes="(max-width: 1000px) 0px, 30vw" priority /><div className="auth-universe-scan" /><div className="auth-universe-orbit orbit-front" /><div className="auth-universe-tags"><i className="tag-mrr">MRR</i><i className="tag-ai">AI</i><i className="tag-data">DATA</i><i className="tag-proof">PROOF</i><i className="tag-growth">GROWTH</i></div><div className="auth-universe-particles">{Array.from({ length: 10 }, (_, index) => <i key={index} />)}</div></div></div><div className="auth-assurance"><div className="auth-signal"><i><ShieldCheck /></i><span><b>Enterprise-grade identity</b><small>Verified providers · protected workspace · auditable access</small></span></div><div className="auth-proof"><span><b>99.99%</b><small>Identity uptime</small></span><span><b>&lt;1.2s</b><small>Secure entry</small></span><span><b>24/7</b><small>Risk monitoring</small></span></div></div></aside>
      <article className="auth-card">
        {mode !== 'signin' && <button className="auth-back" type="button" onClick={() => { setMode('signin'); setConfirmation(null); resetFeedback(); }}><ArrowLeft /> Back to sign in</button>}
        <div className="auth-heading"><span><Sparkles />{mode === 'signup' ? 'CREATE YOUR IDENTITY' : mode === 'forgot' ? 'ACCOUNT RECOVERY' : mode === 'phone' ? 'PHONE VERIFICATION' : 'SECURE ACCESS'}</span><h2>{mode === 'signup' ? 'Create your AXIOM account' : mode === 'forgot' ? 'Reset your password' : mode === 'phone' ? 'Continue with phone' : 'Welcome back'}</h2><p>{mode === 'signup' ? 'Build a verified workspace identity.' : mode === 'forgot' ? 'We’ll email you a secure recovery link.' : mode === 'phone' ? 'Use a real SMS one-time code.' : 'Authenticate to enter your growth command center.'}</p><i className="auth-heading-flow" aria-hidden="true" /></div>

        {mode === 'signin' && <><div className="oauth-grid"><button type="button" disabled={Boolean(loading)} onClick={() => oauthSignIn(new GoogleAuthProvider(), 'google')}><GoogleIcon />{loading === 'google' ? 'Connecting…' : 'Continue with Google'}</button><button type="button" disabled={Boolean(loading)} onClick={() => oauthSignIn(new GithubAuthProvider(), 'github')}><GithubIcon className="github-mark" aria-hidden="true" />{loading === 'github' ? 'Connecting…' : 'Continue with GitHub'}</button></div><button className="phone-entry" type="button" onClick={() => { setMode('phone'); resetFeedback(); }}><Phone /> <span>Continue with phone number</span> <ArrowRight /></button><div className="auth-divider"><span>or use verified email</span></div></>}

        {mode === 'phone' ? <form onSubmit={confirmation ? verifyOtp : sendOtp} className="auth-form">
          <label><span>{confirmation ? 'Verification code' : 'Phone number'}</span><div><Phone />{confirmation ? <input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, ''))} placeholder="6-digit code" required /> : <input type="tel" autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+91 98765 43210" required />}</div></label>
          <button className="auth-submit" disabled={Boolean(loading)}>{loading ? 'Securing request…' : confirmation ? 'Verify and continue' : 'Send secure code'} <ArrowRight /></button>{confirmation && <button className="text-action" type="button" onClick={() => { setConfirmation(null); setOtp(''); }}>Use a different number</button>}<div id="axiom-recaptcha" />
        </form> : <form onSubmit={submitEmail} className="auth-form">
          {mode === 'signup' && <label><span>Full name</span><div><UserRound /><input autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Your full name" required /></div></label>}
          <label><span>Email address</span><div><Mail /><input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" required /></div></label>
          {mode !== 'forgot' && <label><span>Password</span><div><LockKeyhole /><input type={showPassword ? 'text' : 'password'} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" required /><button type="button" onClick={() => setShowPassword((current) => !current)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff /> : <Eye />}</button></div></label>}
          {mode === 'signup' && <><label><span>Confirm password</span><div><KeyRound /><input type={showPassword ? 'text' : 'password'} autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Repeat your password" required /></div></label><div className="password-checks">{passwordChecks.map((check) => <span className={check.passed ? 'passed' : ''} key={check.label}><Check />{check.label}</span>)}</div><label className="auth-consent"><input type="checkbox" checked={acceptedTerms} onChange={(event) => setAcceptedTerms(event.target.checked)} /><span>I agree to the <a href="/terms" target="_blank">Terms of Service</a> and <a href="/privacy" target="_blank">Privacy Policy</a>.</span></label></>}
          {mode === 'signin' && <div className="auth-options"><label><input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} /><span>Remember me</span></label><button type="button" onClick={() => { setMode('forgot'); resetFeedback(); }}>Forgot password?</button></div>}
          <button className="auth-submit" disabled={Boolean(loading)}>{loading ? 'Verifying identity…' : mode === 'signup' ? 'Create secure account' : mode === 'forgot' ? 'Send recovery link' : 'Sign in to AXIOM'} <ArrowRight /></button>
        </form>}

        {error && <div className="auth-message error" role="alert" aria-live="assertive"><ShieldCheck />{error}</div>}{message && <div className="auth-message success" role="status" aria-live="polite"><CheckCircle2 />{message}</div>}
        {mode === 'signin' && <p className="auth-switch">New to AXIOM? <button type="button" onClick={() => { setMode('signup'); resetFeedback(); }}>Create an account</button></p>}
        {mode === 'signup' && <p className="auth-switch">Already have an account? <button type="button" onClick={() => { setMode('signin'); resetFeedback(); }}>Sign in</button></p>}
        <footer><ShieldCheck /> Protected by Firebase Authentication <span>•</span> TLS encrypted <span>•</span> <a href="/privacy" target="_blank">Privacy</a></footer>
      </article>
    </section>
  </main>;
}
