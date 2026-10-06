'use client';

import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Badge, Button, Card, EmptyState, Icon, Input } from '@tka/ui';
import { ApiProblem } from '@/lib/api';
import { useAuth } from '@/features/onboarding/auth';
import { getAdminClass, getAdminUser, listAdminClasses, listAdminUsers } from './operations-api';
import type { AdminClassDto, AdminUserDto } from './generated-types';
import { AdminFrame, AdminLoading, AdminMessage } from './admin-presentation';

type OperationsTab = 'users' | 'classes';
const PAGE_SIZE = 20;
const dateTime = new Intl.DateTimeFormat('id-ID', {
  dateStyle: 'medium',
  timeStyle: 'short',
});
const roleLabels = {
  STUDENT: 'Siswa',
  TEACHER: 'Guru',
  ADMIN: 'Admin',
} satisfies Record<AdminUserDto['role'], string>;
const userStatusLabels = {
  ACTIVE: 'Aktif',
  DISABLED: 'Dinonaktifkan',
} satisfies Record<AdminUserDto['status'], string>;

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Tidak tersedia' : dateTime.format(date);
}

function accessDenied(error: unknown): error is ApiProblem {
  return error instanceof ApiProblem && [401, 403].includes(error.status);
}

export function AdminOperationsScreen() {
  const router = useRouter();
  const { state, refresh } = useAuth();
  const [tab, setTab] = useState<OperationsTab>('users');
  const [revision, setRevision] = useState(0);
  const [deniedError, setDeniedError] = useState('');
  const token =
    state.status === 'ready' && state.profile.role === 'ADMIN' && state.profile.status === 'ACTIVE'
      ? state.session.access_token
      : null;

  useEffect(() => {
    if (state.status === 'signed_out') router.replace('/admin/login');
    if (state.status === 'registration') router.replace('/onboarding');
    if (state.status === 'ready' && state.profile.role !== 'ADMIN')
      router.replace(state.profile.role === 'STUDENT' ? '/student' : '/teacher');
  }, [router, state]);

  const onAccessError = useCallback((error: unknown) => {
    if (accessDenied(error)) {
      setDeniedError(error.message);
    }
  }, []);

  const frame = {
    title: 'Pengguna dan kelas',
    description: 'Lihat data operasional akun dan kelas yang tercatat di Numora.',
    icon: 'users' as const,
  };

  if (!token || deniedError) {
    return (
      <AdminFrame {...frame}>
        {state.status === 'loading' ? (
          <AdminLoading message="Memeriksa akses Admin…" />
        ) : (
          <AdminMessage
            error
            message={
              deniedError ||
              (state.status === 'error'
                ? (state.message ?? 'Akun belum dapat diperiksa.')
                : 'Halaman ini hanya tersedia untuk Admin aktif.')
            }
            login
            retry={() => {
              setDeniedError('');
              setRevision((current) => current + 1);
              void refresh();
            }}
          />
        )}
      </AdminFrame>
    );
  }

  return (
    <AdminFrame {...frame}>
      <div className="monitoring-frame admin-content admin-operations">
        <p className="admin-context-note">
          <span>Data operasional · baca saja</span>
          Detail mengikuti data yang tersedia pada API. Email, kode kelas, dan aksi perubahan akun
          tidak ditampilkan di halaman ini.
        </p>
        <nav className="admin-content-nav" aria-label="Jenis data operasional">
          <Button
            variant={tab === 'users' ? 'primary' : 'secondary'}
            aria-current={tab === 'users' ? 'page' : undefined}
            onClick={() => setTab('users')}
          >
            Pengguna
          </Button>
          <Button
            variant={tab === 'classes' ? 'primary' : 'secondary'}
            aria-current={tab === 'classes' ? 'page' : undefined}
            onClick={() => setTab('classes')}
          >
            Kelas
          </Button>
        </nav>
        {tab === 'users' ? (
          <UsersPanel key="users" token={token} revision={revision} onAccessError={onAccessError} />
        ) : (
          <ClassesPanel
            key="classes"
            token={token}
            revision={revision}
            onAccessError={onAccessError}
          />
        )}
      </div>
    </AdminFrame>
  );
}

