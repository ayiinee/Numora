'use client';

import { useSyncExternalStore } from 'react';

const changed = 'numora-admin-url';
function subscribe(listener: () => void) {
  window.addEventListener('popstate', listener);
  window.addEventListener(changed, listener);
  return () => {
    window.removeEventListener('popstate', listener);
    window.removeEventListener(changed, listener);
  };
}

export function useAdminUrl() {
  const search = useSyncExternalStore(
    subscribe,
    () => window.location.search,
    () => null,
  );
  return {
    search,
    params: new URLSearchParams(search ?? ''),
    update(values: Record<string, string | number | null>, replace = false) {
      const url = new URL(window.location.href);
      for (const [name, value] of Object.entries(values)) {
        if (value === null || value === '') url.searchParams.delete(name);
        else url.searchParams.set(name, String(value));
      }
      if (url.href === window.location.href) return;
      window.history[replace ? 'replaceState' : 'pushState'](null, '', url);
      window.dispatchEvent(new Event(changed));
    },
  };
}

export function adminOffset(value: string | null) {
  const offset = Number(value);
  return Number.isSafeInteger(offset) && offset >= 0 ? offset : 0;
}
