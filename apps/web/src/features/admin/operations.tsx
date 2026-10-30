'use client';
import { useEffect, useRef, useState } from 'react';
import { Button, Icon, Tabs } from '@tka/ui';
import { AppShell } from '@/components/shell';
import { useAuth } from '@/features/onboarding/auth';
import { AdminFrame, AdminLoading, AdminMessage } from './admin-presentation';
import { withAdminWorkspace, useAdminAccessError } from './admin-workspace';
import { useAdminUrl, adminOffset } from './admin-url';
import { getAdminClass, getAdminUser, listAdminClasses, listAdminUsers } from './operations-api';
import type {
  AdminClassDto,
  AdminClassListDto,
  AdminUserDetailDto,
  AdminUserListDto,
} from './generated-types';
import { OperationsMemberships, OperationsRoster } from './membership-readers';
import {
  UserTable,
  ClassTable,
  UserSummary,
  ClassSummary,
  PeopleFooter,
  PeopleEmpty,
  peopleRoles,
} from './operations-panels';
import { OperationsPicker } from './operations-picker';

type View = 'users' | 'classes';
type Directory =
  { kind: 'users'; page: AdminUserListDto } | { kind: 'classes'; page: AdminClassListDto };
type Detail =
  { kind: 'users'; value: AdminUserDetailDto } | { kind: 'classes'; value: AdminClassDto };
