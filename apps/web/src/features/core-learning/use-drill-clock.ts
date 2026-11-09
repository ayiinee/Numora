'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect } from 'react';
import { learningApi } from './api';
import type { DrillAttempt } from './types';

export function useDrillClock(token: string, attemptId: string, clock: DrillAttempt['clock']) {
  const queryClient = useQueryClient();
  const sessionId = clock?.sessionId;
  const pause = useCallback(() => {
    if (sessionId) {
      void learningApi
        .updateDrillClock(token, attemptId, { sessionId, action: 'pause' })
        .catch(() => undefined); // The server lease also expires if delivery fails.
    }
  }, [attemptId, sessionId, token]);

  useEffect(() => {
    if (!sessionId) return;
    let disposed = false;
    let pending = false;
    async function heartbeat() {
      if (pending || !sessionId) return;
      pending = true;
      try {
        const updated = await learningApi.updateDrillClock(token, attemptId, {
          sessionId,
          action: 'heartbeat',
        });
        if (!disposed)
          queryClient.setQueryData<DrillAttempt>(['attempt', attemptId], (current) =>
            current?.clock?.sessionId === sessionId ? { ...current, clock: updated } : current,
          );
      } catch {
        // The most recent acknowledged lease bounds the displayed time while offline.
      } finally {
        pending = false;
      }
    }
    const interval = window.setInterval(() => void heartbeat(), 10_000);
    const restored = (event: PageTransitionEvent) => {
      if (event.persisted) void heartbeat();
    };
    void heartbeat();
    window.addEventListener('pagehide', pause);
    window.addEventListener('pageshow', restored);
    return () => {
      disposed = true;
      window.clearInterval(interval);
      window.removeEventListener('pagehide', pause);
      window.removeEventListener('pageshow', restored);
    };
  }, [attemptId, pause, queryClient, sessionId, token]);

  useEffect(() => {
    if (!clock?.sessionId) return;
    const expiry = window.setTimeout(() => {
      queryClient.setQueryData<DrillAttempt>(['attempt', attemptId], (current) =>
        current?.clock === clock
          ? {
              ...current,
              clock: {
                elapsedMs: clock.elapsedMs + clock.remainingMs,
                remainingMs: 0,
                sessionId: null,
              },
            }
          : current,
      );
    }, clock.remainingMs);
    return () => window.clearTimeout(expiry);
  }, [attemptId, clock, queryClient]);

  return sessionId ? pause : undefined;
}
