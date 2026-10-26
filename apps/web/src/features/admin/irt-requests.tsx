'use client';
import { ADMIN_PAGE_SIZE } from './pagination';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Button, Card } from '@tka/ui';
import { useAuth } from '@/features/onboarding/auth';
import { apiRequest } from '@/lib/api';
import { AdminFrame, AdminLoading, AdminMessage } from './admin-presentation';
import { adminAccessDenied, useOperationalQuery } from './operational-query';
import type {
  IrtRequestDto,
  IrtRequestsDto,
  IrtOperationalOptionsDto,
  IrtBatchHealthListDto,
} from './generated-types';
const reasons: Record<string, string> = {
  CONFIGURATION_APPROVALS_MISSING: 'Model IRT dan quality gate yang disahkan belum lengkap.',
  IRT_DATASET_EMPTY: 'Belum ada attempt selesai untuk snapshot analisis.',
  IRT_V3_DISABLED: 'Compute belum diaktifkan pada environment ini.',
  MEASUREMENT_CONTEXT_MISSING: 'Konteks pengukuran belum tersedia dari handoff Data.',
  BATCH_NOT_CLOSED: 'Batch belum ditutup.',
  ATTEMPTS_NOT_FINALIZED: 'Ada attempt yang belum difinalisasi.',
  SCIENTIFIC_PACKAGE_NOT_FROZEN: 'Paket belum lolos freeze dan quality gate ilmiah.',
  RELEASE_POLICY_NOT_APPROVED: 'Policy rilis belum disahkan.',
  SEALED_RUBRIC_MISSING: 'Rubric sealed belum lengkap.',
  SCIENTIFIC_ARTIFACT_NOT_ADOPTED: 'Evidence ilmiah belum diterima dan diadopsi.',
  RESPONDENT_CONTRACT_NOT_APPROVED: 'Kontrak hasil peserta dan mapping menunggu pengesahan Data.',
};
const time = (value: string) =>
  new Date(value).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }) + ' WIB';
