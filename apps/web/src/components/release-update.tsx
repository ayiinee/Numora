'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import styles from './release-update.module.css';

const updateIntervalMs = 30_000;
const ReloadBlockContext = createContext<((delta: number) => void) | null>(null);

export function useBlockReleaseReload(blocked: boolean) {
  const changeBlockCount = useContext(ReloadBlockContext);
  useEffect(() => {
    if (!blocked || !changeBlockCount) return;
    changeBlockCount(1);
    return () => changeBlockCount(-1);
  }, [blocked, changeBlockCount]);
}

export function ReleaseUpdateProvider({
  children,
  release,
}: {
  children: ReactNode;
  release: string | undefined;
}) {
  const [blockCount, setBlockCount] = useState(0);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const changeBlockCount = useCallback((delta: number) => {
    setBlockCount((count) => count + delta);
  }, []);

  useEffect(() => {
    if (!release) return;
    const controller = new AbortController();
    let checking = false;
    async function checkRelease() {
      if (checking || document.visibilityState === 'hidden') return;
      checking = true;
      try {
        const response = await fetch('/release-version', {
          cache: 'no-store',
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(5000)]),
        });
        if (!response.ok) return;
        const data: { release?: unknown } = await response.json();
        const current = data?.release;
        if (!controller.signal.aborted && typeof current === 'string' && current) {
          setUpdateAvailable(current !== release);
        }
      } catch {
        // Keep the current page available while the server restarts or the tab is offline.
      } finally {
        checking = false;
      }
    }
    void checkRelease();
    const timer = window.setInterval(checkRelease, updateIntervalMs);
    document.addEventListener('visibilitychange', checkRelease);
    return () => {
      controller.abort();
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', checkRelease);
    };
  }, [release]);

  return (
    <ReloadBlockContext.Provider value={changeBlockCount}>
      {children}
      {updateAvailable && (
        <div className={styles.banner}>
          <div role="status">
            <strong>Versi baru tersedia</strong>
            {blockCount > 0 && (
              <p>Selesaikan aktivitas yang sedang berlangsung sebelum memuat ulang.</p>
            )}
          </div>
          <button type="button" disabled={blockCount > 0} onClick={() => window.location.reload()}>
            Muat ulang
          </button>
        </div>
      )}
    </ReloadBlockContext.Provider>
  );
}
