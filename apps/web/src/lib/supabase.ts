import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | undefined;
let studentAuthSequence = 0;

function authConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (process.env.NODE_ENV === 'development') {
    console.debug('[NUMORA SUPABASE]', {
      hasUrl: Boolean(url),
      hasKey: Boolean(key),
      keyIsReplaceMe: key === 'replace-me',
    });
  }

  if (!url || !key || key === 'replace-me') {
    throw new Error('Login belum dikonfigurasi.');
  }
  return { url, key };
}

export function getSupabase() {
  if (client) return client;
  const { url, key } = authConfig();
  client = createClient(url, key, {
    auth: {
      flowType: 'pkce',
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });

  return client;
}

export function createStudentPasswordAuth() {
  const { url, key } = authConfig();
  // Check the role before publishing a session to the shared AuthProvider.
  return createClient(url, key, {
    auth: {
      storageKey: `numora-student-password-check-${++studentAuthSequence}`,
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  }).auth;
}
