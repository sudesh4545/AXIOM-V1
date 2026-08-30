'use client';

import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

// Firebase web configuration is a public project identifier, not a server secret.
// Access is enforced by Firebase Auth plus AXIOM's server-side ID-token validation.
const firebaseConfig = {
  apiKey: 'AIzaSyAZ0nlh8-IBMtySXVWu9Vtc9n00QP3Yf8o',
  authDomain: 'axiom-v1.firebaseapp.com',
  projectId: 'axiom-v1',
  storageBucket: 'axiom-v1.firebasestorage.app',
  messagingSenderId: '729821832311',
  appId: '1:729821832311:web:cb15c7556fbd800b429272',
  measurementId: 'G-WD49YTQ7QQ',
};

export const firebaseApp = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const firebaseAuth = getAuth(firebaseApp);

export async function firebaseAuthorizationHeader(forceRefresh = false): Promise<Record<string, string>> {
  const user = firebaseAuth.currentUser;
  if (!user) return {};
  return { Authorization: `Bearer ${await user.getIdToken(forceRefresh)}` };
}