const keys = ['search', 'role', 'status', 'affiliation', 'schoolId', 'teacherId', 'state'] as const;
export const AdminOperationsScreen = withAdminWorkspace(OperationsScreen, 'operations');
function OperationsScreen() {
  const { state, refresh } = useAuth();
  const url = useAdminUrl();
  const token =
    state.status === 'ready' &&
    state.profile.role === 'ADMIN' &&
    state.profile.status === 'ACTIVE' &&
    state.profile.capabilities?.includes('OPERATIONS_MANAGE')
      ? state.session.access_token
      : null;
  const view: View = url.params.get('view') === 'classes' ? 'classes' : 'users';
  const operations = state.status === 'ready' && state.profile.adminRole === 'OPERATIONS';
  const identity =
    state.status === 'ready'
      ? JSON.stringify([
          state.profile.id,
          state.profile.adminRole,
          state.profile.status,
          state.profile.capabilities,
        ])
      : state.status;
  if (!token || url.search === null)
    return (
      <AdminFrame
        title="Pengguna & kelas"
        description="Telusuri data operasional akun dan kelas."
        icon="users"
      >
        {state.status === 'loading' || url.search === null ? (
          <AdminLoading message="Memeriksa akses Admin..." />
        ) : (
          <AdminMessage
            error
            message="Halaman ini hanya tersedia untuk Admin Operasional dan Super Admin."
            login
            retry={() => void refresh()}
          />
        )}
      </AdminFrame>
    );
  function navigate(next: string) {
    url.update({
      view: next,
      search: null,
      role: null,
      status: null,
      affiliation: null,
      schoolId: null,
      teacherId: null,
      state: null,
      offset: null,
      userId: null,
      classId: null,
    });
  }
  const panel = (
    <PeopleWorkspace
      key={`${identity}:${url.search}`}
      token={token}
      view={view}
      superAdmin={state.status === 'ready' && state.profile.adminRole === 'SUPER_ADMIN'}
    />
  );
  return (
    <AppShell
      area="admin"
      className={`admin-redesign-shell admin-management-shell admin-people-shell${operations ? ' admin-workspace-shell admin-operations-shell' : ''}`}
    >
      <div className="people-frame">
        <header className="people-page-heading">
          <div>
            <h1>Pengguna & kelas</h1>
            <p>Telusuri akun, keanggotaan sekolah, dan anggota kelas.</p>
          </div>
          <span className="people-readonly">
            <Icon name="lock" />
            Baca saja
          </span>
        </header>
        <Tabs
          label="Jenis data operasional"
          value={view}
          onChange={navigate}
          items={[
            { value: 'users', label: 'Pengguna', content: view === 'users' ? panel : null },
            { value: 'classes', label: 'Kelas', content: view === 'classes' ? panel : null },
          ]}
        />
        <p className="people-access-note">
          <Icon name="info" />
          Halaman ini untuk penelusuran data. Pengelolaan akses akun dan tindakan khusus Guru
          mengikuti izin masing-masing.
        </p>
      </div>
    </AppShell>
  );
}
function PeopleWorkspace({
  token,
  view,
  superAdmin,
}: {
  token: string;
  view: View;
  superAdmin: boolean;
}) {
  const url = useAdminUrl();
  const onAccessError = useAdminAccessError();
  const filters = Object.fromEntries(keys.map((key) => [key, url.params.get(key) ?? ''])) as Record<
    (typeof keys)[number],
    string
  >;
  const [form, setForm] = useState(filters),
    [showFilters, setShowFilters] = useState(false);
  const [directory, setDirectory] = useState<Directory | null>(null),
    [listError, setListError] = useState(''),
    [listRetry, setListRetry] = useState(0);
  const [detail, setDetail] = useState<Detail | null>(null),
    [detailError, setDetailError] = useState(''),
    [detailRetry, setDetailRetry] = useState(0);
  const selectedKey = view === 'users' ? 'userId' : 'classId';
  const selectedId = (url.params.get(selectedKey) ?? '').toLowerCase();
  const offset = adminOffset(url.params.get('offset'));
  const detailHeading = useRef<HTMLHeadingElement>(null);
  const query = url.search;
  useEffect(() => {
    if (selectedId) return;
    let active = true;
    setDirectory(null);
    setListError('');
    const pending =
      view === 'users'
        ? listAdminUsers(token, {
            offset,
            search: filters.search,
            role: filters.role,
            status: filters.status,
            affiliation: filters.affiliation,
            schoolId: filters.schoolId,
          }).then((page) => ({ kind: 'users' as const, page }))
        : listAdminClasses(token, {
            offset,
            search: filters.search,
            schoolId: filters.schoolId,
            teacherId: filters.teacherId,
            state: filters.state,
          }).then((page) => ({ kind: 'classes' as const, page }));
    void pending.then(
      (data) => {
        if (active) setDirectory(data);
      },
      (cause) => {
        if (active) {
          setListError(cause instanceof Error ? cause.message : 'Daftar belum dapat dimuat.');
          onAccessError(cause);
        }
      },
    );
    return () => {
      active = false;
    };
  }, [query, listRetry, token, onAccessError, view, selectedId, offset]);
  useEffect(() => {
    if (!selectedId) return;
    let active = true;
    setDetail(null);
    setDetailError('');
    const pending =
      view === 'users'
        ? getAdminUser(token, selectedId).then((value) => ({ kind: 'users' as const, value }))
        : getAdminClass(token, selectedId).then((value) => ({ kind: 'classes' as const, value }));
    void pending.then(
      (value) => {
        if (active) setDetail(value);
      },
      (cause) => {
        if (active) {
          setDetailError(cause instanceof Error ? cause.message : 'Detail belum dapat dimuat.');
          onAccessError(cause);
        }
      },
    );
    return () => {
      active = false;
    };
  }, [token, view, selectedId, detailRetry, onAccessError]);
  useEffect(() => {
    if (selectedId) {
      detailHeading.current?.focus({ preventScroll: true });
      window.scrollTo(0, 0);
    }
  }, [selectedId]);
  function apply() {
    url.update({
      ...Object.fromEntries(keys.map((key) => [key, form[key].trim()])),
      offset: null,
      userId: null,
      classId: null,
    });
  }
  function reset() {
    setForm({
      search: '',
      role: '',
      status: '',
      affiliation: '',
      schoolId: '',
      teacherId: '',
      state: '',
    });
    url.update({
      search: null,
      role: null,
      status: null,
      affiliation: null,
      schoolId: null,
      teacherId: null,
      state: null,
      offset: null,
      userId: null,
      classId: null,
    });
  }
  function field(key: (typeof keys)[number], value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }
  const isUsers = view === 'users';
  const count = keys.filter(
    (key) =>
      key !== 'search' &&
      filters[key] &&
      (isUsers
        ? !['teacherId', 'state'].includes(key)
        : !['role', 'status', 'affiliation'].includes(key)),
  ).length;
  if (selectedId)
    return (
      <section className="people-detail" aria-label={isUsers ? 'Detail pengguna' : 'Detail kelas'}>
        <div className="people-detail-toolbar">
          <Button variant="ghost" onClick={() => url.update({ [selectedKey]: null })}>
            <Icon name="back" />
            Tutup detail
          </Button>
          <h2 ref={detailHeading} tabIndex={-1} className="sr-only">
            {isUsers ? 'Detail pengguna' : 'Detail kelas'}
          </h2>
          <span>Kembali ke hasil pencarian</span>
        </div>
        {detailError ? (
          <div className="people-surface">
            <AdminMessage error message={detailError} retry={() => setDetailRetry((v) => v + 1)} />
          </div>
        ) : !detail ? (
          <div className="people-surface">
            <AdminLoading
              message={isUsers ? 'Memuat detail pengguna...' : 'Memuat detail kelas...'}
            />
          </div>
        ) : detail.kind === 'users' ? (
          <>
            <UserSummary user={detail.value} />
            {detail.value.role !== 'ADMIN' && (
              <OperationsMemberships
                key={detail.value.id}
                token={token}
                userId={detail.value.id}
                onAccessError={onAccessError}
              />
            )}
          </>
        ) : (
          <>
            <ClassSummary item={detail.value} />
            <OperationsRoster
              key={detail.value.id}
              token={token}
              classId={detail.value.id}
              onAccessError={onAccessError}
            />
          </>
        )}
      </section>
    );
  return (
    <section
      className="people-directory people-surface"
      aria-label={isUsers ? 'Hasil pencarian pengguna' : 'Hasil pencarian kelas'}
    >
      <div className="people-toolbar">
        <div>
          <h2>{isUsers ? 'Daftar pengguna' : 'Daftar kelas'}</h2>
          <p>
            {isUsers
              ? 'Temukan akun, lalu telusuri informasi dan keanggotaannya.'
              : 'Lihat sekolah, Guru, dan anggota setiap kelas.'}
          </p>
        </div>
        <form
          className="people-search"
          onSubmit={(event) => {
            event.preventDefault();
            apply();
          }}
        >
          <label className="sr-only" htmlFor="people-search">
            {isUsers ? 'Nama pengguna' : 'Nama kelas'}
          </label>
          <div>
            <Icon name="search" />
            <input
              type="search"
              id="people-search"
              maxLength={100}
              value={form.search}
              onChange={(event) => field('search', event.target.value)}
              placeholder={isUsers ? 'Cari nama pengguna' : 'Cari nama kelas'}
            />
          </div>
          <Button variant="secondary" type="submit">
            Cari
          </Button>
          <Button
            variant="secondary"
            type="button"
            aria-expanded={showFilters}
            aria-controls="people-filters"
            aria-label="Filter"
            onClick={() => setShowFilters((v) => !v)}
          >
            Filter{count > 0 && <span className="people-filter-count">{count}</span>}
          </Button>
        </form>
      </div>
      <div id="people-filters" className="people-filters" hidden={!showFilters}>
        <div className="people-filter-fields">
          {isUsers && (
            <>
              <label className="people-field">
                <span id="people-role-label">Peran</span>
                <select
                  aria-labelledby="people-role-label"
                  value={form.role}
                  onChange={(e) => field('role', e.target.value)}
                >
                  <option value="">Semua peran</option>
                  <option value="STUDENT">Siswa</option>
                  <option value="TEACHER">Guru</option>
                  {superAdmin && <option value="ADMIN">Admin</option>}
                </select>
              </label>
              <label className="people-field">
                <span id="people-status-label">Status akun</span>
                <select
                  aria-labelledby="people-status-label"
                  value={form.status}
                  onChange={(e) => field('status', e.target.value)}
                >
                  <option value="">Semua status</option>
                  <option value="ACTIVE">Aktif</option>
                  <option value="DISABLED">Dinonaktifkan</option>
                </select>
              </label>
              <label className="people-field">
                <span id="people-affiliation-label">Afiliasi siswa</span>
                <select
                  aria-labelledby="people-affiliation-label"
                  value={form.affiliation}
                  onChange={(e) => field('affiliation', e.target.value)}
                >
                  <option value="">Semua afiliasi</option>
                  <option value="MANDIRI">Mandiri</option>
                  <option value="SCHOOL">Sekolah</option>
                </select>
              </label>
            </>
          )}
          <OperationsPicker
            kind="school"
            value={form.schoolId}
            onChange={(value) => field('schoolId', value)}
            token={token}
            onAccessError={onAccessError}
          />
          {!isUsers && (
            <>
              <OperationsPicker
                kind="teacher"
                value={form.teacherId}
                onChange={(value) => field('teacherId', value)}
                schoolId={form.schoolId}
                token={token}
                onAccessError={onAccessError}
              />
              <label className="people-field">
                <span id="people-class-state-label">Status kelas</span>
                <select
                  aria-labelledby="people-class-state-label"
                  value={form.state}
                  onChange={(e) => field('state', e.target.value)}
                >
                  <option value="">Semua status</option>
                  <option value="active">Aktif</option>
                  <option value="archived">Diarsipkan</option>
                </select>
              </label>
            </>
          )}
        </div>
        <div className="people-filter-actions">
          <p>Filter berlaku setelah diterapkan.</p>
          <Button variant="secondary" onClick={reset}>
            Reset filter
          </Button>
          <Button onClick={apply}>Terapkan filter</Button>
        </div>
      </div>
      {(count > 0 || filters.search) && (
        <div className="people-applied">
          <span>{filters.search ? `Pencarian: ${filters.search}` : 'Filter aktif'}</span>
          {isUsers && filters.role && (
            <span>{peopleRoles[filters.role as keyof typeof peopleRoles] ?? filters.role}</span>
          )}
          {isUsers && filters.status && (
            <span>{filters.status === 'ACTIVE' ? 'Aktif' : 'Dinonaktifkan'}</span>
          )}
          {isUsers && filters.affiliation && (
            <span>{filters.affiliation === 'SCHOOL' ? 'Sekolah' : 'Mandiri'}</span>
          )}
          {filters.schoolId && <span>Sekolah dipilih</span>}
          {!isUsers && filters.teacherId && <span>Guru dipilih</span>}
          {!isUsers && filters.state && (
            <span>{filters.state === 'archived' ? 'Diarsipkan' : 'Kelas aktif'}</span>
          )}
          <Button variant="ghost" onClick={reset}>
            Hapus filter
          </Button>
        </div>
      )}
      {listError ? (
        <AdminMessage error message={listError} retry={() => setListRetry((v) => v + 1)} />
      ) : !directory ? (
        <AdminLoading message={isUsers ? 'Memuat pengguna...' : 'Memuat kelas...'} />
      ) : !directory.page.items.length ? (
        <PeopleEmpty
          title={
            isUsers
              ? count || filters.search
                ? 'Tidak ada pengguna yang cocok dengan filter.'
                : 'Belum ada pengguna'
              : count || filters.search
                ? 'Tidak ada kelas yang cocok dengan filter.'
                : 'Belum ada kelas'
          }
          description={
            count || filters.search
              ? 'Coba nama atau pilihan filter lain.'
              : isUsers
                ? 'Pengguna yang terdaftar akan tampil di sini.'
                : 'Kelas yang dibuat Guru akan tampil di sini.'
          }
          {...(count || filters.search ? { reset } : {})}
        />
      ) : directory.kind === 'users' ? (
        <UserTable items={directory.page.items} onSelect={(id) => url.update({ userId: id })} />
      ) : (
        <ClassTable items={directory.page.items} onSelect={(id) => url.update({ classId: id })} />
      )}
      {directory && !listError && (
        <PeopleFooter
          offset={offset}
          count={directory.page.items.length}
          totalItems={directory.page.total}
          nextOffset={directory.page.nextOffset}
          label={isUsers ? 'Halaman pengguna' : 'Halaman kelas'}
          onChange={(next) => url.update({ offset: next })}
        />
      )}
    </section>
  );
}
