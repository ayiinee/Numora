'use client';

import { useState } from 'react';
import { Button, Icon, Tabs } from '@tka/ui';
import { AppShell } from '@/components/shell';
import { useAuth } from '@/features/onboarding/auth';
import { AdminLoading, AdminMessage } from './admin-presentation';
import { adminOffset, useAdminUrl } from './admin-url';
import { useOperationalQuery } from './operational-query';
import { PeopleEmpty, PeopleFooter } from './operations-panels';
import { ADMIN_PAGE_SIZE } from './pagination';
import type { AdminStructureClassesDto, AdminStructureSchoolsDto } from './generated-types';

export function AdminStructuresScreen() {
  const { state } = useAuth();
  const url = useAdminUrl();
  const token =
    state.status === 'ready' &&
    state.profile.role === 'ADMIN' &&
    state.profile.status === 'ACTIVE' &&
    state.profile.capabilities?.includes('OPERATIONS_LIMITED_READ')
      ? state.session.access_token
      : null;
  const tab = url.params.get('view') === 'classes' ? 'classes' : 'schools';
  const identity =
    state.status === 'ready'
      ? JSON.stringify([state.profile.id, state.profile.adminRole, state.profile.capabilities])
      : state.status;
  const panel =
    token && url.search !== null ? (
      <StructurePanel key={`${identity}:${url.search}`} token={token} />
    ) : null;
  return (
    <AppShell
      area="admin"
      className="admin-redesign-shell admin-management-shell admin-people-shell admin-structures-shell"
    >
      <div className="people-frame">
        <header className="people-page-heading">
          <div>
            <h1>Sekolah & kelas</h1>
            <p>Lihat struktur sekolah dan jumlah anggota untuk perencanaan konten.</p>
          </div>
          <span className="people-readonly">
            <Icon name="lock" />
            Baca saja
          </span>
        </header>
        {state.status === 'loading' || url.search === null ? (
          <AdminLoading message="Memeriksa akses…" />
        ) : !token ? (
          <AdminMessage error message="Akses struktur operasional belum tersedia." login />
        ) : (
          <Tabs
            label="Jenis struktur"
            value={tab}
            onChange={(view) => url.update({ view, search: null, offset: null, schoolId: null })}
            items={[
              { value: 'schools', label: 'Sekolah', content: tab === 'schools' ? panel : null },
              { value: 'classes', label: 'Kelas', content: tab === 'classes' ? panel : null },
            ]}
          />
        )}
        <p className="people-access-note" role="note">
          <Icon name="info" />
          Akses baca saja. Data ditampilkan sebagai struktur dan jumlah. Pengelolaan sekolah, Guru,
          credential, dan data individual siswa tersedia sesuai izin Admin Operasional dan Super
          Admin.
        </p>
      </div>
    </AppShell>
  );
}

function StructurePanel({ token }: { token: string }) {
  const url = useAdminUrl();
  const tab = url.params.get('view') === 'classes' ? 'classes' : 'schools';
  const offset = adminOffset(url.params.get('offset'));
  const filter = url.params.get('search') ?? '';
  const schoolId = tab === 'classes' ? (url.params.get('schoolId') ?? '') : '';
  const [search, setSearch] = useState(filter);
  const query = new URLSearchParams({
    offset: String(offset),
    limit: String(ADMIN_PAGE_SIZE),
    search: filter,
  });
  if (schoolId) query.set('schoolId', schoolId);
  const { data, error, denied, retry } = useOperationalQuery<
    AdminStructureClassesDto | AdminStructureSchoolsDto
  >(`admin/structures/${tab}?${query}`, token);
  const reset = () => url.update({ search: null, offset: null, schoolId: null });
  if (denied) return <AdminMessage error message={error!} login retry={retry} />;
  return (
    <section
      className="people-surface"
      aria-label={tab === 'schools' ? 'Daftar sekolah' : 'Daftar kelas'}
    >
      <div className="people-toolbar">
        <div>
          <h2>{tab === 'schools' ? 'Daftar sekolah' : 'Daftar kelas'}</h2>
          <p>
            {tab === 'schools'
              ? 'Jumlah kelas, Guru terverifikasi, siswa, dan status credential.'
              : 'Jumlah siswa dan ketersediaan Guru, tanpa data individual.'}
          </p>
        </div>
        <form
          className="people-search structures-search"
          role="search"
          onSubmit={(event) => {
            event.preventDefault();
            url.update({ search: search.trim(), offset: null });
          }}
        >
          <div>
            <label className="sr-only" htmlFor="structure-search">
              Cari struktur
            </label>
            <Icon name="search" />
            <input
              id="structure-search"
              type="search"
              maxLength={100}
              placeholder={tab === 'schools' ? 'Nama atau kode sekolah' : 'Nama kelas'}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <Button type="submit" variant="secondary">
            Cari
          </Button>
        </form>
      </div>
      {(filter || schoolId) && (
        <div className="people-applied">
          {filter && <span>Pencarian: {filter}</span>}
          {schoolId && <span>Kelas dari sekolah terpilih</span>}
          <Button variant="ghost" onClick={reset}>
            Hapus filter
          </Button>
        </div>
      )}
      {error ? (
        <AdminMessage error message={error} retry={retry} />
      ) : !data ? (
        <AdminLoading message="Memuat struktur…" />
      ) : (
        <>
          {!data.items.length ? (
            <PeopleEmpty
              title="Belum ada struktur sesuai filter."
              description="Coba kata kunci lain atau kembali ke daftar tanpa filter."
              {...(filter || schoolId ? { reset } : {})}
            />
          ) : (
            <StructureTable
              data={data}
              schools={tab === 'schools'}
              onSchool={(id) => {
                url.update({ view: 'classes', schoolId: id, offset: null, search: null });
              }}
            />
          )}
          <PeopleFooter
            offset={offset}
            count={data.items.length}
            nextOffset={data.nextOffset}
            label="Halaman struktur"
            onChange={(next) => url.update({ offset: next || null })}
          />
        </>
      )}
    </section>
  );
}

