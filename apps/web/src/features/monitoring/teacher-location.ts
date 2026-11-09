'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';

/** Native history keeps list filters and student tabs without replacing their workspace. */
export function useTeacherSearch() {
  const serialized = useSearchParams().toString();
  const [observed, setObserved] = useState(serialized);
  const [local, setLocal] = useState(serialized);
  if (observed !== serialized) {
    setObserved(serialized);
    setLocal(serialized);
  }
  const params = new URLSearchParams(local);
  function update(name: string, value: string, push = false) {
    const next = new URLSearchParams(window.location.search);
    if (value) next.set(name, value);
    else next.delete(name);
    const query = next.toString();
    const url = `${window.location.pathname}${query ? `?${query}` : ''}`;
    if (push) window.history.pushState(null, '', url);
    else window.history.replaceState(null, '', url);
    setLocal(query);
  }
  return { params, update };
}

export function teacherContextHref(path: string, params: URLSearchParams) {
  const next = new URLSearchParams();
  for (const key of ['classQ', 'q', 'sort']) {
    const value = params.get(key);
    if (value) next.set(key, value);
  }
  return `${path}${next.size ? `?${next}` : ''}`;
}
