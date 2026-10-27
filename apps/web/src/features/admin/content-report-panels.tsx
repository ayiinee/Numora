'use client';
import { ContentText } from './content-payload';
import { questionFormat, contentStatusLabel } from './content-question-format';
import { Badge, Button } from '@tka/ui';
import Link from 'next/link';
import { AdminEditorForm } from './admin-presentation';
import { resolveReport } from './content-api';
import type { View } from './content-editor';
import { Field, field, type EditorProps, type Workbench } from './content-editor';

export function ServerFilters({
  audit = false,
  filters,
  onApply,
}: {
  audit?: boolean;
  filters: Record<string, string>;
  onApply: (filters: Record<string, string>) => void;
}) {
  function localDate(value?: string) {
    if (!value) return '';
    const date = new Date(value);
    return Number.isFinite(date.getTime())
      ? new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
      : '';
  }
  return (
    <form
      className="admin-content-form"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const next: Record<string, string> = {};
        for (const [key, value] of f)
          if (String(value).trim())
            next[key] = ['from', 'to'].includes(key)
              ? new Date(String(value)).toISOString()
              : String(value).trim();
        onApply(next);
      }}
    >
      {audit ? (
        <>
          <label>
            Aktor (UUID)
            <input name="actorId" defaultValue={filters.actorId ?? ''} />
          </label>
          <label>
            Aksi
            <input name="action" maxLength={120} defaultValue={filters.action ?? ''} />
          </label>
          <label>
            Jenis entitas
            <input name="entityType" maxLength={120} defaultValue={filters.entityType ?? ''} />
          </label>
        </>
      ) : (
        <label>
          Kategori laporan
          <input name="category" maxLength={100} defaultValue={filters.category ?? ''} />
        </label>
      )}
      <label>
        Dari waktu
        <input type="datetime-local" name="from" defaultValue={localDate(filters.from)} />
      </label>
      <label>
        Sampai waktu
        <input type="datetime-local" name="to" defaultValue={localDate(filters.to)} />
      </label>
      <Button>Terapkan filter server</Button>
    </form>
  );
}