function UsersPanel({
  token,
  revision,
  onAccessError,
}: {
  token: string;
  revision: number;
  onAccessError: (error: unknown) => void;
}) {
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [filters, setFilters] = useState({ search: '', role: '', status: '' });
  const [offset, setOffset] = useState(0);
  const [items, setItems] = useState<AdminUserDto[] | null>(null);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState('');
  const [detail, setDetail] = useState<AdminUserDto | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [detailRetry, setDetailRetry] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    setItems(null);
    listAdminUsers(token, { ...filters, offset }).then(
      (page) => {
        if (!active) return;
        setItems(page.items);
        setNextOffset(page.nextOffset);
        setLoading(false);
      },
      (cause: unknown) => {
        if (!active) return;
        setError(cause instanceof Error ? cause.message : 'Daftar pengguna belum dapat dimuat.');
        setLoading(false);
        onAccessError(cause);
      },
    );
    return () => {
      active = false;
    };
  }, [filters, offset, onAccessError, revision, retry, token]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      setDetailError('');
      return;
    }
    let active = true;
    setDetail(null);
    setDetailError('');
    setDetailLoading(true);
    getAdminUser(token, selectedId).then(
      (value) => {
        if (!active) return;
        setDetail(value);
        setDetailLoading(false);
      },
      (cause: unknown) => {
        if (!active) return;
        setDetailError(
          cause instanceof Error ? cause.message : 'Detail pengguna belum dapat dimuat.',
        );
        setDetailLoading(false);
        onAccessError(cause);
      },
    );
    return () => {
      active = false;
    };
  }, [detailRetry, onAccessError, selectedId, token]);

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSelectedId('');
    setOffset(0);
    setFilters({ search: search.trim(), role, status });
  }

  return (
    <div className="admin-operations-grid">
      <section aria-labelledby="admin-users-title">
        <h2 id="admin-users-title">Daftar pengguna</h2>
        <p>Cari berdasarkan nama tampilan dan batasi daftar berdasarkan role atau status.</p>
        <form className="admin-content-form admin-operations-filters" onSubmit={applyFilters}>
          <label className="admin-content-field">
            <span>Nama pengguna</span>
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Cari nama..."
              maxLength={100}
            />
          </label>
          <label className="admin-content-field">
            <span>Role</span>
            <select value={role} onChange={(event) => setRole(event.target.value)}>
              <option value="">Semua role</option>
              <option value="STUDENT">Siswa</option>
              <option value="TEACHER">Guru</option>
              <option value="ADMIN">Admin</option>
            </select>
          </label>
          <label className="admin-content-field">
            <span>Status akun</span>
            <select value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="">Semua status</option>
              <option value="ACTIVE">Aktif</option>
              <option value="DISABLED">Dinonaktifkan</option>
            </select>
          </label>
          <div className="admin-content-actions">
            <Button type="submit" disabled={loading}>
              <Icon name="search" /> Terapkan filter
            </Button>
          </div>
        </form>
        <ResultsState
          loading={loading}
          error={error}
          hasItems={Boolean(items?.length)}
          emptyLabel="Tidak ada pengguna yang cocok dengan filter."
          onRetry={() => setRetry((current) => current + 1)}
        />
        {items?.length ? (
          <>
            <ul className="monitoring-list">
              {items.map((user) => (
                <li className="monitoring-notice admin-content-row" key={user.id}>
                  <div className="admin-operation-row-heading">
                    <strong>{user.displayName}</strong>
                    <Badge variant={user.status === 'ACTIVE' ? 'success' : 'warning'}>
                      {userStatusLabels[user.status]}
                    </Badge>
                  </div>
                  <p>{roleLabels[user.role]}</p>
                  <small>Terdaftar {formatDate(user.createdAt)}</small>
                  <Button
                    variant="secondary"
                    aria-pressed={selectedId === user.id}
                    onClick={() => setSelectedId(user.id)}
                  >
                    Lihat detail
                  </Button>
                </li>
              ))}
            </ul>
            <Pagination
              offset={offset}
              nextOffset={nextOffset}
              loading={loading}
              onPrevious={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              onNext={() => {
                if (nextOffset !== null) setOffset(nextOffset);
              }}
            />
          </>
        ) : null}
      </section>
      <UserDetail
        detail={detail}
        loading={detailLoading}
        error={detailError}
        selected={Boolean(selectedId)}
        onClose={() => setSelectedId('')}
        onRetry={() => setDetailRetry((current) => current + 1)}
      />
    </div>
  );
}

function UserDetail({
  detail,
  loading,
  error,
  selected,
  onClose,
  onRetry,
}: {
  detail: AdminUserDto | null;
  loading: boolean;
  error: string;
  selected: boolean;
  onClose: () => void;
  onRetry: () => void;
}) {
  return (
    <section aria-labelledby="admin-user-detail-title">
      <h2 id="admin-user-detail-title">Detail pengguna</h2>
      {!selected ? (
        <Card className="admin-operation-detail-placeholder">
          <EmptyState
            icon={<Icon name="user" />}
            title="Pilih pengguna"
            description="Pilih satu baris untuk melihat detail akun yang tersedia."
          />
        </Card>
      ) : loading ? (
        <AdminLoading message="Memuat detail pengguna…" />
      ) : error ? (
        <AdminMessage error message={error} retry={onRetry} />
      ) : detail ? (
        <Card className="admin-operation-detail">
          <div className="admin-operation-row-heading">
            <h3>{detail.displayName}</h3>
            <Badge variant={detail.status === 'ACTIVE' ? 'success' : 'warning'}>
              {userStatusLabels[detail.status]}
            </Badge>
          </div>
          <dl>
            <DetailField label="Role">{roleLabels[detail.role]}</DetailField>
            <DetailField label="ID pengguna">
              <code>{detail.id}</code>
            </DetailField>
            <DetailField label="Akun dibuat">{formatDate(detail.createdAt)}</DetailField>
          </dl>
          <Button variant="secondary" onClick={onClose}>
            Tutup detail
          </Button>
        </Card>
      ) : null}
    </section>
  );
}

