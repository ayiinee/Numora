'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Badge, Button, Card } from '@tka/ui';
import { ApiProblem } from '@/lib/api';
import { useAuth } from '@/features/onboarding/auth';
import { AdminFrame, AdminMessage } from './admin-presentation';
import { withAdminWorkspace, useAdminAccessError } from './admin-workspace';
import { assessmentPath } from './assessment-routes';
import { getContentPackage } from './content-package-api';
import { getContentVersionMedia } from './content-lifecycle-api';
import { ContentRichText } from './content-rich-text';
import {
  createTryoutVariant,
  getTryoutVariantOptions,
  getTryoutVariantProcess,
  materializeTryoutVariant,
} from './tryout-variant-api';
import type {
  ContentPackageDetailDto,
  ExcelQuestionDto,
  PreviewMediaDto,
  TryoutVariantOptionsDto,
  TryoutVariantProcessDto,
} from './generated-types';

export const AdminTryoutVariantWizard = withAdminWorkspace(TryoutVariantWizard, 'content');

const reasons: Record<string, string> = {
  ANCHOR_COUNT_INVALID: 'Pilih tepat 5 soal anchor.',
  GENERATOR_MAPPING_MISSING: 'Generator belum tersedia atau belum disetujui.',
  GENERATOR_MAPPING_AMBIGUOUS:
    'Ada lebih dari satu mapping generator. Minta tim konten menyelesaikan mapping.',
  GENERATOR_SERVICE_CONTRACT_DISABLED: 'Versi layanan generator belum didukung.',
  GENERATOR_MAPPING_NOT_APPROVED:
    'Approval generator berubah atau tidak valid. Periksa kembali kesiapan paket.',
  SOURCE_PACKAGE_NOT_PUBLISHED: 'Paket original harus diterbitkan terlebih dahulu.',
  SOURCE_PACKAGE_COUNT_INVALID: 'Paket original harus berisi tepat 30 soal.',
  SOURCE_PACKAGE_DUPLICATE_QUESTION: 'Paket original berisi soal duplikat.',
  SOURCE_PACKAGE_NOT_ORIGINAL: 'Semua soal sumber harus berupa soal original.',
  SOURCE_PACKAGE_USAGE_MISMATCH: 'Semua soal sumber harus ditujukan untuk Tryout.',
  SOURCE_PACKAGE_CONTENT_INVALID: 'Ada soal sumber yang sudah diarsipkan.',
  SOURCE_PACKAGE_DEMO: 'Paket demo tidak dapat digunakan.',
  TRYOUT_VARIANT_SOURCE_INVALID:
    'Paket sumber berubah. Kembali ke pilihan anchor lalu periksa ulang.',
  PACKAGE_REVISION_CONFLICT:
    'Revisi paket berubah. Kembali ke pilihan anchor lalu tinjau ulang sebelum generate.',
  GENERATOR_DISABLED: 'Layanan generator belum diaktifkan. Hubungi pengelola layanan.',
  GENERATOR_MAPPING_NOT_FOUND:
    'Mapping generator tidak lagi tersedia. Periksa ulang approval soal.',
  IDEMPOTENCY_CONFLICT:
    'Data proses berbeda dari pengajuan sebelumnya. Periksa ulang pilihan anchor.',
  GENERATOR_STOCK_EXHAUSTED: 'Stok varian habis. Minta tim konten menyiapkan stok baru.',
};
const reason = (code: string) => reasons[code] ?? `Perlu diperiksa oleh tim konten (${code}).`;
function failure(cause: unknown, fallback: string) {
  if (cause instanceof ApiProblem) {
    if (cause.code === 'TRYOUT_VARIANT_NOT_READY')
      return `Paket belum siap. ${cause.message.split(',').map(reason).join(' ')}`;
    return reasons[cause.code] ?? `${fallback} Kode: ${cause.code}.`;
  }
  return cause instanceof Error ? cause.message : fallback;
}

