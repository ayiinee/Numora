'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Button, Dialog } from '@tka/ui';
import { useAuth } from '@/features/onboarding/auth';
import { apiRequest } from '@/lib/api';
import { adminCanAccess } from './admin-access';
import { AdminFrame, AdminLoading, AdminMessage } from './admin-presentation';
import { AdminPagination } from './admin-pagination';
import { adminOffset, useAdminUrl } from './admin-url';
import { ADMIN_PAGE_SIZE } from './pagination';
import { adminAccessDenied, useOperationalQuery } from './operational-query';
import { IrtBatchCard, IrtRequestRow } from './irt-presentation';
import { IrtRequestDetail } from './irt-request-detail';
import { irtTime } from './irt-model';
import type {
  IrtRequestDto,
  IrtRequestsDto,
  IrtOperationalOptionsDto,
  IrtBatchHealthListDto,
  IrtBatchHealthDto,
} from './generated-types';

export function AdminIrtScreen() {
  const { state } = useAuth();
  const profile = state.status === 'ready' ? state.profile : null;
  return (
    <AdminFrame
      title="Request IRT & publikasi"
      description="Tinjau analisis Tryout dan kesiapan rilis nilai serta pembahasan."
      icon="chart"
      management
    >
      {state.status === 'loading' ? (
        <AdminLoading message="Memeriksa akses..." />
      ) : !adminCanAccess(profile, 'content') || state.status !== 'ready' ? (
        <AdminMessage error message="Akses Content diperlukan." login />
      ) : (
        <IrtPanel
          key={JSON.stringify([
            state.profile.id,
            state.profile.adminRole,
            state.profile.capabilities,
          ])}
          token={state.session.access_token}
        />
      )}
    </AdminFrame>
  );
}
function IrtPanel({ token }: { token: string }) {
  const url = useAdminUrl();
  return url.search === null ? (
    <AdminLoading message="Memuat ruang IRT..." />
  ) : (
    <IrtWorkspace token={token} url={url} />
  );
}
function IrtWorkspace({ token, url }: { token: string; url: ReturnType<typeof useAdminUrl> }) {
  const { refresh } = useAuth();
  const view = url.params.get('view') === 'requests' ? 'requests' : 'batches';
  const requestId = url.params.get('requestId');
  const requestOffset = adminOffset(url.params.get('requestsOffset')),
    batchOffset = adminOffset(url.params.get('batchesOffset'));
  const requests = useOperationalQuery<IrtRequestsDto>(
    `admin/irt/requests?limit=${ADMIN_PAGE_SIZE + 1}&offset=${requestOffset}`,
    token,
  );
  const batches = useOperationalQuery<IrtBatchHealthListDto>(
    `admin/irt/batch-health?limit=${ADMIN_PAGE_SIZE + 1}&offset=${batchOffset}`,
    token,
  );
  const options = useOperationalQuery<IrtOperationalOptionsDto>('admin/irt/options', token);
  const [denied, setDenied] = useState(false),
    [busy, setBusy] = useState(false),
    [creating, setCreating] = useState(false),
    [error, setError] = useState('');
  const [draftBatch, setDraftBatch] = useState<IrtBatchHealthDto | null>(null);
  const [model, setModel] = useState(''),
    [quality, setQuality] = useState('');
  const pending = useRef(false),
    epoch = useRef(0),
    keys = useRef(new Map<string, string>());
  const accessLost = Boolean(denied || requests.denied || batches.denied || options.denied);
  useEffect(() => {
    epoch.current++;
    setCreating(false);
    setBusy(false);
    setError('');
    setDraftBatch(null);
    setModel('');
    setQuality('');
    pending.current = false;
    keys.current.clear();
    return () => {
      epoch.current++;
    };
  }, [token, accessLost]);
  const currentBatch =
    batches.data?.items.find((batch) => batch.contextId === draftBatch?.contextId) ?? draftBatch;
  const configurations =
    options.data?.configurations.filter(
      (configuration) =>
        !configuration.contextId || configuration.contextId === currentBatch?.contextId,
    ) ?? [];
  const eligibleBatches =
    batches.data?.items
      .slice(0, ADMIN_PAGE_SIZE)
      .filter((batch) => batch.contextId && !batch.prepareBlockers.length) ?? [];
  function chooseBatch(batch: IrtBatchHealthDto | null) {
    if (batch?.contextId !== draftBatch?.contextId) {
      setModel('');
      setQuality('');
    }
    setDraftBatch(batch);
    setError('');
  }
  async function prepare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current || accessLost) return;
    const pins = [
      configurations.find((item) => item.approvalId === model && item.kind === 'IRT_MODEL'),
      configurations.find((item) => item.approvalId === quality && item.kind === 'QUALITY_GATE'),
    ];
    if (
      !currentBatch?.contextId ||
      currentBatch.prepareBlockers.length ||
      !options.data?.enabled ||
      pins.some((pin) => !pin)
    ) {
      setError(
        'Pilih batch tanpa kendala persiapan serta model dan quality gate yang masih disahkan.',
      );
      return;
    }
    const body = {
      contextId: currentBatch.contextId,
      configurationPins: pins.map((pin) => ({ approvalId: pin!.approvalId, digest: pin!.digest })),
    };
    const fingerprint = JSON.stringify(body),
      generation = epoch.current;
    const key = keys.current.get(fingerprint) ?? crypto.randomUUID();
    keys.current.set(fingerprint, key);
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      const result = await apiRequest<IrtRequestDto>('admin/irt/requests', token, {
        method: 'POST',
        headers: { 'Idempotency-Key': key },
        body: JSON.stringify(body),
      });
      if (generation !== epoch.current) return;
      keys.current.delete(fingerprint);
      setCreating(false);
      setDraftBatch(null);
      setModel('');
      setQuality('');
      requests.retry();
      batches.retry();
      url.update({ view: 'requests', requestId: result.id });
    } catch (cause) {
      if (generation !== epoch.current) return;
      if (adminAccessDenied(cause)) setDenied(true);
      setError(cause instanceof Error ? cause.message : 'Request belum dapat disiapkan.');
    } finally {
      if (generation === epoch.current) {
        pending.current = false;
        setBusy(false);
      }
    }
  }
  if (accessLost)
    return (
      <AdminMessage
        error
        message="Akses IRT telah berubah. Periksa kembali akun."
        retry={() => {
          setDenied(false);
          requests.retry();
          batches.retry();
          options.retry();
          void refresh();
        }}
      />
    );
  return (
    <div className="admin-irt-workspace">
      <div className="irt-toolbar">
        <nav className="irt-tabs" aria-label="Bagian IRT">
          <Button
            variant="ghost"
            aria-current={view === 'batches' ? 'page' : undefined}
            disabled={busy}
            onClick={() => url.update({ view: 'batches' })}
          >
            Batch & publikasi
          </Button>
          <Button
            variant="ghost"
            aria-current={view === 'requests' ? 'page' : undefined}
            disabled={busy}
            onClick={() => url.update({ view: 'requests' })}
          >
            Request analisis
          </Button>
        </nav>
        <Button
          disabled={busy || options.data?.enabled === false}
          onClick={() => {
            setError('');
            setCreating(true);
          }}
        >
          Siapkan request
        </Button>
      </div>
      <p className="irt-intro">
        Komputasi berhasil, evidence diadopsi, dan hasil terbit adalah status yang berbeda. Seluruh
        batas waktu ditampilkan dalam WIB.
      </p>
      {options.error && (
        <AdminMessage
          error
          message={`Pilihan konfigurasi belum dapat dimuat. ${options.error}`}
          retry={options.retry}
        />
      )}
      {options.data?.enabled === false && (
        <p className="irt-notice" role="status">
          Analisis IRT belum diaktifkan pada environment ini. Riwayat tetap dapat dibaca; persiapan,
          pengiriman ulang, dan adopsi menunggu aktivasi oleh pengelola.
        </p>
      )}
      {view === 'batches' ? (
        <section aria-labelledby="irt-batches-title">
          <header className="irt-section-heading">
            <div>
              <h2 id="irt-batches-title">Batch & kesiapan publikasi</h2>
              <p>Lima batch per halaman. Periksa kendala sebelum menyiapkan analisis.</p>
            </div>
            <Button variant="secondary" disabled={busy} onClick={batches.retry}>
              Perbarui batch
            </Button>
          </header>
          {batches.error ? (
            <AdminMessage error message={batches.error} retry={batches.retry} />
          ) : !batches.data ? (
            <AdminLoading message="Memuat batch..." />
          ) : !batches.data.items.length ? (
            <AdminMessage message="Belum ada batch pada halaman ini." />
          ) : (
            <div className="irt-batches">
              {batches.data.items.slice(0, ADMIN_PAGE_SIZE).map((batch) => (
                <IrtBatchCard
                  key={batch.id}
                  batch={batch}
                  disabled={busy || options.data?.enabled === false}
                  prepare={() => {
                    chooseBatch(batch);
                    setCreating(true);
                  }}
                />
              ))}
            </div>
          )}
          <AdminPagination
            label="Halaman batch"
            offset={batchOffset}
            hasNext={(batches.data?.items.length ?? 0) > ADMIN_PAGE_SIZE}
            disabled={busy || !batches.data}
            onChange={(offset) => url.update({ batchesOffset: offset || null })}
          />
        </section>
      ) : requestId ? (
        <IrtRequestDetail
          key={requestId}
          id={requestId}
          token={token}
          enabled={options.data?.enabled}
          title={
            batches.data?.items.find(
              (batch) =>
                batch.contextId ===
                requests.data?.items.find((request) => request.id === requestId)?.contextId,
            )?.title
          }
          onBack={() => url.update({ requestId: null })}
          onBatches={() => url.update({ view: 'batches' })}
          onRefresh={() => {
            requests.retry();
            batches.retry();
          }}
          onDenied={setDenied}
          onBusyChange={setBusy}
        />
      ) : (
        <section aria-labelledby="irt-requests-title">
          <header className="irt-section-heading">
            <div>
              <h2 id="irt-requests-title">Request analisis</h2>
              <p>Lima request per halaman. Detail menampilkan snapshot, evidence dan tindakan.</p>
            </div>
            <Button variant="secondary" disabled={busy} onClick={requests.retry}>
              Perbarui request
            </Button>
          </header>
          {requests.error ? (
            <AdminMessage error message={requests.error} retry={requests.retry} />
          ) : !requests.data ? (
            <AdminLoading message="Memuat request..." />
          ) : !requests.data.items.length ? (
            <AdminMessage message="Belum ada request pada halaman ini." />
          ) : (
            <ul className="irt-requests">
              {requests.data.items.slice(0, ADMIN_PAGE_SIZE).map((request) => (
                <IrtRequestRow
                  key={request.id}
                  request={request}
                  title={
                    batches.data?.items.find((batch) => batch.contextId === request.contextId)
                      ?.title
                  }
                  disabled={busy}
                  onOpen={() => url.update({ requestId: request.id })}
                />
              ))}
            </ul>
          )}
          <AdminPagination
            label="Halaman request"
            offset={requestOffset}
            hasNext={(requests.data?.items.length ?? 0) > ADMIN_PAGE_SIZE}
            disabled={busy || !requests.data}
            onChange={(offset) => url.update({ requestsOffset: offset || null })}
          />
        </section>
      )}
      <details className="irt-guide">
        <summary>Pahami alur analisis dan rilis</summary>
        <ol>
          <li>
            <strong>Siapkan request.</strong> Pilih batch tanpa kendala dan dua versi konfigurasi
            yang disahkan. Server membekukan input analisis.
          </li>
          <li>
            <strong>Pantau komputasi.</strong> Periksa request, execution dan kegagalan. Pengiriman
            ulang tetap memakai snapshot yang sama.
          </li>
          <li>
            <strong>Adopsi evidence.</strong> Server memvalidasi hasil ilmiah, provenance dan pin.
            Komputasi berhasil belum berarti evidence diterima.
          </li>
          <li>
            <strong>Periksa publikasi.</strong> Nilai serta pembahasan terbuka bersama setelah
            finalisasi terbit. Pengesahan Data/AI dan syarat rilis tetap berlaku.
          </li>
        </ol>
      </details>
      <Dialog
        open={creating}
        onClose={() => {
          if (!pending.current) setCreating(false);
        }}
        title="Siapkan request IRT"
        description="Buat snapshot analisis dengan konfigurasi yang sudah disahkan. Tindakan ini tidak memublikasikan hasil peserta."
        pending={busy}
        className="irt-prepare-dialog"
      >
        <form onSubmit={(event) => void prepare(event)} className="irt-prepare-form">
          {batches.error && <AdminMessage error message={batches.error} retry={batches.retry} />}
          {!batches.data && !batches.error && <p role="status">Memuat pilihan batch...</p>}
          <label>
            <span id="irt-context-label">Konteks batch</span>
            <select
              aria-labelledby="irt-context-label"
              aria-describedby="irt-context-hint"
              required
              value={currentBatch?.contextId ?? ''}
              disabled={busy}
              onChange={(event) =>
                chooseBatch(
                  event.target.value
                    ? (eligibleBatches.find((batch) => batch.contextId === event.target.value) ??
                        currentBatch)
                    : null,
                )
              }
            >
              <option value="">Pilih batch siap diproses</option>
              {currentBatch?.contextId &&
                !eligibleBatches.some((batch) => batch.contextId === currentBatch.contextId) && (
                  <option value={currentBatch.contextId}>{currentBatch.title}</option>
                )}
              {eligibleBatches.map((batch) => (
                <option key={batch.id} value={batch.contextId!}>
                  {batch.title}
                </option>
              ))}
            </select>
            <small id="irt-context-hint">
              Pilihan mengikuti halaman batch yang dibuka dan dipertahankan selama halaman ini
              terbuka.
            </small>
          </label>
          {currentBatch && (
            <p className="irt-muted">Tutup batch: {irtTime(currentBatch.closesAt)}</p>
          )}
          {batches.data && !eligibleBatches.length && !currentBatch && (
            <p className="irt-notice" role="status">
              Belum ada batch siap diproses pada halaman ini. Periksa kendala atau buka halaman
              batch berikutnya.
            </p>
          )}
          {options.error && <AdminMessage error message={options.error} retry={options.retry} />}
          {!options.data && !options.error && <p role="status">Memuat pilihan konfigurasi...</p>}
          {(['IRT_MODEL', 'QUALITY_GATE'] as const).map((kind) => {
            const available = configurations.filter((configuration) => configuration.kind === kind);
            const selected = available.find(
              (configuration) =>
                configuration.approvalId === (kind === 'IRT_MODEL' ? model : quality),
            );
            return (
              <label key={kind}>
                <span id={`irt-${kind}-label`}>
                  {kind === 'IRT_MODEL' ? 'Model IRT' : 'Quality gate'}
                </span>
                <select
                  aria-labelledby={`irt-${kind}-label`}
                  aria-describedby={`irt-${kind}-hint`}
                  required
                  disabled={busy || !currentBatch?.contextId}
                  value={kind === 'IRT_MODEL' ? model : quality}
                  onChange={(event) =>
                    (kind === 'IRT_MODEL' ? setModel : setQuality)(event.target.value)
                  }
                >
                  <option value="">Pilih versi yang disahkan</option>
                  {available.map((configuration) => (
                    <option key={configuration.approvalId} value={configuration.approvalId}>
                      {configuration.code} v{configuration.version} ·{' '}
                      {irtTime(configuration.approvedAt)}
                    </option>
                  ))}
                </select>
                <small id={`irt-${kind}-hint`}>
                  {currentBatch?.contextId && !available.length
                    ? 'Belum ada versi yang sesuai. Periksa pengesahan konfigurasi.'
                    : selected
                      ? `Disahkan ${irtTime(selected.approvedAt)}. Konfigurasi mengikuti konteks yang dipilih.`
                      : 'Hanya versi terkunci dan disahkan sesuai konteks yang ditampilkan.'}
                </small>
              </label>
            );
          })}
          {error && (
            <p className="irt-alert" role="alert">
              {error}
            </p>
          )}
          <div className="irt-form-actions">
            <Button variant="secondary" disabled={busy} onClick={() => setCreating(false)}>
              Tutup, simpan pilihan
            </Button>
            <Button
              type="submit"
              loading={busy}
              disabled={
                busy ||
                !options.data?.enabled ||
                !batches.data ||
                !currentBatch?.contextId ||
                !!currentBatch.prepareBlockers.length ||
                !model ||
                !quality
              }
            >
              Siapkan request IRT
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
