import { Button } from '@tka/ui';
import type { IrtBatchHealthDto, IrtRequestDto } from './generated-types';
import { irtReason, irtReference, irtStatus, irtTime } from './irt-model';

export function IrtStatus({ code }: { code: string }) {
  const status = irtStatus(code);
  return <span className={`irt-status is-${status.tone}`}>{status.label}</span>;
}
export function IrtBlockers({ codes, empty }: { codes: string[]; empty: string }) {
  return codes.length ? (
    <ul className="irt-blockers">
      {codes.map((code) => {
        const reason = irtReason(code);
        return (
          <li key={code}>
            <strong>{reason.label}</strong>
            <p>{reason.next}</p>
            {reason.label !== code && (
              <details>
                <summary>Kode dari server</summary>
                <code>{code}</code>
              </details>
            )}
          </li>
        );
      })}
    </ul>
  ) : (
    <p className="irt-muted">{empty}</p>
  );
}
export function IrtBatchCard({
  batch,
  prepare,
  disabled,
}: {
  batch: IrtBatchHealthDto;
  prepare: () => void;
  disabled: boolean;
}) {
  const firstPrepareBlocker = batch.prepareBlockers[0];
  const firstBlocker = firstPrepareBlocker ?? batch.publicationBlockers[0];
  return (
    <article className="irt-batch" data-batch={batch.id}>
      <header>
        <div>
          <h3>{batch.title}</h3>
          <div className="irt-row-meta">
            <IrtStatus code={batch.status} />
            <span className={`irt-status is-${batch.publishedAt ? 'success' : 'neutral'}`}>
              {batch.publishedAt ? 'Hasil terbit' : 'Belum dipublikasikan'}
            </span>
            {batch.overdue && <span className="irt-status is-warning">Melewati 72 jam</span>}
          </div>
        </div>
        <Button
          variant="secondary"
          disabled={disabled || !batch.contextId || batch.prepareBlockers.length > 0}
          onClick={prepare}
        >
          Siapkan analisis
        </Button>
      </header>
      <dl className="irt-batch-facts">
        <div>
          <dt>Jadwal tutup</dt>
          <dd>
            <time dateTime={batch.closesAt}>{irtTime(batch.closesAt)}</time>
          </dd>
        </div>
        <div>
          <dt>Batas rilis hasil</dt>
          <dd>
            <time dateTime={batch.dueAt}>{irtTime(batch.dueAt)}</time>
          </dd>
        </div>
        <div>
          <dt>Pengerjaan</dt>
          <dd>
            {batch.finalizedAttemptCount.toLocaleString('id-ID')} final ·{' '}
            {batch.activeAttemptCount.toLocaleString('id-ID')} belum final
          </dd>
        </div>
      </dl>
      {batch.overdue && (
        <p className="irt-alert">SLA 72 jam terlewati; hasil belum dipublikasikan.</p>
      )}
      {batch.publishedAt ? (
        <p className="irt-published">
          Terbit <time dateTime={batch.publishedAt}>{irtTime(batch.publishedAt)}</time> · Mode{' '}
          {batch.publicationMode ?? 'belum tercatat'} · Versi{' '}
          {batch.publicationVersion ?? 'belum tercatat'}
        </p>
      ) : (
        firstBlocker && (
          <p className="irt-blocker-preview">
            <strong>{firstPrepareBlocker ? 'Persiapan tertahan:' : 'Rilis tertahan:'}</strong>{' '}
            {irtReason(firstBlocker).label}
          </p>
        )
      )}
      <details className="irt-batch-details">
        <summary>
          Rincian kesiapan{' '}
          <span>
            {batch.prepareBlockers.length} kendala persiapan · {batch.publicationBlockers.length}{' '}
            kendala rilis
          </span>
        </summary>
        <div className="irt-readiness">
          <section>
            <h4>Persiapan analisis</h4>
            <IrtBlockers
              codes={batch.prepareBlockers}
              empty="Tidak ada kendala persiapan yang dilaporkan server."
            />
          </section>
          <section>
            <h4>Publikasi hasil peserta</h4>
            <IrtBlockers
              codes={batch.publicationBlockers}
              empty={
                batch.publishedAt
                  ? 'Hasil sudah dipublikasikan.'
                  : 'Tidak ada kendala yang dilaporkan. Status publikasi tetap mengikuti server.'
              }
            />
          </section>
        </div>
        <details className="irt-technical">
          <summary>Identitas batch</summary>
          <dl>
            <div>
              <dt>ID batch</dt>
              <dd>{batch.id}</dd>
            </div>
            <div>
              <dt>ID paket</dt>
              <dd>{batch.packageId}</dd>
            </div>
            <div>
              <dt>Konteks</dt>
              <dd>{batch.contextId ?? 'Belum tersedia'}</dd>
            </div>
          </dl>
        </details>
      </details>
    </article>
  );
}
export function IrtRequestRow({
  request,
  title,
  onOpen,
  disabled,
}: {
  request: IrtRequestDto;
  title: string | undefined;
  onOpen: () => void;
  disabled: boolean;
}) {
  return (
    <li className="irt-request-row" data-request={request.id}>
      <div>
        <h3>{title ?? `Request ${irtReference(request.id)}`}</h3>
        <p className="irt-muted">
          Referensi {irtReference(request.id)} · Pengiriman ke-{request.dispatchGeneration}
        </p>
        <div className="irt-row-meta">
          <IrtStatus code={request.status} />
          <span>
            {request.execution
              ? irtStatus(request.execution.status).label
              : 'Komputasi belum dimulai'}
          </span>
          <span>{request.acceptedExecutionId ? 'Evidence diadopsi' : 'Belum diadopsi'}</span>
        </div>
        <p className="irt-request-deadline">
          Batas analisis <time dateTime={request.dueAt}>{irtTime(request.dueAt)}</time>
          {request.overdue && <strong> · Melewati batas analisis/adopsi</strong>}
        </p>
        {request.failureCode && <p className="irt-alert">{irtReason(request.failureCode).label}</p>}
      </div>
      <Button
        variant="secondary"
        disabled={disabled}
        aria-label={`Detail request ${request.id}`}
        onClick={onOpen}
      >
        Lihat detail
      </Button>
    </li>
  );
}
