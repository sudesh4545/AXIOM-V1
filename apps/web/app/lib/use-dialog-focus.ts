'use client';
import { useEffect } from 'react';

export function useDialogFocus(open: boolean) {
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const dialogs = document.querySelectorAll<HTMLElement>('[role="dialog"]');
    const dialog = dialogs[dialogs.length - 1];
    if (!dialog) return;
    const scrollRoot = document.querySelector<HTMLElement>('.workspace');
    const bodyOverflow = document.body.style.overflow;
    const workspaceOverflow = scrollRoot?.style.overflow ?? '';
    document.body.style.overflow = 'hidden';
    if (scrollRoot) scrollRoot.style.overflow = 'hidden';
    const focusable = () => Array.from(dialog.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex="0"]')).filter((element) => element.getClientRects().length);
    const frame = requestAnimationFrame(() => focusable()[0]?.focus({ preventScroll: true }));
    const trap = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const elements = focusable();
      if (!elements.length) { event.preventDefault(); return; }
      const first = elements[0], last = elements[elements.length - 1];
      if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', trap);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('keydown', trap);
      document.body.style.overflow = bodyOverflow;
      if (scrollRoot) scrollRoot.style.overflow = workspaceOverflow;
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [open]);
}
