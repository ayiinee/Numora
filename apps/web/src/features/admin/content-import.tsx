'use client';
import Link from 'next/link';
import { apiRequest } from '@/lib/api';
import { MaterialChoices } from './content-mapping';
import { ContentImportSteps } from './content-import-steps';
import { GeneratorImportWorkflow } from './generator-import-workflow';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@tka/ui';
import { useAuth } from '@/features/onboarding/auth';
import { AdminFrame, AdminLoading, AdminMessage } from './admin-presentation';
import { ContentExcelPreview } from './content-excel-preview';
import { downloadFile, uploadExcelMedia, type UploadCache } from './content-excel-api';
import {
  getUpload,
  listUploads,
  receiveUpload,
  saveUpload,
  uploadTemplate,
  validateUpload,
} from './content-upload-api';
import {
  archiveContentPackage,
  getContentPackage,
  publishContentPackage,
} from './content-package-api';
import type {
  ExcelIntakeDto,
  AdminCurriculumDto,
  UploadDestinationDto,
  SaveUploadDraftDto,
  UploadDetailDto,
  UploadListDto,
} from './generated-types';

const labels: Record<string, string> = {
  RECEIVED: 'Diterima',
  INVALID: 'Perlu perbaikan',
  PREVIEW: 'Belum divalidasi',
  VALIDATED: 'Isi valid',
  DRAFT: 'Draft',
  PUBLISHED: 'Terbit',
  CLOSED: 'Ditutup',
  ARCHIVED: 'Diarsipkan',
};
const typeLabels = { TRYOUT: 'Tryout', PRETEST: 'Pretest', DRILL: 'Drill' };
export function ContentImportScreen({ generatorPackageId }: { generatorPackageId?: string } = {}) {
  const { state } = useAuth();
  if (generatorPackageId)
    return <GeneratorImportWorkflow key={generatorPackageId} id={generatorPackageId} />;
  return <UploadContent key={state.status === 'ready' ? state.profile.id : state.status} />;
}
function UploadContent() {
  const { state, refresh } = useAuth();
  const token =
    state.status === 'ready' &&
    state.profile.role === 'ADMIN' &&
    state.profile.capabilities?.includes('CONTENT_MANAGE')
      ? state.session.access_token
      : null;
  const [tab, setTab] = useState<'upload' | 'history'>('upload'),
    [step, setStep] = useState(1);
  const [upload, setUpload] = useState<UploadDetailDto | null>(null),
    [excel, setExcel] = useState<ExcelIntakeDto | null>(null),
    [selected, setSelected] = useState<Set<string>>(new Set());
  const [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(false),
    [editing, setEditing] = useState(false),
    [dragging, setDragging] = useState(false);
  const [error, setError] = useState(''),
    [progress, setProgress] = useState('');
  const [usage, setUsage] = useState<SaveUploadDraftDto['assessmentType']>('TRYOUT'),
    [title, setTitle] = useState('');
  const [curriculum, setCurriculum] = useState<AdminCurriculumDto>({ items: [] });
  const [scope, setScope] = useState({
    chapterId: null as string | null,
    subchapterId: null as string | null,
    levelId: null as string | null,
  });
  const [bulk, setBulk] = useState({
    chapterId: null as string | null,
    subchapterId: null as string | null,
    competencyId: null as string | null,
    levelId: null as string | null,
  });
  const destination = (): UploadDestinationDto => ({ assessmentType: usage, title, ...scope });
  const [confirmed, setConfirmed] = useState(false),
    [releaseDate, setReleaseDate] = useState('');
  const [history, setHistory] = useState<UploadListDto>({ items: [], total: 0 }),
    [historyLoading, setHistoryLoading] = useState(false),
    [historyError, setHistoryError] = useState('');
  const [search, setSearch] = useState(''),
    [filterStatus, setFilterStatus] = useState(''),
    [filterType, setFilterType] = useState(''),
    [offset, setOffset] = useState(0),
    [reload, setReload] = useState(0);
  const running = useRef(false),
    mediaCache = useRef<UploadCache>(new Map()),
    saveKey = useRef<string | null>(null),
    commitBody = useRef<SaveUploadDraftDto | null>(null);
  const lastFile = useRef<{ file: File; key: string } | null>(null);
  async function run(action: () => Promise<void>) {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Permintaan gagal. Coba lagi.');
    } finally {
      running.current = false;
      setBusy(false);
      setProgress('');
    }
  }
  function apply(next: UploadDetailDto, keepMedia = false) {
    setUpload(next);
    setExcel(
      next.excel
        ? {
            ...next.excel,
            media: keepMedia ? (excel?.media ?? next.excel.media) : next.excel.media,
          }
        : null,
    );
    setSelected(new Set(next.selectedIds));
    if (next.destination) {
      setUsage(next.destination.assessmentType);
      setTitle(next.destination.title);
      setScope({
        chapterId: next.destination.chapterId,
        subchapterId: next.destination.subchapterId,
        levelId: next.destination.levelId,
      });
    }
    setDirty(false);
    setReload((n) => n + 1);
    window.history.replaceState(null, '', `?upload=${encodeURIComponent(next.id)}`);
  }
  async function open(id: string) {
    if (!token) return;
    mediaCache.current.clear();
    saveKey.current = null;
    commitBody.current = null;
    setConfirmed(false);
    setReleaseDate('');
    const next = await getUpload(token, id);
    apply(next);
    setTitle(next.destination?.title ?? next.title ?? '');
    if (!next.destination && next.assessmentType && next.assessmentType in typeLabels)
      setUsage(next.assessmentType as SaveUploadDraftDto['assessmentType']);
    setStep(next.packageId ? 4 : 2);
    setTab('upload');
  }
  useEffect(() => {
    if (!token) return;
    void apiRequest<AdminCurriculumDto>('admin/content/curriculum', token)
      .then(setCurriculum)
      .catch((e) => setError(e instanceof Error ? e.message : 'Materi tidak dapat dimuat.'));
    const id = new URLSearchParams(window.location.search).get('upload');
    if (id) void run(() => open(id));
    // Restore once for the authenticated admin; later changes are explicit.
  }, [token]);
  useEffect(() => {
    if (!token || tab !== 'history') return;
    let active = true;
    setHistoryLoading(true);
    setHistoryError('');
    const query = new URLSearchParams({
      limit: '20',
      offset: String(offset),
      ...(search ? { search } : {}),
      ...(filterStatus ? { status: filterStatus } : {}),
      ...(filterType ? { assessmentType: filterType } : {}),
    });
    void listUploads(token, query.toString())
      .then((data) => {
        if (active) setHistory(data);
      })
      .catch((e) => {
        if (active) setHistoryError(e instanceof Error ? e.message : 'Riwayat gagal dimuat.');
      })
      .finally(() => {
        if (active) setHistoryLoading(false);
      });
    return () => {
      active = false;
    };
  }, [token, tab, search, filterStatus, filterType, offset, reload]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  function reset() {
    setUpload(null);
    setExcel(null);
    setSelected(new Set());
    setStep(1);
    setTab('upload');
    setTitle('');
    setScope({ chapterId: null, subchapterId: null, levelId: null });
    setConfirmed(false);
    setReleaseDate('');
    setDirty(false);
    setError('');
    mediaCache.current.clear();
    saveKey.current = null;
    commitBody.current = null;
    lastFile.current = null;
    window.history.replaceState(null, '', window.location.pathname);
  }
  function choose(file: File) {
    if (!token || busy) return;
    const operation = { file, key: crypto.randomUUID() };
    lastFile.current = operation;
    void receive(operation);
  }
  async function receive(operation: { file: File; key: string }) {
    if (!token) return;
    await run(async () => {
      setProgress('Membaca soal dan gambar, serta mencatat unggahan…');
      const next = await receiveUpload(token, operation.file, operation.key);
      apply(next);
      setStep(2);
      setTitle('');
      setConfirmed(false);
      setReleaseDate('');
      mediaCache.current.clear();
      saveKey.current = null;
      commitBody.current = null;
    });
  }
  function change(next: ExcelIntakeDto, ids: Set<string> = selected) {
    setExcel(next);
    setSelected(ids);
    setDirty(true);
    saveKey.current = null;
    commitBody.current = null;
    setError('');
  }
  async function validate(next = excel) {
    if (!token || !upload || !next) throw Error('Upload Excel terlebih dahulu.');
    const result = await validateUpload(token, upload.id, {
      expectedRevision: upload.revision,
      questions: next.envelope.questions,
      destination: destination(),
      selectedIds: [...selected],
    });
    apply(result, true);
    return result;
  }
  const rows = excel?.envelope.questions.filter((q) => selected.has(q.externalId)) ?? [],
    expected = { TRYOUT: 30, PRETEST: 20, DRILL: 10 }[usage];
  const scopeValid =
    usage === 'TRYOUT' ||
    (!!scope.chapterId && (usage !== 'DRILL' || (!!scope.subchapterId && !!scope.levelId)));
  const p = upload?.package,
    technicalChecks =
      p?.readiness.checks.filter((c) => !['REVIEW', 'BLUEPRINT', 'PUBLICATION'].includes(c.code)) ??
      [];
  const ready =
    !!p &&
    p.status === 'DRAFT' &&
    technicalChecks.length > 0 &&
    technicalChecks.every((c) => c.passed);
  const releaseValid =
    !releaseDate || Number.isFinite(new Date(`${releaseDate}:00+07:00`).getTime());
  return (
    <AdminFrame
      title="Impor soal"
      description="Upload, periksa soal, lalu pilih jenis paket dan judulnya."
      icon="book"
    >
      {state.status === 'loading' ? (
        <AdminLoading message="Memeriksa akses…" />
      ) : !token ? (
        <AdminMessage
          message="Akses memerlukan Super Admin atau Admin Content, Data & Moderation."
          login={state.status === 'signed_out'}
          retry={() => void refresh()}
        />
      ) : (
        <div className="content-upload-workflow">
          <nav className="upload-tabs" aria-label="Pengelolaan unggahan">
            <button
              type="button"
              className={tab === 'upload' ? 'is-active' : ''}
              disabled={busy || editing}
              onClick={() => setTab('upload')}
            >
              Upload soal
            </button>
            <button
              type="button"
              className={tab === 'history' ? 'is-active' : ''}
              disabled={busy || editing}
              onClick={() => setTab('history')}
            >
              Riwayat unggahan
            </button>
          </nav>
          {error && (
            <div className="upload-alert" role="alert">
              {error}
              {lastFile.current && !upload && (
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() => void receive(lastFile.current!)}
                >
                  Coba upload lagi
                </Button>
              )}
            </div>
          )}
          {progress && (
            <p role="status" className="upload-progress">
              {progress}
            </p>
          )}
          {tab === 'upload' ? (
            <>
              <ContentImportSteps step={step} />
              {upload && (
                <div className="upload-file-summary">
                  <strong>{upload.fileName}</strong>
                  <span>
                    {labels[upload.status] ?? upload.status} · {upload.questionCount} soal
                  </span>
                  <Button variant="secondary" disabled={busy || editing} onClick={reset}>
                    Upload baru
                  </Button>
                </div>
              )}
              {step === 1 && (
                <section className="upload-panel" aria-labelledby="upload-heading">
                  <h2 id="upload-heading">1. Upload Excel</h2>
                  <p>
                    Gunakan template berikut. Jenis paket dan judul dipilih setelah soal diperiksa.
                  </p>
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() =>
                      void run(async () =>
                        downloadFile(await uploadTemplate(token), 'NUMORA_EXCEL_V5.xlsx'),
                      )
                    }
                  >
                    Unduh template Excel
                  </Button>
                  <div
                    className={`excel-dropzone${dragging ? ' excel-dropzone-active' : ''}`}
                    onDragOver={(e) => {
                      e.preventDefault();
                      if (!busy) setDragging(true);
                    }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragging(false);
                      if (busy) return;
                      if (e.dataTransfer.files.length !== 1) {
                        setError('Upload satu file Excel.');
                        return;
                      }
                      choose(e.dataTransfer.files[0]!);
                    }}
                  >
                    <p>Tarik dan lepas file Excel di sini, atau pilih file.</p>
                    <label>
                      File soal Excel
                      <input
                        type="file"
                        accept=".xlsx"
                        disabled={busy}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          e.target.value = '';
                          if (file) choose(file);
                        }}
                      />
                    </label>
                    <small>.xlsx, maksimal 10 MiB. Gambar harus tertanam di Excel.</small>
                  </div>
                </section>
              )}
              {step === 2 && (
                <section className="upload-panel">
                  <h2>2. Preview dan tujuan</h2>
                  <p>
                    Periksa isi, gambar, kunci dan pembahasan, lalu pilih tujuan. Progres dapat
                    disimpan meskipun materi belum lengkap.
                  </p>
                  {upload?.error && (
                    <div className="upload-alert" role="alert">
                      {upload.error}
                      <Button variant="secondary" onClick={reset}>
                        Upload file yang diperbaiki
                      </Button>
                    </div>
                  )}
                  {excel && (
                    <ContentExcelPreview
                      excel={excel}
                      hideIndicator={usage === 'TRYOUT'}
                      selected={selected}
                      report={dirty ? null : (upload?.excel?.report ?? null)}
                      disabled={busy}
                      editingChanged={setEditing}
                      select={(ids) => change(excel, ids)}
                      edit={(q) =>
                        change({
                          ...excel,
                          envelope: {
                            ...excel.envelope,
                            questions: excel.envelope.questions.map((old) =>
                              old.externalId === q.externalId ? q : old,
                            ),
                          },
                        })
                      }
                      retry={() => void run(() => open(upload!.id))}
                      move={(id, direction) => {
                        const next = [...excel.envelope.questions],
                          index = next.findIndex((q) => q.externalId === id),
                          target = index + direction;
                        if (target < 0 || target >= next.length) return;
                        [next[index], next[target]] = [next[target]!, next[index]!];
                        change({
                          ...excel,
                          envelope: {
                            ...excel.envelope,
                            questions: next.map((q, n) => ({
                              ...q,
                              metadata: { ...q.metadata, sourceOrder: n + 1 },
                            })),
                          },
                        });
                      }}
                    />
                  )}
                  <div className="upload-fields">
                    <label>
                      Jenis paket
                      <select
                        value={usage}
                        disabled={busy || !!p || !!commitBody.current}
                        onChange={(e) => {
                          setUsage(e.target.value as SaveUploadDraftDto['assessmentType']);
                          setScope({ chapterId: null, subchapterId: null, levelId: null });
                          setDirty(true);
                          saveKey.current = null;
                          commitBody.current = null;
                        }}
                      >
                        {Object.entries(typeLabels).map(([key, label]) => (
                          <option key={key} value={key}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Judul paket
                      <input
                        value={title}
                        maxLength={160}
                        disabled={busy || !!commitBody.current}
                        placeholder="Contoh: Tryout Matematika Oktober"
                        onChange={(e) => {
                          setTitle(e.target.value);
                          setDirty(true);
                          saveKey.current = null;
                          commitBody.current = null;
                        }}
                      />
                    </label>
                  </div>
                  {usage !== 'TRYOUT' && (
                    <MaterialChoices
                      value={{ ...scope, competencyId: null }}
                      curriculum={curriculum}
                      disabled={busy || !!p || !!commitBody.current}
                      fieldsShown={
                        usage === 'PRETEST'
                          ? ['chapterId']
                          : ['chapterId', 'subchapterId', 'competencyId', 'levelId']
                      }
                      change={(v) => {
                        setScope({
                          chapterId: v.chapterId,
                          subchapterId: v.subchapterId,
                          levelId: v.levelId,
                        });
                        setDirty(true);
                        saveKey.current = null;
                        commitBody.current = null;
                      }}
                    />
                  )}
                  {upload?.excel?.report && !dirty && (
                    <ul className="upload-problems">
                      {upload.excel.report.items.flatMap((item) =>
                        (item.issues ?? [])
                          .filter((i) => i.code !== 'MEDIA_NOT_READY')
                          .map((issue, n) => (
                            <li key={`${item.externalId}:${n}`}>
                              {issue.sheet} · baris {issue.row}: {issue.detail}
                            </li>
                          )),
                      )}
                    </ul>
                  )}
                  <div className="upload-actions">
                    <Button variant="secondary" disabled={busy || editing} onClick={reset}>
                      Ganti file
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={busy || editing || !excel}
                      onClick={() =>
                        void run(async () => {
                          await validate();
                        })
                      }
                    >
                      Simpan progres preview
                    </Button>
                    <Button
                      disabled={busy || editing || !rows.length || !title.trim()}
                      onClick={() =>
                        void run(async () => {
                          const result = await validate();
                          void result;
                          setStep(3);
                        })
                      }
                    >
                      Lanjutkan ke pemetaan
                    </Button>
                  </div>
                </section>
              )}
              {step === 3 && (
                <section className="upload-panel">
                  <h2>3. Pemetaan dan validasi</h2>
                  <p>
                    {rows.length}/{expected} soal.{' '}
                    {rows.length === expected
                      ? 'Jumlah lengkap.'
                      : 'Dapat disimpan sebagai draft; lengkapi jumlah sebelum Publish.'}
                  </p>
                  {usage !== 'TRYOUT' && (
                    <p>
                      Materi: {String(rows[0]?.metadata.chapterName ?? rows[0]?.chapterCode ?? '')}{' '}
                      {usage === 'DRILL'
                        ? ` / ${String(rows[0]?.metadata.subchapterName ?? rows[0]?.subchapterCode ?? '')} · Level ${rows[0]?.metadata.sourceLevelNumber}`
                        : ''}
                    </p>
                  )}
                  {!scopeValid && (
                    <div role="alert" className="upload-alert">
                      {usage === 'DRILL'
                        ? 'Drill harus berisi soal dari satu subbab dan level.'
                        : 'Pretest harus berisi soal dari satu bab.'}{' '}
                      Kembali ke preview untuk menyesuaikan pilihan soal.
                    </div>
                  )}
                  <p>
                    <Link href="/admin/content?view=curriculum">Buka Materi</Link> untuk melengkapi
                    master melalui alur Admin. Pilihan yang belum tersedia tidak diganti dengan
                    materi lain.
                  </p>
                  {usage === 'TRYOUT' && (
                    <p>
                      Tryout campuran: bab, subbab, indikator, dan level boleh kosong. Kesulitan
                      tetap wajib.
                    </p>
                  )}
                  {usage === 'TRYOUT' && (
                    <Button
                      variant="secondary"
                      disabled={busy || editing || !selected.size || !!commitBody.current}
                      onClick={() => {
                        if (!excel) return;
                        change({
                          ...excel,
                          envelope: {
                            ...excel.envelope,
                            questions: excel.envelope.questions.map((q) =>
                              selected.has(q.externalId)
                                ? {
                                    ...q,
                                    chapterCode: null,
                                    subchapterCode: null,
                                    competencyCode: null,
                                    metadata: {
                                      ...q.metadata,
                                      sourceLevelNumber: null,
                                      materialIds: {
                                        chapterId: null,
                                        subchapterId: null,
                                        competencyId: null,
                                        levelId: null,
                                      },
                                      materialOrigins: {
                                        chapterId: 'USER',
                                        subchapterId: 'USER',
                                        competencyId: 'USER',
                                        levelId: 'USER',
                                      },
                                    },
                                  }
                                : q,
                            ),
                          },
                        });
                        setBulk({
                          chapterId: null,
                          subchapterId: null,
                          competencyId: null,
                          levelId: null,
                        });
                      }}
                    >
                      Lewati pemetaan materi untuk {selected.size} soal Tryout
                    </Button>
                  )}
                  <fieldset disabled={busy} className="upload-mapping-panel">
                    <legend>Terapkan materi ke {selected.size} soal terpilih</legend>
                    <MaterialChoices
                      fieldsShown={['chapterId', 'subchapterId', 'competencyId', 'levelId']}
                      value={bulk}
                      curriculum={curriculum}
                      disabled={busy}
                      change={setBulk}
                    />
                    <Button
                      variant="secondary"
                      disabled={busy || !Object.values(bulk).some(Boolean)}
                      onClick={() => {
                        if (!excel) return;
                        change({
                          ...excel,
                          envelope: {
                            ...excel.envelope,
                            questions: excel.envelope.questions.map((q) =>
                              selected.has(q.externalId)
                                ? {
                                    ...q,
                                    metadata: {
                                      ...q.metadata,
                                      materialIds: {
                                        ...(q.metadata.materialIds ?? {
                                          chapterId: null,
                                          subchapterId: null,
                                          competencyId: null,
                                          levelId: null,
                                        }),
                                        ...Object.fromEntries(
                                          Object.entries(bulk).filter(([, v]) => v !== null),
                                        ),
                                      },
                                    },
                                  }
                                : q,
                            ),
                          },
                        });
                      }}
                    >
                      Terapkan pilihan
                    </Button>
                  </fieldset>
                  {rows.map((q, n) => (
                    <details
                      key={q.externalId}
                      className="upload-mapping-panel"
                      open={excel?.mappingIssues.some((i) => i.externalId === q.externalId)}
                    >
                      <summary>
                        Soal {n + 1} , {q.metadata.sourceSheet} baris {q.metadata.sourceRowNumber}
                      </summary>
                      <p>
                        {q.stem.text
                          .replace(/\[\[asset:[A-Za-z0-9_-]+\]\]/g, '(gambar)')
                          .slice(0, 160)}
                      </p>
                      <MaterialChoices
                        value={
                          q.metadata.materialIds ?? {
                            chapterId: null,
                            subchapterId: null,
                            competencyId: null,
                            levelId: null,
                          }
                        }
                        curriculum={curriculum}
                        fieldsShown={['chapterId', 'subchapterId', 'competencyId', 'levelId']}
                        question={q}
                        disabled={busy || !!commitBody.current}
                        change={(v) => {
                          if (!excel) return;
                          change({
                            ...excel,
                            envelope: {
                              ...excel.envelope,
                              questions: excel.envelope.questions.map((old) =>
                                old.externalId === q.externalId
                                  ? { ...q, metadata: { ...q.metadata, materialIds: v } }
                                  : old,
                              ),
                            },
                          });
                        }}
                      />
                      <ul className="upload-problems">
                        {excel?.mappingIssues
                          .filter((i) => i.externalId === q.externalId)
                          .map((i, index) => (
                            <li key={index}>
                              {i.sheet} , baris {i.row} , {i.field}: {i.detail}
                            </li>
                          ))}
                      </ul>
                    </details>
                  ))}
                  <div className="upload-actions">
                    <Button
                      variant="secondary"
                      disabled={busy || editing}
                      onClick={() =>
                        void run(async () => {
                          await validate();
                        })
                      }
                    >
                      Simpan progres preview / Validasi
                    </Button>
                  </div>
                  <div className="upload-actions">
                    <Button variant="secondary" disabled={busy} onClick={() => setStep(2)}>
                      Kembali ke preview
                    </Button>
                    <Button
                      disabled={
                        busy ||
                        dirty ||
                        !title.trim() ||
                        !scopeValid ||
                        upload?.state !== 'VALIDATED' ||
                        !!excel?.mappingIssues.some((i) => selected.has(i.externalId ?? ''))
                      }
                      onClick={() =>
                        void run(async () => {
                          if (!upload || !excel) return;
                          if (!commitBody.current) {
                            setProgress('Memverifikasi soal dan gambar…');
                            const requiresMediaValidation = rows.some((q) =>
                              q.metadata.assetManifest.some((a) => !a.objectKey),
                            );
                            const uploaded = await uploadExcelMedia(
                              token,
                              { ...excel.envelope, questions: rows },
                              excel.media,
                              mediaCache.current,
                              setProgress,
                            );
                            const next = {
                              ...excel,
                              envelope: {
                                ...excel.envelope,
                                questions: excel.envelope.questions.map(
                                  (q) =>
                                    uploaded.questions.find((u) => u.externalId === q.externalId) ??
                                    q,
                                ),
                              },
                            };
                            setExcel(next);
                            const checked = requiresMediaValidation ? await validate(next) : upload;
                            if (checked.state !== 'VALIDATED') throw Error('Validasi belum lolos.');
                            commitBody.current = {
                              expectedRevision: checked.revision,
                              title,
                              assessmentType: usage,
                            };
                            saveKey.current = crypto.randomUUID();
                          }
                          setProgress('Menyimpan draft paket…');
                          const saved = await saveUpload(
                            token,
                            upload.id,
                            saveKey.current!,
                            commitBody.current,
                          );
                          apply(saved, true);
                          setStep(4);
                          setConfirmed(false);
                        })
                      }
                    >
                      Simpan draft
                    </Button>
                  </div>
                </section>
              )}
              {step === 4 && p && (
                <section className="upload-panel">
                  <h2>4. {p.status === 'DRAFT' ? 'Periksa dan Publish' : 'Detail paket'}</h2>
                  <dl className="upload-package-summary">
                    <div>
                      <dt>Judul</dt>
                      <dd>{p.name}</dd>
                    </div>
                    <div>
                      <dt>Jenis</dt>
                      <dd>{typeLabels[p.assessmentType]}</dd>
                    </div>
                    <div>
                      <dt>Jumlah soal</dt>
                      <dd>
                        {p.items.length}/{p.readiness.expectedCount}
                      </dd>
                    </div>
                    <div>
                      <dt>Status</dt>
                      <dd>{labels[p.status] ?? p.status}</dd>
                    </div>
                  </dl>
                  {p.status === 'DRAFT' ? (
                    <>
                      <p>
                        {ready
                          ? 'Seluruh pemeriksaan teknis lolos. Periksa soal sebelum mengonfirmasi Publish.'
                          : 'Paket belum siap diterbitkan.'}
                      </p>
                      <div className="upload-actions">
                        <Button
                          variant="secondary"
                          disabled={busy || upload?.canEditPreview === false}
                          onClick={() => {
                            saveKey.current = null;
                            commitBody.current = null;
                            setConfirmed(false);
                            setStep(2);
                          }}
                        >
                          Edit draft
                        </Button>
                      </div>
                      {upload?.canEditPreview === false && (
                        <p>
                          File asal unggahan lama belum tersedia. Upload Excel kembali untuk membuat
                          salinan baru yang dapat diedit.
                        </p>
                      )}
                      <ul className="upload-checklist">
                        {technicalChecks.map((c) => (
                          <li key={c.code}>
                            <span className={c.passed ? 'is-valid' : 'is-pending'}>
                              {c.passed ? 'Lolos' : 'Belum'}
                            </span>
                            {c.detail}
                          </li>
                        ))}
                      </ul>
                      <details>
                        <summary>Lihat soal tersimpan ({p.items.length})</summary>
                        {excel && (
                          <ContentExcelPreview
                            excel={excel}
                            hideIndicator={p.assessmentType === 'TRYOUT'}
                            selected={selected}
                            report={upload!.excel?.report ?? null}
                            disabled
                            select={() => {}}
                            edit={() => {}}
                            retry={() => void run(() => open(upload!.id))}
                            editingChanged={() => {}}
                          />
                        )}
                      </details>
                      {p.assessmentType === 'TRYOUT' && (
                        <label>
                          Tanggal dan jam rilis Tryout (WIB, opsional)
                          <input
                            type="datetime-local"
                            value={releaseDate}
                            aria-invalid={!!releaseDate && !releaseValid}
                            disabled={busy}
                            onChange={(e) => setReleaseDate(e.target.value)}
                          />
                          <Button disabled={busy} onClick={() => setReleaseDate('')}>
                            Gunakan waktu sekarang
                          </Button>
                          <small>
                            Kosongkan untuk Publish sekarang. Durasi 10 menit; batch tutup 7 hari
                            setelah rilis.
                          </small>
                          {releaseDate && !releaseValid && (
                            <small role="alert">Isi tanggal dan jam yang valid.</small>
                          )}
                        </label>
                      )}
                      <label className="upload-confirm">
                        <input
                          type="checkbox"
                          checked={confirmed}
                          disabled={busy}
                          onChange={(e) => setConfirmed(e.target.checked)}
                        />
                        <span>
                          Saya telah meninjau isi, kunci, pembahasan dan susunan paket, serta
                          memastikan persetujuan Curriculum.
                        </span>
                      </label>
                      <div className="upload-actions">
                        <Button
                          disabled={
                            busy ||
                            !ready ||
                            !confirmed ||
                            (p.assessmentType === 'TRYOUT' && !releaseValid)
                          }
                          onClick={() =>
                            void run(async () => {
                              await publishContentPackage(token, p.id, {
                                expectedRevision: p.contentRevision,
                                confirmed: true,
                                ...(p.assessmentType === 'TRYOUT' && releaseDate
                                  ? { releaseAt: `${releaseDate}:00+07:00` }
                                  : {}),
                              });
                              const next = await getContentPackage(token, p.id);
                              setUpload({ ...upload!, package: next, status: next.status });
                              setReload((n) => n + 1);
                              setConfirmed(false);
                            })
                          }
                        >
                          {p.assessmentType === 'TRYOUT' && !releaseDate
                            ? 'Publish sekarang'
                            : 'Publish paket'}
                        </Button>
                      </div>
                    </>
                  ) : (
                    <>
                      <p>
                        Paket tersimpan dalam riwayat. Versi soal dan histori pengerjaan tetap
                        dipertahankan.
                      </p>
                      <Link href="/admin/content">Lihat bank soal</Link>
                      {['PUBLISHED', 'CLOSED'].includes(p.status) && (
                        <Button
                          variant="secondary"
                          disabled={busy}
                          onClick={() =>
                            void run(async () => {
                              await archiveContentPackage(token, p.id, {
                                expectedRevision: p.contentRevision,
                              });
                              await open(upload!.id);
                            })
                          }
                        >
                          Arsipkan paket
                        </Button>
                      )}
                    </>
                  )}
                </section>
              )}
            </>
          ) : (
            <section className="upload-panel">
              <div className="upload-history-heading">
                <h2>Riwayat unggahan</h2>
                <Button disabled={busy} onClick={reset}>
                  Upload baru
                </Button>
              </div>
              <div className="upload-history-filters">
                <label>
                  Cari file atau judul
                  <input
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setOffset(0);
                    }}
                  />
                </label>
                <label>
                  Jenis
                  <select
                    value={filterType}
                    onChange={(e) => {
                      setFilterType(e.target.value);
                      setOffset(0);
                    }}
                  >
                    <option value="">Semua jenis</option>
                    {Object.entries(typeLabels).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Status
                  <select
                    value={filterStatus}
                    onChange={(e) => {
                      setFilterStatus(e.target.value);
                      setOffset(0);
                    }}
                  >
                    <option value="">Semua status</option>
                    {Object.entries(labels).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {historyError ? (
                <AdminMessage message={historyError} error retry={() => setReload((n) => n + 1)} />
              ) : historyLoading ? (
                <p role="status">Memuat riwayat…</p>
              ) : !history.items.length ? (
                <p>Belum ada unggahan yang sesuai filter.</p>
              ) : (
                <div
                  className="upload-history-scroll"
                  role="region"
                  aria-label="Tabel riwayat unggahan"
                  tabIndex={0}
                >
                  <table className="upload-history-table">
                    <thead>
                      <tr>
                        <th>File / waktu</th>
                        <th>Admin</th>
                        <th>Judul / jenis</th>
                        <th>Soal</th>
                        <th>Validasi</th>
                        <th>Status</th>
                        <th>Tindakan</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.items.map((item) => (
                        <tr key={item.id}>
                          <td>
                            <strong>{item.fileName}</strong>
                            <small>
                              {new Date(item.createdAt).toLocaleString('id-ID', {
                                timeZone: 'Asia/Jakarta',
                              })}{' '}
                              WIB
                            </small>
                          </td>
                          <td>{item.actorName}</td>
                          <td>
                            {item.title ?? 'Belum dipilih'}
                            <small>
                              {item.assessmentType
                                ? typeLabels[item.assessmentType as keyof typeof typeLabels]
                                : '—'}
                            </small>
                          </td>
                          <td>{item.questionCount}</td>
                          <td>{item.validationResult ?? 'Belum divalidasi'}</td>
                          <td>
                            <span
                              className={`upload-status upload-status-${item.status.toLowerCase()}`}
                            >
                              {labels[item.status] ?? item.status}
                            </span>
                          </td>
                          <td>
                            <Button
                              variant="secondary"
                              disabled={busy}
                              onClick={() => void run(() => open(item.id))}
                            >
                              {['PUBLISHED', 'CLOSED', 'ARCHIVED', 'INVALID'].includes(item.status)
                                ? 'Lihat'
                                : 'Lanjutkan'}
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="upload-actions">
                <Button
                  variant="secondary"
                  disabled={!offset || historyLoading}
                  onClick={() => setOffset((n) => Math.max(0, n - 20))}
                >
                  Sebelumnya
                </Button>
                <span>{history.total} unggahan</span>
                <Button
                  variant="secondary"
                  disabled={offset + 20 >= history.total || historyLoading}
                  onClick={() => setOffset((n) => n + 20)}
                >
                  Berikutnya
                </Button>
              </div>
            </section>
          )}
        </div>
      )}
    </AdminFrame>
  );
}
