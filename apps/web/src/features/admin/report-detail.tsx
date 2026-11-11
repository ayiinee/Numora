'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { adminAccessDenied } from './operational-query';
import { Button, Card } from '@tka/ui';
import { apiRequest } from '@/lib/api';
import { useAuth } from '@/features/onboarding/auth';
import { AdminFrame, AdminLoading, AdminMessage } from './admin-presentation';
import { resolveReport } from './content-api';
import { reportStatusLabel } from './content-report-panels';
import { ContentPayload } from './content-payload';
import type { AdminReportDetailDto, ResolveReportDto } from './generated-types';

const videoStatuses = ['OPEN', 'IN_REVIEW', 'RESOLVED', 'REJECTED'] as const;
const reviewStatus = ['IN_REVIEW'] as const;
const closingStatuses = ['RESOLVED', 'REJECTED'] as const;

function formatDate(value: string) {
  return `${new Date(value).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB`;
}
export function ReportDetailScreen({ kind, id }: { kind: 'QUESTION' | 'VIDEO'; id: string }) {
  const { state } = useAuth();
  return (
    <Detail
      key={
        (state.status === 'ready'
          ? state.profile.id + ':' + state.profile.adminRole
          : state.status) +
        ':' +
        kind +
        ':' +
        id
      }
      kind={kind}
      id={id}
    />
  );
}
function Detail({ kind, id }: { kind: 'QUESTION' | 'VIDEO'; id: string }) {
  const { state } = useAuth();
  const token =
    state.status === 'ready' &&
    state.profile.role === 'ADMIN' &&
    state.profile.status === 'ACTIVE' &&
    state.profile.capabilities?.includes('CONTENT_MANAGE')
      ? state.session.access_token
      : null;
  const [data, setData] = useState<AdminReportDetailDto | null>(null),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!token) return;
    let active = true;
    setData(null);
    setError('');
    setLoading(true);
    apiRequest<AdminReportDetailDto>(`admin/reports/${kind}/${encodeURIComponent(id)}`, token).then(
      (d) => {
        if (active) {
          setData(d);
          setLoading(false);
        }
      },
      (e) => {
        if (active) {
          setError(e.message);
          setLoading(false);
        }
      },
    );
    return () => {
      active = false;
    };
  }, [token, kind, id, revision]);
  return (
    <AdminFrame
      title="Detail laporan"
      description="Target berdasarkan versi atau snapshot saat dilaporkan."
      icon="chat"
      management
    >
      <Link className="assessment-back-link" href="/admin/content?view=reports">
        Kembali ke daftar laporan
      </Link>
      {!token ? (
        <AdminMessage message="Akses moderasi diperlukan." login />
      ) : (
        <>
          {error && <AdminMessage error message={error} retry={() => setRevision((r) => r + 1)} />}
          {loading ? (
            <AdminLoading message="Memuat target laporan…" />
          ) : (
            data && (
              <Card className="content-import-card">
                <h2>{kind === 'QUESTION' ? 'Kasus laporan soal' : data.category}</h2>
                {kind === 'VIDEO' && <p>{data.details || 'Tanpa rincian tambahan.'}</p>}
                <p>
                  {reportStatusLabel(data.status, kind)} ·{' '}
                  {kind === 'QUESTION'
                    ? `${data.reportCount} laporan`
                    : formatDate(data.reportedAt)}
                </p>
                {data.question && (
                  <>
                    <Link href={`/admin/content/versions/${data.question.id}`}>
                      Buka versi yang dilaporkan (v{data.question.versionNumber},{' '}
                      {data.question.status})
                    </Link>
                    <ContentPayload payload={data.question.payload} />
                  </>
                )}
                {data.video && (
                  <>
                    <h3>{data.video.title}</h3>
                    <p>
                      {data.video.source} · Subbab {data.video.subchapterId} · Urutan{' '}
                      {data.video.recommendationOrder}
                    </p>
                    <p>
                      {data.video.evidence === 'REPORT_SNAPSHOT'
                        ? 'Snapshot saat laporan dibuat.'
                        : 'Metadata saat ini; laporan lama tidak memiliki snapshot historis.'}
                    </p>
                    {data.video.url.startsWith('https://') && (
                      <a href={data.video.url} target="_blank" rel="noreferrer">
                        Buka video terkait
                      </a>
                    )}
                  </>
                )}
                {data.revisionQuestionVersionId && (
                  <Link href={`/admin/content/versions/${data.revisionQuestionVersionId}`}>
                    Revisi penyelesaian
                  </Link>
                )}
                {kind === 'QUESTION' && (
                  <>
                    <section aria-label="Laporan yang masuk">
                      <h3>Laporan yang masuk</h3>
                      <ul className="monitoring-list">
                        {data.sourceReports.map((report) => (
                          <li className="monitoring-notice admin-content-row" key={report.id}>
                            <strong>{report.category}</strong>
                            <p>{report.details || 'Tanpa rincian tambahan.'}</p>
                            <small>{formatDate(report.reportedAt)}</small>
                            {report.legacyFollowUp && (
                              <p>Catatan sebelumnya · {report.legacyFollowUp}</p>
                            )}
                          </li>
                        ))}
                      </ul>
                    </section>
                    {data.history.length > 0 && (
                      <section aria-label="Riwayat penanganan">
                        <h3>Riwayat penanganan</h3>
                        <ul className="monitoring-list">
                          {data.history.map((entry) => (
                            <li className="monitoring-notice admin-content-row" key={entry.id}>
                              <strong>{reportStatusLabel(entry.status, kind)}</strong>
                              {entry.reason && <p>{entry.reason}</p>}
                              {entry.revisionQuestionVersionId && (
                                <Link
                                  href={`/admin/content/versions/${entry.revisionQuestionVersionId}`}
                                >
                                  Lihat versi revisi
                                </Link>
                              )}
                              <small>{formatDate(entry.recordedAt)}</small>
                            </li>
                          ))}
                        </ul>
                      </section>
                    )}
                  </>
                )}
                {(kind === 'VIDEO' || data.status === 'OPEN' || data.status === 'IN_REVIEW') && (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (busy) return;
                      const f = new FormData(e.currentTarget);
                      const revisionId = String(f.get('revisionId') ?? '').trim();
                      const contentCorrected = f.get('contentCorrected');
                      const followUp = String(f.get('followUp') ?? '').trim();
                      const body: ResolveReportDto = {
                        status: String(f.get('status')) as ResolveReportDto['status'],
                        ...(followUp ? { followUp } : {}),
                        ...(data.caseRevision !== null
                          ? { expectedRevision: data.caseRevision }
                          : {}),
                        ...(contentCorrected !== null
                          ? { contentCorrected: contentCorrected === 'true' }
                          : {}),
                        ...(revisionId ? { revisionQuestionVersionId: revisionId } : {}),
                      };
                      setBusy(true);
                      setError('');
                      resolveReport(token, kind, id, body)
                        .then(
                          () => setRevision((r) => r + 1),
                          (e: unknown) => {
                            if (adminAccessDenied(e)) setData(null);
                            setError(e instanceof Error ? e.message : 'Permintaan gagal.');
                          },
                        )
                        .finally(() => setBusy(false));
                    }}
                  >
                    <h3>Tindak lanjut laporan</h3>
                    <p>
                      Catat pemeriksaan dan keputusan. Jika soal diperbaiki, hubungkan versi
                      revisinya agar penyelesaian dapat ditelusuri.
                    </p>
                    <label>
                      Status tindak lanjut
                      <select
                        name="status"
                        disabled={busy}
                        defaultValue={kind === 'VIDEO' ? data.status : undefined}
                      >
                        {(kind === 'VIDEO'
                          ? videoStatuses
                          : data.status === 'OPEN'
                            ? reviewStatus
                            : closingStatuses
                        ).map((s) => (
                          <option key={s} value={s}>
                            {reportStatusLabel(s, kind)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Catatan tindak lanjut
                      <textarea
                        name="followUp"
                        required={kind === 'VIDEO' || data.status === 'IN_REVIEW'}
                        maxLength={2000}
                        defaultValue={kind === 'VIDEO' ? (data.followUp ?? '') : ''}
                        disabled={busy}
                      />
                    </label>
                    {kind === 'QUESTION' && data.status === 'IN_REVIEW' && (
                      <QuestionClosureFields busy={busy} />
                    )}
                    <Button disabled={busy}>
                      {kind === 'QUESTION' && data.status === 'OPEN'
                        ? 'Mulai tinjauan'
                        : 'Simpan tindak lanjut'}
                    </Button>
                  </form>
                )}
              </Card>
            )
          )}
        </>
      )}
    </AdminFrame>
  );
}

function QuestionClosureFields({ busy }: { busy: boolean }) {
  const [corrected, setCorrected] = useState('');
  return (
    <>
      <label>
        Perubahan soal
        <select
          name="contentCorrected"
          value={corrected}
          onChange={(event) => setCorrected(event.target.value)}
          required
          disabled={busy}
        >
          <option value="" disabled>
            Pilih hasil penanganan
          </option>
          <option value="true">Soal sudah diperbaiki</option>
          <option value="false">Tanpa perubahan soal</option>
        </select>
      </label>
      {corrected === 'true' && (
        <label>
          ID versi revisi
          <input name="revisionId" required disabled={busy} />
        </label>
      )}
    </>
  );
}