function QuestionContent({
  question,
  id,
  token,
}: {
  question: ExcelQuestionDto;
  id: string;
  token: string;
}) {
  const [media, setMedia] = useState<PreviewMediaDto[]>([]);
  const [pending, setPending] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState('');
  async function loadMedia() {
    if (pending) return;
    setPending(true);
    setError('');
    try {
      const value = await getContentVersionMedia(token, id);
      setMedia(
        value.items.flatMap((asset) =>
          asset.status === 'READY' && asset.url && asset.expiresAt
            ? [
                {
                  instanceId: id,
                  assetId: asset.assetId,
                  altText: asset.altText,
                  url: asset.url,
                  expiresAt: asset.expiresAt,
                },
              ]
            : [],
        ),
      );
    } catch {
      setError('Gambar gagal dimuat. Coba lagi melalui tombol pada gambar.');
    } finally {
      setPending(false);
    }
  }
  const rich = (text: string, renderMedia = true) => (
    <ContentRichText
      text={text}
      media={media}
      instanceId={id}
      mediaPending={pending}
      retry={loadMedia}
      renderMedia={renderMedia}
      renderBareMath
    />
  );
  return (
    <>
      <div className="tryout-variant-stem">{rich(question.stem.text, expanded)}</div>
      <details
        className="tryout-variant-detail"
        onToggle={(event) => {
          setExpanded(event.currentTarget.open);
          if (
            event.currentTarget.open &&
            !media.length &&
            (question.metadata.assetManifest.length ||
              [question.stem.text, ...question.options.map((option) => option.content.text)].some(
                (text) => text.includes('[[asset:'),
              ))
          )
            void loadMedia();
        }}
      >
        <summary>{expanded ? 'Sembunyikan pilihan jawaban' : 'Lihat pilihan jawaban'}</summary>
        {error && <p role="alert">{error}</p>}
        {!!question.metadata.categories?.length && (
          <p>
            Kategori: {question.metadata.categories.map((category) => category.label).join(' · ')}
          </p>
        )}
        <ol>
          {question.options.map((option) => (
            <li key={option.id}>
              <strong>{option.id}.</strong> {rich(option.content.text)}
            </li>
          ))}
        </ol>
      </details>
    </>
  );
}

