'use client';
import { useEffect, useRef, useState } from 'react';
import { Button, Dialog } from '@tka/ui';
import { apiRequest } from '@/lib/api';
import type { IrtRequestDto } from './generated-types';
import { AdminLoading, AdminMessage } from './admin-presentation';
import { adminAccessDenied, useOperationalQuery } from './operational-query';
import { irtCanAdopt, irtCanRetry, irtReason, irtReference, irtTime } from './irt-model';
import { IrtStatus } from './irt-presentation';

export function IrtRequestDetail({
  id,
  token,
  enabled,
  title,
  onBack,
  onBatches,
  onRefresh,
  onDenied,
  onBusyChange,
}: {
  id: string;
  token: string;
  enabled: boolean | undefined;
  title: string | undefined;
  onBack: () => void;
  onBatches: () => void;
  onRefresh: () => void;
  onDenied: (denied: boolean) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const query = useOperationalQuery<IrtRequestDto>(
    `admin/irt/requests/${encodeURIComponent(id)}`,
    token,
  );
  const [receipt, setReceipt] = useState<IrtRequestDto>();
  const [action, setAction] = useState<'retry' | 'adopt' | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const pending = useRef(false),
    epoch = useRef(0),
    keys = useRef(new Map<string, string>());
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    epoch.current++;
    setReceipt(undefined);
    setAction(null);
    setError('');
    setBusy(false);
    pending.current = false;
    keys.current.clear();
    return () => {
      epoch.current++;
      onBusyChange(false);
    };
  }, [token, onBusyChange]);
  useEffect(() => {
    if (query.denied) onDenied(true);
  }, [query.denied, onDenied]);
  useEffect(() => {
    if (query.data?.id) heading.current?.focus();
  }, [query.data?.id]);
  const current = receipt ?? query.data;
  async function mutate() {
    if (!current || !action || pending.current || enabled === false) return;
    if (action === 'retry' ? !irtCanRetry(current) : !irtCanAdopt(current)) return;
    pending.current = true;
    setBusy(true);
    onBusyChange(true);
    setError('');
    const generation = epoch.current;
    const path = `admin/irt/requests/${encodeURIComponent(current.id)}/${action}`;
    const key = keys.current.get(path) ?? crypto.randomUUID();
    keys.current.set(path, key);
    try {
      const result = await apiRequest<IrtRequestDto>(path, token, {
        method: 'POST',
        headers: { 'Idempotency-Key': key },
      });
      if (generation !== epoch.current) return;
      keys.current.delete(path);
      setReceipt(result);
      setAction(null);
      onRefresh();
    } catch (cause) {
      if (generation !== epoch.current) return;
      if (adminAccessDenied(cause)) onDenied(true);
      setError(cause instanceof Error ? cause.message : 'Tindakan belum dapat diselesaikan.');
    } finally {
      if (generation === epoch.current) {
        pending.current = false;
        setBusy(false);
        onBusyChange(false);
      }
    }
  }
  function refresh() {
    if (!pending.current) {
      setReceipt(undefined);
      setError('');
      query.retry();
    }
  }
  if (query.denied) return null;
  return (
    <section className="irt-detail" aria-label="Detail request">
      <Button variant="ghost" disabled={busy} onClick={onBack}>
        Kembali ke daftar request
      </Button>
      {query.error ? (
        <AdminMessage error message={query.error} retry={refresh} />
      ) : !current ? (
        <AdminLoading message="Memuat detail request..." />
      ) : (
        <>
          <header className="irt-section-heading">
            <div>
              <h2 ref={heading} tabIndex={-1}>
                Detail request
              </h2>
              <p>{title ?? `Request ${irtReference(current.id)}`}</p>
            </div>
            <Button variant="secondary" disabled={busy} onClick={refresh}>
              Perbarui detail
            </Button>
          </header>
          <div className="irt-detail-surface">
            <dl className="irt-states">
              <div>
                <dt>Request</dt>
                <dd>
                  <IrtStatus code={current.status} />
                </dd>
              </div>
              <div>
                <dt>Komputasi</dt>
                <dd>
                  {current.execution ? (
                    <IrtStatus code={current.execution.status} />
                  ) : (
                    'Belum dimulai'
                  )}
                </dd>
              </div>
              <div>
                <dt>Adopsi evidence</dt>
                <dd>{current.acceptedExecutionId ? 'Sudah diadopsi' : 'Belum diadopsi'}</dd>
              </div>
            </dl>
            <dl className="irt-detail-facts">
              <div>
                <dt>Baris respons snapshot</dt>
                <dd>{current.rowCount.toLocaleString('id-ID')}</dd>
              </div>
              <div>
                <dt>Pengiriman</dt>
                <dd>Ke-{current.dispatchGeneration}</dd>
              </div>
              <div>
                <dt>Percobaan komputasi</dt>
                <dd>{current.execution?.attemptNumber ?? 0}</dd>
              </div>
              <div>
                <dt>Batas analisis/adopsi</dt>
                <dd>
                  <time dateTime={current.dueAt}>{irtTime(current.dueAt)}</time>
                </dd>
              </div>
            </dl>
            <p className="irt-muted">
              Baris snapshot adalah data respons untuk analisis, bukan jumlah soal atau peserta
              unik.
            </p>
            {current.overdue && (
              <p className="irt-alert">
                Batas analisis/adopsi terlewati. Batas rilis peserta diperiksa terpisah pada batch.
              </p>
            )}
            {current.execution?.leaseExpired && (
              <p className="irt-alert">
                Masa kerja komputasi telah habis. Periksa kelayakan pengiriman ulang.
              </p>
            )}
            {[
              ...new Set(
                [current.failureCode, current.execution?.failureCode].filter(
                  (code): code is string => !!code,
                ),
              ),
            ].map((code) => (
              <p className="irt-alert" key={code}>
                {irtReason(code).label}
              </p>
            ))}
            <div className="irt-next-action">
              <div>
                <h3>Tindakan berikutnya</h3>
                <p>
                  {current.acceptedExecutionId
                    ? 'Evidence sudah diadopsi. Periksa status publikasi pada batch; hasil peserta tidak otomatis terbuka.'
                    : current.status === 'CANCELLED'
                      ? 'Request dibatalkan. Pengiriman ulang dan adopsi tidak tersedia pada request ini.'
                      : current.status === 'COMPLETED'
                        ? 'Request selesai. Periksa evidence serta status publikasi pada batch.'
                        : irtCanAdopt(current)
                          ? 'Komputasi berhasil. Tinjau evidence dan pin sebelum meminta adopsi kepada server.'
                          : irtCanRetry(current)
                            ? 'Request atau komputasi gagal, atau masa kerjanya habis. Pengiriman ulang memakai snapshot yang sama.'
                            : 'Tunggu pembaruan proses. Gunakan Perbarui detail untuk membaca status terbaru.'}
                </p>
              </div>
              <div className="irt-actions">
                <Button
                  variant="secondary"
                  disabled={busy || enabled === false || !irtCanRetry(current)}
                  onClick={() => {
                    setError('');
                    setAction('retry');
                  }}
                >
                  Kirim ulang request
                </Button>
                <Button
                  disabled={busy || enabled === false || !irtCanAdopt(current)}
                  onClick={() => {
                    setError('');
                    setAction('adopt');
                  }}
                >
                  Adopsi evidence
                </Button>
              </div>
            </div>
            <div className="irt-release-note">
              <strong>Adopsi berbeda dari publikasi.</strong>
              <p>
                Nilai dan pembahasan hanya terbuka setelah finalisasi dipublikasikan oleh proses
                server. Halaman ini tidak menyediakan rilis paksa.
              </p>
              <Button variant="ghost" disabled={busy} onClick={onBatches}>
                Lihat batch & publikasi
              </Button>
            </div>
          </div>
          <section className="irt-detail-surface">
            <h3>Evidence ilmiah</h3>
            {current.artifacts.length ? (
              <ul className="irt-artifacts">
                {current.artifacts.map((artifact) => (
                  <li key={artifact.id}>
                    <strong>Keputusan ilmiah: {artifact.scientificDecision}</strong>
                    <details>
                      <summary>Identitas evidence</summary>
                      <dl>
                        <div>
                          <dt>Artifact</dt>
                          <dd>{artifact.id}</dd>
                        </div>
                        <div>
                          <dt>Digest</dt>
                          <dd>{artifact.digest}</dd>
                        </div>
                      </dl>
                    </details>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="irt-muted">Belum ada evidence yang dilaporkan pada request ini.</p>
            )}
          </section>
          <details className="irt-detail-surface irt-technical">
            <summary>Pin konfigurasi & identitas teknis</summary>
            <h3>Pin konfigurasi</h3>
            <ul>
              {current.configurationPins.map((pin) => (
                <li key={pin.approvalId}>
                  <dl>
                    <div>
                      <dt>Approval</dt>
                      <dd>{pin.approvalId}</dd>
                    </div>
                    <div>
                      <dt>Digest</dt>
                      <dd>{pin.digest}</dd>
                    </div>
                  </dl>
                </li>
              ))}
            </ul>
            <h3>Identitas request</h3>
            <dl>
              {[
                ['Request', current.id],
                ['Paket', current.packageId],
                ['Konteks', current.contextId],
                ['Snapshot', current.snapshotId],
                ['Input digest', current.inputDigest],
                ['Snapshot digest', current.snapshotDigest],
                ['Versi kontrak', current.contractVersion],
                ['Execution', current.execution?.id ?? 'Belum tersedia'],
                ['Execution diadopsi', current.acceptedExecutionId ?? 'Belum diadopsi'],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          </details>
          <Dialog
            open={action !== null}
            onClose={() => {
              if (!pending.current) {
                setAction(null);
                setError('');
              }
            }}
            pending={busy}
            title={action === 'retry' ? 'Kirim ulang request?' : 'Adopsi evidence ilmiah?'}
            description={
              action === 'retry'
                ? 'Minta pengiriman baru untuk snapshot yang sama. Server memeriksa kelayakan dan mencegah pengiriman ganda.'
                : 'Minta server memvalidasi dan mengadopsi evidence komputasi saat ini. Tindakan ini tidak memublikasikan hasil peserta.'
            }
            className="irt-action-dialog"
            actions={
              <>
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() => {
                    setAction(null);
                    setError('');
                  }}
                >
                  Batal
                </Button>
                <Button loading={busy} disabled={busy} onClick={() => void mutate()}>
                  {action === 'retry' ? 'Konfirmasi kirim ulang' : 'Konfirmasi adopsi'}
                </Button>
              </>
            }
          >
            <dl className="irt-confirm-facts">
              <div>
                <dt>Request</dt>
                <dd>{current.id}</dd>
              </div>
              <div>
                <dt>Snapshot</dt>
                <dd>{current.snapshotDigest}</dd>
              </div>
              {action === 'adopt' && (
                <div>
                  <dt>Execution</dt>
                  <dd>{current.execution?.id}</dd>
                </div>
              )}
            </dl>
            {error && (
              <p className="irt-alert" role="alert">
                {error}
              </p>
            )}
          </Dialog>
        </>
      )}
    </section>
  );
}
