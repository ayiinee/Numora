'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { adminAccessDenied } from './operational-query';
import { Button, Card } from '@tka/ui';
import { apiRequest } from '@/lib/api';
import { useAuth } from '@/features/onboarding/auth';
import { AdminFrame, AdminLoading, AdminMessage } from './admin-presentation';
import { resolveReport } from './content-api';
import { ContentPayload } from './content-payload';
import type { AdminReportDetailDto, ResolveReportDto } from './generated-types';
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
    >
      <Link href="/admin/content?view=reports">Kembali ke daftar laporan</Link>
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
                <h2>{data.category}</h2>
                <p>{data.details || 'Tanpa rincian tambahan.'}</p>
                <p>
                  {data.status} · {new Date(data.reportedAt).toLocaleString('id-ID')}
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
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (busy) return;
                    const f = new FormData(e.currentTarget);
                    const revisionId = String(f.get('revisionId') ?? '').trim();
                    const body: ResolveReportDto = {
                      status: String(f.get('status')) as ResolveReportDto['status'],
                      followUp: String(f.get('followUp')).trim(),
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
                    Catat pemeriksaan dan keputusan. Jika soal diperbaiki, hubungkan versi revisinya
                    agar penyelesaian dapat ditelusuri.
                  </p>
                  <label>
                    Status tindak lanjut
                    <select name="status" defaultValue={data.status}>
                      {['OPEN', 'IN_REVIEW', 'RESOLVED', 'REJECTED'].map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Alasan / resolution
                    <textarea
                      name="followUp"
                      required
                      maxLength={2000}
                      defaultValue={data.followUp ?? ''}
                      disabled={busy}
                    />
                  </label>
                  {data.question && (
                    <label>
                      ID versi revisi terkait
                      <input
                        name="revisionId"
                        defaultValue={data.revisionQuestionVersionId ?? ''}
                        disabled={busy}
                      />
                    </label>
                  )}
                  <Button disabled={busy}>Simpan resolution</Button>
                </form>
              </Card>
            )
          )}
        </>
      )}
    </AdminFrame>
  );
}