function ClassesPanel({
  token,
  revision,
  onAccessError,
}: {
  token: string;
  revision: number;
  onAccessError: (error: unknown) => void;
}) {
  const [search, setSearch] = useState('');
  const [schoolId, setSchoolId] = useState('');
  const [teacherId, setTeacherId] = useState('');
  const [state, setState] = useState('');
  const [filters, setFilters] = useState({ search: '', schoolId: '', teacherId: '', state: '' });
  const [offset, setOffset] = useState(0);
  const [items, setItems] = useState<AdminClassDto[] | null>(null);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState('');
  const [detail, setDetail] = useState<AdminClassDto | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [detailRetry, setDetailRetry] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    setItems(null);
    listAdminClasses(token, { ...filters, offset }).then(
      (page) => {
        if (!active) return;
        setItems(page.items);
        setNextOffset(page.nextOffset);
        setLoading(false);
      },
      (cause: unknown) => {
        if (!active) return;
        setError(cause instanceof Error ? cause.message : 'Daftar kelas belum dapat dimuat.');
        setLoading(false);
        onAccessError(cause);
      },
    );
    return () => {
      active = false;
    };
  }, [filters, offset, onAccessError, revision, retry, token]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      setDetailError('');
      return;
    }
    let active = true;
    setDetail(null);
    setDetailError('');
    setDetailLoading(true);
    getAdminClass(token, selectedId).then(
      (value) => {
        if (!active) return;
        setDetail(value);
        setDetailLoading(false);
      },
      (cause: unknown) => {
        if (!active) return;
        setDetailError(cause instanceof Error ? cause.message : 'Detail kelas belum dapat dimuat.');
        setDetailLoading(false);
        onAccessError(cause);
      },
    );
    return () => {
      active = false;
    };
  }, [detailRetry, onAccessError, selectedId, token]);

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSelectedId('');
    setOffset(0);
    setFilters({
      search: search.trim(),
      schoolId: schoolId.trim(),
      teacherId: teacherId.trim(),
      state,
    });
  }

  return (
    <div className="admin-operations-grid">
      <section aria-labelledby="admin-classes-title">
        <h2 id="admin-classes-title">Daftar kelas</h2>
        <p>Filter kelas berdasarkan nama, sekolah, Guru, atau status arsip.</p>
        <form className="admin-content-form admin-operations-filters" onSubmit={applyFilters}>
          <label className="admin-content-field">
            <span>Nama kelas</span>
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Cari kelas..."
              maxLength={100}
            />
          </label>
          <label className="admin-content-field">
            <span>ID sekolah (opsional)</span>
            <Input
              value={schoolId}
              onChange={(event) => setSchoolId(event.target.value)}
              placeholder="UUID sekolah"
              inputMode="text"
            />
          </label>
          <label className="admin-content-field">
            <span>ID Guru (opsional)</span>
            <Input
              value={teacherId}
              onChange={(event) => setTeacherId(event.target.value)}
              placeholder="UUID Guru"
              inputMode="text"
            />
          </label>
          <label className="admin-content-field">
            <span>Status kelas</span>
            <select value={state} onChange={(event) => setState(event.target.value)}>
              <option value="">Semua status</option>
              <option value="active">Aktif</option>
              <option value="archived">Diarsipkan</option>
            </select>
          </label>
          <div className="admin-content-actions">
            <Button type="submit" disabled={loading}>
              <Icon name="search" /> Terapkan filter
            </Button>
          </div>
        </form>
        <ResultsState
          loading={loading}
          error={error}
          hasItems={Boolean(items?.length)}
          emptyLabel="Tidak ada kelas yang cocok dengan filter."
          onRetry={() => setRetry((current) => current + 1)}
        />
        {items?.length ? (
          <>
            <ul className="monitoring-list">
              {items.map((item) => (
                <li className="monitoring-notice admin-content-row" key={item.id}>
                  <div className="admin-operation-row-heading">
                    <strong>{item.name}</strong>
                    <Badge variant={item.archivedAt ? 'default' : 'success'}>
                      {item.archivedAt ? 'Diarsipkan' : 'Aktif'}
                    </Badge>
                  </div>
                  <p>{item.schoolName}</p>
                  <small>
                    Guru: {item.teacherName} · {item.studentCount} siswa aktif
                  </small>
                  <Button
                    variant="secondary"
                    aria-pressed={selectedId === item.id}
                    onClick={() => setSelectedId(item.id)}
                  >
                    Lihat detail
                  </Button>
                </li>
              ))}
            </ul>
            <Pagination
              offset={offset}
              nextOffset={nextOffset}
              loading={loading}
              onPrevious={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              onNext={() => {
                if (nextOffset !== null) setOffset(nextOffset);
              }}
            />
          </>
        ) : null}
      </section>
      <ClassDetail
        detail={detail}
        loading={detailLoading}
        error={detailError}
        selected={Boolean(selectedId)}
        onClose={() => setSelectedId('')}
        onRetry={() => setDetailRetry((current) => current + 1)}
      />
    </div>
  );
}

