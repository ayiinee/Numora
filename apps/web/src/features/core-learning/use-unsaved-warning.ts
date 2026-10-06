'use client';

import { useEffect } from 'react';

export function useUnsavedWarning(unsaved: boolean, confirmDrillExit = false) {
  useEffect(() => {
    if (!unsaved && !confirmDrillExit) return;
    const message = confirmDrillExit
      ? `Keluar dari Drill? Jawaban yang sudah tersimpan dapat dilanjutkan. Timer tetap berjalan.${unsaved ? ' Perubahan terakhir belum tersimpan dan dapat hilang.' : ''}`
      : 'Jawaban terakhir belum tersimpan. Keluar dapat menghilangkan perubahan tersebut. Tetap keluar?';
    let currentUrl = window.location.href;
    let currentState: unknown = window.history.state;
    function unload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = '';
    }
    function navigate(event: MouseEvent) {
      if (
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
        target.search === window.location.search
      )
        return;
      if (!window.confirm(message)) {
        event.preventDefault();
        event.stopPropagation();
      }
    }
    function traverse(event: PopStateEvent) {
      const target = new URL(window.location.href);
      const previous = new URL(currentUrl);
      if (target.pathname === previous.pathname && target.search === previous.search) return;
      if (!window.confirm(message)) {
        event.stopImmediatePropagation();
        window.history.pushState(currentState, '', currentUrl);
      } else {
        currentUrl = window.location.href;
        currentState = window.history.state;
      }
    }
    window.addEventListener('beforeunload', unload);
    window.addEventListener('popstate', traverse, true);
    document.addEventListener('click', navigate, true);
    return () => {
      window.removeEventListener('beforeunload', unload);
      window.removeEventListener('popstate', traverse, true);
      document.removeEventListener('click', navigate, true);
    };
  }, [unsaved, confirmDrillExit]);
}