export function Reports({
  data,
  token,
  busy,
  run,
  navigate,
  onFilter,
  filters,
}: EditorProps & {
  filters: Record<string, string>;
  navigate: (view: View) => void;
  onFilter: (filters: Record<string, string>) => void;
}) {
  type Report = Workbench['reports']['items'][number];
  const kind = (filters.kind ?? 'ALL') as Report['kind'] | 'ALL';
  const status = (filters.status ?? 'ALL') as Report['status'] | 'ALL';
  const visible = data.reports.items.filter(
    (report) =>
      (kind === 'ALL' || report.kind === kind) && (status === 'ALL' || report.status === status),
  );
  return (
    <section>
      <h2>Laporan soal dan video</h2>
      <p>
        Filter diterapkan server ke seluruh antrean. Detail target tidak bergantung pada halaman
        metadata.
      </p>
      <div className="admin-content-actions">
        <label>
          Jenis laporan
          <select
            aria-label="Jenis laporan"
            value={kind}
            onChange={(event) => {
              const next = event.target.value as typeof kind;
              const rest = { ...filters };
              delete rest.kind;
              onFilter({
                ...rest,
                ...(next !== 'ALL' ? { kind: next } : {}),
                ...(status !== 'ALL' ? { status } : {}),
              });
            }}
          >
            <option value="ALL">Semua jenis</option>
            <option value="QUESTION">Soal</option>
            <option value="VIDEO">Video</option>
          </select>
        </label>
        <label>
          Status laporan
          <select
            aria-label="Filter status laporan"
            value={status}
            onChange={(event) => {
              const next = event.target.value as typeof status;
              const rest = { ...filters };
              delete rest.status;
              onFilter({
                ...rest,
                ...(kind !== 'ALL' ? { kind } : {}),
                ...(next !== 'ALL' ? { status: next } : {}),
              });
            }}
          >
            <option value="ALL">Semua status</option>
            {(['OPEN', 'IN_REVIEW', 'RESOLVED', 'REJECTED'] as const).map((value) => (
              <option key={value} value={value}>
                {reportStatusLabel(value)}
              </option>
            ))}
          </select>
        </label>
        <span role="status">{visible.length} laporan ditampilkan</span>
      </div>
      <ServerFilters
        filters={filters}
        onApply={(next) =>
          onFilter({
            ...next,
            ...(kind !== 'ALL' ? { kind } : {}),
            ...(status !== 'ALL' ? { status } : {}),
          })
        }
      />
      {!data.reports.items.length ? (
        <p>Belum ada laporan pada halaman ini.</p>
      ) : !visible.length ? (
        <p>Tidak ada laporan yang cocok dengan filter ini.</p>
      ) : (
        <ul className="monitoring-list">
          {visible.map((report) => {
            return (
              <li
                key={`${report.kind}-${report.id}`}
                className="monitoring-notice admin-content-row"
                data-testid={`report-${report.id}`}
              >
                <div className="admin-report-heading">
                  <strong>{report.kind === 'QUESTION' ? 'Laporan soal' : 'Laporan video'}</strong>
                  <Badge
                    className="status-badge"
                    variant={
                      report.status === 'RESOLVED'
                        ? 'success'
                        : report.status === 'IN_REVIEW'
                          ? 'warning'
                          : report.status === 'OPEN'
                            ? 'primary'
                            : 'default'
                    }
                  >
                    {reportStatusLabel(report.status)}
                  </Badge>
                </div>
                <p>Kategori: {report.category}</p>
                <p>{report.details || 'Pelapor tidak menambahkan rincian.'}</p>
                <small>Diterima {new Date(report.reportedAt).toLocaleString('id-ID')}</small>
                <p>Buka detail untuk melihat target historis dan bukti snapshot.</p>
                {report.followUp && (
                  <p>
                    <strong>Tindak lanjut tersimpan:</strong> {report.followUp}
                  </p>
                )}
                <div className="admin-content-actions">
                  <Link href={`/admin/reports/${report.kind}/${report.id}`}>
                    Detail target & resolution
                  </Link>
                  <Button
                    type="button"
                    className="secondary-button"
                    disabled={busy}
                    onClick={() => navigate(report.kind === 'VIDEO' ? 'videos' : 'questions')}
                  >
                    {report.kind === 'VIDEO' ? 'Kelola metadata video' : 'Buka daftar soal'}
                  </Button>
                </div>
                <AdminEditorForm
                  busy={busy}
                  className="admin-content-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const form = new FormData(event.currentTarget);
                    void run(() =>
                      resolveReport(token, report.kind, report.id, {
                        status: field(form, 'status') as Report['status'],
                        followUp: field(form, 'followUp'),
                      }),
                    );
                  }}
                >
                  <Field label="Status tindak lanjut" name="status">
                    <select name="status" defaultValue={report.status}>
                      {(['OPEN', 'IN_REVIEW', 'RESOLVED', 'REJECTED'] as const).map((value) => (
                        <option key={value} value={value}>
                          {reportStatusLabel(value)}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Catatan tindak lanjut" name="followUp">
                    <textarea
                      name="followUp"
                      defaultValue={report.followUp ?? ''}
                      required
                      maxLength={2000}
                    />
                  </Field>
                  <small>{report.followUp?.length ?? 0}/2000 karakter tersimpan</small>
                  <Button type="submit" disabled={busy}>
                    Simpan status dan tindak lanjut
                  </Button>
                </AdminEditorForm>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function reportStatusLabel(status: 'OPEN' | 'IN_REVIEW' | 'RESOLVED' | 'REJECTED') {
  return {
    OPEN: 'Terbuka',
    IN_REVIEW: 'Sedang ditinjau',
    RESOLVED: 'Selesai ditindaklanjuti',
    REJECTED: 'Ditolak',
  }[status];
}

export function VerificationHistory({
  data,
  canReadAudit,
}: {
  data: Workbench;
  canReadAudit: boolean;
}) {
  return (
    <>
      <section>
        <h2>Verifikasi versi konten</h2>
        <p>
          Status dan metadata peninjauan ditampilkan dari API; layar ini tidak mengubah status
          sendiri.
        </p>
        {!data.versions.items.length && <p>Belum ada versi konten pada halaman ini.</p>}
        <ul className="monitoring-list">
          {data.versions.items.map((version) => (
            <li className="monitoring-notice admin-content-row" key={version.id}>
              <strong>
                <ContentText value={version.stem || 'Isi soal belum tersedia'} />
              </strong>
              <p>
                {questionFormat(version.questionType).label} · Versi {version.versionNumber} ·{' '}
                {contentStatusLabel(version.contentStatus)}
              </p>
              <details className="assessment-source">
                <summary>Identitas versi &amp; reviewer</summary>
                <p>Kode varian: {version.variantCode}</p>
                <p>Status keluarga: {contentStatusLabel(version.questionStatus)}</p>
                <p>Reviewer: {version.reviewedByUserId ?? 'Belum tercatat'}</p>
                <p>
                  Waktu review (WIB):{' '}
                  {version.reviewedAt
                    ? new Date(version.reviewedAt).toLocaleString('id-ID', {
                        timeZone: 'Asia/Jakarta',
                      })
                    : 'Belum ditinjau'}
                </p>
                <p>ID versi: {version.id}</p>
              </details>
              <Link href={`/admin/content/versions/${version.id}`}>Detail &amp; review versi</Link>
            </li>
          ))}
        </ul>
      </section>
      {canReadAudit && (
        <section>
          <h2>Riwayat perubahan Admin</h2>
          {!data.audit.items.length && <p>Belum ada riwayat pada halaman ini.</p>}
          <ul className="monitoring-list">
            {data.audit.items.map((entry) => (
              <li className="monitoring-notice admin-content-row" key={entry.id}>
                <strong>{entry.action}</strong>
                <p>
                  {entry.entityType} · {new Date(entry.createdAt).toLocaleString('id-ID')}
                </p>
                <small>
                  Entitas: {entry.entityId ?? 'Tidak tersedia'} · Aktor:{' '}
                  {entry.actorUserId ?? 'Tidak tersedia'}
                </small>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