function StructureTable({
  data,
  schools,
  onSchool,
}: {
  data: AdminStructureClassesDto | AdminStructureSchoolsDto;
  schools: boolean;
  onSchool: (id: string) => void;
}) {
  return (
    <table className={`people-table structures-table${schools ? ' structures-schools-table' : ''}`}>
      <caption className="sr-only">
        {schools ? 'Struktur sekolah dan jumlah anggota' : 'Struktur kelas dan jumlah anggota'}
      </caption>
      <thead>
        <tr>
          <th scope="col">{schools ? 'Sekolah' : 'Kelas'}</th>
          <th scope="col">{schools ? 'Kelas aktif' : 'Sekolah'}</th>
          <th scope="col">{schools ? 'Guru terverifikasi' : 'Ketersediaan Guru'}</th>
          <th scope="col">Siswa aktif</th>
          <th scope="col">{schools ? 'Credential' : 'Status'}</th>
          {schools && <th scope="col">Penelusuran</th>}
        </tr>
      </thead>
      <tbody>
        {data.items.map((item) => (
          <tr key={item.id}>
            <td className="structures-name">
              <strong>{item.name}</strong>
              {'code' in item && (
                <span>
                  {item.code} · {item.status === 'ACTIVE' ? 'Aktif' : 'Nonaktif'}
                </span>
              )}
            </td>
            <td>
              <span className="people-cell-label">{schools ? 'Kelas aktif' : 'Sekolah'}</span>
              {'classCount' in item ? item.classCount : item.schoolName}
            </td>
            <td>
              <span className="people-cell-label">
                {schools ? 'Guru terverifikasi' : 'Ketersediaan Guru'}
              </span>
              {'activeTeacherCount' in item
                ? item.activeTeacherCount
                : item.teacherActive
                  ? 'Dengan Guru aktif'
                  : 'Tanpa Guru aktif'}
            </td>
            <td>
              <span className="people-cell-label">Siswa aktif</span>
              {item.studentCount}
            </td>
            <td>
              <span className="people-cell-label">{schools ? 'Credential' : 'Status'}</span>
              {'availableCredentialCount' in item ? (
                <div className="structures-credentials">
                  <span>{item.availableCredentialCount} tersedia</span>
                  <details>
                    <summary aria-label={`Status lainnya untuk ${item.name}`}>
                      Status lainnya
                    </summary>
                    <dl>
                      <div>
                        <dt>Terpakai</dt>
                        <dd>{item.usedCredentialCount}</dd>
                      </div>
                      <div>
                        <dt>Kedaluwarsa</dt>
                        <dd>{item.expiredCredentialCount}</dd>
                      </div>
                      <div>
                        <dt>Dicabut</dt>
                        <dd>{item.revokedCredentialCount}</dd>
                      </div>
                    </dl>
                  </details>
                </div>
              ) : (
                <span
                  className="people-status"
                  data-status={item.archivedAt ? 'ARCHIVED' : 'ACTIVE'}
                >
                  {item.archivedAt ? 'Diarsipkan' : 'Kelas aktif'}
                </span>
              )}
            </td>
            {'classCount' in item && (
              <td className="structures-action">
                <Button
                  variant="secondary"
                  aria-label={`Lihat kelas sekolah ${item.name}`}
                  onClick={() => onSchool(item.id)}
                >
                  Lihat kelas sekolah
                </Button>
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
