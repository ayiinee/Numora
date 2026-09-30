'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { ApiProblem, getIdentity, registerIdentity, type IdentityProfile } from '@/lib/api';
import { getSupabase } from '@/lib/supabase';
import { destination } from './destination';

type AuthState =
  | {
      status: 'loading' | 'signed_out' | 'registration' | 'disabled' | 'error';
      session?: Session;
      message?: string;
    }
  | { status: 'ready'; session: Session; profile: IdentityProfile };

type AuthContextValue = {
  state: AuthState;
  refresh: () => Promise<void>;
  register: (role: 'STUDENT' | 'TEACHER') => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export { destination };

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let active = true;
    let sequence = 0;
    let lastAccessToken: string | null | undefined;
    let pendingTimer: ReturnType<typeof setTimeout> | undefined;
    const clearPending = () => clearTimeout(pendingTimer);
    const failIfPending = (current: number) => {
      clearPending();
      pendingTimer = setTimeout(() => {
        if (!active || current !== sequence) return;
        sequence++;
        setState({
          status: 'error',
          message: 'Pemeriksaan sesi terlalu lama. Periksa koneksi lalu coba lagi.',
        });
      }, 10_000);
    };
    let client: ReturnType<typeof getSupabase>;
    try {
      client = getSupabase();
    } catch (error) {
      setState({ status: 'error', message: (error as Error).message });
      return;
    }

    const resolve = async (session: Session | null) => {
      const accessToken = session?.access_token ?? null;
      if (lastAccessToken === accessToken) return;
      lastAccessToken = accessToken;
      const current = ++sequence;
      clearPending();
      if (!session) {
        setState({ status: 'signed_out' });
        return;
      }
      setState({ status: 'loading', session });
      failIfPending(current);
      try {
        const profile = await getIdentity(session.access_token);
        if (!active || current !== sequence) return;
        clearPending();
        setState({ status: 'ready', session, profile });
      } catch (error) {
        if (!active || current !== sequence) return;
        clearPending();
        if (error instanceof ApiProblem && error.code === 'ACCOUNT_NOT_REGISTERED') {
          setState({ status: 'registration', session });
        } else if (error instanceof ApiProblem && error.code === 'ACCOUNT_DISABLED') {
          setState({ status: 'disabled', session, message: error.message });
        } else if (error instanceof ApiProblem && error.status === 401) {
          setState({ status: 'signed_out', message: 'Sesi berakhir. Login kembali.' });
        } else {
          setState({
            status: 'error',
            session,
            message: error instanceof Error ? error.message : 'Sesi belum dapat diperiksa.',
          });
        }
      }
    };

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, session) => {
      // Supabase callbacks must not await another Supabase call.
      void Promise.resolve().then(() => {
        if (active) void resolve(session);
      });
    });
    // Supabase emits INITIAL_SESSION for this subscription, including a null session.
    failIfPending(sequence);
    return () => {
      active = false;
      sequence++;
      clearPending();
      subscription.unsubscribe();
    };
  }, [revision]);

  const refresh = useCallback(async () => {
    setRevision((value) => value + 1);
  }, []);
  const register = useCallback(async (role: 'STUDENT' | 'TEACHER') => {
    const { data } = await getSupabase().auth.getSession();
    if (!data.session) throw new Error('Sesi berakhir. Login kembali.');
    await registerIdentity(data.session.access_token, role);
    setRevision((value) => value + 1);
  }, []);
  const logout = useCallback(async () => {
    const { error } = await getSupabase().auth.signOut();
    if (error) throw error;
    setState({ status: 'signed_out' });
  }, []);

  return (
    <AuthContext.Provider value={{ state, refresh, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('AuthProvider is missing.');
  return context;
}
