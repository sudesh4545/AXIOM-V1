'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
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

function Github() { return <span className="github-mark" aria-hidden="true">GH</span>; }

type AuthScreenProps = {
  theme: AuthTheme;
  user: User | null;
  onThemeChange: (theme: AuthTheme) => void;
};

function friendlyAuthError(cause: unknown): string {
  const code = cause && typeof cause === 'object' && 'code' in cause ? String(cause.code) : '';
  const messages: Record<string, string> = {
    'auth/invalid-credential': 'Email or password is incorrect.',
    'auth/email-already-in-use': 'This email already has an AXIOM account. Sign in instead.',
    'auth/invalid-email': 'Enter a valid email address.',
    'auth/weak-password': 'Use at least 8 characters with a number and symbol.',
    'auth/popup-closed-by-user': 'Sign-in window was closed before completion.',
    'auth/popup-blocked': 'Your browser blocked the sign-in window. Allow popups and retry.',
    'auth/account-exists-with-different-credential': 'This email is already linked to another sign-in method.',
    'auth/invalid-phone-number': 'Enter a valid phone number with country code.',
    'auth/invalid-verification-code': 'That verification code is incorrect or expired.',
    'auth/too-many-requests': 'Too many attempts. Please wait and try again.',
    'auth/quota-exceeded': 'The daily SMS limit has been reached. Try another sign-in method.',
    'auth/network-request-failed': 'Network connection failed. Check your internet and retry.',
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

  const passwordChecks = useMemo(() => [
    { label: '8+ characters', passed: password.length >= 8 },
    { label: 'Number', passed: /\d/.test(password) },
    { label: 'Symbol', passed: /[^A-Za-z0-9]/.test(password) },
  ], [password]);

  const preparePersistence = () => setPersistence(firebaseAuth, remember ? browserLocalPersistence : browserSessionPersistence);
  const resetFeedback = () => { setError(''); setMessage(''); };

  const oauthSignIn = async (provider: GoogleAuthProvider | GithubAuthProvider, label: string) => {
    resetFeedback(); setLoading(label);
    try { await preparePersistence(); await signInWithPopup(firebaseAuth, provider); }
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
      setError(friendlyAuthError(cause));
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
    <header className="auth-topbar"><div className="auth-brand"><i>A</i><strong>A<span>X</span>IOM</strong><em>V1</em></div><div className="auth-theme" role="group" aria-label="Login appearance"><button className={theme === 'light' ? 'active' : ''} onClick={() => onThemeChange('light')} title="Light theme"><Sun /></button><button className={theme === 'dark' ? 'active' : ''} onClick={() => onThemeChange('dark')} title="Dark theme"><Moon /></button><button className={theme === 'neon' ? 'active' : ''} onClick={() => onThemeChange('neon')} title="Neon theme"><Sparkles /></button></div></header>
    <section className="auth-experience">
      <aside className="auth-story"><span className="auth-kicker"><Zap /> GOVERNED GROWTH INTELLIGENCE</span><h1>Enter the operating system for <em>decisive growth.</em></h1><p>One secure identity unlocks experiments, causal evidence, recommendations and decision memory.</p><div className="auth-signal"><i><ShieldCheck /></i><span><b>Enterprise-grade identity</b><small>Verified providers · protected workspace · auditable access</small></span></div><div className="auth-proof"><span><b>99.99%</b><small>Identity uptime</small></span><span><b>&lt;1.2s</b><small>Secure entry</small></span><span><b>24/7</b><small>Risk monitoring</small></span></div></aside>
      <article className="auth-card">
        {mode !== 'signin' && <button className="auth-back" type="button" onClick={() => { setMode('signin'); setConfirmation(null); resetFeedback(); }}><ArrowLeft /> Back to sign in</button>}
        <div className="auth-heading"><span>{mode === 'signup' ? 'CREATE YOUR IDENTITY' : mode === 'forgot' ? 'ACCOUNT RECOVERY' : mode === 'phone' ? 'PHONE VERIFICATION' : 'SECURE ACCESS'}</span><h2>{mode === 'signup' ? 'Create your AXIOM account' : mode === 'forgot' ? 'Reset your password' : mode === 'phone' ? 'Continue with phone' : 'Welcome back'}</h2><p>{mode === 'signup' ? 'Build a verified workspace identity.' : mode === 'forgot' ? 'We’ll email you a secure recovery link.' : mode === 'phone' ? 'Use a real SMS one-time code.' : 'Authenticate to enter your growth command center.'}</p></div>

        {mode === 'signin' && <><div className="oauth-grid"><button type="button" disabled={Boolean(loading)} onClick={() => oauthSignIn(new GoogleAuthProvider(), 'google')}><span className="google-mark">G</span>{loading === 'google' ? 'Connecting…' : 'Continue with Google'}</button><button type="button" disabled={Boolean(loading)} onClick={() => oauthSignIn(new GithubAuthProvider(), 'github')}><Github />{loading === 'github' ? 'Connecting…' : 'Continue with GitHub'}</button></div><button className="phone-entry" type="button" onClick={() => { setMode('phone'); resetFeedback(); }}><Phone /> Continue with phone number <ArrowRight /></button><div className="auth-divider"><span>or use verified email</span></div></>}

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

        {error && <div className="auth-message error" role="alert"><ShieldCheck />{error}</div>}{message && <div className="auth-message success"><CheckCircle2 />{message}</div>}
        {mode === 'signin' && <p className="auth-switch">New to AXIOM? <button type="button" onClick={() => { setMode('signup'); resetFeedback(); }}>Create an account</button></p>}
        {mode === 'signup' && <p className="auth-switch">Already have an account? <button type="button" onClick={() => { setMode('signin'); resetFeedback(); }}>Sign in</button></p>}
        <footer><ShieldCheck /> Protected by Firebase Authentication <span>•</span> TLS encrypted <span>•</span> <a href="/privacy" target="_blank">Privacy</a></footer>
      </article>
    </section>
  </main>;
}
