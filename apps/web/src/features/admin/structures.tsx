'use client';
import { ADMIN_PAGE_SIZE } from './pagination';
import { useEffect, useState } from 'react';
import { Button, Card } from '@tka/ui';
import { useAuth } from '@/features/onboarding/auth';
import { apiRequest } from '@/lib/api';
import { AdminFrame, AdminLoading, AdminMessage } from './admin-presentation';
import type { AdminStructureClassesDto, AdminStructureSchoolsDto } from './generated-types';
export function AdminStructuresScreen() {
  const { state } = useAuth();
  const token =
    state.status === 'ready' &&
    state.profile.role === 'ADMIN' &&
    state.profile.status === 'ACTIVE' &&
    state.profile.capabilities?.includes('OPERATIONS_LIMITED_READ')
      ? state.session.access_token
      : null;
  return (
    <AdminFrame
      title="Sekolah dan kelas — baca saja"
      description="View terbatas sesuai PRD: struktur dan jumlah anggota untuk perencanaan konten."
      icon="school"
    >
      {state.status === 'loading' ? (
        <AdminLoading message="Memeriksa akses…" />
      ) : !token ? (
        <AdminMessage error message="Akses struktur operasional belum tersedia." login />
      ) : (
        <StructurePanel
          key={state.status === 'ready' ? state.profile.id + state.profile.adminRole : ''}
          token={token}
        />
      )}
    </AdminFrame>
  );
}
function StructurePanel({ token }: { token: string }) {
  const [tab, setTab] = useState<'schools' | 'classes'>('schools'),
    [data, setData] = useState<AdminStructureClassesDto | AdminStructureSchoolsDto | null>(null),
    [error, setError] = useState(''),
    [offset, setOffset] = useState(0),
    [search, setSearch] = useState(''),
    [filter, setFilter] = useState(''),
    [schoolId, setSchoolId] = useState(''),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setData(null);
    setError('');
    const query = new URLSearchParams({
      offset: String(offset),
      limit: String(ADMIN_PAGE_SIZE),
      search: filter,
    });
    if (tab === 'classes' && schoolId) query.set('schoolId', schoolId);
    void apiRequest<AdminStructureClassesDto | AdminStructureSchoolsDto>(
      `admin/structures/${tab}?${query}`,
      token,
    )
      .then((value) => {
        if (active) setData(value);
      })
      .catch((error) => {
        if (active) setError(error.message);
      });
    return () => {
      active = false;
    };
  }, [token, tab, offset, filter, schoolId, revision]);
  return (
    <div className="page-stack">
      <p role="note">
        Akses baca saja. Pengelolaan sekolah, Guru, credential, dan data individual siswa tersedia
        untuk Admin Operasional dan Super Admin.
      </p>
      <nav aria-label="Jenis struktur" className="admin-content-actions">
        <Button
          variant={tab === 'schools' ? 'primary' : 'secondary'}
          onClick={() => {
            setTab('schools');
            setOffset(0);
            setSchoolId('');
          }}
        >
          Sekolah
        </Button>
        <Button
          variant={tab === 'classes' ? 'primary' : 'secondary'}
          onClick={() => {
            setTab('classes');
            setOffset(0);
          }}
        >
          Kelas
        </Button>
      </nav>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setFilter(search.trim());
          setOffset(0);
        }}
      >
        <label htmlFor="structure-search">Cari struktur</label>
        <input
          id="structure-search"
          className="text-input"
          maxLength={100}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <Button type="submit" variant="secondary">
          Cari
        </Button>
      </form>
      {error ? (
        <AdminMessage error message={error} retry={() => setRevision((value) => value + 1)} />
      ) : !data ? (
        <AdminLoading message="Memuat struktur…" />
      ) : (
        <>
          {!data.items.length && <p>Belum ada struktur sesuai filter.</p>}
          <div className="page-stack">
            {data.items.map((item) => (
              <Card key={item.id}>
                <h2>{item.name}</h2>
                <p>
                  {'schoolName' in item ? item.schoolName : item.code} · {item.studentCount} siswa
                  aktif
                </p>
                {'classCount' in item ? (
                  <>
                    <p>
                      {item.classCount} kelas aktif · {item.activeTeacherCount} Guru aktif dan
                      terverifikasi
                    </p>
                    <p>
                      Credential: {item.availableCredentialCount} tersedia ·{' '}
                      {item.usedCredentialCount} terpakai · {item.expiredCredentialCount}{' '}
                      kedaluwarsa · {item.revokedCredentialCount} dicabut
                    </p>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setSchoolId(item.id);
                        setTab('classes');
                        setOffset(0);
                        setFilter('');
                        setSearch('');
                      }}
                    >
                      Lihat kelas sekolah
                    </Button>
                  </>
                ) : (
                  <p>
                    {item.archivedAt ? 'Diarsipkan' : 'Kelas aktif'} ·{' '}
                    {item.teacherActive ? 'Dengan Guru aktif' : 'Tanpa Guru aktif'}
                  </p>
                )}
              </Card>
            ))}
          </div>
          <div className="admin-content-actions">
            <Button
              variant="secondary"
              disabled={!offset}
              onClick={() => setOffset(Math.max(0, offset - ADMIN_PAGE_SIZE))}
            >
              Sebelumnya
            </Button>
            <Button
              variant="secondary"
              disabled={data.nextOffset === null}
              onClick={() => setOffset(data.nextOffset!)}
            >
              Berikutnya
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
