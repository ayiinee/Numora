'use client';
import { apiRequest } from '@/lib/api';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Badge, Button, Card, Dialog, Icon } from '@tka/ui';
import { useEffect, useRef, useState } from 'react';
import { AdminPagination } from './admin-pagination';
import { AdminMessage } from './admin-presentation';
import { useAdminAccessError } from './admin-workspace';
import {
  approveContentPackage,
  archiveContentPackage,
  createContentPackage,
  getContentPackage,
  listContentPackages,
  publishContentPackage,
  preparePretestScoring,
  reviewImportedQuestion,
  updateContentPackage,
} from './content-package-api';
import { getContentVersionMedia } from './content-lifecycle-api';
import { ContentRichText } from './content-rich-text';
import type {
  AdminCurriculumDto,
  ContentPackageDetailDto,
  ContentPackageDto,
  CreateContentPackageDto,
  PreviewMediaDto,
} from './generated-types';
import { ADMIN_PAGE_SIZE, adminPage } from './pagination';
import { adminOffset, useAdminUrl } from './admin-url';
import { PackageAvailability } from './package-availability';
import { assessmentPath, assessmentListQuery } from './assessment-routes';
import { getTryoutVariantOptions } from './tryout-variant-api';
import { formatTryoutAnswer } from './tryout-pdf';
type Usage = CreateContentPackageDto['assessmentType'];
const checklistActions: Record<string, string> = {
  STRUCTURE:
    'Periksa teks, pilihan, kunci dan pembahasan pada daftar soal di bawah. Revisi melalui file sumber lalu impor ulang.',
  MEDIA: 'Periksa gambar pada preview dan selesaikan verifikasi unggahan.',
  PACKAGE_CONTEXT: 'Periksa sumber dan cakupan paket. Gunakan impor dengan sumber yang sama.',
  COUNT: 'Tambahkan soal atau keluarkan soal dari paket hingga jumlahnya sesuai.',
  METADATA: 'Periksa kesulitan soal serta bab, subbab, kompetensi dan level di Bank konten.',
  USAGE: 'Gunakan soal dengan tujuan asesmen yang sesuai paket ini.',
  REVIEW: 'Tinjau kunci dan pembahasan di bawah, lalu simpan hasil pemeriksaan beserta catatannya.',
  BLUEPRINT: 'Setelah semua soal ditinjau, masukkan bukti persetujuan tim kurikulum.',
  RUNTIME:
    'Periksa format, kunci, rubrik dan gambar melalui preview; revisi sumber bila diperlukan.',
};

