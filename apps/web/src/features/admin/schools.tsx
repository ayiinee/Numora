'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

import { Badge, Button, Card, EmptyState, Icon, Input } from '@tka/ui';
import { useAuth } from '@/features/onboarding/auth';
import { AdminFrame, AdminLoading, AdminMessage, AdminStats } from './admin-presentation';
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

export function AdminSchoolsScreen() {
  const { state } = useAuth();
  const accountKey =
    state.status === 'ready' ? state.profile.id + ':' + state.profile.adminRole : state.status;
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
  const [accessError, setAccessError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
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
          if (cause instanceof ApiProblem && [401, 403].includes(cause.status))
            setAccessError(true);
        }
      },
    );
    return () => {
      active = false;
    };
  }, [token, revision, offset, filter]);
  useEffect(() => {
    if (!token || !selected) {
      setSelectedSchool(null);
      return;
    }
    let active = true;
    void getAdminSchool(token, selected)
      .then((value) => {
        if (active) setSelectedSchool(value);
      })
      .catch((cause) => {
        if (active) setError(message(cause));
      });
    return () => {
      active = false;
    };
  }, [token, selected, revision]);
  useEffect(() => {
    if (!token || !selected) return;
    let active = true;
    setTokenError('');
    setTokens(null);
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
          if (cause instanceof ApiProblem && [401, 403].includes(cause.status))
            setAccessError(true);
        }
      },
    );
    return () => {
      active = false;
    };
  }, [token, selected, revision, tokenOffset]);
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
      if (cause instanceof ApiProblem && [401, 403].includes(cause.status)) setAccessError(true);
    } finally {
      setBusy(false);
    }
  }
  async function addSchool(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
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
                ? error || schoolError || tokenError || 'Akses Admin belum tersedia.'
                : state.status === 'error'
                  ? (state.message ?? 'Akun belum dapat diperiksa.')
                  : 'Halaman ini hanya tersedia untuk Admin yang aktif.'
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
                  helper="Huruf/angka dan tanda hubung; kapitalisasi tetap disimpan."
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
                {schools.map((school) => (
                  <li key={school.id}>
                    <button
                      className="admin-school-row"
                      type="button"
                      disabled={busy}
                      aria-pressed={selected === school.id}
                      onClick={() => {
                        setSelected(school.id);
                        setSelectedSchool(school);
                        setEditName(school.name);
                        setEditAddress(school.address ?? '');
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
            <div className="admin-content-actions">
              <Button
                variant="secondary"
                disabled={offset === 0 || busy}
                onClick={() => setOffset(Math.max(0, offset - 20))}
              >
                Sekolah sebelumnya
              </Button>
              <Button
                variant="secondary"
                disabled={nextOffset === null || busy}
                onClick={() => setOffset(nextOffset!)}
              >
                Sekolah berikutnya
              </Button>
            </div>
          </section>
        </div>
        <aside className="admin-school-context" aria-label="Detail sekolah dan token">
          {current ? (
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
                    Simpan nama
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
                    {tokens.map((item) => (
                      <li key={item.id} className="admin-token-row">
                        <div>
                          <Badge
                            variant={
                              item.usedAt ||
                              item.revokedAt ||
                              new Date(item.expiresAt) <= new Date()
                                ? 'default'
                                : 'success'
                            }
                          >
                            {item.usedAt
                              ? 'Terpakai'
                              : item.revokedAt
                                ? 'Dicabut'
                                : new Date(item.expiresAt) <= new Date()
                                  ? 'Kedaluwarsa'
                                  : 'Belum dipakai'}
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
                              disabled={busy}
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
                <div className="admin-content-actions">
                  <Button
                    variant="secondary"
                    disabled={tokenOffset === 0 || busy}
                    onClick={() => setTokenOffset(Math.max(0, tokenOffset - 20))}
                  >
                    Token sebelumnya
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={tokenNextOffset === null || busy}
                    onClick={() => setTokenOffset(tokenNextOffset!)}
                  >
                    Token berikutnya
                  </Button>
                </div>
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
