'use client';

import { ADMIN_PAGE_SIZE } from './pagination';

import { useAuth } from '@/features/onboarding/auth';
import { apiRequest } from '@/lib/api';
import { Button } from '@tka/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { AdminFrame, AdminLoading, AdminMessage } from './admin-presentation';
import { useAdminAccessError, withAdminWorkspace } from './admin-workspace';
import { adminOffset, useAdminUrl } from './admin-url';
import { AdminPagination, useAdminPagination } from './admin-pagination';
import { downloadFile } from './content-excel-api';
import { ContentExcelPreview } from './content-excel-preview';
import { createPreview, submitPreview } from './content-preview-api';
import {
  DrillGeneratorDialog,
  DrillGeneratorLineage,
  drillGeneratorBlocker,
} from './drill-generator';
import {
  GeneratorCreateDialog,
  generatorError,
  generatorTypeLabels,
} from './generator-package-form';
import type {
  GeneratorPackageDto,
  GeneratorPackageFileDto,
  GeneratorPreviewDto,
  ExcelParseDto,
} from './generated-types';
import {
  getGeneratorPackage,
  cancelGeneratorPackage,
  getGeneratorPackageFile,
  listGeneratorPackages,
  retryGeneratorPackage,
} from './generator-package-api';

export { generatorTypeLabels } from './generator-package-form';
const statusLabels: Record<GeneratorPackageDto['status'], string> = {
  GENERATING: 'Sedang dibuat',
  FAILED: 'Perlu dicoba lagi',
  READY: 'Siap diimpor',
  IMPORTED: 'Sudah diimpor',
  CANCELLED: 'Dibatalkan',
};
export function useGeneratorToken() {
  const { state } = useAuth();
  return state.status === 'ready' &&
    state.profile.role === 'ADMIN' &&
    state.profile.status === 'ACTIVE' &&
    state.profile.capabilities?.includes('CONTENT_MANAGE')
    ? state.session.access_token
    : null;
}
export function GeneratorFilePreview({ file }: { file: GeneratorPackageFileDto }) {
  const token = useGeneratorToken();
  const [previews, setPreviews] = useState<Record<string, GeneratorPreviewDto>>({});
  const [anchorMedia, setAnchorMedia] = useState<ExcelParseDto['media']>([]);
  const [mediaError, setMediaError] = useState('');
  useEffect(() => {
    let active = true;
    if (token)
      void Promise.all(
        file.items
          .filter((item) => item.question.metadata.assetManifest.length > 0)
          .map(
            async (item) =>
              [
                item.requestId,
                await apiRequest<GeneratorPreviewDto>(
                  `admin/content/generator/requests/${item.requestId}/preview`,
                  token,
                ),
              ] as const,
          ),
      )
        .then((items) => {
          if (active) {
            setPreviews(Object.fromEntries(items));
            setMediaError('');
          }
        })
        .catch(() => {
          if (active)
            setMediaError(
              'Gambar kandidat belum dapat dimuat. Muat ulang preview untuk mencoba lagi.',
            );
        });
    const anchors = file.anchors?.filter((item) => item.question.metadata.assetManifest.length);
    if (token && anchors?.length) {
      void createPreview(
        token,
        {
          questionVersionIds: anchors.map((item) => item.lineage.parentQuestionVersionId),
        },
        crypto.randomUUID(),
      )
        .then((preview) => submitPreview(token, preview.id, crypto.randomUUID()))
        .then((review) => {
          if (!active) return;
          setAnchorMedia(
            anchors.flatMap((anchor) => {
              const instance = review.items.find(
                (item) => item.questionVersionId === anchor.lineage.parentQuestionVersionId,
              );
              return review.media
                .filter((asset) => asset.instanceId === instance?.instanceId)
                .map((asset) => ({
                  externalId: anchor.question.externalId,
                  assetId: asset.assetId,
                  url: asset.url,
                  base64: '',
                }));
            }),
          );
        })
        .catch(() => {
          if (active) setMediaError('Gambar anchor belum dapat dimuat.');
        });
    }
    return () => {
      active = false;
    };
  }, [file, token]);
  const questions = [
    ...file.items.map((item) => ({
      ...item.question,
      metadata: {
        ...item.question.metadata,
        assetManifest: (previews[item.requestId]?.media ?? []).map((m, index) => ({
          externalId: item.question.externalId,
          assetId: m.assetId,
          textMarker: `[[asset:${m.assetId}]]`,
          placement: m.placement,
          itemId: null,
          assetOrder: index + 1,
          altText: m.altText,
          objectKey: null,
          sha256: m.sha256,
          contentType: m.contentType,
          byteLength: m.byteLength,
          bucket: '',
        })),
      },
    })),
    ...(file.anchors?.map((item) => item.question) ?? []),
  ].sort((a, b) => (a.metadata.sourceOrder ?? 0) - (b.metadata.sourceOrder ?? 0));
  const media: ExcelParseDto['media'] = file.items.flatMap((item) =>
    (previews[item.requestId]?.media ?? []).map((m) => ({
      externalId: item.question.externalId,
      assetId: m.assetId,
      url: m.url,
      base64: '',
    })),
  );
  return (
    <>
      {mediaError && <p role="alert">{mediaError}</p>}
      {file.drillVariant && (
        <DrillGeneratorLineage
          manifest={{
            ...file.drillVariant,
            items: file.drillVariant.items.map(
              (item) =>
                file.items.find((focal) => focal.requestId === item.requestId)?.lineage ?? item,
            ),
          }}
        />
      )}
      <ContentExcelPreview
        excel={{
          envelope: { questions },
          media: [...media, ...anchorMedia],
          issues: [],
        }}
        selected={new Set(questions.map((question) => question.externalId))}
        report={null}
        disabled
        hideIndicator={file.assessmentType === 'TRYOUT'}
        sourceFormat="JSON"
        select={() => {}}
        edit={() => {}}
        retry={() => {}}
        editingChanged={() => {}}
      />
    </>
  );
}
export const GeneratorPackageScreen = withAdminWorkspace(
  GeneratorPackageScreenProtected,
  'content',
);
function GeneratorPackageScreenProtected() {
  const token = useGeneratorToken();
  const url = useAdminUrl();
  const activeId = url.params.get('package') || undefined;
  const [creating, setCreating] = useState(false);
  const [creatingDrill, setCreatingDrill] = useState(false);
  useEffect(() => {
    if (activeId) setCreating(false);
    if (activeId) setCreatingDrill(false);
  }, [activeId]);
  return (
    <AdminFrame
      title="Generator paket"
      description="Buat kandidat soal, pantau prosesnya, lalu periksa hasil melalui Impor soal."
      icon="book"
      management
    >
      <div className="admin-generator-workspace">
        <div className="generator-taskbar">
          <Link href="/admin/content/generator/individual">Generator per soal</Link>
          {activeId ? (
            <Button variant="ghost" onClick={() => url.update({ package: null })}>
              Kembali ke riwayat
            </Button>
          ) : (
            <Link href="/admin/content">Bank soal & assessment</Link>
          )}
          {activeId ? (
            <Link href="/admin/content/imports">Impor soal</Link>
          ) : (
            <>
              <Button variant="secondary" onClick={() => setCreatingDrill(true)}>
                Varian Drill
              </Button>
              <Button onClick={() => setCreating(true)}>Generate Variant</Button>
            </>
          )}
        </div>
        {process.env.NEXT_PUBLIC_GENERATOR_DEMO === 'true' && (
          <p className="generator-footnote" role="status">
            DEMO LOKAL — Soal dan persetujuan TEST ONLY; bukan persetujuan akademik produksi.
          </p>
        )}
        <GeneratorResultsScreen
          key={activeId ?? 'directory'}
          {...(activeId ? { id: activeId } : {})}
          embedded
          autoOpen
          onSelect={(id) => url.update({ package: id })}
        />
        {!activeId && token && (
          <GeneratorCreateDialog
            open={creating}
            token={token}
            onClose={() => setCreating(false)}
            onCreated={(id) => {
              setCreating(false);
              url.update({ package: id, offset: null });
            }}
          />
        )}
        {!activeId && token && creatingDrill && (
          <DrillGeneratorDialog
            token={token}
            onClose={() => setCreatingDrill(false)}
            onCreated={(id) => {
              setCreatingDrill(false);
              url.update({ package: id, offset: null });
            }}
          />
        )}
      </div>
    </AdminFrame>
  );
}
function ResultsFrame({ embedded, children }: { embedded: boolean; children: ReactNode }) {
  const body = (
    <section className="generator-results" aria-label="Hasil generator">
      {children}
    </section>
  );
  return embedded ? (
    body
  ) : (
    <AdminFrame
      title="Detail paket generator"
      description="Pantau progres dan periksa hasil paket sebelum diimpor."
      icon="book"
      management
    >
      <div className="admin-generator-workspace">
        <div className="generator-taskbar">
          <Link href="/admin/content/generator">Kembali ke riwayat</Link>
        </div>
        {body}
      </div>
    </AdminFrame>
  );
}
export const GeneratorResultsScreen = withAdminWorkspace(
  GeneratorResultsScreenProtected,
  'content',
);
function GeneratorResultsScreenProtected({
  id,
  embedded = false,
  autoOpen = false,
  onSelect,
}: {
  id?: string;
  embedded?: boolean;
  autoOpen?: boolean;
  onSelect?: (id: string) => void;
}) {
  const onAccessError = useAdminAccessError();
  const token = useGeneratorToken();
  const router = useRouter();
  const url = useAdminUrl();
  const [items, setItems] = useState<GeneratorPackageDto[] | null>(null);
  const [current, setCurrent] = useState<GeneratorPackageDto | null>(null);
  const [file, setFile] = useState<GeneratorPackageFileDto | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [action, setAction] = useState<'retry' | 'preview' | 'download' | 'cancel' | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const retryKey = useRef<string | null>(null);
  const active = useRef(false);
  const scope = useRef(0);
  const serial = useRef(0);
  const mutating = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const load = useCallback(async () => {
    if (!token || mutating.current) return;
    const request = ++serial.current;
    setRefreshing(true);
    try {
      const data = id ? await getGeneratorPackage(token, id) : await listGeneratorPackages(token);
      if (active.current && serial.current === request) {
        if ('items' in data) setItems(data.items);
        else setCurrent(data);
        setError('');
      }
    } catch (cause) {
      if (active.current && serial.current === request) {
        onAccessError(cause);
        setError(generatorError(cause, 'Riwayat generator belum dapat dimuat.'));
      }
    } finally {
      if (active.current && serial.current === request) setRefreshing(false);
    }
  }, [token, id, onAccessError]);
  useEffect(() => {
    active.current = true;
    scope.current += 1;
    mutating.current = false;
    setAction(null);
    setConfirmCancel(false);
    retryKey.current = null;
    setFile(null);
    setCurrent(null);
    setItems(null);
    setError('');
    void load();
    return () => {
      active.current = false;
      scope.current += 1;
      serial.current += 1;
    };
  }, [load]);
  useEffect(() => {
    if (!id || current?.status !== 'GENERATING' || current.blockers?.length) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      await load();
      if (!stopped) timer = setTimeout(() => void poll(), 3000);
    }
    timer = setTimeout(() => void poll(), 3000);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [id, current?.status, current?.blockers?.length, load]);
  useEffect(() => {
    if (
      autoOpen &&
      current?.id === id &&
      current &&
      !current.drillVariant &&
      ['READY', 'IMPORTED'].includes(current.status)
    )
      router.replace(`/admin/content/imports?generatorPackage=${encodeURIComponent(current.id)}`);
  }, [autoOpen, current, id, router]);
  useEffect(() => {
    if (current?.id) heading.current?.focus();
  }, [current?.id]);
  async function perform(kind: 'retry' | 'preview' | 'download' | 'cancel') {
    if (!token || !current || mutating.current) return;
    const identity = scope.current;
    const valid = () => active.current && scope.current === identity;
    mutating.current = true;
    serial.current += 1;
    setRefreshing(false);
    setAction(kind);
    setError('');
    try {
      if (kind === 'retry') {
        retryKey.current ??= crypto.randomUUID();
        const result = await retryGeneratorPackage(token, current.id, retryKey.current);
        if (valid()) {
          setCurrent(result);
          retryKey.current = null;
        }
      } else if (kind === 'cancel') {
        const result = await cancelGeneratorPackage(token, current.id);
        if (valid()) {
          setCurrent(result);
          setConfirmCancel(false);
        }
      } else {
        const json = await getGeneratorPackageFile(token, current.id);
        if (valid()) {
          if (kind === 'preview') setFile(json);
          else
            downloadFile(
              new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' }),
              `generator-${current.assessmentType.toLowerCase()}-${current.id}.json`,
            );
        }
      }
    } catch (cause) {
      if (valid()) {
        onAccessError(cause);
        setError(generatorError(cause, 'Permintaan belum berhasil. Coba lagi.'));
      }
    } finally {
      if (valid()) {
        mutating.current = false;
        setAction(null);
      }
    }
  }
  const page = useAdminPagination(items ?? [], token, {
    offset: adminOffset(url.params.get('offset')),
    onChange: (offset) => url.update({ offset: offset || null }),
  });
  return (
    <ResultsFrame embedded={embedded}>
      {!token ? (
        <AdminMessage message="Akses Super Admin atau Content/Data/Moderation diperlukan." />
      ) : (
        <>
          {error && <AdminMessage error message={error} retry={() => void load()} />}
          {!id && (
            <div className="generator-directory">
              <header className="generator-section-heading">
                <div>
                  <h2>Riwayat paket</h2>
                  <p>Riwayat terbaru dari server. Maksimal {ADMIN_PAGE_SIZE} paket per halaman.</p>
                </div>
                <Button
                  variant="secondary"
                  disabled={refreshing}
                  onClick={() => void load()}
                  loading={refreshing && items !== null}
                >
                  Muat ulang
                </Button>
              </header>
              {items === null ? (
                !error && <AdminLoading message="Memuat riwayat generator..." />
              ) : !items.length ? (
                <AdminMessage message="Belum ada paket generator. Pilih Generate Variant untuk membuat kandidat soal." />
              ) : (
                <>
                  <table className="generator-table">
                    <caption className="sr-only">Riwayat paket generator yang dimuat</caption>
                    <thead>
                      <tr>
                        <th scope="col">Paket</th>
                        <th scope="col">Status</th>
                        <th scope="col">Soal selesai</th>
                        <th scope="col">Dibuat (WIB)</th>
                        <th scope="col">Tindakan</th>
                      </tr>
                    </thead>
                    <tbody>
                      {page.items.map((pack) => (
                        <tr key={pack.id}>
                          <td>
                            <strong>{pack.title}</strong>
                            <span>{generatorTypeLabels[pack.assessmentType]}</span>
                          </td>
                          <td>
                            <span className={`generator-status is-${pack.status.toLowerCase()}`}>
                              {statusLabels[pack.status]}
                            </span>
                          </td>
                          <td data-label="Soal selesai">
                            {pack.completedCount}/{pack.expectedCount}
                            {pack.failedCount > 0 && (
                              <span>{pack.failedCount} perlu dicoba lagi</span>
                            )}
                          </td>
                          <td data-label="Dibuat (WIB)">
                            <time dateTime={pack.createdAt}>
                              {new Date(pack.createdAt).toLocaleString('id-ID', {
                                timeZone: 'Asia/Jakarta',
                                dateStyle: 'medium',
                                timeStyle: 'short',
                              })}
                            </time>
                          </td>
                          <td>
                            {onSelect ? (
                              <Button
                                variant="secondary"
                                aria-label={`Lihat detail ${pack.title}`}
                                onClick={() => onSelect(pack.id)}
                              >
                                Lihat detail
                              </Button>
                            ) : (
                              <Link
                                href={`/admin/content/generator?package=${encodeURIComponent(pack.id)}`}
                              >
                                Lihat detail
                              </Link>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <footer className="generator-directory-footer">
                    <p>
                      Menampilkan {page.pagination.offset + 1}–
                      {Math.min(page.pagination.offset + page.items.length, items.length)} dari{' '}
                      {items.length} paket yang dimuat.
                    </p>
                    <AdminPagination
                      offset={page.pagination.offset}
                      hasNext={page.pagination.hasNext}
                      onChange={page.pagination.onChange}
                      label="Halaman riwayat generator"
                      disabled={refreshing}
                    />
                  </footer>
                </>
              )}
            </div>
          )}
          {id && !current && !error && <AdminLoading message="Memuat detail paket generator..." />}
          {current?.id === id && current && (
            <article className="generator-detail">
              <header className="generator-section-heading">
                <div>
                  <span className={`generator-status is-${current.status.toLowerCase()}`}>
                    {statusLabels[current.status]}
                  </span>
                  <h2 ref={heading} tabIndex={-1}>
                    {current.title}
                  </h2>
                  <p>
                    {generatorTypeLabels[current.assessmentType]} ·{' '}
                    {current.drillVariant
                      ? '3 anchor original dan 7 focal'
                      : `${current.expectedCount} soal per paket`}
                  </p>
                </div>
                <Button
                  variant="secondary"
                  disabled={refreshing || action !== null}
                  loading={refreshing}
                  onClick={() => void load()}
                >
                  Perbarui status
                </Button>
              </header>
              <dl className="generator-progress">
                <div>
                  <dt>{current.drillVariant ? 'Focal selesai' : 'Soal selesai'}</dt>
                  <dd>
                    {current.completedCount}
                    <span> dari {current.expectedCount}</span>
                  </dd>
                </div>
                <div>
                  <dt>Perlu dicoba lagi</dt>
                  <dd>{current.failedCount}</dd>
                </div>
              </dl>
              <p className="generator-status-copy" role="status">
                {current.blockers?.length
                  ? current.blockers.map(drillGeneratorBlocker).join(' ')
                  : current.status === 'CANCELLED'
                    ? 'Permintaan varian Drill dibatalkan.'
                    : current.status === 'GENERATING'
                      ? 'Pembuatan soal sedang berjalan. Status diperbarui otomatis; kamu dapat kembali ke riwayat.'
                      : current.status === 'FAILED'
                        ? 'Sebagian proses belum berhasil. Coba kembali proses yang gagal tanpa membuat paket baru.'
                        : autoOpen && !current.drillVariant
                          ? 'Hasil siap. Membuka Preview & tujuan di Impor soal...'
                          : 'Hasil siap diperiksa melalui preview impor. Konten belum otomatis diterbitkan.'}
              </p>
              <div className="generator-detail-actions">
                {current.status === 'FAILED' && !current.blockers?.length && (
                  <Button
                    disabled={action !== null || refreshing}
                    loading={action === 'retry'}
                    onClick={() => void perform('retry')}
                  >
                    Coba generate lagi
                  </Button>
                )}
                {current.drillVariant &&
                  ['GENERATING', 'FAILED', 'READY'].includes(current.status) &&
                  (confirmCancel ? (
                    <>
                      <Button
                        variant="secondary"
                        disabled={action !== null}
                        onClick={() => setConfirmCancel(false)}
                      >
                        Kembali
                      </Button>
                      <Button
                        variant="danger"
                        disabled={action !== null}
                        loading={action === 'cancel'}
                        onClick={() => void perform('cancel')}
                      >
                        Konfirmasi pembatalan
                      </Button>
                    </>
                  ) : (
                    <Button
                      variant="secondary"
                      disabled={action !== null}
                      onClick={() => setConfirmCancel(true)}
                    >
                      Batalkan generation
                    </Button>
                  ))}
                {['READY', 'IMPORTED'].includes(current.status) && (
                  <>
                    <Button
                      disabled={action !== null}
                      loading={action === 'preview'}
                      onClick={() => void perform('preview')}
                    >
                      Lihat hasil
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={action !== null}
                      loading={action === 'download'}
                      onClick={() => void perform('download')}
                    >
                      Unduh JSON
                    </Button>
                    <Link
                      href={`/admin/content/imports?generatorPackage=${encodeURIComponent(current.id)}`}
                    >
                      Preview & impor
                    </Link>
                  </>
                )}
              </div>
              {current.packageId && (
                <p className="generator-footnote">
                  Paket sudah diimpor. Status publikasi mengikuti review dan validasi paket.
                </p>
              )}
              {current.drillVariant && (
                <DrillGeneratorLineage
                  manifest={current.drillVariant}
                  requests={current.requests}
                />
              )}
              <details className="generator-identity">
                <summary>Identitas paket</summary>
                <dl>
                  <dt>ID generator</dt>
                  <dd>{current.id}</dd>
                  {current.packageId && (
                    <>
                      <dt>ID paket hasil impor</dt>
                      <dd>{current.packageId}</dd>
                    </>
                  )}
                </dl>
              </details>
            </article>
          )}
          {file && <GeneratorFilePreview file={file} />}
        </>
      )}
    </ResultsFrame>
  );
}
