'use client';

import { useEffect, useRef, useState } from 'react';

export function useUnsavedWarning(
  unsaved: boolean,
  confirmDrillExit = false,
  onExit?: () => void,
  options?: { message?: string; ignoreSearchChanges?: boolean; customDialog?: boolean },
) {
  const customMessage = options?.message;
  const ignoreSearchChanges = options?.ignoreSearchChanges ?? false;
  const customDialog = options?.customDialog ?? false;
  const [destination, setDestination] = useState<{ proceed: () => void } | null>(null);
  const approved = useRef(false);
  const active = unsaved || confirmDrillExit;
  const description =
    customMessage ??
    (confirmDrillExit
      ? `Jawaban yang sudah tersimpan bisa kamu lanjutkan nanti. ${onExit ? 'Timer akan dijeda saat kamu keluar.' : 'Timer tetap berjalan selama sesi aktif.'}${unsaved ? ' Perubahan terakhir belum tersimpan dan dapat hilang.' : ''}`
      : 'Jawaban terakhir belum tersimpan. Jika keluar sekarang, perubahan tersebut dapat hilang.');
  useEffect(() => {
    approved.current = false;
    if (!active) return;
    let currentUrl = window.location.href;
    let currentState: unknown = window.history.state;
    function unload(event: BeforeUnloadEvent) {
      if (approved.current) return;
      event.preventDefault();
      event.returnValue = '';
    }
    function navigate(event: MouseEvent) {
      if (
        approved.current ||
        event.defaultPrevented ||
        event.button !== 0 ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (
        !(link instanceof HTMLAnchorElement) ||
        link.target === '_blank' ||
        link.hasAttribute('download') ||
        link.href === window.location.href
      )
        return;
      const target = new URL(link.href);
      if (
        target.origin === window.location.origin &&
        target.pathname === window.location.pathname &&
        (ignoreSearchChanges || target.search === window.location.search)
      )
        return;
      if (!customDialog) {
        if (window.confirm(description)) onExit?.();
        else {
          event.preventDefault();
          event.stopPropagation();
        }
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      setDestination({ proceed: () => link.click() });
    }
    function traverse(event: PopStateEvent) {
      if (approved.current) return;
      const target = new URL(window.location.href);
      const previous = new URL(currentUrl);
      if (
        target.pathname === previous.pathname &&
        (ignoreSearchChanges || target.search === previous.search)
      ) {
        currentUrl = target.href;
        currentState = window.history.state;
        return;
      }
      if (!customDialog && window.confirm(description)) {
        onExit?.();
        currentUrl = target.href;
        currentState = window.history.state;
        return;
      }
      event.stopImmediatePropagation();
      // Restore the attempt while the student decides. Back returns to the target on approval.
      window.history.pushState(currentState, '', currentUrl);
      if (customDialog) setDestination({ proceed: () => window.history.back() });
    }
    window.addEventListener('beforeunload', unload);
    window.addEventListener('popstate', traverse, true);
    document.addEventListener('click', navigate, true);
    return () => {
      window.removeEventListener('beforeunload', unload);
      window.removeEventListener('popstate', traverse, true);
      document.removeEventListener('click', navigate, true);
    };
  }, [active, customDialog, description, ignoreSearchChanges, onExit]);
  return {
    open: active && destination !== null,
    title: confirmDrillExit ? 'Jeda latihan dulu?' : 'Keluar dari sesi?',
    description,
    onClose: () => setDestination(null),
    onConfirm: () => {
      if (!destination || !active || approved.current) return;
      approved.current = true;
      onExit?.();
      setDestination(null);
      destination.proceed();
    },
  };
}
