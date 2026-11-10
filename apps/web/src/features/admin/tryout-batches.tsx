'use client';

import { ADMIN_PAGE_SIZE } from './pagination';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Badge, Button, Card, Dialog } from '@tka/ui';
import { useAuth } from '@/features/onboarding/auth';
import { apiRequest } from '@/lib/api';
import { AdminFrame, AdminMessage } from './admin-presentation';
import { useAdminAccessError, withAdminWorkspace } from './admin-workspace';
import { adminCanAccess } from './admin-access';
import { adminOffset, useAdminUrl } from './admin-url';
import { AdminPagination } from './admin-pagination';
import type {
  SaveTryoutBatchDto,
  TryoutBatchDto,
  TryoutBatchesDto,
  TryoutBatchOptionsDto,
} from './generated-types';

const base = '/admin/tryout-batches';
const labels: Record<string, string> = {
  DRAFT: 'Draf',
  SCHEDULED: 'Terjadwal',
  OPEN: 'Berlangsung',
  CLOSED: 'Ditutup',
  CANCELLED: 'Dibatalkan',
};
const wib = (value: string) =>
  new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Jakarta',
  }).format(new Date(value)) + ' WIB';
const local = (value: string) =>
  new Date(Date.parse(value) + 7 * 3600000).toISOString().slice(0, 16);
const initial: SaveTryoutBatchDto = {
  title: '',
  startsAt: '',
  closesAt: '',
  packageIds: [],
  mandiriPackageId: null,
  schools: [],
};