function TryoutVariantWizard({ packageId }: { packageId: string }) {
  const { state } = useAuth();
  const accessError = useAdminAccessError();
  const [options, setOptions] = useState<TryoutVariantOptionsDto | null>(null);
  const [detail, setDetail] = useState<ContentPackageDetailDto | null>(null);
  const [verified, setVerified] = useState<TryoutVariantOptionsDto | null>(null);
  const [anchors, setAnchors] = useState<string[]>([]);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [search, setSearch] = useState('');
  const [onlySelected, setOnlySelected] = useState(false);
  const [process, setProcess] = useState<TryoutVariantProcessDto | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const operationKey = useRef<string | null>(null);

  useEffect(() => {
    if (state.status !== 'ready') return;
    let active = true;
    setLoading(true);
    Promise.all([
      getTryoutVariantOptions(state.session.access_token, packageId),
      getContentPackage(state.session.access_token, packageId),
    ])
      .then(([value, source]) => {
        if (active) {
          setOptions(value);
          setDetail(source);
          setError('');
        }
      })
      .catch((cause) => {
        if (active) {
          accessError(cause);
          setError(failure(cause, 'Paket gagal dimuat.'));
        }
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [state, packageId, accessError, reload]);

  const processId = process?.id;
  const processStatus = process?.status;
  useEffect(() => {
    if (!processId || processStatus !== 'GENERATING' || state.status !== 'ready') return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const value = await getTryoutVariantProcess(
          state.status === 'ready' ? state.session.access_token : '',
          processId!,
        );
        if (active) {
          setProcess(value);
          setError('');
        }
      } catch (cause) {
        if (active) {
          accessError(cause);
          setError(failure(cause, 'Status proses gagal dimuat. Pemeriksaan akan diulang.'));
        }
      } finally {
        if (active) timer = setTimeout(() => void poll(), 3000);
      }
    }
    timer = setTimeout(() => void poll(), 3000);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [processId, processStatus, state, accessError]);

  if (state.status !== 'ready') return null;
  const token = state.session.access_token;
  const selected = new Set(anchors);
  const focal = options?.focalQuestions.filter((item) => !selected.has(item.id)) ?? [];
  const blocked = focal.filter((item) => item.blockers.length);
  const items = new Map(detail?.items.map((item) => [item.questionVersionId, item.question]));
  const visible =
    options?.questions.filter(
      (item) =>
        (!onlySelected || selected.has(item.id)) &&
        `${item.displayOrder} ${item.label} ${items.get(item.id)?.stem.text ?? ''}`
          .toLocaleLowerCase()
          .includes(search.toLocaleLowerCase().trim()),
    ) ?? [];
  const sourceBlockers =
    options?.blockers.filter(
      (code) => code !== 'ANCHOR_COUNT_INVALID' && !options.generatorBlockers.includes(code),
    ) ?? [];

  function changeAnchors(next: string[]) {
    setAnchors(next);
    setVerified(null);
    operationKey.current = null;
    setError('');
  }
  async function review() {
    if (busy || anchors.length !== 5) return;
    setBusy(true);
    setError('');
    try {
      const value = await getTryoutVariantOptions(token, packageId, anchors);
      setVerified(value);
      setStep(2);
    } catch (cause) {
      accessError(cause);
      setError(failure(cause, 'Kesiapan generator gagal diperiksa.'));
    } finally {
      setBusy(false);
    }
  }
  async function start() {
    if (!verified?.canGenerate || busy) return;
    setBusy(true);
    setError('');
    operationKey.current ??= crypto.randomUUID();
    try {
      setProcess(
        await createTryoutVariant(token, packageId, {
          anchorQuestionVersionIds: anchors,
          operationKey: operationKey.current,
          expectedRevision: verified.contentRevision,
        }),
      );
      setStep(3);
    } catch (cause) {
      accessError(cause);
      setError(failure(cause, 'Generate varian gagal dimulai.'));
    } finally {
      setBusy(false);
    }
  }
  async function materialize() {
    if (!process || busy) return;
    setBusy(true);
    setError('');
    try {
      const value = await materializeTryoutVariant(token, process.id);
      window.location.href = assessmentPath('TRYOUT', value.id);
    } catch (cause) {
      accessError(cause);
      setError(failure(cause, 'Paket varian gagal disiapkan.'));
    } finally {
      setBusy(false);
    }
  }
  const completed =
    process?.requests.filter((request) => request.executionStatus === 'SUCCEEDED').length ?? 0;

  return (
    <AdminFrame
      title="Generate varian Tryout"
      description="Pertahankan 5 soal anchor, buat varian untuk 25 soal lainnya."
      icon="target"
      management
      minimalHeader
      fullWidth
    >
      <Link className="assessment-back-link" href={assessmentPath('TRYOUT', packageId)}>
        ← Kembali ke paket original
      </Link>
      <Card className="tryout-variant-wizard">
        <nav aria-label="Tahap generate varian" className="tryout-variant-steps">
          {['Pilih anchor', 'Tinjau paket', 'Hasil generate'].map((label, index) => (
            <span key={label} aria-current={step === index + 1 ? 'step' : undefined}>
              <b>{index + 1}</b>
              {label}
            </span>
          ))}
        </nav>
        {error && <AdminMessage error message={error} />}
        {loading && <p role="status">Memuat paket dan isi soal…</p>}
        {!loading && !options && (
          <Button variant="secondary" onClick={() => setReload((value) => value + 1)}>
            Coba muat ulang
          </Button>
        )}
        {!loading && options && (
          <>
            <header className="tryout-variant-source">
              <div>
                <small>PAKET ORIGINAL</small>
                <h2>{options.packageName}</h2>
                <p>
                  Versi {options.packageVersion} · {options.questions.length} soal
                </p>
              </div>
              <Badge variant={options.status === 'PUBLISHED' ? 'success' : 'warning'}>
                {options.status === 'PUBLISHED' ? 'Terbit' : options.status}
              </Badge>
            </header>
            {step === 1 && (
              <div className="tryout-variant-layout">
                <section className="tryout-variant-selection" aria-labelledby="anchor-title">
                  <div>
                    <h2 id="anchor-title">Pilih 5 soal anchor</h2>
                    <p>
                      Anchor tetap sama pada paket original dan varian. Baca soal, lalu centang
                      pilihan Anda.
                    </p>
                  </div>
                  <div className="tryout-variant-toolbar">
                    <label>
                      Cari soal
                      <input
                        type="search"
                        placeholder="Nomor, kode, atau isi soal"
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                      />
                    </label>
                    <label className="tryout-variant-filter">
                      <input
                        type="checkbox"
                        checked={onlySelected}
                        onChange={(event) => setOnlySelected(event.target.checked)}
                      />
                      Terpilih saja
                    </label>
                  </div>
                  <p className="tryout-variant-count" role="status">
                    {anchors.length}/5 anchor dipilih · {visible.length} soal ditampilkan
                  </p>
                  <div className="tryout-variant-question-list">
                    {visible.map((question) => {
                      const content = items.get(question.id);
                      const mapping = options.focalQuestions.find(
                        (item) => item.id === question.id,
                      );
                      return (
                        <article
                          key={question.id}
                          className="tryout-variant-question"
                          data-selected={selected.has(question.id)}
                        >
                          <label className="tryout-variant-question-choice">
                            <input
                              type="checkbox"
                              aria-label={`Pilih soal ${question.displayOrder} sebagai anchor`}
                              checked={selected.has(question.id)}
                              disabled={busy || (!selected.has(question.id) && anchors.length >= 5)}
                              onChange={(event) =>
                                changeAnchors(
                                  event.target.checked
                                    ? [...anchors, question.id]
                                    : anchors.filter((id) => id !== question.id),
                                )
                              }
                            />
                            <strong>Soal {question.displayOrder}</strong>
                            <span>
                              {selected.has(question.id) ? 'Anchor dipilih' : 'Pilih anchor'}
                            </span>
                          </label>
                          <small className="tryout-variant-code">{question.label}</small>
                          {content ? (
                            <QuestionContent question={content} id={question.id} token={token} />
                          ) : (
                            <p>
                              Isi soal belum tersedia. Periksa paket original sebelum menentukan
                              anchor.
                            </p>
                          )}
                          {!!mapping?.blockers.length && (
                            <p className="tryout-variant-note">
                              {selected.has(question.id)
                                ? 'Dipertahankan sebagai anchor; tidak memerlukan generator.'
                                : 'Generator belum siap. Soal ini dapat dipertahankan sebagai anchor.'}
                            </p>
                          )}
                        </article>
                      );
                    })}
                    {!visible.length && (
                      <p>Tidak ada soal yang cocok. Ubah pencarian atau filter.</p>
                    )}
                  </div>
                </section>
                <aside className="tryout-variant-summary" aria-label="Ringkasan pilihan">
                  <h3>Komposisi varian</h3>
                  <div className="tryout-variant-metrics">
                    <div>
                      <strong>
                        {anchors.length}
                        <small>/5</small>
                      </strong>
                      <span>Anchor tetap</span>
                    </div>
                    <div>
                      <strong>{options.questions.length - anchors.length}</strong>
                      <span>Soal dibuat ulang</span>
                    </div>
                  </div>
                  <p>Pilih tepat 5 anchor. Soal lainnya harus memiliki generator yang disetujui.</p>
                  <div className="tryout-variant-chips">
                    {options.questions
                      .filter((item) => selected.has(item.id))
                      .map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          disabled={busy}
                          aria-label={`Hapus soal ${item.displayOrder} dari anchor`}
                          onClick={() => changeAnchors(anchors.filter((id) => id !== item.id))}
                        >
                          Soal {item.displayOrder} ×
                        </button>
                      ))}
                  </div>
                  {!!anchors.length && (
                    <Button variant="secondary" disabled={busy} onClick={() => changeAnchors([])}>
                      Kosongkan pilihan
                    </Button>
                  )}
                  {sourceBlockers.map((code) => (
                    <p key={code} role="alert">
                      {reason(code)}
                    </p>
                  ))}
                  {!!blocked.length && (
                    <p className="tryout-variant-note">
                      {blocked.length} soal di luar pilihan belum memiliki generator siap. Periksa
                      pilihan anchor atau mapping soal.
                    </p>
                  )}
                  <Button
                    disabled={anchors.length !== 5 || !!sourceBlockers.length || busy}
                    loading={busy}
                    onClick={() => void review()}
                  >
                    Tinjau & lanjutkan
                  </Button>
                </aside>
              </div>
            )}
            {step === 2 && verified && (
              <section className="tryout-variant-review">
                <div>
                  <h2>Tinjau sebelum generate</h2>
                  <p>
                    5 soal anchor dipertahankan. 25 soal lainnya dibuat melalui generator yang
                    disetujui.
                  </p>
                </div>
                <div className="tryout-variant-review-grid">
                  <div>
                    <h3>Anchor pilihan</h3>
                    <div className="tryout-variant-chips">
                      {options.questions
                        .filter((item) => selected.has(item.id))
                        .map((item) => (
                          <span key={item.id}>Soal {item.displayOrder}</span>
                        ))}
                    </div>
                    <p>Isi, kunci, dan versi anchor tidak diubah.</p>
                  </div>
                  <div>
                    <h3>Kesiapan generator</h3>
                    <strong>
                      {verified.focalQuestions.filter((item) => !item.blockers.length).length}/25
                      soal siap
                    </strong>
                    <p>Mapping dipilih otomatis dari approval per soal.</p>
                  </div>
                </div>
                {!verified.canGenerate && (
                  <AdminMessage
                    error
                    message="Generate belum dapat dimulai. Selesaikan kendala berikut atau ubah pilihan anchor."
                  />
                )}
                {verified.blockers
                  .filter((code) => !verified.generatorBlockers.includes(code))
                  .map((code) => (
                    <p key={code} role="alert">
                      {reason(code)}
                    </p>
                  ))}
                <details className="tryout-variant-detail" open={!verified.canGenerate}>
                  <summary>Detail kesiapan 25 soal</summary>
                  <ul className="tryout-variant-mapping-list">
                    {verified.focalQuestions.map((item) => (
                      <li key={item.id}>
                        <strong>Soal {item.displayOrder}</strong>
                        <span>
                          {item.blockers.length
                            ? item.blockers.map(reason).join(' ')
                            : `Siap · ${item.mapping?.label} · konfigurasi v${item.mapping?.configVersion}`}
                        </span>
                      </li>
                    ))}
                  </ul>
                </details>
                <p className="tryout-variant-note">
                  Hasil disimpan sebagai paket DRAFT. Periksa isi, kunci, pembahasan, dan media
                  sebelum menerbitkan. Generate tidak membuktikan kesetaraan IRT.
                </p>
                <div className="tryout-variant-footer">
                  <Button variant="secondary" disabled={busy} onClick={() => setStep(1)}>
                    Ubah anchor
                  </Button>
                  <Button
                    disabled={!verified.canGenerate || busy}
                    loading={busy}
                    onClick={() => void start()}
                  >
                    Generate 25 soal varian
                  </Button>
                </div>
              </section>
            )}
            {step === 3 && process && (
              <section className="tryout-variant-review">
                <h2>
                  {process.status === 'READY'
                    ? 'Varian siap disimpan'
                    : process.status === 'FAILED'
                      ? 'Generate belum berhasil'
                      : process.status === 'IMPORTED'
                        ? 'Paket varian tersimpan'
                        : 'Sedang membuat soal varian'}
                </h2>
                <p role="status">
                  {completed}/25 soal selesai · {process.status}
                </p>
                <progress max={25} value={completed} aria-label="Soal varian selesai" />
                {process.status === 'GENERATING' && (
                  <p>Status diperbarui otomatis. Pilihan anchor sudah dikunci untuk proses ini.</p>
                )}
                {process.status === 'FAILED' && (
                  <>
                    <AdminMessage
                      error
                      message="Sebagian soal gagal dibuat. Paket belum siap disimpan. Periksa kendala berikut sebelum memulai proses baru."
                    />
                    <ul>
                      {process.requests
                        .filter(
                          (request) =>
                            request.failureCode ||
                            ['FAILED', 'EXPIRED'].includes(request.executionStatus ?? ''),
                        )
                        .map((request) => (
                          <li key={request.id}>
                            {request.label}:{' '}
                            {request.failureCode
                              ? reason(request.failureCode)
                              : 'Proses gagal atau kedaluwarsa.'}
                          </li>
                        ))}
                    </ul>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setProcess(null);
                        operationKey.current = null;
                        setStep(1);
                      }}
                    >
                      Periksa ulang pilihan
                    </Button>
                  </>
                )}
                {process.status === 'READY' && (
                  <>
                    <p>
                      Simpan sebagai DRAFT untuk meninjau isi, kunci, dan pembahasan hasil
                      generator.
                    </p>
                    <Button disabled={busy} loading={busy} onClick={() => void materialize()}>
                      Simpan paket DRAFT
                    </Button>
                  </>
                )}
                {process.generatedPackageId && (
                  <Link
                    className="button-link"
                    href={assessmentPath('TRYOUT', process.generatedPackageId)}
                  >
                    Buka paket varian
                  </Link>
                )}
                <details className="tryout-variant-detail">
                  <summary>Detail proses</summary>
                  <p>ID: {process.id}</p>
                  <ul className="tryout-variant-mapping-list">
                    {process.requests.map((request) => (
                      <li key={request.id}>
                        <strong>{request.label}</strong>
                        <span>{request.executionStatus}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              </section>
            )}
          </>
        )}
      </Card>
    </AdminFrame>
  );
}
