'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Badge, Button, Card } from '@tka/ui';
import { apiRequest } from '@/lib/api';
import { useAuth } from '@/features/onboarding/auth';
import { AdminFrame, AdminLoading, AdminMessage } from './admin-presentation';
import { createPreview, importContent, validateImport } from './content-preview-api';
import { setContentStatus } from './content-api';
import { ContentPayload } from './content-payload';
import { ContentBlockers } from './content-blockers';
import { adminAccessDenied } from './operational-query';
import type {
  ContentMutationDto,
  ContentVersionDetailDto,
  ReviewContentDto,
  ImportBodyDto,
} from './generated-types';

export function ContentReviewScreen({ id }: { id: string }) {
  const { state } = useAuth();
  return (
    <Review
      key={
        (state.status === 'ready'
          ? state.profile.id + ':' + state.profile.adminRole
          : state.status) +
        ':' +
        id
      }
      id={id}
    />
  );
}
function Review({ id }: { id: string }) {
  const { state } = useAuth();
  const token =
    state.status === 'ready' &&
    state.profile.role === 'ADMIN' &&
    state.profile.status === 'ACTIVE' &&
    state.profile.capabilities?.includes('CONTENT_MANAGE')
      ? state.session.access_token
      : null;
  const [detail, setDetail] = useState<ContentVersionDetailDto | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [revision, setRevision] = useState(0),
    [json, setJson] = useState(''),
    [notice, setNotice] = useState(''),
    [loading, setLoading] = useState(true);
  const op = useRef<string | null>(null);
  useEffect(() => {
    if (!token) return;
    let active = true;
    setDetail(null);
    setError('');
    setLoading(true);
    apiRequest<ContentVersionDetailDto>(
      `admin/content/versions/${encodeURIComponent(id)}`,
      token,
    ).then(
      (d) => {
        if (active) {
          setDetail(d);
          setJson(JSON.stringify(d.payload, null, 2));
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
  }, [token, id, revision]);
  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await action();
    } catch (e) {
      if (adminAccessDenied(e)) setDetail(null);
      setError(e instanceof Error ? e.message : 'Permintaan gagal.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <AdminFrame
      title="Review versi soal"
      description="Periksa isi dan kelengkapan, lalu catat keputusan review untuk versi ini."
      icon="book"
    >
      <Link href="/admin/content">Kembali ke bank soal</Link>
      {!token ? (
        <AdminMessage message="Akses konten diperlukan." login />
      ) : (
        <>
          {error && <AdminMessage error message={error} retry={() => setRevision((r) => r + 1)} />}
          {notice && <p role="status">{notice}</p>}
          {loading ? (
            <AdminLoading message="Memuat versi…" />
          ) : (
            detail && (
              <>
                <Card className="content-import-card">
                  <h2>Versi {detail.versionNumber}</h2>
                  <Badge>{detail.status}</Badge>
                  <ContentPayload payload={detail.payload} />
                  <details>
                    <summary>Identitas versi & riwayat review</summary>
                    <p>ID: {detail.id}</p>
                    <p>
                      Revisi dari:{' '}
                      {detail.revisedFromId ? (
                        <Link href={`/admin/content/versions/${detail.revisedFromId}`}>
                          {detail.revisedFromId}
                        </Link>
                      ) : (
                        'Versi awal'
                      )}
                    </p>
                    <p>
                      Reviewer: {detail.reviewedByUserId ?? 'Belum direview'} ·{' '}
                      {detail.reviewedAt
                        ? new Date(detail.reviewedAt).toLocaleString('id-ID')
                        : '—'}
                    </p>
                    <h3>Riwayat review</h3>
                    <ul>
                      {detail.reviews.map((r) => (
                        <li key={r.id}>
                          {r.status} · {r.reason} · {r.actorId} ·{' '}
                          {new Date(r.at).toLocaleString('id-ID')}
                        </li>
                      ))}
                    </ul>
                  </details>
                  <div className="content-readiness">
                    <h3>Validasi isi</h3>
                    <ContentBlockers
                      codes={detail.readiness.contentBlockers}
                      empty="Struktur, taxonomy dan bukti upload media lengkap."
                    />
                    <h3>Publikasi assessment</h3>
                    <ContentBlockers
                      codes={detail.readiness.publicationBlockers}
                      empty="Kesiapan versi terpenuhi; publikasi tetap memeriksa policy paket."
                    />
                    <p>
                      {detail.readiness.canReviewReady
                        ? 'Isi dapat diajukan sebagai READY. Tetap periksa kebenaran kunci dan pembahasannya.'
                        : 'READY belum tersedia. Lengkapi hambatan validasi sebelum menyimpan keputusan.'}
                    </p>
                  </div>
                  <div className="admin-content-actions">
                    <Button
                      disabled={busy || detail.status === 'ARCHIVED'}
                      onClick={() =>
                        void run(async () => {
                          await setContentStatus(token, 'questions', detail.questionId, 'READY');
                          setRevision((r) => r + 1);
                        })
                      }
                    >
                      Atur keluarga READY
                    </Button>
                    {detail.sourceNamespace && (
                      <Button
                        variant="secondary"
                        disabled={busy || detail.status === 'ARCHIVED'}
                        onClick={() =>
                          void run(async () => {
                            const session = await createPreview(
                              token,
                              { questionVersionIds: [detail.id] },
                              crypto.randomUUID(),
                            );
                            setNotice(`Sesi preview: ${session.id}`);
                            window.location.assign(`/admin/content/preview-sessions/${session.id}`);
                          })
                        }
                      >
                        Preview konten dan media
                      </Button>
                    )}
                  </div>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const f = new FormData(e.currentTarget);
                      const body: ReviewContentDto = {
                        status: String(f.get('status')) as ReviewContentDto['status'],
                        expectedStatus: detail.status,
                        reason: String(f.get('reason')).trim(),
                      };
                      void run(async () => {
                        await apiRequest<ContentMutationDto>(
                          `admin/content/versions/${id}/review`,
                          token,
                          { method: 'POST', body: JSON.stringify(body) },
                        );
                        setNotice('Keputusan review tersimpan.');
                        setRevision((r) => r + 1);
                      });
                    }}
                  >
                    <h3>Catat keputusan review</h3>
                    <p>
                      READY: siap secara konten. REVISION: perlu diperbaiki. ARCHIVED: hentikan
                      penggunaan baru. Alasan keputusan akan disimpan dalam riwayat.
                    </p>
                    <label>
                      Status review
                      <select name="status" disabled={busy || detail.status === 'ARCHIVED'}>
                        <option value="READY" disabled={!detail.readiness.canReviewReady}>
                          READY
                        </option>
                        <option value="REVISION">REVISION</option>
                        <option value="ARCHIVED">ARCHIVED</option>
                      </select>
                    </label>
                    <label>
                      Alasan review
                      <textarea name="reason" required maxLength={2000} disabled={busy} />
                    </label>
                    <Button disabled={busy || detail.status === 'ARCHIVED'}>Simpan review</Button>
                  </form>
                </Card>
                {detail.sourceNamespace && (
                  <Card className="content-import-card">
                    <details>
                      <summary>Revisi isi soal melalui JSON</summary>
                      <h2>Buat revisi payload</h2>
                      <p>
                        Revisi mempertahankan versi asal dan snapshot historis. Namespace, identitas
                        dan taxonomy keluarga tetap diperiksa server.
                      </p>
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          const f = new FormData(e.currentTarget);
                          void run(async () => {
                            const payload: unknown = JSON.parse(json);
                            if (!payload || typeof payload !== 'object' || Array.isArray(payload))
                              throw Error('Payload harus berupa objek soal.');
                            const body: ImportBodyDto = {
                              sourceNamespace: detail.sourceNamespace!,
                              questions: [payload as Record<string, unknown>],
                              expectedSourceVersionId: detail.id,
                              revisionReason: String(f.get('reason')).trim(),
                            };
                            const validation = await validateImport(token, body);
                            if (!validation.canImportDraft)
                              throw Error(validation.items.flatMap((i) => i.blockers).join(', '));
                            op.current ??= crypto.randomUUID();
                            const result = await importContent(token, body, op.current);
                            const next = result.items[0]?.questionVersionId;
                            if (next && next !== id)
                              window.location.assign(`/admin/content/versions/${next}`);
                            else setNotice('Payload tidak berubah; versi baru tidak dibuat.');
                          });
                        }}
                      >
                        <label>
                          Payload JSON
                          <textarea
                            value={json}
                            rows={20}
                            disabled={busy}
                            onChange={(e) => {
                              setJson(e.target.value);
                              op.current = null;
                            }}
                          />
                        </label>
                        <label>
                          Alasan revisi
                          <textarea
                            name="reason"
                            required
                            maxLength={2000}
                            disabled={busy}
                            onChange={() => {
                              op.current = null;
                            }}
                          />
                        </label>
                        <Button disabled={busy}>Validasi dan simpan revisi</Button>
                      </form>
                    </details>
                  </Card>
                )}
              </>
            )
          )}
        </>
      )}
    </AdminFrame>
  );
}