export function ContentPackageWorkspace({
  token,
  disabled,
  onSelect,
  refreshKey,
  busyChanged,
  embedded = false,
  initialUsage = 'DRILL',
  urlContext = false,
  mode = 'picker',
  packageId,
  backHref,
}: {
  token: string;
  disabled: boolean;
  onSelect: (p: ContentPackageDetailDto | null) => void;
  refreshKey: number;
  busyChanged?: (busy: boolean) => void;
  embedded?: boolean;
  initialUsage?: Usage;
  urlContext?: boolean;
  mode?: 'picker' | 'create' | 'detail';
  packageId?: string;
  backHref?: string;
}) {
  const url = useAdminUrl();
  const router = useRouter();
  const reportAccessError = useAdminAccessError();
  const [localUsage, setUsage] = useState<Usage>(initialUsage);
  const usage = urlContext ? initialUsage : localUsage;
  const requestedId = packageId ?? (urlContext ? url.params.get('package') : null);
  const [localStatus, setStatus] = useState('DRAFT');
  const status = urlContext ? (url.params.get('status') ?? '') : localStatus;
  const [localChapter, setChapter] = useState('');
  const chapter = urlContext ? (url.params.get('chapter') ?? '') : localChapter;
  const [localSource, setSource] = useState('');
  const source = urlContext ? (url.params.get('source') ?? '') : localSource;
  const [localOffset, setOffset] = useState(0);
  const offset = urlContext ? adminOffset(url.params.get('offset')) : localOffset;
  const [packages, setPackages] = useState<ContentPackageDto[]>([]);
  const [hasNext, setHasNext] = useState(false);
  const [totalItems, setTotalItems] = useState<number>();
  const [curriculum, setCurriculum] = useState<AdminCurriculumDto['items']>([]);
  const [detail, setDetail] = useState<ContentPackageDetailDto | null>(null);
  const [creating, setCreating] = useState(mode === 'create');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [reload, setReload] = useState(0);
  const [selectionRetry, setSelectionRetry] = useState(0);
  const [notes, setNotes] = useState('');
  const [inspectingId, setInspectingId] = useState<string | null>(null);
  const [reviewStep, setReviewStep] = useState<1 | 2 | 3 | 4>(1);
  const [compositionOpen, setCompositionOpen] = useState(false);
  const [settingsName, setSettingsName] = useState('');
  const [approvalReference, setApprovalReference] = useState('');
  const [approvalConfirmed, setApprovalConfirmed] = useState(false);
  const [publishConfirmed, setPublishConfirmed] = useState(false);
  const [informationOpen, setInformationOpen] = useState<'access' | 'readiness' | null>(null);
  const [publicationOpen, setPublicationOpen] = useState(false);
  const [archiveConfirmed, setArchiveConfirmed] = useState(false);
  const [variantAvailable, setVariantAvailable] = useState<boolean | null>(null);
  const [media, setMedia] = useState<PreviewMediaDto[]>([]);
  const running = useRef(false);
  const selectionRequest = useRef(0);
  const selectionContext = useRef('');
  useEffect(() => {
    if (mode === 'detail') {
      setLoading(false);
      let active = true;
      apiRequest<AdminCurriculumDto>('admin/content/curriculum', token)
        .then((value) => {
          if (active) setCurriculum(value.items);
        })
        .catch((cause) => {
          if (active) reportAccessError(cause);
        });
      return () => {
        active = false;
      };
    }
    let active = true;
    setLoading(true);
    const query = new URLSearchParams({
      usageType: usage,
      ...(status ? { status } : {}),
      limit: String(ADMIN_PAGE_SIZE + 1),
      offset: String(offset),
      ...(chapter ? { chapterId: chapter } : {}),
      ...(source ? { source } : {}),
    });
    Promise.all([
      mode === 'picker'
        ? listContentPackages(token, query.toString())
        : Promise.resolve({ items: [], total: 0 }),
      apiRequest<AdminCurriculumDto>('admin/content/curriculum', token),
    ])
      .then(([p, c]) => {
        if (active) {
          const page = adminPage(p.items);
          setPackages(page.items);
          setHasNext(page.hasNext);
          setTotalItems(p.total);
          setCurriculum(c.items);
          setError('');
        }
      })
      .catch((e) => {
        if (active) reportAccessError(e);
        if (active) setError(e instanceof Error ? e.message : 'Daftar paket gagal dimuat.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [token, usage, status, chapter, source, offset, reload, mode]);
  useEffect(() => {
    if (!refreshKey || !detail || (urlContext && detail.id !== requestedId)) return;
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
        if (active) reportAccessError(e);
        if (active) setError(e instanceof Error ? e.message : 'Checklist gagal dimuat.');
      });
    return () => {
      active = false;
    };
    // Refresh only after a completed import, not every parent preview change.
  }, [refreshKey, token, requestedId]);
  useEffect(() => {
    if (
      !detail ||
      detail.assessmentType !== 'TRYOUT' ||
      detail.status !== 'PUBLISHED' ||
      detail.source?.sourceNamespace === 'TRYOUT_VARIANT_GENERATOR'
    ) {
      setVariantAvailable(null);
      return;
    }
    let active = true;
    setVariantAvailable(null);
    getTryoutVariantOptions(token, detail.id)
      .then((value) => active && setVariantAvailable(value.generatorAvailable))
      .catch(() => active && setVariantAvailable(false));
    return () => {
      active = false;
    };
  }, [detail, token]);
  useEffect(() => {
    if (!urlContext && mode !== 'detail') return;
    let active = true;
    const request = ++selectionRequest.current;
    const context = `${usage}:${requestedId ?? ''}`;
    if (selectionContext.current !== context) {
      selectionContext.current = context;
      setDetail(null);
      onSelect(null);
    }
    setDetailLoading(Boolean(requestedId));
    if (requestedId)
      getContentPackage(token, requestedId)
        .then((next) => {
          if (!active || request !== selectionRequest.current) return;
          if (next.assessmentType !== usage) {
            if (mode === 'detail') {
              router.replace(
                assessmentPath(next.assessmentType, next.id) + assessmentListQuery(url.params),
              );
              return;
            }
            throw Error('Paket tidak sesuai jenis asesmen.');
          }
          setDetail(next);
          onSelect(next);
          setError('');
        })
        .catch((cause) => {
          if (active) {
            reportAccessError(cause);
            setError(cause instanceof Error ? cause.message : 'Paket gagal dimuat.');
          }
        })
        .finally(() => {
          if (active) setDetailLoading(false);
        });
    return () => {
      active = false;
    };
  }, [requestedId, token, usage, urlContext, selectionRetry, mode, router]);
  useEffect(() => {
    setNotes('');
    setInspectingId(null);
    setArchiveConfirmed(false);
    setApprovalReference('');
    setApprovalConfirmed(false);
    setPublishConfirmed(false);
    setMedia([]);
  }, [detail?.id, detail?.contentRevision, detail?.status]);
  async function run(action: () => Promise<void>) {
    if (running.current || disabled) return;
    running.current = true;
    setBusy(true);
    busyChanged?.(true);
    setError('');
    setNotice('');
    try {
      await action();
    } catch (e) {
      reportAccessError(e);
      setError(e instanceof Error ? e.message : 'Permintaan gagal.');
    } finally {
      running.current = false;
      setBusy(false);
      busyChanged?.(false);
    }
  }
  async function prepareScoring() {
    if (!token || !detail) return;
    await run(async () => {
      await preparePretestScoring(token, detail.id, detail.contentRevision);
      setDetail(await getContentPackage(token, detail.id));
      setNotice('Penilaian otomatis siap. Masalah konten lain, jika ada, tetap perlu diperbaiki.');
    });
  }
  const choose = async (id: string) => {
    if (mode === 'create') {
      router.push(assessmentPath(usage, id) + assessmentListQuery(url.params));
      return;
    }
    if (mode === 'detail' && id !== requestedId) {
      router.push(assessmentPath(usage, id) + assessmentListQuery(url.params));
      return;
    }
    if (urlContext && new URLSearchParams(window.location.search).get('package') !== requestedId)
      return;
    if (urlContext && id !== requestedId) {
      url.update({ package: id || null });
      return;
    }
    const request = ++selectionRequest.current;
    const next = id ? await getContentPackage(token, id) : null;
    if (
      request !== selectionRequest.current ||
      (urlContext && new URLSearchParams(window.location.search).get('package') !== requestedId)
    )
      return;
    setDetail(next);
    if (urlContext) url.update({ package: id || null });
    onSelect(next);
    setNotes('');
    setArchiveConfirmed(false);
    setMedia([]);
  };
  const clear = () => {
    selectionRequest.current++;
    setDetail(null);
    onSelect(null);
    setOffset(0);
    setMedia([]);
  };
  const loadMedia = () =>
    void run(async () => {
      if (!detail?.items.length) return;
      const links = await Promise.all(
        detail.items.map(async (item) => {
          const result = await getContentVersionMedia(token, item.questionVersionId);
          return result.items
            .filter((asset) => asset.status === 'READY' && asset.url && asset.expiresAt)
            .map((asset) => ({
              instanceId: item.questionVersionId,
              assetId: asset.assetId,
              altText: asset.altText,
              url: asset.url!,
              expiresAt: asset.expiresAt!,
            }));
        }),
      );
      setMedia(links.flat());
    });
  useEffect(() => {
    if (inspectingId && detail) void loadMedia();
    // Reload links when reviewer changes question; signed links remain server-authorized.
  }, [inspectingId, detail?.id]);
  const locked = busy || disabled || detailLoading;
  const printableTryout =
    detail?.assessmentType === 'TRYOUT' &&
    detail.items.length > 0 &&
    detail.items.length === detail.readiness.expectedCount &&
    detail.items.every((item) => item.question);
  const printTryout = () => {
    if (!printableTryout) return;
    const previousTitle = document.title;
    document.title = `${detail.name} - Soal`;
    const restore = () => {
      document.title = previousTitle;
      window.removeEventListener('afterprint', restore);
    };
    window.addEventListener('afterprint', restore, { once: true });
    window.print();
    // Some browsers do not emit afterprint for cancelled dialogs.
    window.setTimeout(restore, 1000);
  };
  const publicationProblems =
    detail?.readiness.checks.filter(
      (check) => !check.passed && !['REVIEW', 'BLUEPRINT'].includes(check.code),
    ) ?? [];
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
  const compactTryout = mode === 'detail' && initialUsage === 'TRYOUT';
  const generatorAction =
    detail?.assessmentType === 'TRYOUT' &&
    detail.status === 'PUBLISHED' &&
    detail.source?.sourceNamespace !== 'TRYOUT_VARIANT_GENERATOR' &&
    (variantAvailable === true ? (
      <Link
        className="button-link"
        href={`/admin/assessments/tryout/${encodeURIComponent(detail.id)}/variant/new`}
      >
        Generate varian paket
      </Link>
    ) : (
      <Button
        variant="secondary"
        disabled
        title="Mapping generator belum lengkap untuk 25 focal soal."
      >
        {variantAvailable === null ? 'Memeriksa generator…' : 'Generate varian paket'}
      </Button>
    ));
  const packageActions = detail && (
    <div className="assessment-header-actions">
      {detail.assessmentType === 'TRYOUT' && !compactTryout && (
        <Link className="button-link" href="/admin/tryout-batches">
          Batch Tryout
        </Link>
      )}
      {detail.assessmentType === 'TRYOUT' && (
        <Button
          variant="secondary"
          disabled={!printableTryout}
          onClick={printTryout}
          title={
            printableTryout
              ? 'Cetak soal, pilihan jawaban, dan kunci jawaban'
              : 'Lengkapi seluruh soal paket sebelum mengekspor'
          }
        >
          Export PDF
        </Button>
      )}
      <Button onClick={() => setPublicationOpen(true)}>
        {detail.status === 'DRAFT' ? 'Penerbitan' : 'Kelola publikasi'}
      </Button>

      {compactTryout ? (
        <>
          <Button
            variant="secondary"
            popoverTarget="tryout-package-actions"
            className="tryout-package-more"
            aria-label="Tindakan lainnya"
            title="Tindakan lainnya"
          >
            <span aria-hidden="true">⋯</span>
          </Button>
          <div
            id="tryout-package-actions"
            popover="auto"
            className="tryout-package-menu"
            aria-label="Tindakan paket lainnya"
            onClick={(event) => {
              if ((event.target as HTMLElement).closest('button, a'))
                event.currentTarget.hidePopover();
            }}
          >
            <Link className="button-link" href="/admin/tryout-batches">
              Batch Tryout
            </Link>
            <Button
              variant="secondary"
              onClick={() => {
                setSettingsName(detail.name);
                setCompositionOpen(true);
              }}
            >
              Komposisi paket
            </Button>

            <Button variant="secondary" onClick={() => setInformationOpen('access')}>
              <Icon name="users" width={18} height={18} /> Akses siswa
            </Button>
            <Button variant="secondary" onClick={() => setInformationOpen('readiness')}>
              <Icon name="clipboard" width={18} height={18} /> Syarat penerbitan
            </Button>
            {generatorAction}
          </div>
        </>
      ) : (
        <>
          <Button variant="secondary" onClick={() => setCompositionOpen(true)}>
            Komposisi paket
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              setSettingsName(detail.name);
              setCompositionOpen(true);
            }}
          >
            Pengaturan
          </Button>

          {generatorAction}
        </>
      )}
    </div>
  );
  return (
    <Card
      id="paket-soal"
      className={
        mode === 'detail'
          ? `content-import-card assessment-detail-card${compactTryout ? ' tryout-package-detail' : ''}`
          : 'content-import-card'
      }
      style={
        compactTryout
          ? { border: 0, boxShadow: 'none', padding: 0 }
          : embedded
            ? { border: 0, boxShadow: 'none', paddingTop: 0 }
            : undefined
      }
    >
      {compactTryout && (
        <div className="tryout-package-toolbar">
          <Link className="assessment-back-link" href={backHref ?? assessmentPath('TRYOUT')}>
            ← Kembali ke daftar
          </Link>
          {packageActions}
        </div>
      )}
      {mode === 'picker' && (
        <>
          <h2>{urlContext ? 'Daftar paket' : 'Tujuan & paket soal'}</h2>
          <p>
            {urlContext
              ? 'Pilih paket untuk melihat susunan soal, kelengkapan dan akses siswa.'
              : 'Satu file untuk satu paket. PG, MCMA, dan Kategori adalah format jawaban dalam tujuan yang sama.'}
          </p>
          <div className="admin-search-toolbar">
            <label>
              Tujuan unggah
              <select
                value={usage}
                disabled={locked || urlContext}
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
                  if (urlContext)
                    url.update({ status: e.target.value, offset: null, package: null });
                  clear();
                }}
              >
                {urlContext && <option value="">Semua status</option>}
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
                  if (urlContext)
                    url.update({ chapter: e.target.value, offset: null, package: null });
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
                  if (urlContext) url.update({ source: e.target.value, offset: null });
                  setOffset(0);
                }}
              />
            </label>
          </div>
          {loading ? (
            <p role="status">Memuat paket…</p>
          ) : urlContext ? (
            <ul className="assessment-package-list" aria-label="Daftar paket asesmen">
              {packages.map((pack) => (
                <li key={pack.id}>
                  <Button
                    variant={pack.id === detail?.id ? 'primary' : 'secondary'}
                    disabled={locked}
                    onClick={() => void run(() => choose(pack.id))}
                    aria-pressed={pack.id === detail?.id}
                  >
                    <span>{pack.name}</span>
                    <small>
                      {pack.familyCode} · v{pack.packageVersion}
                    </small>
                  </Button>
                  <span>
                    {pack.availability?.state === 'AVAILABLE'
                      ? 'Tersedia'
                      : pack.availability?.state === 'SCHEDULED'
                        ? 'Terjadwal'
                        : pack.status === 'DRAFT'
                          ? 'Draf'
                          : pack.status === 'ARCHIVED'
                            ? 'Arsip'
                            : pack.availability?.state === 'CLOSED'
                              ? 'Ditutup'
                              : 'Terhalang'}
                  </span>
                </li>
              ))}
            </ul>
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
          <AdminPagination
            offset={offset}
            hasNext={hasNext}
            totalItems={totalItems}
            disabled={locked || loading}
            onChange={(next) => {
              setOffset(next);
              if (urlContext) url.update({ offset: next });
            }}
            label="Halaman paket"
            previousLabel="Paket sebelumnya"
            nextLabel="Paket berikutnya"
          />
          <div className="admin-content-actions">
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
        </>
      )}
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
              if (urlContext) url.update({ status: 'DRAFT', package: p.id });
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
                      {bab?.name} · {sub?.name} · Level {l.code}
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
            <p>
              Tryout memuat 30 soal. Lengkapi soal, jawaban dan pembahasan untuk menerbitkan paket.
            </p>
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
            {mode === 'create' ? 'Simpan draft' : 'Simpan paket DRAFT'}
          </Button>
        </form>
      )}
      {detail && (
        <div className="assessment-detail-workspace">
          <div className="assessment-summary-panel">
            <header className="assessment-detail-identity">
              <div>
                <span className="assessment-detail-kicker">
                  {detail.assessmentType === 'PRETEST'
                    ? 'Pretest'
                    : detail.assessmentType === 'TRYOUT'
                      ? 'Tryout'
                      : 'Drill'}
                </span>
                <h2>{detail.name}</h2>
                <p>
                  {detail.familyCode} · Versi {detail.packageVersion} · Revisi{' '}
                  {detail.contentRevision}
                </p>
                <Badge variant={detail.status === 'PUBLISHED' ? 'success' : 'default'}>
                  {{
                    DRAFT: 'Draf',
                    PUBLISHED: 'Diterbitkan',
                    CLOSED: 'Ditutup',
                    ARCHIVED: 'Arsip',
                  }[detail.status] ?? detail.status}
                </Badge>
              </div>
              {!compactTryout && packageActions}
            </header>
            <div className="assessment-detail-metrics">
              <div>
                <span>Soal dalam paket</span>
                <strong>
                  {detail.readiness.actualCount}
                  <small> / {detail.readiness.expectedCount}</small>
                </strong>
              </div>
              <div>
                <span>
                  {detail.assessmentType !== 'DRILL' ? 'Isi soal valid' : 'Soal ditinjau'}
                </span>
                <strong>
                  {
                    detail.items.filter((item) =>
                      detail.assessmentType !== 'DRILL'
                        ? item.question && !item.validationIssues?.length
                        : item.reviewedAt,
                    ).length
                  }
                  <small> / {detail.items.length}</small>
                </strong>
              </div>
              <div>
                <span>Syarat terpenuhi</span>
                <strong>
                  {detail.readiness.checks.filter((check) => check.passed).length}
                  <small> / {detail.readiness.checks.length}</small>
                </strong>
              </div>
            </div>
          </div>
          {detail.legacyPreparation && (
            <div className="assessment-inline-warning" role="status">
              <strong>Versi ini belum punya sumber impor.</strong>
              <p>
                Paket lama yang sudah diterbitkan tetap terkunci agar histori siswa aman. Buat versi
                perbaikan melalui sumber impor, lalu validasi, review, dan terbitkan versi baru.
              </p>
            </div>
          )}
          {detail.assessmentType === 'DRILL' &&
            detail.status === 'DRAFT' &&
            detail.items.some((item) => !item.reviewedAt) && (
              <div className="assessment-inline-warning" role="status">
                <Button
                  variant="secondary"
                  disabled={locked || detail.items.some((item) => !item.question)}
                  onClick={() =>
                    void run(async () => {
                      let completed = 0;
                      for (const item of detail.items) {
                        if (item.reviewedAt) continue;
                        try {
                          await reviewImportedQuestion(
                            token,
                            item.questionVersionId,
                            '',
                            detail.id,
                          );
                          completed++;
                        } catch (cause) {
                          const reason = cause instanceof Error ? cause.message : 'validasi gagal';
                          throw Error(
                            `Bulk review berhenti pada soal ${item.displayOrder}. ${completed} soal berhasil ditinjau; perbaiki soal ini lalu jalankan lagi. Alasan: ${reason}`,
                          );
                        }
                      }
                      await choose(detail.id);
                      setNotice('Semua soal valid berhasil ditandai sudah ditinjau.');
                    })
                  }
                >
                  {busy ? 'Meninjau soal…' : 'Tinjau semua soal valid'}
                </Button>
                {detail.items.some((item) => !item.question) && (
                  <small>Lengkapi soal yang belum lolos validasi sebelum bulk review.</small>
                )}
              </div>
            )}
          <Dialog
            open={compositionOpen}
            onClose={() => setCompositionOpen(false)}
            pending={locked}
            title="Komposisi paket"
            className="admin-management-dialog assessment-settings-dialog"
          >
            <div className="assessment-detail-workspace assessment-detail-settings-body">
              <label>
                Nama paket
                <input
                  aria-label="Nama paket"
                  value={settingsName}
                  onChange={(e) => setSettingsName(e.target.value)}
                />
              </label>
              <Button
                variant="secondary"
                onClick={() =>
                  void run(async () => {
                    await updateContentPackage(token, detail.id, {
                      name: settingsName,
                      expectedRevision: detail.contentRevision,
                      questionVersionIds: detail.items.map((item) => item.questionVersionId),
                    });
                    await choose(detail.id);
                  })
                }
              >
                Simpan nama
              </Button>
              <p>
                {[
                  detail.chapterName,
                  detail.subchapterName,
                  detail.levelNumber ? `Level ${detail.levelNumber}` : null,
                ]
                  .filter(Boolean)
                  .join(' · ') || 'Lintas bab'}
              </p>
              <p>
                Sumber:{' '}
                {detail.source
                  ? `${detail.source.sourceName} · ${detail.source.sourceReference}`
                  : 'Sumber belum diisi.'}
              </p>
              <details className="assessment-distribution">
                <summary>Komposisi soal</summary>
                <p>
                  Jumlah soal menurut materi, tingkat kesulitan, dan jenis jawaban. Satu soal dapat
                  terhitung dalam beberapa kelompok.
                </p>
                <dl>
                  {detail.distribution.map((entry) => (
                    <div key={entry.dimension + ':' + entry.value}>
                      <dt>
                        {{
                          chapter: 'Bab',
                          subchapter: 'Subbab',
                          competency: 'Indikator',
                          difficulty: 'Kesulitan',
                          format: 'Jenis soal',
                        }[entry.dimension] ?? entry.dimension}
                        :{' '}
                        {{
                          EASY: 'Mudah',
                          MEDIUM: 'Sedang',
                          HARD: 'Sulit',
                          SINGLE_CHOICE: 'Pilihan tunggal',
                          MULTIPLE_CHOICE_MULTIPLE_ANSWER: 'Pilihan lebih dari satu',
                          CATEGORY: 'Kategori',
                        }[entry.value] ??
                          curriculum.find((item) => item.code === entry.value)?.name ??
                          entry.value}
                      </dt>
                      <dd>{entry.count} soal</dd>
                    </div>
                  ))}
                </dl>
              </details>{' '}
            </div>
          </Dialog>
          <div className="assessment-detail-layout">
            <section className="assessment-detail-questions" aria-label="Soal dan review paket">
              <div className="assessment-detail-section-heading">
                <div>
                  <h3>
                    Daftar soal{' '}
                    <span className="assessment-count" aria-hidden="true">
                      {detail.items.length}
                    </span>
                  </h3>
                </div>{' '}
                {(urlContext || mode === 'detail') &&
                  detail.source &&
                  detail.status === 'DRAFT' &&
                  detail.items.length < detail.readiness.expectedCount && (
                    <p>
                      <Link
                        href={`/admin/content/imports?mode=json&type=${detail.assessmentType}&package=${encodeURIComponent(detail.id)}`}
                      >
                        Impor soal
                      </Link>
                    </p>
                  )}
              </div>
              {detail.items.length === 0 && (
                <div className="assessment-detail-empty">
                  <h4>Belum ada soal</h4>
                  <p>Tambahkan soal ke paket ini untuk mulai meninjau isi dan kelengkapannya.</p>
                </div>
              )}
              <p className="assessment-table-hint">
                Buka detail soal untuk memeriksa isi, jawaban, dan pembahasan.{' '}
                {detail.assessmentType === 'TRYOUT'
                  ? 'Kelengkapan Tryout diperiksa otomatis saat diterbitkan.'
                  : 'Pretest divalidasi otomatis saat diterbitkan.'}
              </p>
              {detail.items.length > 0 && (
                <div className="assessment-table-scroll">
                  <table className="assessment-directory-table assessment-question-table">
                    <thead>
                      <tr>
                        <th scope="col">No.</th>
                        <th scope="col">Soal</th>
                        {detail.assessmentType === 'DRILL' && <th scope="col">Kelengkapan</th>}
                        <th scope="col">
                          {detail.assessmentType !== 'DRILL' ? 'Validasi' : 'Tinjauan'}
                        </th>
                        {detail.assessmentType !== 'DRILL' && <th scope="col">Masalah</th>}
                        <th scope="col">Aksi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.items.map((item) => (
                        <tr key={item.questionVersionId}>
                          <td>{item.displayOrder}</td>
                          <td>
                            <strong>
                              {item.question?.externalId ?? 'Soal ' + item.displayOrder}
                            </strong>
                            <small>
                              {item.question
                                ? item.question.stem.text.replace(/<[^>]*>/g, '').slice(0, 100)
                                : 'Data soal perlu diperiksa'}
                            </small>
                          </td>
                          {detail.assessmentType === 'DRILL' && (
                            <td>
                              <Badge variant={item.question ? 'success' : 'warning'}>
                                {item.question ? 'Isi terbaca' : 'Perlu diperbaiki'}
                              </Badge>
                            </td>
                          )}
                          <td>
                            <Badge
                              variant={
                                detail.assessmentType !== 'DRILL'
                                  ? item.question && !item.validationIssues?.length
                                    ? 'success'
                                    : 'warning'
                                  : item.reviewedAt
                                    ? 'success'
                                    : 'default'
                              }
                            >
                              {detail.assessmentType !== 'DRILL'
                                ? item.question && !item.validationIssues?.length
                                  ? 'Aman'
                                  : 'Perlu diperbaiki'
                                : item.reviewedAt
                                  ? 'Sudah ditinjau'
                                  : 'Belum ditinjau'}
                            </Badge>
                          </td>
                          {detail.assessmentType !== 'DRILL' && (
                            <td>
                              {item.validationIssues?.length || !item.question ? (
                                <ul>
                                  {(item.validationIssues?.length
                                    ? item.validationIssues
                                    : ['Isi soal belum lengkap.']
                                  ).map((issue) => (
                                    <li key={issue}>{issue}</li>
                                  ))}
                                </ul>
                              ) : (
                                'Tidak ada masalah'
                              )}
                            </td>
                          )}
                          <td>
                            {detail.assessmentType !== 'DRILL' &&
                            (item.validationIssues?.length || !item.question) ? (
                              <>
                                {detail.status === 'DRAFT' && item.scoringRepairRequired ? (
                                  <Button
                                    variant="secondary"
                                    disabled={locked}
                                    onClick={prepareScoring}
                                  >
                                    {busy
                                      ? 'Menyiapkan penilaian...'
                                      : 'Siapkan penilaian otomatis'}
                                  </Button>
                                ) : (
                                  <Link
                                    className="numora-button numora-button--secondary assessment-repair-button"
                                    href={`/admin/content/versions/${item.questionVersionId}?package=${encodeURIComponent(detail.id)}`}
                                  >
                                    Perbaiki
                                  </Link>
                                )}
                              </>
                            ) : (
                              <Button
                                variant="secondary"
                                onClick={() => {
                                  setInspectingId(item.questionVersionId);
                                  setNotes('');
                                  setReviewStep(1);
                                }}
                              >
                                {detail.assessmentType !== 'DRILL' ? 'Lihat soal' : 'Tinjau'}
                              </Button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <Dialog
                open={Boolean(inspectingId)}
                onClose={() => setInspectingId(null)}
                pending={locked}
                title="Pemeriksaan soal"
                className="admin-management-dialog assessment-question-dialog"
              >
                <div className="assessment-detail-workspace">
                  <div className="assessment-review-navigation">
                    <Button
                      variant="secondary"
                      disabled={
                        locked ||
                        detail.items.findIndex((item) => item.questionVersionId === inspectingId) <=
                          0
                      }
                      onClick={() => {
                        const index = detail.items.findIndex(
                          (item) => item.questionVersionId === inspectingId,
                        );
                        setInspectingId(detail.items[index - 1]!.questionVersionId);
                        setNotes('');
                        setReviewStep(1);
                      }}
                    >
                      Sebelumnya
                    </Button>
                    <span>
                      Soal{' '}
                      {
                        detail.items.find((item) => item.questionVersionId === inspectingId)
                          ?.displayOrder
                      }{' '}
                      dari {detail.items.length}
                    </span>
                    <Button
                      variant="secondary"
                      disabled={
                        locked ||
                        detail.items.findIndex((item) => item.questionVersionId === inspectingId) >=
                          detail.items.length - 1
                      }
                      onClick={() => {
                        const index = detail.items.findIndex(
                          (item) => item.questionVersionId === inspectingId,
                        );
                        setInspectingId(detail.items[index + 1]!.questionVersionId);
                        setNotes('');
                        setReviewStep(1);
                      }}
                    >
                      Berikutnya
                    </Button>
                  </div>
                  {detail.items.some((item) => {
                    const question = item.question;
                    return Boolean(
                      item.questionVersionId === inspectingId &&
                      question &&
                      (question.metadata.assetManifest.length ||
                        question.stem.text.includes('[[asset:') ||
                        question.explanation.text.includes('[[asset:')),
                    );
                  }) && (
                    <Button variant="secondary" onClick={loadMedia} disabled={locked}>
                      Muat gambar
                    </Button>
                  )}
                  <nav className="assessment-review-steps" aria-label="Tahap pemeriksaan soal">
                    {(detail.assessmentType === 'TRYOUT'
                      ? ['Isi soal', 'Media', 'Validasi']
                      : ['Isi soal', 'Media', 'Validasi', 'Keputusan']
                    ).map((label, i) => (
                      <button
                        type="button"
                        key={label}
                        className={reviewStep === i + 1 ? 'is-active' : ''}
                        aria-current={reviewStep === i + 1 ? 'step' : undefined}
                        onClick={() => setReviewStep((i + 1) as 1 | 2 | 3 | 4)}
                      >
                        {i + 1}. {label}
                      </button>
                    ))}
                  </nav>
                  {reviewStep === 2 && (
                    <section className="assessment-review-step-panel">
                      <h3>Media soal</h3>
                      {(() => {
                        const selected = detail.items.find(
                          (item) => item.questionVersionId === inspectingId,
                        );
                        const assets = selected?.question?.metadata.assetManifest ?? [];
                        const ready = new Set(
                          media
                            .filter((asset) => asset.instanceId === inspectingId)
                            .map((asset) => asset.assetId),
                        );
                        return assets.length ? (
                          <ul className="assessment-media-list">
                            {assets.map((asset) => (
                              <li key={asset.assetId}>
                                <strong>{asset.assetId}</strong>
                                <span>
                                  {ready.has(asset.assetId) ? 'Siap' : 'Perlu diperbaiki'}
                                </span>
                                <small>{asset.altText}</small>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p>Soal ini tidak memiliki gambar.</p>
                        );
                      })()}
                      <Button variant="secondary" onClick={loadMedia} disabled={locked}>
                        Validasi dan muat ulang media
                      </Button>
                    </section>
                  )}
                  {reviewStep === 3 && (
                    <section className="assessment-review-step-panel">
                      <h3>Validasi soal</h3>
                      {(() => {
                        const selected = detail.items.find(
                          (item) => item.questionVersionId === inspectingId,
                        );
                        const issues = selected?.validationIssues ?? [];
                        return issues.length ? (
                          <ul className="content-blocker-list">
                            {issues.map((issue) => (
                              <li key={issue}>
                                <small>{issue}</small>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p>
                            Validasi isi soal lulus. Periksa kembali gambar, kunci, dan pembahasan.
                          </p>
                        );
                      })()}
                      <Button
                        variant="secondary"
                        onClick={() => void choose(detail.id)}
                        disabled={locked}
                      >
                        Validasi ulang
                      </Button>
                    </section>
                  )}
                  {(reviewStep === 1 || reviewStep === 4) && (
                    <ul className="monitoring-list assessment-detail-question-list">
                      {detail.items
                        .filter((item) => item.questionVersionId === inspectingId)
                        .map((item) => (
                          <li key={item.questionVersionId}>
                            <div className="assessment-question-heading">
                              <strong>Soal {item.displayOrder}</strong>
                              <Badge variant={item.reviewedAt ? 'success' : 'warning'}>
                                {detail.assessmentType !== 'DRILL'
                                  ? item.question && !item.validationIssues?.length
                                    ? 'Aman'
                                    : 'Perlu diperbaiki'
                                  : item.reviewedAt
                                    ? 'Sudah ditinjau'
                                    : 'Belum ditinjau'}
                              </Badge>
                            </div>
                            <small className="assessment-question-code">
                              Kode soal: {item.question?.externalId ?? item.questionVersionId}
                            </small>
                            {item.question ? (
                              <>
                                <Button variant="secondary" onClick={() => void loadMedia()}>
                                  Tampilkan gambar soal
                                </Button>
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
                                <details className="assessment-question-answer">
                                  <summary>Jawaban dan pembahasan</summary>
                                  <div>
                                    <p>
                                      <strong>Jawaban:</strong>{' '}
                                      {Object.entries(item.question.answer)
                                        .filter(([key]) => key !== 'type')
                                        .map(([_key, value]) =>
                                          typeof value === 'object' && value !== null
                                            ? Array.isArray(value)
                                              ? value.join(', ')
                                              : Object.entries(value)
                                                  .map(
                                                    ([label, answer]) =>
                                                      label + ': ' + String(answer),
                                                  )
                                                  .join('; ')
                                            : String(value),
                                        )
                                        .join(' ? ')}
                                    </p>
                                    <ContentRichText
                                      text={item.question.explanation.text}
                                      media={media}
                                      retry={loadMedia}
                                      renderBareMath
                                    />
                                  </div>
                                </details>
                              </>
                            ) : (
                              <div className="assessment-question-problem">
                                <h4>Soal belum bisa ditinjau</h4>
                                <p>
                                  Data soal ini belum lolos validasi. Buka pemeriksaan versi untuk
                                  melihat isi, metadata, dan langkah revisinya. Menandai review
                                  belum dapat dilakukan sebelum data valid.
                                </p>
                                {detail.legacyPreparation ? (
                                  <Button
                                    variant="secondary"
                                    onClick={() => {
                                      setInspectingId(null);
                                      setCompositionOpen(true);
                                    }}
                                  >
                                    Lengkapi sumber untuk impor perbaikan
                                  </Button>
                                ) : (
                                  <Link
                                    className="numora-button numora-button--secondary"
                                    href={`/admin/content/imports?mode=json&type=${detail.assessmentType}&package=${encodeURIComponent(detail.id)}`}
                                  >
                                    Perbaiki melalui impor
                                  </Link>
                                )}
                                <Link
                                  className="numora-button numora-button--secondary"
                                  href={`/admin/content/versions/${item.questionVersionId}?package=${encodeURIComponent(detail.id)}`}
                                >
                                  Periksa / perbaiki soal
                                </Link>
                              </div>
                            )}
                            {detail.assessmentType !== 'TRYOUT' && (
                              <p>
                                {item.reviewedAt
                                  ? `Ditinjau pada ${new Date(item.reviewedAt).toLocaleString('id-ID')}`
                                  : 'Belum ditinjau'}{' '}
                                · {item.contentStatus}
                              </p>
                            )}
                            {item.question && (
                              <Link
                                href={`/admin/content/versions/${item.questionVersionId}?package=${encodeURIComponent(detail.id)}`}
                              >
                                Perbaiki soal
                              </Link>
                            )}
                            <p className="assessment-question-removal-help">
                              Mengeluarkan soal hanya mengubah isi paket ini. Soal tetap tersimpan
                              di bank konten.
                            </p>
                            {detail.assessmentType === 'DRILL' && (
                              <div className="assessment-question-review-note">
                                {' '}
                                <label>
                                  Catatan pemeriksaan soal ini
                                  <textarea
                                    value={notes}
                                    maxLength={1000}
                                    rows={2}
                                    placeholder="Catat hasil pemeriksaan materi, jawaban, dan pembahasan"
                                    onChange={(event) => setNotes(event.target.value)}
                                    disabled={locked || detail.status !== 'DRAFT'}
                                  />
                                </label>
                                <p className="assessment-review-help">
                                  Catatan ini hanya disimpan untuk soal yang sedang ditinjau.
                                </p>
                              </div>
                            )}
                            <div className="admin-content-actions">
                              {detail.assessmentType === 'DRILL' && (
                                <Button
                                  variant="secondary"
                                  disabled={locked || !item.question || detail.status !== 'DRAFT'}
                                  onClick={() =>
                                    void run(async () => {
                                      await reviewImportedQuestion(
                                        token,
                                        item.questionVersionId,
                                        notes,
                                        detail.id,
                                      );
                                      await choose(detail.id);
                                      setNotice(
                                        `Soal ${item.displayOrder} ditandai sudah ditinjau.`,
                                      );
                                    })
                                  }
                                >
                                  Tandai soal {item.displayOrder} sudah ditinjau
                                </Button>
                              )}
                              {detail.assessmentType === 'DRILL' &&
                                !item.reviewedAt &&
                                detail.status === 'DRAFT' && (
                                  <small className="assessment-review-help">
                                    {!item.question
                                      ? 'Soal belum lolos validasi; buka Periksa / perbaiki soal.'
                                      : 'Soal siap ditandai sudah ditinjau. Catatan opsional.'}
                                  </small>
                                )}
                              <Button
                                variant="secondary"
                                disabled={locked || detail.status !== 'DRAFT'}
                                onClick={() =>
                                  void run(async () => {
                                    await updateContentPackage(token, detail.id, {
                                      name: detail.name,
                                      expectedRevision: detail.contentRevision,
                                      questionVersionIds: detail.items
                                        .filter(
                                          (i) => i.questionVersionId !== item.questionVersionId,
                                        )
                                        .map((i) => i.questionVersionId),
                                    });
                                    await choose(detail.id);
                                  })
                                }
                              >
                                Keluarkan soal {item.displayOrder} dari paket
                              </Button>
                            </div>
                          </li>
                        ))}
                    </ul>
                  )}
                  {error && <p role="alert">{error}</p>}
                </div>
              </Dialog>
            </section>
            <aside
              className="assessment-detail-sidebar assessment-status-panels"
              aria-label="Kesiapan dan publikasi paket"
            >
              {!compactTryout && (
                <div className="assessment-information-actions">
                  <Button variant="secondary" onClick={() => setInformationOpen('access')}>
                    <Icon name="users" width={18} height={18} /> Akses siswa
                  </Button>
                  <Button variant="secondary" onClick={() => setInformationOpen('readiness')}>
                    <Icon name="clipboard" width={18} height={18} /> Syarat penerbitan
                  </Button>
                </div>
              )}
              <Dialog
                open={informationOpen !== null}
                onClose={() => setInformationOpen(null)}
                title={
                  informationOpen === 'access'
                    ? 'Akses siswa dan informasi versi'
                    : 'Syarat penerbitan paket'
                }
                className="admin-management-dialog assessment-information-dialog"
              >
                {informationOpen === 'access' ? (
                  <>
                    <section className="assessment-status-explanation">
                      <h3>Status paket</h3>
                      <p>
                        Status menunjukkan lifecycle admin: draf, diterbitkan, atau arsip. Ini
                        berbeda dari ketersediaan siswa yang dipengaruhi jadwal dan aturan batch.
                      </p>
                    </section>
                    <PackageAvailability detail={detail} />
                  </>
                ) : (
                  <section className="assessment-detail-checklist">
                    <p>
                      {detail.readiness.checks.filter((check) => check.passed).length} dari{' '}
                      {detail.readiness.checks.length} syarat terpenuhi
                    </p>
                    <p>Status kelengkapan paket berdasarkan pemeriksaan sistem.</p>
                    <ul className="assessment-publication-checks">
                      {detail.readiness.checks.map((check) => (
                        <li key={check.code}>
                          <Icon
                            name={check.passed ? 'check-circle' : 'info'}
                            width={20}
                            height={20}
                          />
                          <div>
                            <Badge variant={check.passed ? 'success' : 'warning'} size="sm">
                              {check.passed ? 'Lolos' : 'Belum'}
                            </Badge>
                            <p>
                              {check.detail ||
                                checklistActions[check.code] ||
                                'Rincian syarat belum tersedia.'}
                            </p>
                            {!check.passed && check.detail && checklistActions[check.code] && (
                              <small>{checklistActions[check.code]}</small>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                    {detail.readiness.checks.length === 0 && (
                      <p className="assessment-checklist-empty">
                        Rincian pemeriksaan belum tersedia. Buka Penerbitan untuk memeriksa kesiapan
                        paket.
                      </p>
                    )}
                    {!detail.readiness.canPublish &&
                      detail.readiness.checks.some((check) => !check.passed) && (
                        <p role="alert" className="assessment-checklist-note">
                          {detail.readiness.checks.filter((check) => !check.passed).length} syarat
                          belum terpenuhi. Ikuti petunjuk pada baris bertanda <strong>Belum</strong>
                          .
                        </p>
                      )}
                    {detail.assessmentType !== 'TRYOUT' && detail.curriculumApproval && (
                      <p>
                        Persetujuan tim kurikulum: {detail.curriculumApproval.reference} ·{' '}
                        {new Date(detail.curriculumApproval.approvedAt).toLocaleString('id-ID')}
                      </p>
                    )}
                  </section>
                )}
              </Dialog>
              <Dialog
                open={publicationOpen}
                onClose={() => setPublicationOpen(false)}
                pending={locked}
                title="Penerbitan paket"
                className="admin-management-dialog assessment-publication-dialog"
              >
                <section
                  className="assessment-detail-workspace assessment-detail-publication"
                  aria-label="Publikasi paket"
                >
                  <h3>
                    {detail.status === 'DRAFT'
                      ? detail.assessmentType !== 'DRILL'
                        ? 'Terbitkan paket'
                        : 'Persetujuan dan penerbitan'
                      : 'Pengelolaan publikasi'}
                  </h3>
                  {detail.assessmentType === 'TRYOUT' && (
                    <p>
                      Atur jadwal dan penerima setelah paket terbit melalui{' '}
                      <Link href="/admin/tryout-batches">Batch Tryout</Link>.
                    </p>
                  )}
                  {detail.status === 'DRAFT' && detail.assessmentType === 'DRILL' && (
                    <div className="content-import-card">
                      <p className="assessment-publication-summary">
                        {detail.readiness.canPublish
                          ? 'Paket siap diterbitkan setelah konfirmasi.'
                          : 'Paket belum siap diterbitkan. Perbaiki soal dan lengkapi syarat penerbitan terlebih dahulu.'}
                      </p>
                      <details className="assessment-approval-step">
                        <summary>1. Simpan persetujuan tim kurikulum</summary>
                        <div>
                          <label>
                            Bukti persetujuan tim kurikulum
                            <input
                              value={approvalReference}
                              maxLength={1000}
                              disabled={locked}
                              onChange={(e) => setApprovalReference(e.target.value)}
                              placeholder="Tautan dokumen atau referensi persetujuan"
                            />
                          </label>
                          <label>
                            <input
                              type="checkbox"
                              checked={approvalConfirmed}
                              disabled={locked}
                              onChange={(e) => setApprovalConfirmed(e.target.checked)}
                            />
                            Susunan paket, kesulitan, kunci dan pembahasan sudah disetujui tim
                            kurikulum.
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
                            Simpan persetujuan
                          </Button>
                        </div>
                      </details>
                      <div className="assessment-publish-step">
                        <h4>2. Terbitkan paket</h4>
                        <label>
                          <input
                            type="checkbox"
                            checked={publishConfirmed}
                            onChange={(event) => setPublishConfirmed(event.target.checked)}
                            disabled={locked}
                          />
                          Saya telah memeriksa paket dan menyetujui publikasi versi ini.
                        </label>
                        <Button
                          disabled={locked || !detail.readiness.canPublish || !publishConfirmed}
                          onClick={() =>
                            void run(async () => {
                              await publishContentPackage(token, detail.id, {
                                expectedRevision: detail.contentRevision,
                              });
                              await choose(detail.id);
                              setReload((n) => n + 1);
                            })
                          }
                        >
                          Publikasikan paket
                        </Button>
                      </div>
                    </div>
                  )}
                  {detail.status === 'DRAFT' && detail.assessmentType !== 'DRILL' && (
                    <div className="content-import-card">
                      {publicationProblems.length > 0 ? (
                        <div className="assessment-publication-problems" role="alert">
                          <h4>Lengkapi paket sebelum diterbitkan</h4>
                          <p>
                            Tidak perlu menandai persetujuan. Setelah data diperbaiki, jalankan
                            validasi ulang. Paket siap jika semua pemeriksaan otomatis lolos.
                          </p>
                          <ul>
                            {publicationProblems.map((check) => (
                              <li key={check.code}>
                                <strong>{check.detail}</strong>
                                {check.code !== 'RUNTIME' && (
                                  <p>
                                    {checklistActions[check.code] ??
                                      'Lengkapi data paket yang disebutkan di atas.'}
                                  </p>
                                )}
                              </li>
                            ))}
                          </ul>
                          {detail.items
                            .filter((item) => item.validationIssues?.length || !item.question)
                            .map((item) => (
                              <section
                                className="assessment-publication-issue"
                                key={item.questionVersionId}
                              >
                                <h4>Soal {item.displayOrder}</h4>
                                <ul>
                                  {(item.validationIssues?.length
                                    ? item.validationIssues
                                    : ['Isi atau metadata soal belum lengkap.']
                                  ).map((issue) => (
                                    <li key={issue}>{issue}</li>
                                  ))}
                                </ul>
                                {item.scoringRepairRequired ? (
                                  <Button disabled={locked} onClick={prepareScoring}>
                                    {busy
                                      ? 'Menyiapkan penilaian...'
                                      : 'Siapkan penilaian otomatis'}
                                  </Button>
                                ) : (
                                  <Link
                                    className="numora-button numora-button--secondary"
                                    href={`/admin/content/versions/${item.questionVersionId}?package=${encodeURIComponent(detail.id)}`}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    Perbaiki
                                  </Link>
                                )}
                              </section>
                            ))}
                          {detail.items.some((item) => !item.question) && (
                            <p>
                              Soal yang perlu diperbaiki:{' '}
                              {detail.items
                                .filter((item) => !item.question)
                                .map((item) => item.displayOrder)
                                .join(', ')}
                              . Buka Kelola soal pada daftar soal.
                            </p>
                          )}
                          <div className="admin-content-actions">
                            <Button
                              disabled={locked}
                              onClick={() =>
                                void run(async () => {
                                  await choose(detail.id);
                                  setNotice('Validasi paket diperbarui.');
                                })
                              }
                            >
                              {busy ? 'Memvalidasi…' : 'Validasi ulang'}
                            </Button>
                            <Button
                              variant="secondary"
                              disabled={locked}
                              onClick={() => setPublicationOpen(false)}
                            >
                              Kembali ke paket
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="assessment-publish-step">
                          <p>
                            Yakin ingin menerbitkan paket <strong>{detail.name}</strong> versi{' '}
                            {detail.packageVersion}?
                          </p>
                          <Button
                            disabled={locked}
                            onClick={() =>
                              void run(async () => {
                                await publishContentPackage(token, detail.id, {
                                  expectedRevision: detail.contentRevision,
                                  ...(detail.assessmentType === 'PRETEST'
                                    ? { confirmed: true }
                                    : {}),
                                });
                                await choose(detail.id);
                                setReload((n) => n + 1);
                                setPublicationOpen(false);
                              })
                            }
                          >
                            Publikasikan paket
                          </Button>
                          <Button
                            variant="secondary"
                            disabled={locked}
                            onClick={() => setPublicationOpen(false)}
                          >
                            Batal
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                  {['DRAFT', 'PUBLISHED', 'CLOSED'].includes(detail.status) && (
                    <>
                      <label>
                        <input
                          type="checkbox"
                          checked={archiveConfirmed}
                          onChange={(event) => setArchiveConfirmed(event.target.checked)}
                          disabled={locked}
                        />
                        Saya memahami arsip menghentikan distribusi baru dan mempertahankan histori.
                      </label>
                      <Button
                        variant="secondary"
                        disabled={locked || !archiveConfirmed}
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
                    </>
                  )}

                  {error && <p role="alert">{error}</p>}
                  {detail.status === 'ARCHIVED' && (
                    <p>Paket diarsipkan. Histori pengerjaan tetap dipertahankan.</p>
                  )}
                </section>
              </Dialog>
            </aside>
          </div>
        </div>
      )}
      {detail?.assessmentType === 'TRYOUT' && (
        <section className="tryout-pdf-print" aria-label="Soal Tryout untuk dicetak">
          <h1>{detail.name}</h1>
          {detail.items.map((item, index) =>
            item.question ? (
              <article className="tryout-pdf-question" key={item.questionVersionId}>
                <h2>{index + 1}. Soal</h2>
                <ContentRichText
                  text={item.question.stem.text}
                  media={media}
                  retry={loadMedia}
                  renderBareMath
                />
                <ol className="tryout-pdf-options" type="A">
                  {item.question.options.map((option) => (
                    <li key={option.id}>
                      <strong>{option.id}.</strong>{' '}
                      <ContentRichText
                        text={option.content.text}
                        media={media}
                        retry={loadMedia}
                        renderBareMath
                      />
                    </li>
                  ))}
                </ol>
                <p className="tryout-pdf-answer">
                  <strong>Kunci jawaban:</strong> {formatTryoutAnswer(item.question.answer)}
                </p>
              </article>
            ) : null,
          )}
        </section>
      )}
      {detailLoading && <p role="status">Memuat detail paket…</p>}
      {busy && (
        <div role="status" aria-live="polite" className="assessment-package-progress">
          Memproses paket. Tunggu hingga selesai...
        </div>
      )}
      {notice && <p role="status">{notice}</p>}
      {error && (
        <AdminMessage
          error
          message={error}
          retry={() => {
            setReload((n) => n + 1);
            if (urlContext || mode === 'detail') setSelectionRetry((n) => n + 1);
          }}
        />
      )}
    </Card>
  );
}
