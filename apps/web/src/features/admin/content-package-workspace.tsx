'use client';
import { useEffect, useState } from 'react';
import { Badge, Button, Card } from '@tka/ui';
import { apiRequest } from '@/lib/api';
import { AdminMessage } from './admin-presentation';
import { ContentRichText } from './content-rich-text';
import { createPreview, submitPreview } from './content-preview-api';
import {
  createContentPackage,
  getContentPackage,
  listContentPackages,
  reviewImportedQuestion,
  updateContentPackage,
  approveContentPackage,
  publishContentPackage,
  archiveContentPackage,
} from './content-package-api';
import type {
  AdminCurriculumDto,
  ContentPackageDetailDto,
  ContentPackageDto,
  CreateContentPackageDto,
  PreviewMediaDto,
} from './generated-types';
type Usage = CreateContentPackageDto['assessmentType'];

export function ContentPackageWorkspace({
  token,
  disabled,
  onSelect,
  refreshKey,
  busyChanged,
}: {
  token: string;
  disabled: boolean;
  onSelect: (p: ContentPackageDetailDto | null) => void;
  refreshKey: number;
  busyChanged?: (busy: boolean) => void;
}) {
  const [usage, setUsage] = useState<Usage>('DRILL');
  const [status, setStatus] = useState('DRAFT');
  const [chapter, setChapter] = useState('');
  const [source, setSource] = useState('');
  const [offset, setOffset] = useState(0);
  const [packages, setPackages] = useState<ContentPackageDto[]>([]);
  const [curriculum, setCurriculum] = useState<AdminCurriculumDto['items']>([]);
  const [detail, setDetail] = useState<ContentPackageDetailDto | null>(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [notes, setNotes] = useState('');
  const [approvalReference, setApprovalReference] = useState('');
  const [approvalConfirmed, setApprovalConfirmed] = useState(false);
  const [releaseDate, setReleaseDate] = useState('');
  const [media, setMedia] = useState<PreviewMediaDto[]>([]);
  useEffect(() => {
    let active = true;
    setLoading(true);
    const query = new URLSearchParams({
      usageType: usage,
      status,
      limit: '20',
      offset: String(offset),
      ...(chapter ? { chapterId: chapter } : {}),
      ...(source ? { source } : {}),
    });
    Promise.all([
      listContentPackages(token, query.toString()),
      apiRequest<AdminCurriculumDto>('admin/content/curriculum', token),
    ])
      .then(([p, c]) => {
        if (active) {
          setPackages(p.items);
          setCurriculum(c.items);
          setError('');
        }
      })
      .catch((e) => {
        if (active) setError(e instanceof Error ? e.message : 'Daftar paket gagal dimuat.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [token, usage, status, chapter, source, offset, reload]);
  useEffect(() => {
    if (!refreshKey || !detail) return;
    let active = true;
    getContentPackage(token, detail.id)
      .then((p) => {
        if (active) {
          setDetail(p);
          onSelect(p);
          setReload((n) => n + 1);
        }
      })
      .catch((e) => {
        if (active) setError(e instanceof Error ? e.message : 'Checklist gagal dimuat.');
      });
    return () => {
      active = false;
    };
    // Refresh only after a completed import, not every parent preview change.
  }, [refreshKey, token]);
  async function run(action: () => Promise<void>) {
    setBusy(true);
    busyChanged?.(true);
    setError('');
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Permintaan gagal.');
    } finally {
      setBusy(false);
      busyChanged?.(false);
    }
  }
  const choose = async (id: string) => {
    const next = id ? await getContentPackage(token, id) : null;
    setDetail(next);
    onSelect(next);
    setNotes('');
    setApprovalReference('');
    setApprovalConfirmed(false);
    setReleaseDate('');
    setMedia([]);
  };
  const clear = () => {
    setDetail(null);
    onSelect(null);
    setOffset(0);
    setMedia([]);
  };
  const loadMedia = () =>
    void run(async () => {
      if (!detail?.items.length) return;
      const preview = await createPreview(
        token,
        { questionVersionIds: detail.items.map((i) => i.questionVersionId) },
        crypto.randomUUID(),
      );
      // Review includes explanation media; WORK media intentionally hides it.
      const review = await submitPreview(token, preview.id, crypto.randomUUID());
      setMedia(review.media);
    });
  const locked = busy || disabled;
  const chapters = curriculum.filter((c) => c.kind === 'CHAPTER' && c.status !== 'ARCHIVED');
  const levels = curriculum.filter(
    (l) =>
      l.kind === 'LEVEL' &&
      l.status !== 'ARCHIVED' &&
      (() => {
        const sub = curriculum.find((s) => s.id === l.parentId);
        return sub?.status !== 'ARCHIVED' && (!chapter || sub?.parentId === chapter);
      })(),
  );
  return (
    <Card id="paket-soal" className="content-import-card">
      <h2>Tujuan & paket soal</h2>
      <p>
        Satu file untuk satu paket. PG, MCMA, dan Kategori adalah format jawaban dalam tujuan yang
        sama.
      </p>
      <div className="excel-editor-options">
        <label>
          Tujuan unggah
          <select
            value={usage}
            disabled={locked}
            onChange={(e) => {
              setUsage(e.target.value as Usage);
              clear();
            }}
          >
            <option value="DRILL">Drill</option>
            <option value="PRETEST">Pretest</option>
            <option value="TRYOUT">Tryout</option>
          </select>
        </label>
        <label>
          Status paket
          <select
            value={status}
            disabled={locked}
            onChange={(e) => {
              setStatus(e.target.value);
              clear();
            }}
          >
            {['DRAFT', 'PUBLISHED', 'CLOSED', 'ARCHIVED'].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label>
          Filter bab
          <select
            value={chapter}
            disabled={locked}
            onChange={(e) => {
              setChapter(e.target.value);
              clear();
            }}
          >
            <option value="">Semua bab</option>
            {chapters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Filter sumber
          <input
            value={source}
            maxLength={240}
            disabled={locked}
            onChange={(e) => {
              setSource(e.target.value);
              setOffset(0);
            }}
          />
        </label>
      </div>
      {loading ? (
        <p role="status">Memuat paket…</p>
      ) : (
        <label>
          Paket tujuan
          <select
            value={detail?.id ?? ''}
            disabled={locked}
            onChange={(e) => void run(() => choose(e.target.value))}
          >
            <option value="">Pilih paket</option>
            {detail && !packages.some((p) => p.id === detail.id) && (
              <option value={detail.id}>{detail.name} · paket terpilih</option>
            )}
            {packages.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {p.familyCode} v{p.packageVersion}
              </option>
            ))}
          </select>
        </label>
      )}
      {!loading && !packages.length && (
        <p>Belum ada paket yang cocok dengan filter. Buat paket DRAFT terlebih dahulu.</p>
      )}
      <div className="admin-content-actions">
        <Button
          variant="secondary"
          disabled={locked || !offset}
          onClick={() => setOffset((n) => Math.max(0, n - 20))}
        >
          Paket sebelumnya
        </Button>
        <Button
          variant="secondary"
          disabled={locked || packages.length < 20}
          onClick={() => setOffset((n) => n + 20)}
        >
          Paket berikutnya
        </Button>
        <Button variant="secondary" disabled={locked} onClick={() => setCreating((v) => !v)}>
          {creating ? 'Tutup formulir paket' : 'Buat paket DRAFT'}
        </Button>
        <Button
          variant="secondary"
          disabled={locked}
          onClick={() =>
            void run(async () => {
              if (detail) await choose(detail.id);
              setReload((n) => n + 1);
            })
          }
        >
          Muat ulang paket
        </Button>
      </div>
      {creating && (
        <form
          className="excel-question-editor"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const value = (key: string) => String(f.get(key) ?? '').trim();
            const body: CreateContentPackageDto = {
              familyCode: value('familyCode'),
              packageVersion: Number(value('packageVersion')),
              name: value('name'),
              assessmentType: usage,
              isDemo: false,
              source: {
                sourceNamespace: value('sourceNamespace'),
                sourceName: value('sourceName'),
                sourceReference: value('sourceReference'),
              },
              ...(usage === 'DRILL'
                ? { levelId: value('levelId') }
                : usage === 'PRETEST'
                  ? { chapterId: value('chapterId') }
                  : {}),
            };
            void run(async () => {
              const p = await createContentPackage(token, body);
              await choose(p.id);
              setStatus('DRAFT');
              setCreating(false);
              setReload((n) => n + 1);
            });
          }}
        >
          <h3>Paket {usage} baru</h3>
          <label>
            Judul paket
            <input name="name" required maxLength={160} disabled={locked} />
          </label>
          <div className="excel-editor-options">
            <label>
              Kode keluarga paket
              <input name="familyCode" required pattern="[A-Za-z0-9-]{1,64}" disabled={locked} />
            </label>
            <label>
              Versi paket
              <input
                name="packageVersion"
                type="number"
                min={1}
                max={100000}
                defaultValue={1}
                required
                disabled={locked}
              />
            </label>
          </div>
          {usage === 'DRILL' && (
            <label>
              Subbab dan level paket
              <select name="levelId" required disabled={locked}>
                <option value="">Pilih level kurikulum</option>
                {levels.map((l) => {
                  const sub = curriculum.find((s) => s.id === l.parentId);
                  const bab = curriculum.find((c) => c.id === sub?.parentId);
                  return (
                    <option key={l.id} value={l.id}>
                      {bab?.name} → {sub?.name} → Level {l.code}
                    </option>
                  );
                })}
              </select>
            </label>
          )}
          {usage === 'PRETEST' && (
            <label>
              Bab Pretest
              <select name="chapterId" required disabled={locked}>
                <option value="">Pilih bab</option>
                {chapters.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {usage === 'TRYOUT' && (
            <p>Tryout dapat memuat soal lintas bab. Blueprint Curriculum menentukan komposisi.</p>
          )}
          <label>
            Kode sumber stabil
            <input
              name="sourceNamespace"
              required
              pattern="[A-Za-z0-9_-]{1,128}"
              disabled={locked}
            />
          </label>
          <label>
            Nama penyusun / tim / buku
            <input name="sourceName" required maxLength={240} disabled={locked} />
          </label>
          <label>
            Referensi sumber
            <textarea name="sourceReference" required maxLength={1000} rows={2} disabled={locked} />
          </label>
          <Button type="submit" disabled={locked}>
            Simpan paket DRAFT
          </Button>
        </form>
      )}
      {detail && (
        <>
          <h3>
            {detail.name} <Badge>{detail.assessmentType}</Badge>{' '}
          </h3>
          <p>
            {detail.familyCode} · versi {detail.packageVersion} · revisi DRAFT{' '}
            {detail.contentRevision} · {detail.status}
          </p>
          <p>
            {[
              detail.chapterName,
              detail.subchapterName,
              detail.levelNumber ? `Level ${detail.levelNumber}` : null,
            ]
              .filter(Boolean)
              .join(' → ') || 'Lintas bab'}
          </p>
          <p>
            Sumber:{' '}
            {detail.source
              ? `${detail.source.sourceName} · ${detail.source.sourceReference}`
              : 'Belum dilengkapi; gunakan paket terarah baru.'}
          </p>
          <h3>
            Checklist kesiapan · {detail.readiness.actualCount}/{detail.readiness.expectedCount}{' '}
            soal
          </h3>
          <ul className="monitoring-list">
            {detail.readiness.checks.map((check) => (
              <li key={check.code}>
                <Badge variant={check.passed ? 'success' : 'warning'}>
                  {check.passed ? 'Lolos' : 'Belum'}
                </Badge>{' '}
                {check.detail}
              </li>
            ))}
          </ul>
          {detail.curriculumApproval && (
            <p>
              Persetujuan Curriculum: {detail.curriculumApproval.reference} ·{' '}
              {new Date(detail.curriculumApproval.approvedAt).toLocaleString('id-ID')}
            </p>
          )}
          {['PUBLISHED', 'CLOSED'].includes(detail.status) && (
            <Button
              variant="secondary"
              disabled={locked}
              onClick={() =>
                void run(async () => {
                  await archiveContentPackage(token, detail.id, {
                    expectedRevision: detail.contentRevision,
                  });
                  await choose(detail.id);
                  setReload((n) => n + 1);
                })
              }
            >
              Arsipkan paket
            </Button>
          )}
          <p>
            Distribusi aktual:{' '}
            {detail.distribution.map((d) => `${d.dimension} ${d.value}: ${d.count}`).join(' · ') ||
              'Belum ada soal.'}
          </p>
          {detail.status === 'DRAFT' && (
            <div className="content-import-card">
              <label>
                Referensi persetujuan Curriculum
                <input
                  value={approvalReference}
                  maxLength={1000}
                  disabled={locked}
                  onChange={(e) => setApprovalReference(e.target.value)}
                  placeholder="Dokumen, rapat, atau tim yang menyetujui paket"
                />
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={approvalConfirmed}
                  disabled={locked}
                  onChange={(e) => setApprovalConfirmed(e.target.checked)}
                />
                Susunan paket, kesulitan, kunci dan pembahasan sudah disetujui Curriculum.
              </label>
              <Button
                variant="secondary"
                disabled={locked || !approvalReference.trim() || !approvalConfirmed}
                onClick={() =>
                  void run(async () => {
                    await approveContentPackage(token, detail.id, {
                      expectedRevision: detail.contentRevision,
                      reference: approvalReference,
                      confirmed: true,
                    });
                    await choose(detail.id);
                  })
                }
              >
                Catat persetujuan paket
              </Button>
              {detail.assessmentType === 'TRYOUT' && (
                <>
                  <label>
                    Tanggal dan jam rilis Tryout (WIB, opsional)
                    <input
                      type="datetime-local"
                      value={releaseDate}
                      disabled={locked}
                      onChange={(e) => setReleaseDate(e.target.value)}
                    />
                  </label>
                  <Button disabled={locked} onClick={() => setReleaseDate('')}>
                    Gunakan waktu sekarang
                  </Button>
                  <p>
                    Kosongkan untuk Publish sekarang. Durasi 10 menit; batch tutup 7 hari setelah
                    rilis.
                  </p>
                </>
              )}
              <Button
                disabled={locked || !detail.readiness.canPublish}
                onClick={() =>
                  void run(async () => {
                    await publishContentPackage(token, detail.id, {
                      expectedRevision: detail.contentRevision,
                      ...(detail.assessmentType === 'TRYOUT' && releaseDate
                        ? {
                            releaseAt: `${releaseDate}:00+07:00`,
                          }
                        : {}),
                    });
                    await choose(detail.id);
                    setReload((n) => n + 1);
                  })
                }
              >
                {detail.assessmentType === 'TRYOUT' && !releaseDate
                  ? 'Publish sekarang'
                  : 'Publish paket'}
              </Button>
            </div>
          )}
          {detail.items.length > 0 && (
            <>
              {detail.items.some((i) => i.question?.metadata.assetManifest.length) && (
                <Button variant="secondary" disabled={locked} onClick={loadMedia}>
                  Muat gambar untuk review
                </Button>
              )}
              <label>
                Catatan tinjauan materi, kunci dan pembahasan
                <textarea
                  value={notes}
                  maxLength={1000}
                  rows={2}
                  onChange={(e) => setNotes(e.target.value)}
                  disabled={locked || detail.status !== 'DRAFT'}
                />
              </label>
              <Button
                variant="secondary"
                disabled={
                  locked ||
                  !notes.trim() ||
                  detail.status !== 'DRAFT' ||
                  detail.items.some((i) => !i.question)
                }
                onClick={() =>
                  void run(async () => {
                    try {
                      for (const item of detail.items.filter((i) => !i.reviewedAt))
                        await reviewImportedQuestion(
                          token,
                          item.questionVersionId,
                          notes,
                          detail.id,
                        );
                    } finally {
                      await choose(detail.id);
                    }
                  })
                }
              >
                Catat review seluruh paket
              </Button>
              <ul className="monitoring-list">
                {detail.items.map((item) => (
                  <li key={item.questionVersionId}>
                    <strong>
                      {item.displayOrder}. {item.question?.externalId ?? item.questionVersionId}
                    </strong>{' '}
                    <Badge>{item.usageType ?? 'Belum diklasifikasikan'}</Badge>
                    {item.question ? (
                      <>
                        <ContentRichText
                          text={item.question.stem.text}
                          media={media}
                          retry={loadMedia}
                          renderBareMath
                        />
                        <ol>
                          {item.question.options.map((o) => (
                            <li key={o.id}>
                              <strong>{o.id}.</strong>{' '}
                              <ContentRichText
                                text={o.content.text}
                                media={media}
                                retry={loadMedia}
                                renderBareMath
                              />
                            </li>
                          ))}
                        </ol>
                        <p>Kunci: {JSON.stringify(item.question.answer)}</p>
                        <ContentRichText
                          text={item.question.explanation.text}
                          media={media}
                          retry={loadMedia}
                          renderBareMath
                        />
                      </>
                    ) : (
                      <p>Metadata belum lengkap.</p>
                    )}
                    <p>
                      {item.reviewedAt
                        ? `Review tercatat ${new Date(item.reviewedAt).toLocaleString('id-ID')}`
                        : 'Belum ditinjau'}{' '}
                      · {item.contentStatus}
                    </p>
                    <div className="admin-content-actions">
                      <Button
                        variant="secondary"
                        disabled={locked || !notes.trim() || detail.status !== 'DRAFT'}
                        onClick={() =>
                          void run(async () => {
                            await reviewImportedQuestion(
                              token,
                              item.questionVersionId,
                              notes,
                              detail.id,
                            );
                            await choose(detail.id);
                          })
                        }
                      >
                        Catat review {item.displayOrder}
                      </Button>
                      <Button
                        variant="secondary"
                        disabled={locked || detail.status !== 'DRAFT'}
                        onClick={() =>
                          void run(async () => {
                            await updateContentPackage(token, detail.id, {
                              name: detail.name,
                              expectedRevision: detail.contentRevision,
                              questionVersionIds: detail.items
                                .filter((i) => i.questionVersionId !== item.questionVersionId)
                                .map((i) => i.questionVersionId),
                            });
                            await choose(detail.id);
                          })
                        }
                      >
                        Lepas soal {item.displayOrder}
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
      {busy && <p role="status">Memproses paket…</p>}
      {error && <AdminMessage error message={error} />}
    </Card>
  );
}
