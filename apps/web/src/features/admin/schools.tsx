'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

import { Badge, Button, Card, EmptyState, Icon, Input } from '@tka/ui';
import { useAuth } from '@/features/onboarding/auth';
import { AdminFrame, AdminLoading, AdminMessage, AdminStats } from './admin-presentation';
import { AdminPagination } from './admin-pagination';
import {
  ApiProblem,
  createSchool,
  getAdminSchool,
  issueTeacherToken,
  listAdminSchools,
  listTeacherTokens,
  reissueTeacherToken,
  revokeTeacherToken,
  updateSchool,
  type AdminSchool,
  type IssuedTeacherToken,
  type TeacherTokenSummary,
} from '@/lib/api';

const tokenStatusLabels = {
  AVAILABLE: 'Belum dipakai',
  USED: 'Terpakai',
  REVOKED: 'Dicabut',
  EXPIRED: 'Kedaluwarsa',
} satisfies Record<TeacherTokenSummary['status'], string>;

export function AdminSchoolsScreen() {
  const { state } = useAuth();
  const accountKey =
    state.status === 'ready'
      ? `${state.profile.id}:${state.profile.adminRole}:${state.profile.status}:${state.profile.capabilities?.includes('OPERATIONS_MANAGE')}`
      : state.status;
  return <AdminSchoolsScreenContent key={accountKey} />;
}