export const AdminTryoutBatchesScreen = withAdminWorkspace(Batches, 'tryoutRead');
function Batches({ id }: { id?: string }) {
  const { state } = useAuth();
  if (state.status !== 'ready') return null;
  const canManage = adminCanAccess(state.profile, 'content');
  if (id === 'new' && !canManage)
    return <AdminMessage error message="Akses pengelolaan konten diperlukan." />;
  return (
    <AdminFrame
      title="Batch Tryout"
      description=""
      icon="target"
      management
      minimalHeader
      fullWidth
    >
      <BatchWorkspace
        key={`${state.profile.id}:${id ?? 'list'}`}
        canManage={canManage}
        token={state.session.access_token}
        {...(id ? { id } : {})}
      />
    </AdminFrame>
  );
}
function BatchWorkspace({
  token,
  id,
  canManage,
}: {
  token: string;
  id?: string;
  canManage: boolean;
}) {
  const router = useRouter();
  const url = useAdminUrl();
  const accessError = useAdminAccessError();
  const [data, setData] = useState<TryoutBatchesDto | null>(null);
  const [detail, setDetail] = useState<TryoutBatchDto | null>(null);
  const [version, setVersion] = useState(0);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [editing, setEditing] = useState(false);
  const [action, setAction] = useState<'publish' | 'cancel' | null>(null);
  const [reason, setReason] = useState('');
  const offset = adminOffset(url.params.get('offset'));
  const search = url.params.get('search') ?? '';
  const context = new URLSearchParams();
  if (search) context.set('search', search);
  if (offset) context.set('offset', String(offset));
  const suffix = context.size ? '?' + context : '';
  useEffect(() => {
    let active = true;
    if (id === 'new') {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    const request = id
      ? apiRequest<TryoutBatchDto>(`admin/tryout-batches/${id}`, token).then((v) => {
          if (active) setDetail(v);
        })
      : apiRequest<TryoutBatchesDto>(
          `admin/tryout-batches?limit=${ADMIN_PAGE_SIZE}&offset=${offset}&search=${encodeURIComponent(search)}`,
          token,
        ).then((v) => {
          if (active) setData(v);
        });
    request
      .catch((e) => {
        if (active) {
          accessError(e);
          setError(e.message);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id, token, version, offset, search, accessError]);
  async function mutate(kind: 'publish' | 'cancel') {
    if (!detail) return;
    setPending(true);
    setError('');
    try {
      await apiRequest(`admin/tryout-batches/${detail.id}/${kind}`, token, {
        method: 'POST',
        body: JSON.stringify({
          expectedRevision: detail.revision,
          ...(kind === 'cancel' ? { reason } : {}),
        }),
      });
      setAction(null);
      setVersion((v) => v + 1);
    } catch (e) {
      accessError(e);
      setError(e instanceof Error ? e.message : 'Perubahan gagal disimpan.');
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="tryout-batch-workspace">
      {error && (
        <div role="alert">
          <AdminMessage message={error} error />
          <Button variant="secondary" onClick={() => setVersion((v) => v + 1)}>
            Coba lagi
          </Button>
        </div>
      )}
      {loading && <p role="status">Memuat batch…</p>}
      {id === 'new' ? (
        <Card className="tryout-batch-create">
          <header className="tryout-batch-create-header">
            <h2>Tambah batch Tryout</h2>
            <p>Atur jadwal, pilih paket, lalu tentukan siapa yang dapat mengerjakan.</p>
          </header>
          <BatchForm
            token={token}
            onSaved={(saved) => router.push(`${base}/${saved}${suffix}`)}
            onCancel={() => router.push(base + suffix)}
          />
        </Card>
      ) : !id ? (
        <Card className="assessment-directory assessment-directory-compact">
          <div className="assessment-directory-toolbar">
            <form
              className="assessment-directory-search"
              key={search}
              onSubmit={(e) => {
                e.preventDefault();
                url.update({
                  search: String(new FormData(e.currentTarget).get('search') ?? '').trim(),
                  offset: null,
                });
              }}
            >
              <label className="sr-only" htmlFor="batch-search">
                Cari batch
              </label>
              <input
                id="batch-search"
                name="search"
                type="search"
                placeholder="Cari judul batch"
                maxLength={160}
                defaultValue={search}
              />
              <Button variant="secondary" type="submit">
                Cari
              </Button>
            </form>
            <Button variant="secondary" disabled={loading} onClick={() => setVersion((v) => v + 1)}>
              Muat ulang
            </Button>
            {canManage && (
              <Link className="button-link" href={`${base}/new${suffix}`}>
                Tambah batch
              </Link>
            )}
          </div>
          {data && (
            <>
              <div className="assessment-table-scroll">
                <table className="assessment-question-table">
                  <thead>
                    <tr>
                      {[
                        'No.',
                        'Judul batch',
                        'Jadwal (WIB)',
                        'Pelaksanaan',
                        'Paket',
                        'Sekolah',
                        'Aksi',
                      ].map((h) => (
                        <th key={h} scope="col">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((b, i) => (
                      <tr key={b.id}>
                        <td>{offset + i + 1}</td>
                        <td>
                          <Link href={`${base}/${b.id}${suffix}`}>{b.title}</Link>
                        </td>
                        <td>
                          {wib(b.startsAt)}
                          <br />
                          {wib(b.closesAt)}
                        </td>
                        <td>{labels[b.state] ?? b.state}</td>
                        <td>{b.packages.length}</td>
                        <td>{b.schools.length}</td>
                        <td>
                          <Link
                            className="button-link button-link-secondary"
                            href={`${base}/${b.id}${suffix}`}
                          >
                            Kelola
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!data.items.length && <p>Belum ada batch yang cocok.</p>}
              <AdminPagination
                offset={offset}
                hasNext={offset + ADMIN_PAGE_SIZE < data.total}
                totalItems={data.total}
                onChange={(value) => url.update({ offset: value || null })}
              />
            </>
          )}
        </Card>
      ) : (
        detail && (
          <>
            <Card className="assessment-summary-panel tryout-detail-summary">
              <div className="assessment-detail-identity">
                <h2>{detail.title}</h2>
                <Badge>{labels[detail.state] ?? detail.state}</Badge>
                {canManage && (
                  <div className="admin-content-actions">
                    <Button
                      variant="secondary"
                      disabled={!(detail.editable || detail.delegationsEditable) || pending}
                      onClick={() => setEditing(true)}
                    >
                      {detail.editable ? 'Pengaturan' : 'Atur penerima'}
                    </Button>
                    {detail.state === 'DRAFT' && (
                      <Button
                        disabled={!detail.editable || pending}
                        onClick={() => setAction('publish')}
                      >
                        Terbitkan batch
                      </Button>
                    )}
                    {detail.editable && (
                      <Button
                        variant="secondary"
                        disabled={pending}
                        onClick={() => setAction('cancel')}
                      >
                        Batalkan batch
                      </Button>
                    )}
                  </div>
                )}
              </div>
              <dl className="tryout-detail-schedule">
                <div>
                  <dt>Mulai</dt>
                  <dd>{wib(detail.startsAt)}</dd>
                </div>
                <div>
                  <dt>Tutup</dt>
                  <dd>{wib(detail.closesAt)}</dd>
                </div>
                <div>
                  <dt>Paket</dt>
                  <dd>{detail.packages.length} paket</dd>
                </div>
                <div>
                  <dt>Delegasi</dt>
                  <dd>{detail.schools.length} sekolah</dd>
                </div>
              </dl>
            </Card>
            <div className="tryout-detail-grid">
              <Card className="tryout-detail-delegations">
                <h3>Paket dan delegasi</h3>
                <div className="assessment-table-scroll">
                  <table className="assessment-question-table">
                    <thead>
                      <tr>
                        <th scope="col">Penerima</th>
                        <th scope="col">Paket</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>Sekolah tanpa delegasi</td>
                        <td>{detail.packages[0]?.name ?? 'Paket utama'}</td>
                      </tr>
                      <tr>
                        <td>Siswa Mandiri</td>
                        <td>
                          {detail.packages.find((p) => p.id === detail.mandiriPackageId)?.name ??
                            'Akses dimatikan'}
                        </td>
                      </tr>
                      {detail.schools.map((s) => (
                        <tr key={s.schoolId}>
                          <td>{s.schoolName}</td>
                          <td>
                            {detail.packages.find((p) => p.id === s.packageId)?.name ??
                              'Paket tidak ditemukan'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
              <Card className="tryout-detail-participants">
                <h3>Peserta</h3>
                {detail.participants.length ? (
                  <div className="assessment-table-scroll">
                    <table className="assessment-question-table">
                      <thead>
                        <tr>
                          <th>Penerima</th>
                          <th>Paket</th>
                          <th>Mulai</th>
                          <th>Selesai</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.participants.map((p) => (
                          <tr key={`${p.packageId}:${p.schoolId}`}>
                            <td>
                              {p.schoolId
                                ? detail.schools.find((s) => s.schoolId === p.schoolId)?.schoolName
                                : 'Mandiri'}
                            </td>
                            <td>{detail.packages.find((pack) => pack.id === p.packageId)?.name}</td>
                            <td>{p.assigned}</td>
                            <td>{p.completed}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="tryout-detail-empty">
                    <strong>Belum ada peserta yang mulai.</strong>
                    <p>Jumlah peserta muncul setelah siswa memulai Tryout.</p>
                  </div>
                )}
              </Card>
              <Card className="tryout-detail-results">
                <h3>Hasil peserta</h3>
                <Badge>Belum diterbitkan</Badge>
                <p>
                  Hasil dan pembahasan menunggu finalisasi penilaian. Finalisasi multi-paket masih
                  memerlukan integrasi dan kebijakan yang disahkan.
                </p>
                <dl className="tryout-detail-deadline">
                  <dt>Batas penerbitan hasil</dt>
                  <dd>{wib(detail.resultDueAt)}</dd>
                </dl>
                {detail.resultBlockers.includes('RESULT_DEADLINE_EXCEEDED') && (
                  <p role="alert">Batas 72 jam terlewati. Hasil belum tersedia.</p>
                )}
              </Card>
            </div>
            <Dialog
              open={editing}
              onClose={() => setEditing(false)}
              title="Pengaturan batch"
              className="admin-management-dialog"
              pending={pending}
            >
              {canManage && editing && (
                <BatchForm
                  key={detail.revision}
                  token={token}
                  batch={detail}
                  recipientsOnly={!detail.editable}
                  onBusy={setPending}
                  onSaved={() => {
                    setEditing(false);
                    setVersion((v) => v + 1);
                  }}
                  onCancel={() => setEditing(false)}
                />
              )}
            </Dialog>
            <Dialog
              open={!!action}
              onClose={() => setAction(null)}
              title={action === 'cancel' ? 'Batalkan batch' : 'Terbitkan batch'}
              pending={pending}
              className="admin-management-dialog tryout-batch-confirmation"
              actions={
                <>
                  <Button variant="secondary" disabled={pending} onClick={() => setAction(null)}>
                    Kembali
                  </Button>
                  <Button
                    disabled={pending || (action === 'cancel' && !reason.trim())}
                    onClick={() => action && void mutate(action)}
                  >
                    {pending
                      ? 'Menyimpan…'
                      : action === 'publish'
                        ? 'Ya, terbitkan batch'
                        : 'Konfirmasi'}
                  </Button>
                </>
              }
            >
              {action === 'cancel' ? (
                <label>
                  Alasan pembatalan
                  <textarea
                    value={reason}
                    maxLength={1000}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </label>
              ) : (
                <div className="tryout-publish-summary">
                  <p className="tryout-publish-question">Terbitkan batch ini?</p>
                  <strong className="tryout-publish-name">{detail.title}</strong>
                  <dl>
                    <div>
                      <dt>Mulai</dt>
                      <dd>{wib(detail.startsAt)}</dd>
                    </div>
                    <div>
                      <dt>Tutup</dt>
                      <dd>{wib(detail.closesAt)}</dd>
                    </div>
                  </dl>
                  <p>Siswa mendapat akses sesuai delegasi saat jadwal mulai.</p>
                  <p className="tryout-publish-notice">Pengaturan terkunci saat batch dimulai.</p>
                </div>
              )}
              {error && <p role="alert">{error}</p>}
            </Dialog>
          </>
        )
      )}
    </div>
  );
}
function BatchForm({
  token,
  batch,
  onSaved,
  onCancel,
  onBusy,
  recipientsOnly = false,
}: {
  token: string;
  batch?: TryoutBatchDto;
  recipientsOnly?: boolean;
  onSaved: (id: string) => void;
  onCancel: () => void;
  onBusy?: (busy: boolean) => void;
}) {
  const accessError = useAdminAccessError();
  const [form, setForm] = useState<SaveTryoutBatchDto>(
    batch
      ? {
          title: batch.title,
          startsAt: local(batch.startsAt),
          closesAt: local(batch.closesAt),
          packageIds: batch.packages.map((p) => p.id),
          mandiriPackageId: batch.mandiriPackageId,
          schools: batch.schools.map((s) => ({ schoolId: s.schoolId, packageId: s.packageId })),
          expectedRevision: batch.revision,
        }
      : structuredClone(initial),
  );
  const [options, setOptions] = useState<TryoutBatchOptionsDto | null>(null);
  const [knownPackages, setKnownPackages] = useState(batch?.packages ?? []);
  const [knownSchools, setKnownSchools] = useState(
    batch?.schools.map((s) => ({ schoolId: s.schoolId, schoolName: s.schoolName })) ?? [],
  );
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [optionLoading, setOptionLoading] = useState(true);
  const [packageModalOpen, setPackageModalOpen] = useState(false);
  const selectedPackages = form.packageIds.flatMap((id) =>
    knownPackages.filter((p) => p.id === id),
  );
  const primaryPackage = selectedPackages[0];
  const availablePackages = (options?.packages ?? []).filter(
    (p) =>
      !form.packageIds.includes(p.id) &&
      (!primaryPackage ||
        (Boolean(primaryPackage.familyCode) && p.familyCode === primaryPackage.familyCode)),
  );
  useEffect(() => {
    let active = true;
    setOptionLoading(true);
    apiRequest<TryoutBatchOptionsDto>(
      `admin/tryout-batches/options?limit=100&offset=0&search=${encodeURIComponent(search)}${primaryPackage?.familyCode ? `&familyCode=${encodeURIComponent(primaryPackage.familyCode)}` : ''}`,
      token,
    )
      .then((v) => {
        if (!active) return;
        setOptions(v);
        setKnownPackages((old) => [
          ...new Map([...old, ...v.packages].map((p) => [p.id, p])).values(),
        ]);
        setKnownSchools((old) => [
          ...new Map([...old, ...v.schools].map((s) => [s.schoolId, s])).values(),
        ]);
      })
      .catch((e) => {
        if (active) {
          accessError(e);
          setError(e.message);
        }
      })
      .finally(() => {
        if (active) setOptionLoading(false);
      });
    return () => {
      active = false;
    };
  }, [token, search, primaryPackage?.familyCode, accessError]);
  async function save() {
    setPending(true);
    onBusy?.(true);
    setError('');
    try {
      const saved = await apiRequest<{ id: string }>(
        `admin/tryout-batches${batch ? '/' + batch.id : ''}${recipientsOnly ? '/delegations' : ''}`,
        token,
        {
          method: batch ? 'PATCH' : 'POST',
          body: JSON.stringify(
            recipientsOnly
              ? {
                  schools: form.schools,
                  mandiriPackageId: form.mandiriPackageId,
                  expectedRevision: form.expectedRevision,
                }
              : {
                  ...form,
                  startsAt: `${form.startsAt}:00+07:00`,
                  closesAt: `${form.closesAt}:00+07:00`,
                },
          ),
        },
      );
      onSaved(saved.id);
    } catch (e) {
      accessError(e);
      setError(e instanceof Error ? e.message : 'Batch gagal disimpan.');
    } finally {
      setPending(false);
      onBusy?.(false);
    }
  }
  return (
    <div className="tryout-batch-form">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <fieldset disabled={pending}>
          <legend className="sr-only">Pengaturan batch Tryout</legend>
          {!recipientsOnly && (
            <section className="tryout-batch-section" aria-labelledby="batch-schedule-title">
              <header className="tryout-batch-section-header">
                <h3 id="batch-schedule-title">Nama dan jadwal</h3>
              </header>
              <label>
                Judul batch
                <input
                  required
                  maxLength={160}
                  placeholder="Contoh: Tryout TKA - November 2026"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                />
              </label>
              <div className="tryout-batch-dates">
                <label>
                  Mulai (WIB)
                  <input
                    required
                    type="datetime-local"
                    min={local(new Date(Date.now() + 60000).toISOString())}
                    value={form.startsAt}
                    onChange={(e) => {
                      const startsAt = e.target.value;
                      setForm({
                        ...form,
                        startsAt,
                        closesAt: startsAt
                          ? local(
                              new Date(
                                Date.parse(`${startsAt}:00+07:00`) + 7 * 86400000,
                              ).toISOString(),
                            )
                          : '',
                      });
                    }}
                  />
                </label>
                <label>
                  Tutup (WIB)
                  <input
                    required
                    type="datetime-local"
                    min={
                      form.startsAt
                        ? local(
                            new Date(Date.parse(`${form.startsAt}:00+07:00`) + 60000).toISOString(),
                          )
                        : undefined
                    }
                    value={form.closesAt}
                    onChange={(e) => setForm({ ...form, closesAt: e.target.value })}
                  />
                </label>
              </div>
            </section>
          )}
          <section className="tryout-batch-section" aria-labelledby="batch-packages-title">
            <header className="tryout-batch-section-header">
              <h3 id="batch-packages-title">Paket soal</h3>
              <Badge>{form.packageIds.length} dipilih</Badge>
              {!recipientsOnly && (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setSearch('');
                    setPackageModalOpen(true);
                  }}
                >
                  {primaryPackage ? 'Tambah paket tambahan' : 'Pilih paket utama'}
                </Button>
              )}
            </header>
            <div
              className="tryout-batch-selected-packages"
              role="region"
              aria-label="Paket terpilih"
              tabIndex={0}
            >
              {!selectedPackages.length && (
                <p className="tryout-batch-empty">Belum ada paket yang dipilih.</p>
              )}

              {selectedPackages.map((p) => (
                <div className="tryout-batch-choice" key={p.id}>
                  <Badge>{p.id === form.packageIds[0] ? 'Utama' : 'Tambahan'}</Badge>
                  <Link href={`/admin/assessments/tryout/${p.id}`}>
                    {p.name} · Versi {p.packageVersion}
                  </Link>
                  {!recipientsOnly && (
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={
                        (p.id === form.packageIds[0] && form.packageIds.length > 1) ||
                        form.schools.some((s) => s.packageId === p.id) ||
                        form.mandiriPackageId === p.id
                      }
                      onClick={() =>
                        setForm({
                          ...form,
                          packageIds: form.packageIds.filter((id) => id !== p.id),
                        })
                      }
                    >
                      Keluarkan dari batch
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </section>
          {form.packageIds.length > 0 && (
            <section className="tryout-batch-section" aria-labelledby="batch-recipients-title">
              <header className="tryout-batch-section-header">
                <h3 id="batch-recipients-title">Penerima Tryout</h3>
              </header>
              <p className="tryout-batch-recipient-info">
                Sekolah aktif tanpa delegasi memakai paket utama. Tambahkan delegasi untuk memilih
                paket berbeda. Akses Mandiri diatur terpisah.
              </p>
              <div className="tryout-batch-recipient-controls">
                <label>
                  Paket siswa Mandiri
                  <select
                    value={form.mandiriPackageId ?? ''}
                    onChange={(e) => setForm({ ...form, mandiriPackageId: e.target.value || null })}
                  >
                    <option value="">Akses dimatikan</option>
                    {selectedPackages.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
                {form.schools.map((s) => (
                  <div className="tryout-batch-choice tryout-batch-delegation" key={s.schoolId}>
                    <label>
                      {knownSchools.find((k) => k.schoolId === s.schoolId)?.schoolName ?? 'Sekolah'}
                      <select
                        aria-label={`Paket ${knownSchools.find((k) => k.schoolId === s.schoolId)?.schoolName ?? 'sekolah'}`}
                        value={s.packageId}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            schools: form.schools.map((old) =>
                              old.schoolId === s.schoolId
                                ? { ...old, packageId: e.target.value }
                                : old,
                            ),
                          })
                        }
                      >
                        {selectedPackages.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() =>
                        setForm({
                          ...form,
                          schools: form.schools.filter((old) => old.schoolId !== s.schoolId),
                        })
                      }
                    >
                      Hapus delegasi
                    </Button>
                  </div>
                ))}
                <label>
                  Tambahkan sekolah
                  <select
                    value=""
                    disabled={!form.packageIds.length}
                    onChange={(e) => {
                      if (e.target.value)
                        setForm({
                          ...form,
                          schools: [
                            ...form.schools,
                            { schoolId: e.target.value, packageId: form.packageIds[0]! },
                          ],
                        });
                    }}
                  >
                    <option value="">Pilih sekolah</option>
                    {knownSchools
                      .filter((s) => !form.schools.some((old) => old.schoolId === s.schoolId))
                      .map((s) => (
                        <option key={s.schoolId} value={s.schoolId}>
                          {s.schoolName}
                        </option>
                      ))}
                  </select>
                </label>
              </div>
            </section>
          )}
          {error && <p role="alert">{error}</p>}
          <footer className="tryout-batch-form-footer">
            <div>
              <strong>
                {form.packageIds.length} paket / {form.schools.length} sekolah
              </strong>
              <p>
                {recipientsOnly
                  ? 'Perubahan berlaku untuk siswa yang belum mulai. Attempt yang sudah dimulai tetap memakai paket awal.'
                  : batch && batch.state !== 'DRAFT'
                    ? 'Pengaturan umum dapat diubah sebelum batch dimulai.'
                    : 'Disimpan sebagai draft. Terbitkan setelah pengaturan selesai.'}
              </p>
            </div>
            <div className="admin-content-actions">
              <Button type="submit" disabled={!form.packageIds.length}>
                {pending ? 'Menyimpan…' : batch ? 'Simpan perubahan' : 'Simpan draft'}
              </Button>
              <Button type="button" variant="secondary" onClick={onCancel}>
                Batal
              </Button>
            </div>
          </footer>
        </fieldset>
      </form>
      <Dialog
        open={packageModalOpen}
        onClose={() => setPackageModalOpen(false)}
        title={primaryPackage ? 'Tambah paket tambahan' : 'Pilih paket utama'}
      >
        <form
          className="tryout-batch-modal-search"
          onSubmit={(e) => {
            e.preventDefault();
            setSearch(String(new FormData(e.currentTarget).get('search') ?? '').trim());
          }}
        >
          <label>
            Cari paket
            <input
              type="search"
              name="search"
              defaultValue={search}
              placeholder="Nama paket Tryout"
              maxLength={160}
            />
          </label>
          <Button type="submit" variant="secondary">
            Cari
          </Button>
        </form>
        {optionLoading && <p role="status">Memuat paket...</p>}
        {!optionLoading && !availablePackages.length && <p>Tidak ada paket yang cocok.</p>}
        <div className="tryout-batch-package-list">
          {availablePackages.map((p) => {
            return (
              <div className="tryout-batch-package-row" key={p.id}>
                <div>
                  <strong>{p.name}</strong>
                  <span>
                    Versi {p.packageVersion} · Parent {p.familyCode}
                  </span>
                  <span>
                    {p.usedBatchCount} batch · {p.valid ? 'Valid' : 'Belum valid'}
                  </span>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  className="tryout-batch-package-select"
                  disabled={pending || optionLoading}
                  onClick={() => {
                    setForm({ ...form, packageIds: [...form.packageIds, p.id] });
                    setPackageModalOpen(false);
                  }}
                >
                  Pilih
                </Button>
              </div>
            );
          })}
        </div>
      </Dialog>
    </div>
  );
}