function ClassDetail({
  detail,
  loading,
  error,
  selected,
  onClose,
  onRetry,
}: {
  detail: AdminClassDto | null;
  loading: boolean;
  error: string;
  selected: boolean;
  onClose: () => void;
  onRetry: () => void;
}) {
  return (
    <section aria-labelledby="admin-class-detail-title">
      <h2 id="admin-class-detail-title">Detail kelas</h2>
      {!selected ? (
        <Card className="admin-operation-detail-placeholder">
          <EmptyState
            icon={<Icon name="school" />}
            title="Pilih kelas"
            description="Pilih satu baris untuk melihat sekolah, Guru, dan jumlah anggota aktif."
          />
        </Card>
      ) : loading ? (
        <AdminLoading message="Memuat detail kelas…" />
      ) : error ? (
        <AdminMessage error message={error} retry={onRetry} />
      ) : detail ? (
        <Card className="admin-operation-detail">
          <div className="admin-operation-row-heading">
            <h3>{detail.name}</h3>
            <Badge variant={detail.archivedAt ? 'default' : 'success'}>
              {detail.archivedAt ? 'Diarsipkan' : 'Aktif'}
            </Badge>
          </div>
          <dl>
            <DetailField label="Sekolah">{detail.schoolName}</DetailField>
            <DetailField label="ID sekolah">
              <code>{detail.schoolId}</code>
            </DetailField>
            <DetailField label="Guru aktif">{detail.teacherName}</DetailField>
            <DetailField label="ID Guru">
              <code>{detail.teacherId}</code>
            </DetailField>
            <DetailField label="Siswa aktif">{detail.studentCount}</DetailField>
            <DetailField label="Kelas dibuat">{formatDate(detail.createdAt)}</DetailField>
            {detail.archivedAt && (
              <DetailField label="Diarsipkan">{formatDate(detail.archivedAt)}</DetailField>
            )}
            <DetailField label="ID kelas">
              <code>{detail.id}</code>
            </DetailField>
          </dl>
          <p className="admin-operation-readonly-note">
            Kode/link bergabung dan daftar siswa tidak ditampilkan pada ringkasan ini.
          </p>
          <Button variant="secondary" onClick={onClose}>
            Tutup detail
          </Button>
        </Card>
      ) : null}
    </section>
  );
}

function DetailField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function ResultsState({
  loading,
  error,
  hasItems,
  emptyLabel,
  onRetry,
}: {
  loading: boolean;
  error: string;
  hasItems: boolean;
  emptyLabel: string;
  onRetry: () => void;
}) {
  if (loading) return <AdminLoading message="Memuat daftar…" />;
  if (error) return <AdminMessage error message={error} retry={onRetry} />;
  if (!hasItems)
    return (
      <Card>
        <EmptyState
          icon={<Icon name="search" />}
          title="Belum ada hasil"
          description={emptyLabel}
        />
      </Card>
    );
  return null;
}

function Pagination({
  offset,
  nextOffset,
  loading,
  onPrevious,
  onNext,
}: {
  offset: number;
  nextOffset: number | null;
  loading: boolean;
  onPrevious: () => void;
  onNext: () => void;
}) {
  return (
    <nav className="admin-content-actions admin-operations-pagination" aria-label="Halaman data">
      <Button variant="secondary" disabled={offset === 0 || loading} onClick={onPrevious}>
        Sebelumnya
      </Button>
      <span>Halaman {Math.floor(offset / PAGE_SIZE) + 1}</span>
      <Button variant="secondary" disabled={nextOffset === null || loading} onClick={onNext}>
        Berikutnya
      </Button>
    </nav>
  );
}
