'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Button, Card } from '@tka/ui';
import { apiRequest } from '@/lib/api';
import { useAuth } from '@/features/onboarding/auth';
import { AdminFrame, AdminLoading, AdminMessage } from './admin-presentation';
import { createPreview, importContent, validateImport } from './content-preview-api';
import { ManualQuestionFields } from './manual-question-fields';
import { ContentPayload } from './content-payload';
import { contentStatusLabel } from './content-question-format';
import { ContentBlockers } from './content-blockers';
import { getContentVersionMedia } from './content-lifecycle-api';
import { MediaUpload } from './media-upload';
import { adminAccessDenied } from './operational-query';
import { getContentPackage, preparePretestScoring } from './content-package-api';
import type {
  ContentVersionDetailDto,
  ContentMutationDto,
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
    [media, setMedia] = useState<import('./generated-types').ContentVersionMediaLinkDto[]>([]),
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
    setMedia([]);
    setError('');
    setLoading(true);
    apiRequest<ContentVersionDetailDto>(
      `admin/content/versions/${encodeURIComponent(id)}`,
      token,
    ).then(
      (d) => {
        if (active) {
          setDetail(d);
          void getContentVersionMedia(token, d.id).then(
            (links) => active && setMedia(links?.items ?? []),
            () => active && setMedia([]),
          );
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
  let previewPayload = detail?.payload ?? {};
  try {
    const draft: unknown = JSON.parse(json);
    if (draft && typeof draft === 'object' && !Array.isArray(draft))
      previewPayload = draft as Record<string, unknown>;
  } catch {
    /* Keep saved preview while advanced JSON is incomplete. */
  }
  return (
    <AdminFrame
      title="Perbaiki soal"
      description="Lengkapi data yang bermasalah, lalu simpan."
      icon="book"
      management
      fullWidth
      minimalHeader
    >
      <header className="assessment-repair-header">
        <Link href="/admin/content">← Bank soal</Link>
        <h2>Perbaiki soal</h2>
      </header>
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
              <div className="assessment-review-layout assessment-edit-preview-layout">
                <div className="assessment-review-editor">
                  <Card className="content-import-card assessment-review-workflow">
                    <h2>Validasi soal</h2>

                    <Button
                      variant="secondary"
                      disabled={busy}
                      onClick={() => setRevision((r) => r + 1)}
                    >
                      Validasi ulang soal
                    </Button>
                    {detail.sourceNamespace ? (
                      <a className="numora-button numora-button--secondary" href="#perbaikan-soal">
                        Ubah isi dan metadata soal
                      </a>
                    ) : (
                      <p>
                        Soal lama ini belum mendukung editor revisi pada halaman ini. Buka Bank soal
                        untuk membuat revisi manual; jangan mengubah histori versi terbit.
                      </p>
                    )}
                    {detail.readiness.publicationBlockers.includes(
                      'APPROVED_PGK_RUBRIC_REQUIRED',
                    ) && (
                      <div className="assessment-question-problem">
                        <h3>Aturan penilaian belum lengkap</h3>
                        <p>
                          {detail.usageType === 'PRETEST'
                            ? 'Kunci jawaban tidak perlu diubah. Tekan Siapkan penilaian otomatis untuk memasang aturan Pretest yang sesuai.'
                            : 'Rubrik penilaian belum sesuai. Lengkapi aturan penilaian sebelum menerbitkan paket.'}
                        </p>
                        {detail.usageType === 'PRETEST' && (
                          <Button
                            disabled={busy}
                            onClick={() =>
                              run(async () => {
                                const packageId = new URLSearchParams(window.location.search).get(
                                  'package',
                                );
                                if (!packageId) {
                                  window.location.assign('/admin/assessments/pretest');
                                  return;
                                }
                                const pack = await getContentPackage(token, packageId);
                                const item = pack.items.find(
                                  (item) => item.questionVersionId === id,
                                );
                                if (!item) throw new Error('Soal sudah berubah. Buka ulang paket.');
                                await preparePretestScoring(token, packageId, pack.contentRevision);
                                const updated = await getContentPackage(token, packageId);
                                const next = updated.items.find(
                                  (entry) => entry.displayOrder === item.displayOrder,
                                );
                                if (!next)
                                  throw new Error(
                                    'Buka ulang paket untuk melihat hasil penyiapan.',
                                  );
                                window.location.assign(
                                  `/admin/content/versions/${next.questionVersionId}?package=${encodeURIComponent(packageId)}`,
                                );
                              })
                            }
                          >
                            {busy ? 'Menyiapkan penilaian...' : 'Siapkan penilaian otomatis'}
                          </Button>
                        )}
                      </div>
                    )}
                    <div className="content-readiness">
                      <h3>Validasi isi</h3>
                      <ContentBlockers
                        codes={detail.readiness.contentBlockers}
                        empty="Struktur, taxonomy dan bukti upload media lengkap."
                      />
                      <h3>Publikasi assessment</h3>
                      <ContentBlockers
                        codes={detail.readiness.publicationBlockers.filter(
                          (code) =>
                            ![
                              'REVIEW_REQUIRED',
                              'QUESTION_NOT_READY',
                              'APPROVED_PGK_RUBRIC_REQUIRED',
                            ].includes(code),
                        )}
                        empty="Kesiapan versi terpenuhi; publikasi tetap memeriksa policy paket."
                      />
                    </div>
                    <div className="admin-content-actions">
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
                              window.location.assign(
                                `/admin/content/preview-sessions/${session.id}`,
                              );
                            })
                          }
                        >
                          Preview konten dan media
                        </Button>
                      )}
                    </div>
                    {detail.usageType !== 'PRETEST' && (
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
                              Siap (READY)
                            </option>
                            <option value="REVISION">Perlu revisi (REVISION)</option>
                            <option value="ARCHIVED">Diarsipkan (ARCHIVED)</option>
                          </select>
                        </label>
                        <label>
                          Alasan review
                          <textarea name="reason" required maxLength={2000} disabled={busy} />
                        </label>
                        <Button disabled={busy || detail.status === 'ARCHIVED'}>
                          Simpan review
                        </Button>
                      </form>
                    )}
                  </Card>
                  {detail.sourceNamespace && (
                    <Card className="content-import-card assessment-review-revision">
                      <details id="perbaikan-soal" open>
                        <summary>Perbaiki isi dan metadata</summary>

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
                                revisionReason:
                                  String(f.get('reason')).trim() ||
                                  'Perbaikan melalui formulir Admin',
                              };
                              const packageId = new URLSearchParams(window.location.search).get(
                                'package',
                              );
                              if (packageId) {
                                const pack = await getContentPackage(token, packageId);
                                const item = pack.items.find(
                                  (item) => item.questionVersionId === detail.id,
                                );
                                if (!item)
                                  throw Error(
                                    'Versi soal pada paket sudah berubah. Buka ulang paket.',
                                  );
                                const question = body.questions[0] as Record<string, unknown>;
                                question.metadata = {
                                  ...(question.metadata as Record<string, unknown>),
                                  sourceOrder: item.displayOrder,
                                };
                                body.target = {
                                  packageId: pack.id,
                                  expectedRevision: pack.contentRevision,
                                };
                              }
                              const validation = await validateImport(token, body);
                              if (!validation.canImportDraft)
                                throw Error(validation.items.flatMap((i) => i.blockers).join(', '));
                              op.current ??= crypto.randomUUID();
                              const result = await importContent(token, body, op.current);
                              const next = result.items[0]?.questionVersionId;
                              if (next && next !== id)
                                window.location.assign(
                                  `/admin/content/versions/${next}${packageId ? `?package=${encodeURIComponent(packageId)}` : ''}`,
                                );
                              else setNotice('Payload tidak berubah; versi baru tidak dibuat.');
                            });
                          }}
                        >
                          <ManualQuestionFields
                            json={json}
                            disabled={busy}
                            change={(value) => {
                              setJson(value);
                              op.current = null;
                            }}
                          />
                          <details>
                            <summary>Data lengkap JSON (lanjutan)</summary>
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
                          </details>
                          <label>
                            Catatan perubahan (opsional)
                            <textarea
                              name="reason"
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
                </div>
                <Card className="content-import-card assessment-review-content">
                  <div className="assessment-review-heading">
                    <h2>Preview soal</h2>
                    <span className="assessment-status" data-status={detail.status}>
                      {contentStatusLabel(detail.status)}
                    </span>
                  </div>
                  {detail.sourceNamespace && (
                    <p className="assessment-media-note">
                      Gambar ditampilkan dari signed URL privat. Link kedaluwarsa dapat dimuat
                      ulang.
                    </p>
                  )}
                  {media.some((asset) => asset.status !== 'READY') && (
                    <div className="assessment-media-status" role="status">
                      <strong>Media perlu diperbaiki</strong>
                      {media
                        .filter((asset) => asset.status !== 'READY')
                        .map((asset) => (
                          <p key={asset.assetId}>
                            {asset.assetId}: {asset.reason ?? 'Upload belum siap.'}{' '}
                            {detail.sourceNamespace && <a href="#perbaikan-soal">Ganti gambar</a>}
                          </p>
                        ))}
                      {detail.sourceNamespace &&
                        media.some((asset) => asset.status !== 'READY') && (
                          <MediaUpload
                            token={token}
                            initialExternalId={String(previewPayload.externalId ?? detail.id)}
                            initialAssetId={
                              media.find((asset) => asset.status !== 'READY')?.assetId ?? ''
                            }
                            onVerified={(receipt) => {
                              const next = JSON.parse(JSON.stringify(previewPayload)) as Record<
                                string,
                                unknown
                              >;
                              const metadata = (next.metadata ?? {}) as Record<string, unknown>;
                              const manifest = Array.isArray(metadata.assetManifest)
                                ? metadata.assetManifest.map((asset) =>
                                    asset &&
                                    typeof asset === 'object' &&
                                    (asset as Record<string, unknown>).assetId === receipt.assetId
                                      ? { ...(asset as Record<string, unknown>), ...receipt }
                                      : asset,
                                  )
                                : [];
                              next.metadata = { ...metadata, assetManifest: manifest };
                              setJson(JSON.stringify(next, null, 2));
                              setMedia((current) =>
                                current.map((asset) =>
                                  asset.assetId === receipt.assetId
                                    ? { ...asset, status: 'READY', url: null, reason: null }
                                    : asset,
                                ),
                              );
                              setNotice(
                                'Media terverifikasi. Simpan revisi untuk menerapkan asset baru.',
                              );
                            }}
                          />
                        )}
                    </div>
                  )}
                  <ContentPayload
                    payload={previewPayload}
                    media={media}
                    retryMedia={() =>
                      void getContentVersionMedia(token, detail.id).then((links) =>
                        setMedia(links?.items ?? []),
                      )
                    }
                  />
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
                </Card>
              </div>
            )
          )}
        </>
      )}
    </AdminFrame>
  );
}
