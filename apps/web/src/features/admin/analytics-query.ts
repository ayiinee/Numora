'use client';
import { useEffect, useRef, useState } from 'react';
import { apiRequest } from '@/lib/api';
import { adminAccessDenied } from './operational-query';
import type { AdminAnalyticsDto } from './generated-types';

export function useAnalyticsSnapshot(token: string) {
  const [state, setState] = useState<{
    token: string;
    data?: AdminAnalyticsDto;
    error?: string;
    denied?: boolean;
    loading: boolean;
  }>({ token, loading: true });
  const [generation, setGeneration] = useState(0);
  const pending = useRef(true);
  useEffect(() => {
    let active = true;
    pending.current = true;
    setState((previous) => ({
      token,
      loading: true,
      ...(previous.token === token && previous.data ? { data: previous.data } : {}),
    }));
    void apiRequest<AdminAnalyticsDto>('admin/analytics', token)
      .then(
        (data) => {
          if (active) setState({ token, data, loading: false });
        },
        (cause) => {
          if (!active) return;
          const denied = adminAccessDenied(cause);
          setState((previous) => ({
            token,
            loading: false,
            denied,
            error: cause instanceof Error ? cause.message : 'Analytics belum dapat dimuat.',
            ...(!denied && previous.token === token && previous.data
              ? { data: previous.data }
              : {}),
          }));
        },
      )
      .finally(() => {
        if (active) pending.current = false;
      });
    return () => {
      active = false;
    };
  }, [token, generation]);
  return {
    data: state.token === token ? state.data : undefined,
    error: state.token === token ? state.error : undefined,
    denied: state.token === token ? state.denied : undefined,
    loading: state.token !== token || state.loading,
    retry: () => {
      if (!pending.current) {
        pending.current = true;
        setGeneration((value) => value + 1);
      }
    },
  };
}
