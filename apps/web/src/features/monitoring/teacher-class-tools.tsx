'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import QRCode from 'qrcode';
import { useQuery } from '@tanstack/react-query';
import { Badge, Button, Card, Icon, ListRow, SectionHeader } from '@tka/ui';
import { TeacherShell } from '@/components/shell';
import { getClassStudents, getTeacherClasses } from '@/lib/api';
import { DataState } from '@/features/core-learning/ui';
import { TeacherGate } from './teacher-gate';
import { TeacherAnnouncement, TeacherUnavailable } from './teacher-ui';

export function TeacherInviteContent({ name, code }: { name: string; code: string | undefined }) {
  const [qr, setQr] = useState('');
  const [qrError, setQrError] = useState('');
  const [copyStatus, setCopyStatus] = useState('');
  const [generation, setGeneration] = useState(0);
  useEffect(() => {
    let current = true;
    setQr('');
    setQrError('');
    setCopyStatus('');
    if (code)
      void QRCode.toDataURL(code, {
        width: 320,
        margin: 4,
        errorCorrectionLevel: 'M',
        color: { dark: '#0D1B33', light: '#FFFFFF' },
      })
        .then((value) => {
          if (current) setQr(value);
        })
        .catch(() => {
          if (current) setQrError('Kode QR belum dapat dibuat.');
        });
    return () => {
      current = false;
    };
  }, [code, generation]);
  async function copy() {
    try {
      await navigator.clipboard.writeText(code!);
      setCopyStatus('Kode kelas disalin.');
    } catch {
      setCopyStatus('Belum dapat menyalin. Pilih dan salin kode kelas secara manual.');
    }
  }
  return (
    <div className="teacher-invite-content">
      <div className="teacher-invite-heading">
        <span className="icon-tile">
          <Icon name="users" />
        </span>
        <div>
          <h3>{name}</h3>
          <p>Undang siswa ke kelas Anda</p>
        </div>
      </div>
      {code ? (
        <>
          <Card className="teacher-code-panel">
            <span>Kode kelas</span>
            <strong>{code}</strong>
            <Button variant="secondary" onClick={() => void copy()}>
              <Icon name="clipboard" /> Salin kode
            </Button>
            <p role="status">{copyStatus}</p>
          </Card>
          <div className="teacher-qr-panel">
            {qr ? (
              <Image src={qr} width={240} height={240} unoptimized alt={`QR kode kelas ${name}`} />
            ) : qrError ? (
              <div role="alert">
                <p>{qrError}</p>
                <Button variant="secondary" onClick={() => setGeneration((value) => value + 1)}>
                  Coba lagi
                </Button>
              </div>
            ) : (
              <p role="status">Menyiapkan kode QR…</p>
            )}
            <p>QR berisi kode kelas di atas.</p>
            {qr && (
              <a className="button-link" href={qr} download="numora-kode-kelas.png">
                <Icon name="arrow" /> Unduh PNG QR
              </a>
            )}
          </div>
          <Card>
            <SectionHeader title="Cara bergabung" />
            <ol className="teacher-invite-steps">
              <li>Siswa masuk ke NUMORA dengan akun Google.</li>
              <li>Buka Profil, pilih Gabung kelas, lalu masukkan kode.</li>
              <li>Setelah bergabung, siswa tampil dalam daftar anggota kelas.</li>
            </ol>
            <TeacherAnnouncement>
              Siswa hanya dapat bergabung dalam satu kelas. Gunakan kode kelas; QR ini bukan tautan
              otomatis untuk bergabung.
            </TeacherAnnouncement>
          </Card>
        </>
      ) : (
        <TeacherUnavailable
          title="Kode kelas belum tersedia"
          description="Kode belum dikembalikan untuk kelas ini. Muat ulang daftar kelas sebelum membagikan undangan."
        />
      )}
    </div>
  );
}

export function TeacherClassToolsScreen({
  classId,
  mode,
}: {
  classId: string;
  mode: 'invite' | 'settings';
}) {
  return (
    <TeacherGate>
      {(token, name) => (
        <ClassTools token={token} teacherName={name} classId={classId} mode={mode} />
      )}
    </TeacherGate>
  );
}
function ClassTools({
  token,
  teacherName,
  classId,
  mode,
}: {
  token: string;
  teacherName: string;
  classId: string;
  mode: 'invite' | 'settings';
}) {
  const classes = useQuery({
    queryKey: ['teacher-classes'],
    queryFn: () => getTeacherClasses(token),
  });
  const roster = useQuery({
    queryKey: ['class-students', classId],
    queryFn: () => getClassStudents(token, classId),
  });
  const cls = classes.data?.items.find((value) => value.id === classId);
  return (
    <TeacherShell
      title={mode === 'invite' ? 'Undang siswa' : 'Pengaturan kelas'}
      description={roster.data?.class.name}
      teacherName={teacherName}
      backHref={`/teacher/classes/${classId}`}
    >
      <div className="teacher-tools-page">
        <Link className="back-link" href={`/teacher/classes/${classId}`}>
          <Icon name="back" />
          Kembali ke detail kelas
        </Link>
        {classes.isPending || classes.isError || roster.isPending || roster.isError ? (
          <DataState
            pending={classes.isPending || roster.isPending}
            error={classes.error || roster.error}
            retry={() => {
              void classes.refetch();
              void roster.refetch();
            }}
          />
        ) : mode === 'invite' ? (
          <TeacherInviteContent name={roster.data.class.name} code={cls?.joinCode} />
        ) : (
          <>
            <Card>
              <SectionHeader title="Informasi kelas" />
              <ListRow
                wrapText
                title={roster.data.class.name}
                description="Nama kelas"
                leading={<Icon name="users" />}
              />
              <ListRow
                wrapText
                title={cls?.joinCode ?? 'Belum tersedia'}
                description="Kode kelas"
                leading={<Icon name="clipboard" />}
              />
              <ListRow
                title={`${roster.data.items.length} siswa`}
                description="Anggota aktif"
                leading={<Icon name="graduation" />}
              />
              <Badge variant="primary">Informasi hanya baca</Badge>
            </Card>
            <TeacherAnnouncement>
              Pengubahan nama, pengarsipan kelas, dan pengaturan keanggotaan belum tersedia.
            </TeacherAnnouncement>
            <Link className="button-link" href={`/teacher/classes/${classId}/invite`}>
              Bagikan kode kelas <Icon name="arrow" />
            </Link>
          </>
        )}
      </div>
    </TeacherShell>
  );
}
