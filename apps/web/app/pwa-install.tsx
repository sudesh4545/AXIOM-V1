'use client';

import { useEffect, useState } from 'react';
import { Download, MonitorCheck } from 'lucide-react';

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

export function PwaInstall() {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const register = () => { if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') void navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).catch(() => {}); };
    const registrationTimer = window.setTimeout(register, 1500);

    const standalone = window.matchMedia('(display-mode: standalone)').matches;
    const native = /AXIOMMobile|; wv\)/.test(navigator.userAgent);

    const onPrompt = (event: Event) => {
      event.preventDefault();
      if (standalone || native) return;
      setPrompt(event as InstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.clearTimeout(registrationTimer);
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (!prompt || installed) return null;

  const install = async () => {
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (choice.outcome === 'accepted') setInstalled(true);
    } catch { /* The browser can withdraw the install prompt. */ }
    finally { setPrompt(null); }
  };

  return (
    <button className="pwa-install" type="button" onClick={() => void install()} aria-label="Install AXIOM on this device">
      <span><MonitorCheck /></span>
      <strong>Install AXIOM</strong>
      <Download />
    </button>
  );
}
