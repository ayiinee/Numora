'use client';
import Link from 'next/link';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card } from '@tka/ui';
import { useAuth } from '@/features/onboarding/auth';
import { AdminFrame, AdminLoading, AdminMessage } from './admin-presentation';
import {
  createGeneratorPackage,
  generatorPackageCatalog,
  getGeneratorPackage,
  getGeneratorPackageFile,
  listGeneratorPackages,
  retryGeneratorPackage,
} from './generator-package-api';
import { downloadFile } from './content-excel-api';
import { ContentExcelPreview } from './content-excel-preview';
import type {
  GeneratorPackageCatalogDto,
  GeneratorPackageDto,
  GeneratorPackageFileDto,
} from './generated-types';
export const generatorTypeLabels = { TRYOUT: 'Tryout', DRILL: 'Drill', PRETEST: 'Pretest' };
export function useGeneratorToken() {
  const { state } = useAuth();
  return state.status === 'ready' &&
    state.profile.role === 'ADMIN' &&
    state.profile.status === 'ACTIVE' &&
    state.profile.capabilities?.includes('CONTENT_MANAGE')
    ? state.session.access_token
    : null;
}
function GeneratorNav() {
  return (
    <nav className="admin-content-actions" aria-label="Generator paket">
      <Link href="/admin/content/generator">Generate paket</Link>
      <Link href="/admin/content/imports">Impor soal</Link>
    </nav>
  );
}
export function GeneratorFilePreview({ file }: { file: GeneratorPackageFileDto }) {
  return (
    <ContentExcelPreview
      excel={{ envelope: { questions: file.items.map((i) => i.question) }, media: [], issues: [] }}
      selected={new Set(file.items.map((i) => i.question.externalId))}
      report={null}
      disabled
      hideIndicator={file.assessmentType === 'TRYOUT'}
      sourceFormat="JSON"
      select={() => {}}
      edit={() => {}}
      retry={() => {}}
      editingChanged={() => {}}
    />
  );
}
export function GeneratorPackageScreen() {
  const token = useGeneratorToken(),
    router = useRouter();
  const [catalog, setCatalog] = useState<GeneratorPackageCatalogDto | null>(null),
    [type, setType] = useState<'TRYOUT' | 'DRILL' | 'PRETEST'>('TRYOUT'),
    [scope, setScope] = useState(''),
    [title, setTitle] = useState('Paket Tryout'),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const key = useRef<string | null>(null);
  const [activeId, setActiveId] = useState<string | undefined>();
  useEffect(() => {
    setActiveId(new URLSearchParams(window.location.search).get('package') ?? undefined);
  }, []);
  async function load() {
    if (!token) return;
    try {
      setCatalog(await generatorPackageCatalog(token));
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat sumber generator.');
    }
  }
  useEffect(() => {
    void load();
  }, [token]);
  const choices = catalog?.options.filter((o) => o.assessmentType === type) ?? [],
    choice =
      choices.find((o) => (o.scopeId ?? 'GLOBAL') === scope) ??
      (type === 'TRYOUT' ? choices[0] : null);
  async function generate() {
    if (!token || !choice) return;
    setBusy(true);
    setError('');
    try {
      key.current ??= crypto.randomUUID();
      const result = await createGeneratorPackage(token, key.current, {
        assessmentType: type,
        title,
        ...(choice.scopeId ? { scopeId: choice.scopeId } : {}),
      });
      key.current = null;
      setActiveId(result.id);
      window.history.replaceState(null, '', `?package=${result.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Generate gagal.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <AdminFrame
      title="Generator paket soal"
      description="Generate dan lihat riwayat paket di sini. Hasil selesai langsung masuk ke preview impor soal."
      icon="book"
    >
      <GeneratorNav />
      {process.env.NEXT_PUBLIC_GENERATOR_DEMO === 'true' && (
        <p role="status">
          DEMO LOKAL — Soal dan approval TEST ONLY, bukan persetujuan akademik produksi.
        </p>
      )}
      {!token ? (
        <AdminMessage message="Akses Super Admin atau Content/Data/Moderation diperlukan." />
      ) : (
        <>
          {error && <AdminMessage message={error} error retry={() => void load()} />}
          {!catalog && !error ? (
            <AdminLoading message="Memuat original mapped yang disetujui…" />
          ) : (
            <Card className="admin-generator-form">
              <label htmlFor="generator-type">Tujuan paket</label>
              <select
                id="generator-type"
                disabled={busy}
                value={type}
                onChange={(e) => {
                  const value = e.target.value as typeof type;
                  setType(value);
                  setScope('');
                  setTitle(`Paket ${generatorTypeLabels[value]}`);
                  key.current = null;
                }}
              >
                {Object.entries(generatorTypeLabels).map(([value, label]) => (
                  <option value={value} key={value}>
                    {label}
                  </option>
                ))}
              </select>
              <label htmlFor="generator-title">Judul paket</label>
              <input
                id="generator-title"
                maxLength={160}
                value={title}
                disabled={busy}
                onChange={(e) => {
                  setTitle(e.target.value);
                  key.current = null;
                }}
              />
              {type !== 'TRYOUT' && (
                <>
                  <label htmlFor="generator-scope">
                    {type === 'DRILL' ? 'Subbab dan level' : 'Bab'}
                  </label>
                  <select
                    id="generator-scope"
                    value={scope}
                    disabled={busy}
                    onChange={(e) => {
                      setScope(e.target.value);
                      key.current = null;
                    }}
                  >
                    <option value="">Pilih scope</option>
                    {choices.map((o) => (
                      <option key={o.scopeId} value={o.scopeId ?? ''}>
                        {o.scopeLabel}
                      </option>
                    ))}
                  </select>
                </>
              )}
              {choice ? (
                <p>
                  {choice.requiredCount} soal per paket. {choice.availableCount} original mapped
                  dari keluarga berbeda tersedia.
                  {!choice.canGenerate ? ' Sumber belum cukup untuk satu paket.' : ''}
                </p>
              ) : (
                <p>
                  {choices.length
                    ? 'Pilih scope untuk melihat jumlah soal.'
                    : 'Belum ada sumber mapped dengan tujuan dan scope ini.'}
                </p>
              )}
              <p>
                Generate menyimpan kandidat, belum membuat soal DRAFT atau menerbitkan paket. Hasil
                selesai langsung dibuka pada langkah Preview & tujuan di Impor soal.
              </p>
              <Button
                disabled={busy || !!activeId || !choice?.canGenerate || !title.trim()}
                loading={busy}
                onClick={() => void generate()}
              >
                Generate paket
              </Button>
            </Card>
          )}
          {activeId && (
            <Button
              variant="secondary"
              onClick={() => {
                setActiveId(undefined);
                router.replace('/admin/content/generator');
              }}
            >
              Lihat riwayat paket
            </Button>
          )}
          <GeneratorResultsScreen
            {...(activeId ? { id: activeId } : {})}
            embedded
            autoOpen
            onSelect={(id) => {
              setActiveId(id);
              window.history.replaceState(null, '', `?package=${id}`);
            }}
          />
        </>
      )}
    </AdminFrame>
  );
}
function ResultsFrame({ embedded, children }: { embedded: boolean; children: ReactNode }) {
  return embedded ? (
    <section aria-label="Hasil generator">
      <h2>Hasil generator</h2>
      {children}
    </section>
  ) : (
    <AdminFrame title="Generator paket" description="Generate dan tinjau hasil paket." icon="book">
      {children}
    </AdminFrame>
  );
}
export function GeneratorResultsScreen({
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
  const token = useGeneratorToken();
  const router = useRouter();
  const [items, setItems] = useState<GeneratorPackageDto[]>([]),
    [current, setCurrent] = useState<GeneratorPackageDto | null>(null),
    [file, setFile] = useState<GeneratorPackageFileDto | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const retryKey = useRef<string | null>(null);
  async function load() {
    if (!token) return;
    try {
      if (id) setCurrent(await getGeneratorPackage(token, id));
      else setItems((await listGeneratorPackages(token)).items);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat hasil.');
    }
  }
  useEffect(() => {
    setFile(null);
    void load();
  }, [token, id]);
  useEffect(() => {
    if (!id || current?.status !== 'GENERATING') return;
    const timer = setInterval(() => void load(), 3000);
    return () => clearInterval(timer);
  }, [token, id, current?.status]);
  useEffect(() => {
    if (autoOpen && current && current.id === id && ['READY', 'IMPORTED'].includes(current.status))
      router.replace(`/admin/content/imports?generatorPackage=${current.id}`);
  }, [autoOpen, current, id, router]);
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Permintaan gagal.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <ResultsFrame embedded={embedded}>
      {!embedded && <GeneratorNav />}
      {!token ? (
        <AdminMessage message="Akses Content Admin diperlukan." />
      ) : (
        <>
          {error && <AdminMessage message={error} error retry={() => void load()} />}
          {id && !current && !error && <AdminLoading message="Memuat hasil generator…" />}
          {current && current.id === id && (
            <Card className="admin-generator-form">
              <h2>{current.title}</h2>
              <p>
                {generatorTypeLabels[current.assessmentType]} · {current.completedCount}/
                {current.expectedCount} soal selesai ·{' '}
                {current.status === 'GENERATING'
                  ? 'Sedang generate'
                  : current.status === 'READY'
                    ? 'JSON siap'
                    : current.status === 'IMPORTED'
                      ? 'Sudah diimpor DRAFT'
                      : 'Perlu retry'}
              </p>
              <div className="admin-content-actions">
                <Button variant="secondary" disabled={busy} onClick={() => void load()}>
                  Perbarui status
                </Button>
                {current.failedCount > 0 && (
                  <Button
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        retryKey.current ??= crypto.randomUUID();
                        setCurrent(
                          await retryGeneratorPackage(token, current.id, retryKey.current),
                        );
                        retryKey.current = null;
                      })
                    }
                  >
                    Coba generate lagi
                  </Button>
                )}
                {['READY', 'IMPORTED'].includes(current.status) && (
                  <>
                    <Button
                      disabled={busy}
                      onClick={() =>
                        void run(async () =>
                          setFile(await getGeneratorPackageFile(token, current.id)),
                        )
                      }
                    >
                      Lihat hasil
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          const json = await getGeneratorPackageFile(token, current.id);
                          downloadFile(
                            new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' }),
                            `generator-${current.assessmentType.toLowerCase()}-${current.id}.json`,
                          );
                        })
                      }
                    >
                      Unduh JSON
                    </Button>
                    <Link
                      className="admin-generator-link"
                      href={`/admin/content/imports?generatorPackage=${current.id}`}
                    >
                      Impor JSON & preview
                    </Link>
                  </>
                )}
              </div>
              {current.packageId && (
                <p>
                  Paket DRAFT sudah tersimpan. Publication tetap mengikuti review dan validasi
                  paket.
                </p>
              )}
            </Card>
          )}
          {file && <GeneratorFilePreview file={file} />}
          {!id &&
            (items.length ? (
              <div className="admin-generator-history">
                {items.map((p) => (
                  <Card key={p.id}>
                    {onSelect ? (
                      <Button variant="secondary" onClick={() => onSelect(p.id)}>
                        {p.title}
                      </Button>
                    ) : (
                      <Link href={`/admin/content/generator?package=${p.id}`}>
                        <strong>{p.title}</strong>
                      </Link>
                    )}
                    <p>
                      {generatorTypeLabels[p.assessmentType]} · {p.completedCount}/{p.expectedCount}{' '}
                      · {p.status}
                    </p>
                  </Card>
                ))}
              </div>
            ) : (
              <AdminMessage message="Belum ada hasil paket generator." />
            ))}
        </>
      )}
    </ResultsFrame>
  );
}
