'use client';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Button, Dialog, Icon } from '@tka/ui';
import { AppShell } from '@/components/shell';
import { useAuth } from '@/features/onboarding/auth';
import { AdminFrame, AdminLoading, AdminMessage } from './admin-presentation';
import { AdminPagination } from './admin-pagination';
import { withAdminWorkspace, useAdminAccessError } from './admin-workspace';
import { useAdminUrl, adminOffset } from './admin-url';
import {
  SchoolDirectory,
  SchoolFields,
  SchoolStatus,
  SchoolTokens,
  TokenDetail,
  schoolTime,
} from './schools-panels';
import {
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

type Modal =
  | 'create'
  | 'edit'
  | 'status'
  | { kind: 'reissue' | 'revoke' | 'detail'; token: TeacherTokenSummary }
  | null;
type Notice = { text: string; error?: boolean } | null;
const message = (cause: unknown) =>
  cause instanceof Error ? cause.message : 'Permintaan belum berhasil. Coba lagi.';
export const AdminSchoolsScreen = withAdminWorkspace(AdminSchoolsScreenProtected, 'operations');
function AdminSchoolsScreenProtected() {
  const { state } = useAuth();
  const key =
    state.status === 'ready'
      ? `${state.profile.id}:${state.profile.adminRole}:${state.profile.status}:${state.profile.capabilities?.includes('OPERATIONS_MANAGE')}`
      : state.status;
  return <AdminSchoolsScreenContent key={key} />;
}
function AdminSchoolsScreenContent() {
  const { state, refresh } = useAuth();
  const reportAccessError = useAdminAccessError();
  const denyAccess = useCallback((cause: unknown) => reportAccessError(cause), [reportAccessError]);
  const token =
    state.status === 'ready' &&
    state.profile.role === 'ADMIN' &&
    state.profile.status === 'ACTIVE' &&
    state.profile.capabilities?.includes('OPERATIONS_MANAGE')
      ? state.session.access_token
      : null;
  const url = useAdminUrl();
  const urlReady = url.search !== null;
  const selected = (url.params.get('schoolId') ?? '').toLowerCase();
  const offset = adminOffset(url.params.get('offset'));
  const tokenOffset = adminOffset(url.params.get('tokenOffset'));
  const filter = url.params.get('search') ?? '';
  const [search, setSearch] = useState(filter);
  const [schools, setSchools] = useState<AdminSchool[] | null>(null);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [selectedSchool, setSelectedSchool] = useState<AdminSchool | null>(null);
  const current = selectedSchool?.id === selected ? selectedSchool : null;
  const [tokens, setTokens] = useState<TeacherTokenSummary[] | null>(null);
  const [tokenNextOffset, setTokenNextOffset] = useState<number | null>(null);
  const [issuedData, setIssued] = useState<(IssuedTeacherToken & { schoolId: string }) | null>(
    null,
  );
  const issued =
    issuedData?.schoolId === selected && current?.status === 'ACTIVE' ? issuedData : null;
  const [copyState, setCopyState] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [editName, setEditName] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [schoolError, setSchoolError] = useState('');
  const [detailError, setDetailError] = useState('');
  const [tokenError, setTokenError] = useState('');
  const [detailLoading, setDetailLoading] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [modal, setModal] = useState<Modal>(null);
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const initializedSchool = useRef('');
  const mutation = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const issuedPanel = useRef<HTMLElement>(null);
  const previousSelection = useRef(selected);
  useEffect(() => {
    setSearch(filter);
  }, [filter]);
  useEffect(() => {
    if (!token || !urlReady) return;
    let active = true;
    setSchools(null);
    setSchoolError('');
    setNextOffset(null);
    void listAdminSchools(token, { offset, search: filter }).then(
      (result) => {
        if (active) {
          setSchools(result.items);
          setNextOffset(result.nextOffset);
        }
      },
      (cause) => {
        if (active) {
          setSchoolError(message(cause));
          denyAccess(cause);
        }
      },
    );
    return () => {
      active = false;
    };
  }, [token, urlReady, offset, filter, revision, denyAccess]);
  useEffect(() => {
    setIssued(null);
    setCopyState('');
    setTokens(null);
    setSelectedSchool(null);
    setModal(null);
    setNotice(null);
    initializedSchool.current = '';
  }, [selected]);
  useEffect(() => {
    if (!token || !selected) return;
    let active = true;
    setDetailLoading(true);
    setDetailError('');
    void getAdminSchool(token, selected).then(
      (value) => {
        if (!active) return;
        setSelectedSchool(value);
        setDetailLoading(false);
        if (initializedSchool.current !== selected) {
          setEditName(value.name);
          setEditAddress(value.address ?? '');
          initializedSchool.current = selected;
        }
        if (value.status !== 'ACTIVE') setIssued(null);
      },
      (cause) => {
        if (active) {
          setDetailError(message(cause));
          setDetailLoading(false);
          setSelectedSchool(null);
          setIssued(null);
          denyAccess(cause);
        }
      },
    );
    return () => {
      active = false;
    };
  }, [token, selected, revision, denyAccess]);
  useEffect(() => {
    if (!token || !selected) return;
    let active = true;
    setTokens(null);
    setTokenNextOffset(null);
    setTokenError('');
    void listTeacherTokens(token, selected, tokenOffset).then(
      (result) => {
        if (active) {
          setTokens(result.items);
          setTokenNextOffset(result.nextOffset);
        }
      },
      (cause) => {
        if (active) {
          setTokenError(message(cause));
          denyAccess(cause);
        }
      },
    );
    return () => {
      active = false;
    };
  }, [token, selected, tokenOffset, revision, denyAccess]);
  useEffect(() => {
    if (previousSelection.current === selected) return;
    previousSelection.current = selected;
    heading.current?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }, [selected]);
  useEffect(() => {
    if (!issued?.id) return;
    issuedPanel.current?.focus({ preventScroll: true });
    issuedPanel.current?.scrollIntoView?.({ block: 'nearest' });
  }, [issued?.id]);
  async function run(action: () => Promise<unknown>, success: string) {
    if (mutation.current) return false;
    mutation.current = true;
    setBusy(true);
    setNotice(null);
    try {
      await action();
      setRevision((value) => value + 1);
      setNotice({ text: success });
      return true;
    } catch (cause) {
      setNotice({ text: message(cause), error: true });
      denyAccess(cause);
      return false;
    } finally {
      mutation.current = false;
      setBusy(false);
    }
  }
  function open(value: Exclude<Modal, null>) {
    setNotice(null);
    setModal(value);
  }
  function close() {
    if (!mutation.current) {
      setModal(null);
      setNotice(null);
    }
  }
  const retry = () => {
    setNotice(null);
    setRevision((value) => value + 1);
  };
  async function addSchool(event: FormEvent) {
    event.preventDefault();
    if (!token) return;
    if (!code.trim() || !name.trim()) {
      setNotice({ text: 'Isi kode dan nama sekolah dengan karakter selain spasi.', error: true });
      return;
    }
    if (
      await run(async () => {
        const created = await createSchool(token, code.trim(), name.trim(), address.trim());
        url.update({ schoolId: created.id, tokenOffset: null });
        setCode('');
        setName('');
        setAddress('');
      }, 'Sekolah berhasil ditambahkan.')
    )
      setModal(null);
  }
  async function saveSchool(event: FormEvent) {
    event.preventDefault();
    if (!token || !current) return;
    if (!editName.trim()) {
      setNotice({ text: 'Nama sekolah tidak boleh kosong.', error: true });
      return;
    }
    if (
      await run(async () => {
        const updated = await updateSchool(token, current.id, {
          name: editName.trim(),
          address: editAddress.trim() || null,
        });
        setSelectedSchool(updated);
      }, 'Informasi sekolah tersimpan.')
    )
      setModal(null);
  }
  async function issue() {
    if (!token || !current || current.status !== 'ACTIVE') return;
    await run(async () => {
      const value = await issueTeacherToken(token, current.id);
      setIssued({ ...value, schoolId: current.id });
      setCopyState('');
      url.update({ tokenOffset: null });
    }, 'Token baru diterbitkan. Salin sebelum meninggalkan halaman.');
  }
  async function confirm() {
    if (
      !token ||
      !current ||
      !modal ||
      modal === 'create' ||
      modal === 'edit' ||
      (typeof modal === 'object' && modal.kind === 'detail')
    )
      return;
    const action = modal;
    if (
      await run(
        async () => {
          if (action === 'status') {
            const updated = await updateSchool(token, current.id, {
              status: current.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE',
            });
            setSelectedSchool(updated);
            setIssued(null);
          } else if (action.kind === 'reissue') {
            if (current.status !== 'ACTIVE')
              throw new Error('Aktifkan sekolah untuk menerbitkan ulang token.');
            const value = await reissueTeacherToken(token, current.id, action.token.id);
            setIssued({ ...value, schoolId: current.id });
            setCopyState('');
            url.update({ tokenOffset: null });
          } else {
            await revokeTeacherToken(token, current.id, action.token.id);
            setIssued(null);
          }
        },
        action === 'status'
          ? 'Status sekolah diperbarui.'
          : action.kind === 'reissue'
            ? 'Token pengganti diterbitkan. Token lama tidak dapat digunakan.'
            : 'Token berhasil dicabut.',
      )
    )
      setModal(null);
  }
  async function copyToken() {
    if (!issued) return;
    try {
      await navigator.clipboard.writeText(issued.token);
      setCopyState('Token disalin. Bagikan langsung kepada Guru yang dituju.');
    } catch {
      setCopyState('Token belum dapat disalin. Pilih dan salin teks token secara manual.');
    }
  }
  const feedback = notice && (
    <div
      className={`schools-feedback${notice.error ? ' schools-feedback-error' : ''}`}
      role={notice.error ? 'alert' : 'status'}
    >
      <Icon name={notice.error ? 'info' : 'check-circle'} />
      <p>{notice.text}</p>
    </div>
  );
  if (!token || !urlReady)
    return (
      <AdminFrame
        title="Sekolah & credential"
        description="Kelola sekolah dan akses verifikasi Guru."
        icon="school"
      >
        {!urlReady || state.status === 'loading' ? (
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
  const operations = state.status === 'ready' && state.profile.adminRole === 'OPERATIONS';
  const modalTitle =
    modal === 'create'
      ? 'Tambah sekolah'
      : modal === 'edit'
        ? 'Edit sekolah'
        : modal === 'status'
          ? current?.status === 'ACTIVE'
            ? 'Nonaktifkan sekolah'
            : 'Aktifkan sekolah'
          : modal?.kind === 'detail'
            ? 'Detail token Guru'
            : modal?.kind === 'reissue'
              ? 'Terbit ulang token'
              : 'Cabut token';
  return (
    <AppShell
      area="admin"
      className={`admin-redesign-shell admin-management-shell admin-schools-shell${operations ? ' admin-workspace-shell admin-operations-shell' : ''}`}
    >
      <div className="schools-frame">
        {selected && (
          <Button
            variant="ghost"
            className="schools-back"
            disabled={busy}
            onClick={() => url.update({ schoolId: null, tokenOffset: null })}
          >
            <Icon name="back" />
            Kembali ke daftar sekolah
          </Button>
        )}
        <header className="schools-page-heading">
          <div>
            <h1 ref={heading} tabIndex={-1}>
              {selected ? (current?.name ?? 'Detail sekolah') : 'Sekolah & credential'}
            </h1>
            <p>
              {selected
                ? 'Kelola informasi sekolah dan akses verifikasi Guru.'
                : 'Kelola sekolah dan token verifikasi Guru dalam satu tempat.'}
            </p>
          </div>
          {!selected ? (
            <Button
              disabled={busy}
              leftIcon={<Icon name="school" />}
              onClick={() => open('create')}
            >
              Tambah sekolah
            </Button>
          ) : (
            current && (
              <Button
                variant="secondary"
                disabled={busy}
                leftIcon={<Icon name="settings" />}
                onClick={() => open('edit')}
              >
                Edit sekolah
              </Button>
            )
          )}
        </header>
        {!modal && feedback}
        {!selected ? (
          <section className="schools-directory schools-surface" aria-label="Daftar sekolah">
            <div className="schools-toolbar">
              <div>
                <h2>Sekolah terdaftar</h2>
                <p>Pilih sekolah untuk mengelola token dan akses Guru.</p>
              </div>
              <form
                className="schools-search"
                onSubmit={(event) => {
                  event.preventDefault();
                  url.update({ search: search.trim(), offset: null });
                }}
              >
                <label className="sr-only" htmlFor="school-search">
                  Cari sekolah
                </label>
                <div>
                  <Icon name="search" />
                  <input
                    type="search"
                    id="school-search"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Nama atau kode sekolah"
                    maxLength={120}
                  />
                </div>
                <Button variant="secondary" type="submit" disabled={busy}>
                  Cari sekolah
                </Button>
                {filter && (
                  <Button
                    variant="ghost"
                    type="button"
                    onClick={() => {
                      setSearch('');
                      url.update({ search: null, offset: null });
                    }}
                  >
                    Reset
                  </Button>
                )}
              </form>
            </div>
            {schoolError ? (
              <AdminMessage error message={schoolError} retry={retry} />
            ) : schools === null ? (
              <AdminLoading message="Memuat sekolah..." />
            ) : !schools.length ? (
              <div className="schools-empty">
                <span>
                  <Icon name="school" />
                </span>
                <h3>{filter ? 'Sekolah tidak ditemukan' : 'Belum ada sekolah.'}</h3>
                <p>
                  {filter
                    ? 'Coba nama atau kode sekolah lain.'
                    : 'Tambahkan sekolah sebelum menerbitkan token Guru.'}
                </p>
                <Button
                  variant="secondary"
                  onClick={() =>
                    filter ? url.update({ search: null, offset: null }) : open('create')
                  }
                >
                  {filter ? 'Reset pencarian' : 'Tambah sekolah'}
                </Button>
              </div>
            ) : (
              <SchoolDirectory
                schools={schools}
                busy={busy}
                onSelect={(school) => url.update({ schoolId: school.id, tokenOffset: null })}
              />
            )}
            {schools && !schoolError && (
              <footer className="schools-directory-footer">
                <p>
                  {schools.length
                    ? `Menampilkan ${offset + 1}–${offset + schools.length}`
                    : '0 ditampilkan'}
                  <span>Maksimal 5 per halaman</span>
                </p>
                <AdminPagination
                  offset={offset}
                  hasNext={nextOffset !== null}
                  disabled={busy}
                  onChange={(next) => url.update({ offset: next < offset ? next : nextOffset! })}
                  label="Halaman sekolah"
                />
              </footer>
            )}
          </section>
        ) : (
          <section
            className="schools-detail"
            aria-label="Detail sekolah dan token"
            aria-busy={detailLoading}
          >
            {detailError ? (
              <div className="schools-surface">
                <AdminMessage error message={detailError} retry={retry} />
              </div>
            ) : !current ? (
              <div className="schools-surface">
                <AdminLoading message="Memuat detail sekolah..." />
              </div>
            ) : (
              <>
                <section
                  className="schools-school-info schools-surface"
                  aria-label="Informasi sekolah"
                >
                  <div className="schools-info-line">
                    <span className="schools-code">{current.code}</span>
                    <SchoolStatus status={current.status} />
                    <Button
                      variant="ghost"
                      disabled={busy}
                      className="schools-status-action"
                      onClick={() => open('status')}
                    >
                      {current.status === 'ACTIVE' ? 'Nonaktifkan sekolah' : 'Aktifkan sekolah'}
                    </Button>
                  </div>
                  <p className="schools-address">{current.address || 'Alamat belum dicatat'}</p>
                  <div className="schools-related">
                    <Link href={`/admin/operations?schoolId=${current.id}&role=TEACHER`}>
                      <Icon name="users" />
                      Lihat Guru sekolah
                    </Link>
                    <Link href={`/admin/operations?schoolId=${current.id}&view=classes`}>
                      <Icon name="book" />
                      Lihat kelas sekolah
                    </Link>
                  </div>
                </section>
                {issued && (
                  <section
                    ref={issuedPanel}
                    tabIndex={-1}
                    className="schools-issued"
                    aria-label="Token baru"
                  >
                    <div>
                      <Icon name="lock" />
                      <div>
                        <h2>Token baru siap dibagikan</h2>
                        <p>Ditampilkan hanya kali ini. Salin sebelum meninggalkan halaman.</p>
                      </div>
                    </div>
                    <code>{issued.token}</code>
                    <p>
                      Berlaku sampai {schoolTime(issued.expiresAt)} WIB. Bagikan hanya kepada Guru
                      yang dituju.
                    </p>
                    <div className="schools-issued-actions">
                      <Button onClick={() => void copyToken()} disabled={busy}>
                        Salin token
                      </Button>
                      <Button
                        variant="ghost"
                        disabled={busy}
                        onClick={() => {
                          setIssued(null);
                          setCopyState('');
                        }}
                      >
                        Sembunyikan token
                      </Button>
                    </div>
                    {copyState && <p role="status">{copyState}</p>}
                  </section>
                )}
                <section className="schools-tokens schools-surface" aria-label="Riwayat token Guru">
                  <div className="schools-toolbar">
                    <div>
                      <h2>Token Guru</h2>
                      <p>Satu kali pakai. Berlaku 3 × 24 jam sejak diterbitkan.</p>
                    </div>
                    <Button
                      disabled={busy || current.status !== 'ACTIVE'}
                      loading={busy && !modal}
                      leftIcon={<Icon name="lock" />}
                      onClick={() => void issue()}
                    >
                      Terbitkan token
                    </Button>
                  </div>
                  {current.status !== 'ACTIVE' && (
                    <p className="schools-inactive-note">
                      <Icon name="info" />
                      Aktifkan sekolah untuk menerbitkan atau menerbitkan ulang token. Riwayat tetap
                      dapat dilihat.
                    </p>
                  )}
                  {tokenError ? (
                    <AdminMessage error message={tokenError} retry={retry} />
                  ) : tokens === null ? (
                    <AdminLoading message="Memuat token..." />
                  ) : !tokens.length ? (
                    <div className="schools-empty">
                      <span>
                        <Icon name="lock" />
                      </span>
                      <h3>Belum ada token.</h3>
                      <p>Terbitkan token untuk memulai verifikasi Guru di sekolah ini.</p>
                    </div>
                  ) : (
                    <SchoolTokens
                      tokens={tokens}
                      busy={busy}
                      active={current.status === 'ACTIVE'}
                      onAction={(kind, token) => open({ kind, token })}
                      onDetail={(token) => open({ kind: 'detail', token })}
                    />
                  )}
                  {tokens && !tokenError && (
                    <footer className="schools-directory-footer">
                      <p>
                        {tokens.length
                          ? `Menampilkan ${tokenOffset + 1}–${tokenOffset + tokens.length}`
                          : '0 ditampilkan'}
                        <span>Waktu dalam WIB</span>
                      </p>
                      <AdminPagination
                        offset={tokenOffset}
                        hasNext={tokenNextOffset !== null}
                        disabled={busy}
                        onChange={(next) =>
                          url.update({ tokenOffset: next < tokenOffset ? next : tokenNextOffset! })
                        }
                        label="Halaman token Guru"
                      />
                    </footer>
                  )}
                </section>
              </>
            )}
          </section>
        )}
        <p className="schools-access-note">
          <Icon name="lock" />
          Pengelolaan sekolah dan token tersedia untuk Super Admin dan Admin Operasional.
        </p>
        {modal && (
          <Dialog
            open
            onClose={close}
            pending={busy}
            title={modalTitle}
            className="admin-management-dialog admin-schools-dialog"
          >
            {feedback}
            {modal === 'create' || modal === 'edit' ? (
              <form
                className="schools-form"
                onSubmit={(event) =>
                  void (modal === 'create' ? addSchool(event) : saveSchool(event))
                }
              >
                <p className="schools-dialog-description">
                  {modal === 'create'
                    ? 'Daftarkan sekolah untuk memulai verifikasi Guru.'
                    : `${current?.code} · Perubahan berlaku setelah disimpan.`}
                </p>
                <SchoolFields
                  mode={modal}
                  code={code}
                  name={modal === 'create' ? name : editName}
                  address={modal === 'create' ? address : editAddress}
                  onCode={setCode}
                  onName={modal === 'create' ? setName : setEditName}
                  onAddress={modal === 'create' ? setAddress : setEditAddress}
                  busy={busy}
                />
                <div className="schools-dialog-actions">
                  <Button variant="secondary" type="button" disabled={busy} onClick={close}>
                    Batal
                  </Button>
                  <Button type="submit" loading={busy}>
                    {modal === 'create' ? 'Simpan sekolah' : 'Simpan perubahan'}
                  </Button>
                </div>
              </form>
            ) : typeof modal === 'object' && modal.kind === 'detail' ? (
              <>
                <TokenDetail token={modal.token} />
                <div className="schools-dialog-actions">
                  <Button variant="secondary" onClick={close}>
                    Tutup
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="schools-confirm-target">
                  <Icon name={modal === 'status' ? 'school' : 'lock'} />
                  <div>
                    <strong>{current?.name}</strong>
                    <span>{current?.code}</span>
                  </div>
                </div>
                <p className="schools-confirm-copy">
                  {modal === 'status'
                    ? current?.status === 'ACTIVE'
                      ? 'Nonaktifkan sekolah? Verifikasi Guru dengan sekolah ini akan ditolak. Sekolah dan riwayat tetap tersimpan.'
                      : 'Aktifkan sekolah ini agar token verifikasi Guru dapat diterbitkan kembali.'
                    : modal.kind === 'reissue'
                      ? 'Terbit ulang token? Token lama tidak dapat digunakan lagi. Token pengganti akan ditampilkan satu kali.'
                      : 'Cabut token ini? Token tidak dapat digunakan untuk verifikasi Guru.'}
                </p>
                {typeof modal === 'object' && (
                  <p className="schools-confirm-reference">
                    ID riwayat: <code>{modal.token.id}</code>
                  </p>
                )}
                <div className="schools-dialog-actions">
                  <Button variant="secondary" disabled={busy} onClick={close}>
                    Batal
                  </Button>
                  <Button
                    variant={
                      (modal === 'status' && current?.status === 'ACTIVE') ||
                      (typeof modal === 'object' && modal.kind === 'revoke')
                        ? 'danger'
                        : 'primary'
                    }
                    loading={busy}
                    onClick={() => void confirm()}
                  >
                    Konfirmasi
                  </Button>
                </div>
              </>
            )}
          </Dialog>
        )}
      </div>
    </AppShell>
  );
}