export function AdminIrtScreen() {
  const { state } = useAuth();
  const allowed =
    state.status === 'ready' &&
    state.profile.role === 'ADMIN' &&
    state.profile.status === 'ACTIVE' &&
    state.profile.capabilities?.includes('CONTENT_MANAGE');
  return (
    <AdminFrame
      title="Request IRT & publikasi"
      description="Pantau analisis Tryout, penerimaan hasil ilmiah, dan kesiapan rilis nilai serta pembahasan."
      icon="chart"
    >
      {state.status === 'loading' ? (
        <AdminLoading message="Memeriksa akses..." />
      ) : !allowed || state.status !== 'ready' ? (
        <AdminMessage error message="Akses Content diperlukan." login />
      ) : (
        <IrtPanel
          key={state.profile.id + state.profile.adminRole}
          token={state.session.access_token}
        />
      )}
    </AdminFrame>
  );
}
function IrtPanel({ token }: { token: string }) {
  const { refresh } = useAuth();
  const [denied, setDenied] = useState(false);
  const [requestOffset, setRequestOffset] = useState(0),
    [batchOffset, setBatchOffset] = useState(0),
    [contextId, setContextId] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [selected, setSelected] = useState<IrtRequestDto | null>(null);
  const keys = useRef(new Map<string, string>());
  const requests = useOperationalQuery<IrtRequestsDto>(
    `admin/irt/requests?limit=${ADMIN_PAGE_SIZE + 1}&offset=${requestOffset}`,
    token,
  );
  const batches = useOperationalQuery<IrtBatchHealthListDto>(
    `admin/irt/batch-health?limit=${ADMIN_PAGE_SIZE + 1}&offset=${batchOffset}`,
    token,
  );
  const options = useOperationalQuery<IrtOperationalOptionsDto>('admin/irt/options', token);
  const accessLost = denied || requests.denied || batches.denied || options.denied;
  useEffect(() => {
    if (accessLost) setSelected(null);
  }, [accessLost]);
  const configurations =
    options.data?.configurations.filter((c) => !c.contextId || c.contextId === contextId) ?? [];
  async function mutation(path: string, body?: object) {
    if (busy) return;
    setBusy(true);
    setError('');
    const fingerprint = path + JSON.stringify(body ?? null);
    let key = keys.current.get(fingerprint);
    if (!key) {
      key = crypto.randomUUID();
      keys.current.set(fingerprint, key);
    }
    try {
      const result = await apiRequest<IrtRequestDto>(path, token, {
        method: 'POST',
        headers: { 'Idempotency-Key': key },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      setSelected(result);
      keys.current.delete(fingerprint);
      requests.retry();
      batches.retry();
    } catch (e) {
      if (adminAccessDenied(e)) setDenied(true);
      setError(e instanceof Error ? e.message : 'Permintaan gagal.');
    } finally {
      setBusy(false);
    }
  }
  function prepare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const pins = ['model', 'quality'].map((name) =>
      configurations.find((c) => c.approvalId === form.get(name)),
    );
    if (pins.some((p) => !p) || !contextId) {
      setError('Pilih konteks dan dua versi konfigurasi yang disahkan.');
      return;
    }
    void mutation('admin/irt/requests', {
      contextId,
      configurationPins: pins.map((pin) => ({ approvalId: pin!.approvalId, digest: pin!.digest })),
    });
  }
  async function detail(id: string) {
    if (busy) return;
    setSelected(null);
    setError('');
    setBusy(true);
    try {
      setSelected(await apiRequest<IrtRequestDto>(`admin/irt/requests/${id}`, token));
    } catch (e) {
      if (adminAccessDenied(e)) setDenied(true);
      setError(e instanceof Error ? e.message : 'Detail gagal dimuat.');
    } finally {
      setBusy(false);
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
    <div className="admin-content page-stack">
      <ol className="content-workflow" aria-label="Alur analisis dan rilis">
        {[
          ['Siapkan analisis', 'Pilih batch dan konfigurasi yang sudah disahkan.'],
          ['Jalankan compute', 'Pantau execution, kegagalan, dan percobaan ulang.'],
          ['Terima hasil ilmiah', 'Adopsi memerlukan evidence yang lolos pemeriksaan.'],
          [
            'Rilis ke peserta',
            'Nilai dan pembahasan dibuka bersama setelah seluruh syarat terpenuhi.',
          ],
        ].map(([title, description], index) => (
          <li key={title}>
            <span className="content-step-number" aria-hidden="true">
              0{index + 1}
            </span>
            <h3>{title}</h3>
            <p>{description}</p>
          </li>
        ))}
      </ol>
      <p className="admin-context-note">
        Nilai dan pembahasan hanya terbuka setelah finalisasi hasil dipublikasikan. Execution
        SUCCEEDED belum berarti rilis peserta.
      </p>
      {error && <p role="alert">{error}</p>}
      <Card>
        <h2>Siapkan request</h2>
        {options.error && <AdminMessage error message={options.error} retry={options.retry} />}
        {!options.data && !options.error && <p role="status">Memuat pilihan konfigurasi...</p>}
        {options.data && !options.data.enabled && <p role="status">{reasons.IRT_V3_DISABLED}</p>}
        <form onSubmit={prepare} className="admin-content-form">
          <label className="admin-content-field">
            <span>Konteks batch</span>
            <select required value={contextId} onChange={(e) => setContextId(e.target.value)}>
              <option value="">Pilih batch siap diproses</option>
              {batches.data?.items
                .filter((b) => b.contextId && !b.prepareBlockers.length)
                .map((b) => (
                  <option key={b.id} value={b.contextId!}>
                    {b.title} - tutup {time(b.closesAt)}
                  </option>
                ))}
            </select>
          </label>
          {(['model', 'quality'] as const).map((name) => (
            <label key={name} className="admin-content-field">
              <span>{name === 'model' ? 'Model IRT' : 'Quality gate'}</span>
              <select required name={name} key={contextId + name}>
                <option value="">Pilih versi sealed yang disahkan</option>
                {configurations
                  .filter((c) => c.kind === (name === 'model' ? 'IRT_MODEL' : 'QUALITY_GATE'))
                  .map((c) => (
                    <option key={c.approvalId} value={c.approvalId}>
                      {c.code} v{c.version} - disahkan {time(c.approvedAt)}
                    </option>
                  ))}
              </select>
            </label>
          ))}
          <Button type="submit" disabled={busy || !options.data?.enabled}>
            Siapkan request IRT
          </Button>
        </form>
        {batches.data &&
          !batches.data.items.some((b) => b.contextId && !b.prepareBlockers.length) && (
            <p role="status">Belum ada batch siap diproses. Periksa blocker batch di bawah.</p>
          )}
      </Card>
      <Card>
        <h2>Request dan execution</h2>
        <Button onClick={requests.retry}>Perbarui request</Button>
        {requests.error ? (
          <AdminMessage error message={requests.error} retry={requests.retry} />
        ) : !requests.data ? (
          <AdminLoading message="Memuat request..." />
        ) : !requests.data.items.length ? (
          <p>Belum ada request pada halaman ini.</p>
        ) : (
          <ul className="monitoring-list">
            {requests.data.items.slice(0, ADMIN_PAGE_SIZE).map((r) => (
              <li key={r.id} className="admin-content-row">
                <Button disabled={busy} onClick={() => void detail(r.id)}>
                  Detail request {r.id}
                </Button>
                <p>
                  {r.status} - generation {r.dispatchGeneration} - execution{' '}
                  {r.execution?.status ?? 'belum dimulai'}
                </p>
                <p>
                  Batas {time(r.dueAt)} {r.overdue ? ' - overdue execution/adoption' : ''}
                </p>
                {r.failureCode && <p>{r.failureCode}</p>}
              </li>
            ))}
          </ul>
        )}
        <Pagination
          offset={requestOffset}
          count={requests.data?.items.length ?? 0}
          setOffset={setRequestOffset}
        />
      </Card>
      {selected && (
        <Card>
          <h2>Detail request</h2>
          <p style={{ overflowWrap: 'anywhere' }}>{selected.id}</p>
          <p>
            Snapshot {selected.rowCount} item respons - generation {selected.dispatchGeneration}
          </p>
          <p>
            Execution: {selected.execution?.status ?? 'belum dimulai'} - percobaan{' '}
            {selected.execution?.attemptNumber ?? 0}
            {selected.execution?.leaseExpired ? ' - lease expired' : ''}
          </p>
          <p>
            Adoption: {selected.acceptedExecutionId ? 'diterima' : 'belum diterima'}. Publication
            diperiksa terpisah pada batch.
          </p>
          <details>
            <summary>Pin konfigurasi dan digest</summary>
            <p style={{ overflowWrap: 'anywhere' }}>
              Input {selected.inputDigest}
              <br />
              Snapshot {selected.snapshotDigest}
            </p>
            <ul>
              {selected.configurationPins.map((p) => (
                <li key={p.approvalId} style={{ overflowWrap: 'anywhere' }}>
                  {p.approvalId}: {p.digest}
                </li>
              ))}
            </ul>
          </details>
          <ul>
            {selected.artifacts.map((a) => (
              <li key={a.id} style={{ overflowWrap: 'anywhere' }}>
                Scientific decision: {a.scientificDecision} - artifact {a.id} - {a.digest}
              </li>
            ))}
          </ul>
          {selected.execution?.failureCode && <p role="alert">{selected.execution.failureCode}</p>}
          <div className="admin-content-actions">
            <Button disabled={busy} onClick={() => void detail(selected.id)}>
              Perbarui detail
            </Button>
            <Button
              disabled={
                busy ||
                !!selected.acceptedExecutionId ||
                !(
                  selected.status === 'FAILED' ||
                  selected.execution?.status === 'FAILED' ||
                  selected.execution?.leaseExpired
                )
              }
              onClick={() => void mutation(`admin/irt/requests/${selected.id}/retry`)}
            >
              Retry request
            </Button>
            <Button
              disabled={
                busy || !!selected.acceptedExecutionId || selected.execution?.status !== 'SUCCEEDED'
              }
              onClick={() => void mutation(`admin/irt/requests/${selected.id}/adopt`)}
            >
              Adopsi evidence
            </Button>
          </div>
        </Card>
      )}
      <Card>
        <h2>Batch dan SLA rilis 72 jam</h2>
        <Button onClick={batches.retry}>Perbarui batch</Button>
        {batches.error ? (
          <AdminMessage error message={batches.error} retry={batches.retry} />
        ) : !batches.data ? (
          <AdminLoading message="Memuat batch..." />
        ) : !batches.data.items.length ? (
          <p>Belum ada batch pada halaman ini.</p>
        ) : (
          <ul className="monitoring-list">
            {batches.data.items.slice(0, ADMIN_PAGE_SIZE).map((b) => (
              <li className="admin-content-row" key={b.id}>
                <h3>{b.title}</h3>
                <p>
                  {b.status} - {b.finalizedAttemptCount} attempt selesai, {b.activeAttemptCount}{' '}
                  belum final
                </p>
                <p>
                  Tutup {time(b.closesAt)} - batas rilis {time(b.dueAt)}
                </p>
                {b.overdue && <p role="alert">SLA 72 jam terlewati; hasil belum dipublikasikan.</p>}
                <p>
                  {b.publishedAt
                    ? `Published ${b.publicationMode} v${b.publicationVersion} pada ${time(b.publishedAt)}`
                    : 'Hasil peserta belum dipublikasikan.'}
                </p>
                <details open={b.prepareBlockers.length > 0 || b.publicationBlockers.length > 0}>
                  <summary>Blocker persiapan dan publikasi</summary>
                  <h4>Persiapan request</h4>
                  <ul>
                    {b.prepareBlockers.map((code) => (
                      <li key={code}>{reasons[code] ?? code}</li>
                    ))}
                  </ul>
                  <h4>Publikasi hasil</h4>
                  <ul>
                    {b.publicationBlockers.map((code) => (
                      <li key={code}>{reasons[code] ?? code}</li>
                    ))}
                  </ul>
                </details>
              </li>
            ))}
          </ul>
        )}
        <Pagination
          offset={batchOffset}
          count={batches.data?.items.length ?? 0}
          setOffset={setBatchOffset}
        />
      </Card>
    </div>
  );
}
function Pagination({
  offset,
  count,
  setOffset,
}: {
  offset: number;
  count: number;
  setOffset: (n: number) => void;
}) {
  return (
    <nav aria-label="Halaman data" className="admin-content-actions">
      <Button disabled={!offset} onClick={() => setOffset(Math.max(0, offset - ADMIN_PAGE_SIZE))}>
        Sebelumnya
      </Button>
      <span>Halaman {offset / ADMIN_PAGE_SIZE + 1}</span>
      <Button
        disabled={count <= ADMIN_PAGE_SIZE}
        onClick={() => setOffset(offset + ADMIN_PAGE_SIZE)}
      >
        Berikutnya
      </Button>
    </nav>
  );
}
