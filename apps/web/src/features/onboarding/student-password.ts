import { ApiProblem, apiRequest, registerIdentity, type IdentityProfile } from '@/lib/api';
import { createStudentPasswordAuth, getSupabase } from '@/lib/supabase';

async function studentProfile(token: string) {
  const read = () => apiRequest<IdentityProfile>('identity/me', token);
  try {
    return await read();
  } catch (error) {
    if (!(error instanceof ApiProblem) || error.code !== 'ACCOUNT_NOT_REGISTERED') throw error;
  }

  try {
    return await registerIdentity(token, 'STUDENT');
  } catch (error) {
    // Another tab may have finished provisioning this profile first.
    if (error instanceof ApiProblem && error.status === 409) return read();
    throw error;
  }
}

export async function signInStudent(email: string, password: string) {
  const auth = createStudentPasswordAuth();
  let acquiredSession = false;
  let acceptedSession = false;
  try {
    const { data, error } = await auth.signInWithPassword({ email: email.trim(), password });
    if (error || !data.session)
      throw new Error('Login belum berhasil. Periksa email dan password, lalu coba lagi.');

    acquiredSession = true;
    const { access_token, refresh_token } = data.session;
    const profile = await studentProfile(access_token);
    if (profile.role !== 'STUDENT') throw new Error('Gunakan akun Siswa untuk masuk di sini.');

    const result = await getSupabase().auth.setSession({ access_token, refresh_token });
    if (result.error || !result.data.session)
      throw new Error('Sesi belum dapat dibuat. Coba lagi.');
    acceptedSession = true;
  } finally {
    if (acquiredSession && !acceptedSession) await auth.signOut({ scope: 'local' }).catch(() => {});
    await auth.dispose();
  }
}