function AdminSchoolsScreenContent() {
  const router = useRouter();
  const { state, refresh } = useAuth();
  const token =
    state.status === 'ready' &&
    state.profile.role === 'ADMIN' &&
    state.profile.status === 'ACTIVE' &&
    state.profile.capabilities?.includes('OPERATIONS_MANAGE')
      ? state.session.access_token
      : null;
  const [schools, setSchools] = useState<AdminSchool[] | null>(null);
  const [selected, setSelected] = useState('');
  const [tokens, setTokens] = useState<TeacherTokenSummary[] | null>(null);
  const [issued, setIssued] = useState<IssuedTeacherToken | null>(null);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('');
  const [offset, setOffset] = useState(0);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [tokenOffset, setTokenOffset] = useState(0);
  const [tokenNextOffset, setTokenNextOffset] = useState<number | null>(null);
  const [selectedSchool, setSelectedSchool] = useState<AdminSchool | null>(null);
  const [editName, setEditName] = useState('');
  const [error, setError] = useState('');
  const [schoolError, setSchoolError] = useState('');
  const [tokenError, setTokenError] = useState('');
  const [detailError, setDetailError] = useState('');
  const [detailLoading, setDetailLoading] = useState(false);
  const initializedSchool = useRef('');
  const [accessError, setAccessError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const denyAccess = useCallback((cause: unknown) => {
    if (cause instanceof ApiProblem && [401, 403].includes(cause.status)) {
      setAccessError(true);
      setSchools(null);
      setSelected('');
      setSelectedSchool(null);
      setTokens(null);
      setIssued(null);
      initializedSchool.current = '';
    }
  }, []);
  useEffect(() => {
    if (state.status === 'signed_out') router.replace('/admin/login');
    if (state.status === 'registration') router.replace('/onboarding');
    if (state.status === 'ready' && state.profile.role !== 'ADMIN')
      router.replace(state.profile.role === 'STUDENT' ? '/student' : '/teacher');
  }, [router, state]);
  useEffect(() => {
    if (!token) return;
    let active = true;
    setSchoolError('');
    setSchools(null);
    setNextOffset(null);
    listAdminSchools(token, { offset, search: filter }).then(
      (result) => {
        if (active) {
          setSchools(result.items);
          setNextOffset(result.nextOffset);
        }
      },
      (cause: unknown) => {
        if (active) {
          setSchoolError(message(cause));
          denyAccess(cause);
        }
      },
    );
    return () => {
      active = false;
    };
  }, [token, revision, offset, filter, denyAccess]);
  useEffect(() => {
    if (!token || !selected) {
      setSelectedSchool(null);
      return;
    }
    let active = true;
    setDetailError('');
    setDetailLoading(true);
    void getAdminSchool(token, selected)
      .then((value) => {
        if (active) {
          setSelectedSchool(value);
          setDetailLoading(false);
          if (initializedSchool.current !== selected) {
            setEditName(value.name);
            setEditAddress(value.address ?? '');
            initializedSchool.current = selected;
          }
        }
      })
      .catch((cause) => {
        if (active) {
          setDetailError(message(cause));
          setDetailLoading(false);
          setSelectedSchool(null);
          setIssued(null);
          denyAccess(cause);
        }
      });
    return () => {
      active = false;
    };
  }, [token, selected, revision, denyAccess]);
  useEffect(() => {
    if (!token || !selected) return;
    let active = true;
    setTokenError('');
    setTokens(null);
    setTokenNextOffset(null);
    listTeacherTokens(token, selected, tokenOffset).then(
      (result) => {
        if (active) {
          setTokens(result.items);
          setTokenNextOffset(result.nextOffset);
        }
      },
      (cause: unknown) => {
        if (active) {
          setTokenError(message(cause));
          denyAccess(cause);
        }
      },
    );
    return () => {
      active = false;
    };
  }, [token, selected, revision, tokenOffset, denyAccess]);
  const current = selectedSchool;
  async function run(action: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await action();
      setRevision((value) => value + 1);
    } catch (cause) {
      setError(message(cause));
      denyAccess(cause);
    } finally {
      setBusy(false);
    }
  }
  async function addSchool(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    if (!code.trim() || !name.trim()) {
      setError('Isi kode dan nama sekolah dengan karakter selain spasi.');
      return;
    }
    await run(async () => {
      const created = await createSchool(token, code.trim(), name.trim(), address.trim());
      setSelectedSchool(created);
      setSelected(created.id);
      setEditName(name.trim());
      setEditAddress(address.trim());
      setTokenOffset(0);
      setIssued(null);
      setTokens(null);
      setCode('');
      setName('');
      setAddress('');
    });
  }
  async function saveName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editName.trim()) {
      setError('Nama sekolah tidak boleh kosong.');
      return;
    }
    if (token && current && editName.trim())
      await run(() =>
        updateSchool(token, current.id, {
          name: editName.trim(),
          address: editAddress.trim() || null,
        }),
      );
  }
  const retry = () => {
    setAccessError(false);
    setError('');
    setRevision((value) => value + 1);
  };
  const frame = {
    title: 'Sekolah dan token Guru',
    description: 'Kelola sekolah dan akses verifikasi guru pendamping.',
    icon: 'school' as const,
  };
  if (!token || accessError)
    return (
      <AdminFrame {...frame}>
        {state.status === 'loading' ? (
          <AdminLoading message="Memeriksa akses Admin…" />
        ) : (
          <AdminMessage
            error
            message={
              accessError
                ? error || schoolError || tokenError || detailError || 'Akses Admin belum tersedia.'
                : state.status === 'error'
                  ? (state.message ?? 'Akun belum dapat diperiksa.')
                  : 'Halaman ini hanya tersedia untuk Admin Operasional dan Super Admin.'
            }
            login
            retry={() => {
              retry();
              void refresh();
            }}
          />
        )}
      </AdminFrame>
    );
  const operationsRole = state.status === 'ready' && state.profile.adminRole === 'OPERATIONS';
  const schoolForm = (
    <Card className="admin-card admin-create-school">
      <div className="admin-section-heading">
        <Icon name="school" />
        <h2>Tambah sekolah</h2>
      </div>
      <p className="admin-helper">Daftarkan sekolah sebelum menerbitkan token guru.</p>
      <form onSubmit={(event) => void addSchool(event)}>
        <fieldset disabled={busy} className="admin-form-fields">
          <Input
            label="Kode sekolah"
            id="school-code"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            minLength={2}
            maxLength={32}
            pattern="[a-zA-Z0-9]+(-[a-zA-Z0-9]+)*"
            required
            helper="Huruf/angka dan tanda hubung; server menyimpan kode dalam huruf kapital."
          />
          <Input
            label="Nama sekolah"
            id="school-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={120}
            required
          />
          <Input
            label="Alamat sekolah"
            id="school-address"
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            maxLength={500}
          />
          <Button type="submit" disabled={busy} fullWidth>
            Simpan sekolah
          </Button>
        </fieldset>
      </form>
    </Card>
  );
  return (
    <AdminFrame {...frame}>
      {error && <AdminMessage error message={error} />}
      {schools && (
        <AdminStats
          items={[
            { label: 'Sekolah pada halaman ini', value: schools.length, icon: 'school' },
            {
              label: 'Aktif pada halaman ini',
              value: schools.filter((s) => s.status === 'ACTIVE').length,
              icon: 'check',
            },
          ]}
        />
      )}
      <div className="admin-schools-layout">
        <div className="admin-schools-main">
          {operationsRole ? (
            <details className="operations-create-disclosure">
              <summary>
                <Icon name="school" /> Tambah sekolah
              </summary>
              {schoolForm}
            </details>
          ) : (
            schoolForm
          )}
          <section className="admin-school-list" aria-label="Daftar sekolah">
            <form
              onSubmit={(event) => {
                event.preventDefault();
                setFilter(search.trim());
                setOffset(0);
              }}
            >
              <Input
                label="Cari sekolah"
                id="school-search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                maxLength={120}
              />
              <Button variant="secondary" type="submit">
                Cari sekolah
              </Button>
            </form>
            <div className="admin-section-heading">
              <h2>Sekolah terdaftar</h2>
              {schools && <Badge variant="default">{schools.length} sekolah</Badge>}
            </div>
            {schoolError ? (
              <AdminMessage error message={schoolError} retry={retry} />
            ) : schools === null ? (
              <AdminLoading message="Memuat sekolah…" />
            ) : !schools.length ? (
              <Card className="admin-card">
                <EmptyState
                  title="Belum ada sekolah."
                  description="Gunakan formulir di atas untuk mendaftarkan sekolah pertama."
                />
              </Card>
            ) : (
              <ul className="admin-school-rows">
                {schools.slice(0, 5).map((school) => (
                  <li key={school.id}>
                    <button
                      className="admin-school-row"
                      type="button"
                      disabled={busy}
                      aria-pressed={selected === school.id}
                      onClick={() => {
                        if (selected === school.id) return;
                        setSelected(school.id);
                        setSelectedSchool(null);
                        setDetailError('');
                        setTokenOffset(0);
                        setIssued(null);
                        setTokens(null);
                        setTokenError('');
                      }}
                    >
                      <span className="admin-school-icon">
                        <Icon name="school" />
                      </span>
                      <span className="admin-school-name">
                        <strong>{school.name}</strong>
                        <small>{school.code}</small>
                        <Badge variant={school.status === 'ACTIVE' ? 'success' : 'default'}>
                          {school.status === 'ACTIVE' ? 'Aktif' : 'Nonaktif'}
                        </Badge>
                      </span>
                      <Icon name="chevron" width="20" height="20" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <AdminPagination
              offset={offset}
              hasNext={nextOffset !== null}
              disabled={busy || schools === null}
              onChange={setOffset}
              label="Halaman sekolah"
              previousLabel="Sekolah sebelumnya"
              nextLabel="Sekolah berikutnya"
            />
          </section>
        </div>
        <aside className="admin-school-context" aria-label="Detail sekolah dan token">
          {detailError ? (
            <AdminMessage error message={detailError} retry={retry} />
          ) : selected && (detailLoading || !current) ? (
            <AdminLoading message="Memuat detail sekolah…" />
          ) : current ? (
            <Card className="admin-card admin-school-detail">
              <span className="admin-eyebrow">Sekolah dipilih</span>
              <h2>{current.name}</h2>
              <p>Status: {current.status === 'ACTIVE' ? 'Aktif' : 'Nonaktif'}</p>
              <p>Alamat: {current.address ?? 'Belum dicatat'}</p>
              <p>
                <Link href={`/admin/operations?schoolId=${current.id}&role=TEACHER`}>
                  Lihat Guru sekolah
                </Link>{' '}
                ·{' '}
                <Link href={`/admin/operations?schoolId=${current.id}&view=classes`}>
                  Lihat kelas sekolah
                </Link>
              </p>
              <form onSubmit={(event) => void saveName(event)}>
                <fieldset disabled={busy} className="admin-form-fields">
                  <Input
                    label="Ubah nama"
                    id="edit-school-name"
                    value={editName}
                    onChange={(event) => setEditName(event.target.value)}
                    maxLength={120}
                    required
                  />
                  <Input
                    label="Ubah alamat"
                    id="edit-school-address"
                    value={editAddress}
                    onChange={(event) => setEditAddress(event.target.value)}
                    maxLength={500}
                  />
                  <Button variant="secondary" type="submit" disabled={busy} fullWidth>
                    Simpan perubahan
                  </Button>
                </fieldset>
              </form>
              <Button
                variant={current.status === 'ACTIVE' ? 'danger-outline' : 'secondary'}
                disabled={busy}
                fullWidth
                onClick={() =>
                  void run(() =>
                    updateSchool(token, current.id, {
                      status: current.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE',
                    }),
                  )
                }
              >
                {current.status === 'ACTIVE' ? 'Nonaktifkan sekolah' : 'Aktifkan sekolah'}
              </Button>
              <div className="admin-token-section">
                <div className="admin-section-heading">
                  <Icon name="lock" />
                  <h3>Token Guru</h3>
                </div>
                <p className="admin-helper">
                  Single-use · Berlaku 3×24 jam. Token baru ditampilkan sekali.
                </p>
                <Button
                  disabled={busy || current.status !== 'ACTIVE'}
                  fullWidth
                  leftIcon={<Icon name="lock" width="18" height="18" />}
                  onClick={() =>
                    void run(async () => setIssued(await issueTeacherToken(token, current.id)))
                  }
                >
                  Terbitkan token
                </Button>
                {current.status !== 'ACTIVE' && (
                  <p className="admin-helper">Aktifkan sekolah untuk menerbitkan token baru.</p>
                )}
                {issued && (
                  <div className="admin-issued-token" role="status">
                    <strong>Token baru (ditampilkan hanya kali ini)</strong>
                    <code>{issued.token}</code>
                    <p>
                      Berlaku sampai{' '}
                      {new Date(issued.expiresAt).toLocaleString('id-ID', {
                        timeZone: 'Asia/Jakarta',
                      })}{' '}
                      WIB.
                    </p>
                  </div>
                )}
                {tokenError ? (
                  <AdminMessage error message={tokenError} retry={retry} />
                ) : tokens === null ? (
                  <AdminLoading message="Memuat token…" />
                ) : !tokens.length ? (
                  <p className="admin-empty-inline">Belum ada token.</p>
                ) : (
                  <ul className="admin-token-list">
                    {tokens.slice(0, 5).map((item) => (
                      <li key={item.id} className="admin-token-row">
                        <div>
                          <Badge variant={item.status === 'AVAILABLE' ? 'success' : 'default'}>
                            {tokenStatusLabels[item.status]}
                          </Badge>
                          <small className="admin-token-id">{item.id}</small>
                          <small>
                            Diterbitkan{' '}
                            {new Date(item.createdAt).toLocaleString('id-ID', {
                              timeZone: 'Asia/Jakarta',
                            })}{' '}
                            WIB
                          </small>
                          {item.usedAt && (
                            <small>
                              Dipakai{' '}
                              {new Date(item.usedAt).toLocaleString('id-ID', {
                                timeZone: 'Asia/Jakarta',
                              })}{' '}
                              WIB oleh{' '}
                              {item.usedByName ?? item.usedByUserId ?? 'Guru tidak tersedia'}
                            </small>
                          )}
                          {item.usedByUserId && (
                            <Link href={`/admin/operations?userId=${item.usedByUserId}`}>
                              Detail Guru pemakai
                            </Link>
                          )}
                          {item.revokedAt && (
                            <small>
                              Dicabut{' '}
                              {new Date(item.revokedAt).toLocaleString('id-ID', {
                                timeZone: 'Asia/Jakarta',
                              })}{' '}
                              WIB
                            </small>
                          )}
                          <small>
                            Kedaluwarsa{' '}
                            {new Date(item.expiresAt).toLocaleString('id-ID', {
                              timeZone: 'Asia/Jakarta',
                            })}{' '}
                            WIB
                          </small>
                        </div>
                        {!item.usedAt && !item.revokedAt && (
                          <div className="admin-content-actions">
                            <Button
                              variant="secondary"
                              disabled={busy || current.status !== 'ACTIVE'}
                              onClick={() =>
                                void run(async () =>
                                  setIssued(await reissueTeacherToken(token, current.id, item.id)),
                                )
                              }
                            >
                              Terbit ulang
                            </Button>
                            <Button
                              variant="danger-outline"
                              disabled={busy}
                              onClick={() =>
                                void run(async () => {
                                  await revokeTeacherToken(token, current.id, item.id);
                                  setIssued(null);
                                })
                              }
                            >
                              Cabut
                            </Button>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                <AdminPagination
                  offset={tokenOffset}
                  hasNext={tokenNextOffset !== null}
                  disabled={busy || tokens === null}
                  onChange={setTokenOffset}
                  label="Halaman token Guru"
                  previousLabel="Token sebelumnya"
                  nextLabel="Token berikutnya"
                />
              </div>
            </Card>
          ) : (
            <Card className="admin-card admin-school-prompt">
              <EmptyState
                title="Pilih sekolah"
                description="Buka salah satu sekolah untuk mengubah nama, status, atau mengelola token guru."
              />
            </Card>
          )}
        </aside>
      </div>
    </AdminFrame>
  );
}

function message(cause: unknown) {
  return cause instanceof Error ? cause.message : 'Permintaan belum berhasil. Coba lagi.';
}
