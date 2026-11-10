'use client';

import { useEffect, useState } from 'react';
import type { IdentityProfile } from '@/lib/api';
import type { AdminNavigationGroup } from './navigation';

const memory = new Map<string, string[]>();
export function adminNavigationStorageKey(profile: IdentityProfile | null) {
  if (profile?.role !== 'ADMIN' || profile.status !== 'ACTIVE' || !profile.adminRole) return null;
  return `numora:admin-dropdowns:${JSON.stringify([profile.id, profile.adminRole, [...(profile.capabilities ?? [])].sort()])}`;
}

function read(key: string): string[] {
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(key) ?? 'null');
    if (Array.isArray(value) && value.every((item) => typeof item === 'string')) return value;
    return [];
  } catch {
    // Storage can be blocked or contain an old/invalid preference.
  }
  return memory.get(key) ?? [];
}
function write(key: string, ids: string[]) {
  memory.set(key, ids);
  try {
    sessionStorage.setItem(key, JSON.stringify(ids));
  } catch {
    /* Memory fallback. */
  }
}

/** One owner supplies the same expansion state to the desktop sidebar and drawer. */
export function useAdminNavigation(
  profile: IdentityProfile | null,
  groups: AdminNavigationGroup[],
  activeHref: string | undefined,
  location: string,
) {
  const key = adminNavigationStorageKey(profile);
  const parent = groups
    .flatMap((group) => group.items)
    .find((item) => item.children?.some((child) => child.href === activeHref))?.id;
  const allowed = groups
    .flatMap((group) => group.items.filter((item) => item.children).map((item) => item.id))
    .join(',');
  const [state, setState] = useState<{ key: string | null; ids: string[] }>({ key: null, ids: [] });
  useEffect(() => {
    if (!key) {
      setState({ key: null, ids: [] });
      return;
    }
    const ids = read(key).filter((id) => allowed.split(',').includes(id));
    if (parent && !ids.includes(parent)) ids.push(parent);
    write(key, ids);
    setState({ key, ids });
  }, [key, parent, location, allowed]);
  return {
    openIds: state.key === key ? state.ids : [],
    toggle(id: string) {
      if (!key || !allowed.split(',').includes(id)) return;
      const current = state.key === key ? state.ids : read(key);
      const ids = current.includes(id) ? current.filter((value) => value !== id) : [...current, id];
      write(key, ids);
      setState({ key, ids });
    },
    clear() {
      if (!key) return;
      memory.delete(key);
      try {
        sessionStorage.removeItem(key);
      } catch {
        /* Memory is already cleared. */
      }
      setState({ key, ids: [] });
    },
  };
}
