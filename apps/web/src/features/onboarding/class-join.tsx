'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Icon, SectionHeader } from '@tka/ui';
import { StudentLayout } from '@/components/shell';
import { StudentGate } from '@/features/core-learning/ui';
import { ApiProblem, joinClass } from '@/lib/api';
import { useAuth } from './auth';

const JOIN_CODE = /^(?:[A-Za-z0-9]{6}|[A-Za-z0-9_\x2D]{8,32})$/;

const FAILURE_HINT: Record<string, string> = {
  CLASS_NOT_FOUND: 'Kode bisa salah, kelas sudah diarsipkan, atau sekolah tidak aktif.',
  ALREADY_IN_CLASS:
    'Satu Siswa hanya boleh aktif pada satu kelas. Keluar atau pindah kelas tidak dapat dilakukan sendiri.',
  CODE_ATTEMPT_LIMIT: 'Tunggu beberapa saat sebelum mencoba kode lagi.',
  CODE_LIMITER_UNAVAILABLE: 'Pemeriksaan kode sementara tidak tersedia. Coba lagi nanti.',
  NETWORK_ERROR: 'Periksa koneksi lalu coba lagi.',
};

type JoinFailure = { status: number; code: string; detail: string };

function toFailure(error: unknown): JoinFailure {
  if (error instanceof ApiProblem)
    return { status: error.status, code: error.code, detail: error.message };
  return { status: 0, code: 'UNKNOWN', detail: 'Gabung kelas belum berhasil. Coba lagi.' };
}

export function ClassJoinScreen({ code }: { code: string | undefined }) {
  return (
    <StudentLayout
      title="Gabung kelas"
      subtitle="Tautan atau QR dari gurumu membawa kode kelas."
      backHref="/student"
    >
      <StudentGate>{(token) => <JoinContent token={token} rawCode={code} />}</StudentGate>
    </StudentLayout>
  );
}

function JoinContent({ token, rawCode }: { token: string; rawCode: string | undefined }) {
  const { state, refresh } = useAuth();
  const router = useRouter();
  const cache = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<JoinFailure | null>(null);
  if (state.status !== 'ready') return null;

  const code = (rawCode ?? '').trim();
  const usable = JOIN_CODE.test(code);

  async function join() {
    if (busy || !usable) return;
    setBusy(true);
    setFailure(null);
    try {
      await joinClass(token, code);
      await cache.invalidateQueries();
      await refresh();
      // The refresh cycles the Student gate, so the class name is confirmed from the dashboard.
      router.replace('/student');
    } catch (error) {
      setFailure(toFailure(error));
      setBusy(false);
    }
  }

  if (!code)
    return (
      <section className="surface-card">
        <SectionHeader
          title="Kode kelas tidak tersedia"
          subtitle="Tautan yang kamu buka tidak membawa kode kelas."
        />
        <p className="field-help">Gunakan halaman Profil untuk memasukkan kode dari gurumu.</p>
        <Link className="button-link" href="/student/profile">
          Gabung dengan kode
        </Link>
      </section>
    );

  if (!usable)
    return (
      <section className="surface-card">
        <SectionHeader title="Kode pada tautan tidak dikenali" />
        <p className="form-error" role="alert">
          Format kode kelas tidak dikenali.
        </p>
        <p className="field-help">Kode kelas baru terdiri atas 6 karakter, tanpa spasi.</p>
        <Link className="button-link" href="/student/profile">
          Masukkan kode manual
        </Link>
      </section>
    );

  return (
    <section className="surface-card">
      <SectionHeader title="Konfirmasi gabung kelas" subtitle="Periksa kode dari gurumu." />
      <div className="settings-list">
        <div className="settings-row">
          <span className="icon-tile accent-2">
            <Icon name="school" />
          </span>
          <div>
            <small>Kode kelas</small>
            <strong>{code}</strong>
          </div>
        </div>
      </div>
      {state.profile.studentAffiliation === 'SCHOOL' && (
        <p className="gentle-note">
          Akunmu sudah terhubung dengan sebuah kelas. Hasil akhir tetap ditentukan server.
        </p>
      )}
      {failure && (
        <p className="form-error" role="alert">
          {failure.detail}
          {FAILURE_HINT[failure.code] ? ` ${FAILURE_HINT[failure.code]}` : ''}
          {failure.status === 401 && (
            <>
              {' '}
              <Link className="button-link" href="/">
                Masuk kembali
              </Link>
            </>
          )}
        </p>
      )}
      <Button onClick={() => void join()} disabled={busy}>
        {busy ? 'Menghubungkan…' : 'Gabung kelas'}
      </Button>
    </section>
  );
}
