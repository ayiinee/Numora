'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Badge, Button, Card, Dialog } from '@tka/ui';
import { useAuth } from '@/features/onboarding/auth';
import { apiRequest } from '@/lib/api';
import { AdminFrame, AdminMessage } from './admin-presentation';
import { useAdminAccessError, withAdminWorkspace } from './admin-workspace';
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

export const AdminTryoutBatchesScreen = withAdminWorkspace(Batches, 'content');
function Batches({ id }: { id?: string }) {
  const { state } = useAuth();
  if (state.status !== 'ready') return null;
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
        token={state.session.access_token}
        {...(id ? { id } : {})}
      />
    </AdminFrame>
  );
}
function BatchWorkspace({ token, id }: { token: string; id?: string }) {
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
          `admin/tryout-batches?limit=5&offset=${offset}&search=${encodeURIComponent(search)}`,
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
      {id && (
        <Link className="assessment-back-link" href={base + suffix}>
          Kembali ke daftar
        </Link>
      )}
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
        <Card>
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
            <Link className="button-link" href={`${base}/new${suffix}`}>
              Tambah batch
            </Link>
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
                hasNext={offset + 5 < data.total}
                totalItems={data.total}
                onChange={(value) => url.update({ offset: value || null })}
              />
            </>
          )}
        </Card>
      ) : (
        detail && (
          <>
            <Card className="assessment-summary-panel">
              <div className="assessment-detail-identity">
                <h2>{detail.title}</h2>
                <Badge>{labels[detail.state] ?? detail.state}</Badge>
                <div className="admin-content-actions">
                  <Button
                    variant="secondary"
                    disabled={!detail.editable || pending}
                    onClick={() => setEditing(true)}
                  >
                    Pengaturan
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
              </div>
              <p>
                {wib(detail.startsAt)} — {wib(detail.closesAt)}
              </p>
            </Card>
            <Card>
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
            <Card>
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
                <p>Belum ada peserta yang mulai.</p>
              )}
            </Card>
            <Card>
              <h3>Hasil peserta</h3>
              <p>
                Hasil dan pembahasan belum diterbitkan. Finalisasi multi-paket masih memerlukan
                integrasi dan policy yang disahkan.
              </p>
              <p>Batas penerbitan: {wib(detail.resultDueAt)}</p>
              {detail.resultBlockers.includes('RESULT_DEADLINE_EXCEEDED') && (
                <p role="alert">Batas 72 jam terlewati. Hasil belum tersedia.</p>
              )}
            </Card>
            <Dialog
              open={editing}
              onClose={() => setEditing(false)}
              title="Pengaturan batch"
              className="admin-management-dialog"
              pending={pending}
            >
              <BatchForm
                key={detail.revision}
                token={token}
                batch={detail}
                onBusy={setPending}
                onSaved={() => {
                  setEditing(false);
                  setVersion((v) => v + 1);
                }}
                onCancel={() => setEditing(false)}
              />
            </Dialog>
            <Dialog
              open={!!action}
              onClose={() => setAction(null)}
              title={action === 'cancel' ? 'Batalkan batch' : 'Terbitkan batch'}
              pending={pending}
              className="admin-management-dialog"
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
                <p>
                  Terbitkan {detail.title}? Siswa mendapat akses sesuai delegasi saat jadwal mulai.
                  Konfigurasi terkunci saat batch dimulai.
                </p>
              )}
              {error && <p role="alert">{error}</p>}
              <Button
                disabled={pending || (action === 'cancel' && !reason.trim())}
                onClick={() => action && void mutate(action)}
              >
                {pending ? 'Menyimpan…' : 'Konfirmasi'}
              </Button>
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
}: {
  token: string;
  batch?: TryoutBatchDto;
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
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [optionLoading, setOptionLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setOptionLoading(true);
    apiRequest<TryoutBatchOptionsDto>(
      `admin/tryout-batches/options?limit=20&offset=${offset}&search=${encodeURIComponent(search)}`,
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
  }, [token, offset, search, retry, accessError]);
  const selectedPackages = knownPackages.filter((p) => form.packageIds.includes(p.id));
  async function save() {
    setPending(true);
    onBusy?.(true);
    setError('');
    try {
      const saved = await apiRequest<{ id: string }>(
        `admin/tryout-batches${batch ? '/' + batch.id : ''}`,
        token,
        {
          method: batch ? 'PATCH' : 'POST',
          body: JSON.stringify({
            ...form,
            startsAt: `${form.startsAt}:00+07:00`,
            closesAt: `${form.closesAt}:00+07:00`,
          }),
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
          <label>
            Judul batch
            <input
              required
              maxLength={160}
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
                value={form.startsAt}
                onChange={(e) => setForm({ ...form, startsAt: e.target.value })}
              />
            </label>
            <label>
              Tutup (WIB)
              <input
                required
                type="datetime-local"
                value={form.closesAt}
                onChange={(e) => setForm({ ...form, closesAt: e.target.value })}
              />
            </label>
          </div>
          <h3>Paket batch</h3>
          {selectedPackages.map((p) => (
            <div className="tryout-batch-choice" key={p.id}>
              <Link href={`/admin/assessments/tryout/${p.id}`}>
                {p.name} · Versi {p.packageVersion}
              </Link>
              <Button
                type="button"
                variant="secondary"
                disabled={
                  form.schools.some((s) => s.packageId === p.id) || form.mandiriPackageId === p.id
                }
                onClick={() =>
                  setForm({ ...form, packageIds: form.packageIds.filter((id) => id !== p.id) })
                }
              >
                Keluarkan dari batch
              </Button>
            </div>
          ))}
          <label>
            Tambahkan paket
            <select
              value=""
              onChange={(e) => {
                if (e.target.value)
                  setForm({ ...form, packageIds: [...form.packageIds, e.target.value] });
              }}
            >
              <option value="">Pilih paket dari hasil pencarian</option>
              {options?.packages
                .filter((p) => !form.packageIds.includes(p.id))
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · Versi {p.packageVersion}
                  </option>
                ))}
            </select>
          </label>
          <h3>Delegasi</h3>
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
            <div className="tryout-batch-choice" key={s.schoolId}>
              <label>
                {knownSchools.find((k) => k.schoolId === s.schoolId)?.schoolName ?? 'Sekolah'}
                <select
                  aria-label={`Paket ${knownSchools.find((k) => k.schoolId === s.schoolId)?.schoolName ?? 'sekolah'}`}
                  value={s.packageId}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      schools: form.schools.map((old) =>
                        old.schoolId === s.schoolId ? { ...old, packageId: e.target.value } : old,
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
              <option value="">Pilih sekolah dari hasil pencarian</option>
              {options?.schools
                .filter((s) => !form.schools.some((old) => old.schoolId === s.schoolId))
                .map((s) => (
                  <option key={s.schoolId} value={s.schoolId}>
                    {s.schoolName}
                  </option>
                ))}
            </select>
          </label>
          {error && <p role="alert">{error}</p>}
          <div className="admin-content-actions">
            <Button type="submit" disabled={!form.packageIds.length}>
              {pending ? 'Menyimpan…' : batch ? 'Simpan perubahan' : 'Simpan draft'}
            </Button>
            <Button type="button" variant="secondary" onClick={onCancel}>
              Batal
            </Button>
          </div>
        </fieldset>
      </form>
      <details className="tryout-batch-option-search" open>
        <summary>Cari paket atau sekolah</summary>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setSearch(String(new FormData(e.currentTarget).get('search') ?? ''));
            setOffset(0);
          }}
        >
          <label>
            Nama paket atau sekolah
            <input type="search" name="search" maxLength={160} />
          </label>
          <Button type="submit" variant="secondary">
            Cari pilihan
          </Button>
        </form>
        {optionLoading && <p role="status">Memuat pilihan…</p>}
        {options && (
          <p>
            {options.packageTotal} paket · {options.schoolTotal} sekolah cocok
          </p>
        )}
        <div className="admin-content-actions">
          <Button
            variant="secondary"
            disabled={offset === 0 || optionLoading}
            onClick={() => setOffset((v) => Math.max(0, v - 20))}
          >
            Pilihan sebelumnya
          </Button>
          <Button
            variant="secondary"
            disabled={
              optionLoading ||
              !options ||
              offset + 20 >= Math.max(options.packageTotal, options.schoolTotal)
            }
            onClick={() => setOffset((v) => v + 20)}
          >
            Pilihan berikutnya
          </Button>
          <Button variant="secondary" onClick={() => setRetry((v) => v + 1)}>
            Muat ulang pilihan
          </Button>
        </div>
      </details>
    </div>
  );
}
