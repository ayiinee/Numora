'use client';
import { Badge, Button } from '@tka/ui';
import { useState } from 'react';
import { AdminEditorForm } from './admin-presentation';
import { resolveReport } from './content-api';
import { Field, field, type EditorProps, type Workbench } from './content-editor';
import type { View } from './content-editor';

export function Reports({
  data,
  token,
  busy,
  run,
  navigate,
}: EditorProps & { navigate: (view: View) => void }) {
  type Report = Workbench['reports']['items'][number];
  const [kind, setKind] = useState<Report['kind'] | 'ALL'>('ALL');
  const [status, setStatus] = useState<Report['status'] | 'ALL'>('ALL');
  const visible = data.reports.items.filter(
    (report) =>
      (kind === 'ALL' || report.kind === kind) && (status === 'ALL' || report.status === status),
  );
  return (
    <section>
      <h2>Laporan soal dan video</h2>
      <p>
        Daftar ini berisi laporan pada halaman yang dimuat. Filter tidak mengubah data di server.
      </p>
      <div className="admin-content-actions">
        <label>
          Jenis laporan
          <select
            aria-label="Jenis laporan"
            value={kind}
            onChange={(event) => setKind(event.target.value as typeof kind)}
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
            onChange={(event) => setStatus(event.target.value as typeof status)}
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
      {!data.reports.items.length ? (
        <p>Belum ada laporan pada halaman ini.</p>
      ) : !visible.length ? (
        <p>Tidak ada laporan yang cocok dengan filter ini.</p>
      ) : (
        <ul className="monitoring-list">
          {visible.map((report) => {
            const video =
              report.kind === 'VIDEO'
                ? data.videos.items.find((item) => item.mappingId === report.referenceId)
                : undefined;
            const subchapter = video
              ? data.curriculum.items.find((item) => item.id === video.subchapterId)
              : undefined;
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
                {report.kind === 'VIDEO' ? (
                  video ? (
                    <div>
                      <p>
                        Mapping: {video.title} · {video.source} · subbab{' '}
                        {subchapter?.name ?? video.subchapterId} · urutan{' '}
                        {video.recommendationOrder}
                      </p>
                      {video.url.startsWith('https://') ? (
                        <a href={video.url} target="_blank" rel="noreferrer">
                          Buka video terkait
                        </a>
                      ) : (
                        <p>URL mapping video belum menggunakan HTTPS.</p>
                      )}
                    </div>
                  ) : (
                    <p>Mapping video tidak ada pada halaman metadata yang sedang dimuat.</p>
                  )
                ) : (
                  <p>
                    Referensi jawaban/attempt: <code>{report.referenceId}</code>
                  </p>
                )}
                {report.followUp && (
                  <p>
                    <strong>Tindak lanjut tersimpan:</strong> {report.followUp}
                  </p>
                )}
                <div className="admin-content-actions">
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

export function reportStatusLabel(status: 'OPEN' | 'IN_REVIEW' | 'RESOLVED' | 'REJECTED') {
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
                {version.variantCode} · v{version.versionNumber} · {version.questionType}
              </strong>
              <p>
                Keluarga {version.questionStatus} · Versi {version.contentStatus}
              </p>
              <small>{version.stem || `Soal ${version.questionId}`}</small>
              <small>Reviewer: {version.reviewedByUserId ?? 'Belum tercatat'}</small>
              <small>
                Waktu review:{' '}
                {version.reviewedAt
                  ? new Date(version.reviewedAt).toLocaleString('id-ID')
                  : 'Belum ditinjau'}
              </small>
              <small>ID versi: {version.id}</small>
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
