'use client';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { Badge, Button, Card } from '@tka/ui';
import { useAuth } from '@/features/onboarding/auth';
import { AdminFrame, AdminLoading, AdminMessage } from './admin-presentation';
import { validateImport, importContent, createPreview } from './content-preview-api';
import type {
  ImportReportDto,
  ImportBodyDto,
  ExcelParseDto,
  ContentPackageDetailDto,
} from './generated-types';
import { ContentPackageWorkspace } from './content-package-workspace';
import {
  downloadExcelTemplate,
  downloadFile,
  parseExcelFile,
  uploadExcelMedia,
  type UploadCache,
} from './content-excel-api';
import { ContentExcelPreview } from './content-excel-preview';

export function ContentImportScreen() {
  const { state } = useAuth();
  return <ContentImportContent key={state.status === 'ready' ? state.profile.id : state.status} />;
}
function ContentImportContent() {
  const { state, refresh } = useAuth();
  const token =
    state.status === 'ready' &&
    state.profile.role === 'ADMIN' &&
    state.profile.capabilities?.includes('CONTENT_MANAGE')
      ? state.session.access_token
      : null;
  const [namespace, setNamespace] = useState('CURRICULUM_SHEETS_SAMPLE');
  const [questions, setQuestions] = useState<ImportBodyDto['questions']>([]);
  const [report, setReport] = useState<ImportReportDto | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [working, setBusy] = useState(false);
  const [packageBusy, setPackageBusy] = useState(false);
  const busy = working || packageBusy;
  const [excel, setExcel] = useState<ExcelParseDto | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState(false);
  const [targetPackage, setTargetPackage] = useState<ContentPackageDetailDto | null>(null);
  const [packageRefresh, setPackageRefresh] = useState(0);
  const [converted, setConverted] = useState(false);
  const [fileName, setFileName] = useState('');
  const [progress, setProgress] = useState('');
  const uploadCache = useRef<UploadCache>(new Map());
  const importKey = useRef<string | null>(null),
    previewKey = useRef<string | null>(null);
  const reset = () => {
    setReport(null);
    setSessionId(null);
    importKey.current = null;
    previewKey.current = null;
  };
  async function choose(file?: File) {
    reset();
    setExcel(null);
    setSelected(new Set());
    uploadCache.current.clear();
    setQuestions([]);
    setError('');
    setConverted(false);
    setFileName(file?.name ?? '');
    if (!file) return;
    try {
      if (file.size > 2 * 1024 * 1024) throw Error('Batas file JSON adalah 2 MiB.');
      const parsed: unknown = JSON.parse(await file.text());
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        if ('schemaVersion' in parsed && parsed.schemaVersion !== 2)
          throw Error('Versi envelope JSON tidak didukung.');
        for (const key of ['binding', 'target'] as const) {
          const binding = (parsed as Record<string, unknown>)[key];
          if (binding) {
            const bound = binding as Record<string, unknown>;
            if (
              !targetPackage ||
              bound.packageId !== targetPackage.id ||
              (key === 'binding' &&
                Object.entries({
                  assessmentType: targetPackage.assessmentType,
                  packageVersion: targetPackage.packageVersion,
                  familyCode: targetPackage.familyCode,
                  chapterCode: targetPackage.chapterCode,
                  subchapterCode: targetPackage.subchapterCode,
                  levelNumber: targetPackage.levelNumber,
                  isDemo: targetPackage.isDemo,
                  ...targetPackage.source,
                }).some(([field, value]) => bound[field] !== value))
            )
              throw Error(
                'Identitas paket JSON berbeda. Pilih paket yang tertera pada file; tujuan tidak dapat diganti melalui konversi.',
              );
          }
        }
        if ('sourceNamespace' in parsed) {
          if (
            typeof parsed.sourceNamespace !== 'string' ||
            !/^[A-Za-z0-9_-]{1,128}$/.test(parsed.sourceNamespace)
          )
            throw Error('Namespace pada JSON tidak valid.');
          if (
            targetPackage?.source &&
            parsed.sourceNamespace !== targetPackage.source.sourceNamespace
          )
            throw Error('Namespace JSON berbeda dari paket. Gunakan sumber paket yang sesuai.');
          setNamespace(parsed.sourceNamespace);
        }
      }
      const rows = Array.isArray(parsed)
        ? parsed
        : parsed && typeof parsed === 'object' && 'questions' in parsed
          ? parsed.questions
          : null;
      if (
        !Array.isArray(rows) ||
        !rows.length ||
        rows.length > 100 ||
        rows.some((q) => !q || typeof q !== 'object' || Array.isArray(q))
      )
        throw Error('Pilih JSON berisi 1–100 objek soal.');
      setQuestions(rows as ImportBodyDto['questions']);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'File tidak dapat dibaca.');
    }
  }
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Permintaan gagal. Coba lagi.');
    } finally {
      setBusy(false);
      setProgress('');
    }
  }
  const readyIds =
    report?.items
      .filter((i) => i.canPreview && i.questionVersionId)
      .map((i) => i.questionVersionId!) ?? [];
  const selectedEnvelope = excel
    ? {
        ...excel.envelope,
        questions: excel.envelope.questions.filter((q) => selected.has(q.externalId)),
      }
    : null;
  const directed =
    targetPackage?.source &&
    targetPackage.status === 'DRAFT' &&
    (converted || !!excel?.envelope.binding);
  const bodyFor = (rows: ImportBodyDto['questions']): ImportBodyDto => ({
    sourceNamespace: namespace,
    questions: rows,
    ...(targetPackage && directed
      ? {
          target: {
            packageId: targetPackage.id,
            expectedRevision: targetPackage.contentRevision,
            ...(fileName ? { fileName } : {}),
          },
        }
      : {}),
  });
  function changePreview(next: ExcelParseDto, ids: Set<string>) {
    reset();
    setError('');
    setSelected(ids);
    setExcel(next);
    setQuestions(next.envelope.questions.filter((q) => ids.has(q.externalId)));
  }
  return (
    <AdminFrame
      title="Impor & preview soal"
      description="Validasi konten, simpan DRAFT, lalu coba tiga format tanpa scoring."
      icon="book"
    >
      <Badge>DRAFT — preview internal</Badge>
      {state.status === 'loading' ? (
        <AdminLoading message="Memeriksa akses konten…" />
      ) : !token ? (
        <AdminMessage
          message="Akses memerlukan Super Admin atau Admin Content, Data & Moderation."
          login={state.status === 'signed_out'}
          {...(state.status === 'ready' ? { retry: () => void refresh() } : {})}
        />
      ) : (
        <>
          <ContentPackageWorkspace
            token={token}
            disabled={busy || editing}
            busyChanged={setPackageBusy}
            refreshKey={packageRefresh}
            onSelect={(p) => {
              const same = p?.id === targetPackage?.id;
              if (same && p?.contentRevision !== targetPackage?.contentRevision && !report?.id)
                reset();
              setTargetPackage(p);
              if (!same) {
                reset();
                setExcel(null);
                setQuestions([]);
                setSelected(new Set());
                setConverted(false);
                uploadCache.current.clear();
              }
              if (p?.source) setNamespace(p.source.sourceNamespace);
            }}
          />
          <Card className="content-import-card">
            <label>
              Namespace sumber
              <input
                value={namespace}
                maxLength={128}
                disabled={busy || editing || !!targetPackage?.source}
                onChange={(e) => {
                  setNamespace(e.target.value);
                  reset();
                  if (excel) {
                    setExcel(null);
                    setQuestions([]);
                    uploadCache.current.clear();
                  }
                }}
              />
            </label>
            <div className="admin-content-actions">
              <Button
                variant="secondary"
                disabled={busy || editing || !targetPackage?.source}
                onClick={() =>
                  void run(async () =>
                    downloadFile(
                      await downloadExcelTemplate(token, targetPackage!.id),
                      `NUMORA_EXCEL_V4_${targetPackage!.assessmentType}.xlsx`,
                    ),
                  )
                }
              >
                Unduh template Excel
              </Button>
              <Button
                variant="secondary"
                disabled={busy || editing || !targetPackage?.source || !targetPackage.isDemo}
                onClick={() =>
                  void run(async () =>
                    downloadFile(
                      await downloadExcelTemplate(token, targetPackage!.id, true),
                      `NUMORA_EXCEL_V4_${targetPackage!.assessmentType}_CONTOH.xlsx`,
                    ),
                  )
                }
              >
                Unduh contoh penuh DEMO
              </Button>
            </div>
            <label>
              File soal Excel
              <input
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                disabled={busy || editing || !namespace}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setConverted(false);
                  setFileName(file.name);
                  reset();
                  setExcel(null);
                  setQuestions([]);
                  uploadCache.current.clear();
                  void run(async () => {
                    if (file.size > 10 * 1024 * 1024)
                      throw Error('Batas file Excel adalah 10 MiB.');
                    const parsed = await parseExcelFile(
                      token,
                      file,
                      namespace,
                      targetPackage?.source ? targetPackage.id : undefined,
                    );
                    parsed.envelope.questions.sort(
                      (a, b) => (a.metadata.sourceOrder ?? 0) - (b.metadata.sourceOrder ?? 0),
                    );
                    setExcel(parsed);
                    setSelected(new Set(parsed.envelope.questions.map((q) => q.externalId)));
                    setQuestions(parsed.envelope.questions);
                    setReport(parsed.report);
                  });
                }}
              />
            </label>
            <label>
              File soal JSON
              <input
                type="file"
                accept="application/json,.json"
                disabled={busy || editing}
                onChange={(e) => void choose(e.target.files?.[0])}
              />
            </label>
            <p>
              {questions.length
                ? `${questions.length} soal dipilih.`
                : 'Belum ada file. Pilih questions.draft.json atau envelope questions.'}
            </p>
            {!targetPackage && (
              <p>Pilih paket untuk menyimpan. File lama tetap dapat dipreview tanpa tujuan.</p>
            )}
            {targetPackage && !targetPackage.source && (
              <p>
                Paket lama belum mempunyai sumber terarah. Buat versi paket baru dengan metadata
                sumber.
              </p>
            )}
            {targetPackage?.source && !excel?.envelope.binding && questions.length > 0 && (
              <>
                <p>
                  File V3/JSON belum terikat paket. Konversi menetapkan tujuan{' '}
                  {targetPackage.assessmentType} dan memberi urutan 1–{questions.length} sesuai
                  preview. Periksa kesesuaian materi sebelum validasi.
                </p>
                <Button
                  variant="secondary"
                  disabled={busy || editing || !!excel?.issues.length || !!report?.id}
                  onClick={() => {
                    reset();
                    setConverted(true);
                    if (excel) {
                      const numbered = excel.envelope.questions.map((q, i) => ({
                        ...q,
                        metadata: { ...q.metadata, sourceOrder: i + 1 },
                      }));
                      setExcel({ ...excel, envelope: { ...excel.envelope, questions: numbered } });
                      setQuestions(numbered.filter((q) => selected.has(q.externalId)));
                    } else
                      setQuestions(
                        questions.map((q, i) => ({
                          ...q,
                          metadata: {
                            ...(q.metadata && typeof q.metadata === 'object' ? q.metadata : {}),
                            sourceOrder: i + 1,
                          },
                        })),
                      );
                  }}
                >
                  Konversi ke paket terpilih
                </Button>
              </>
            )}
            <div className="admin-content-actions">
              <Button
                disabled={
                  busy ||
                  editing ||
                  !questions.length ||
                  !namespace ||
                  !!excel?.issues.length ||
                  !!report?.id ||
                  !directed
                }
                onClick={() =>
                  void run(async () => setReport(await validateImport(token, bodyFor(questions))))
                }
              >
                Validasi JSON
              </Button>
              <Button
                variant="secondary"
                disabled={
                  busy ||
                  editing ||
                  !questions.length ||
                  !report?.canImportDraft ||
                  !!report.id ||
                  !!excel?.issues.length ||
                  !directed
                }
                onClick={() =>
                  void run(async () => {
                    let body = bodyFor(questions);
                    if (excel && selectedEnvelope) {
                      const uploaded = await uploadExcelMedia(
                        token,
                        selectedEnvelope,
                        excel.media,
                        uploadCache.current,
                        setProgress,
                      );
                      body = bodyFor(uploaded.questions);
                      setExcel({
                        ...excel,
                        envelope: {
                          ...excel.envelope,
                          questions: excel.envelope.questions.map(
                            (q) =>
                              uploaded.questions.find((u) => u.externalId === q.externalId) ?? q,
                          ),
                        },
                      });
                      setQuestions(uploaded.questions);
                      const validated = await validateImport(token, body);
                      setReport(validated);
                      if (!validated.canImportDraft || validated.items.some((i) => !i.canPreview))
                        throw Error('Validasi media/konten belum lolos. Soal belum disimpan.');
                    }
                    importKey.current ??= crypto.randomUUID();
                    setReport(await importContent(token, body, importKey.current));
                    setPackageRefresh((n) => n + 1);
                  })
                }
              >
                Impor sebagai DRAFT
              </Button>
              <Button
                variant="secondary"
                disabled={busy || editing || !report?.id || !readyIds.length}
                onClick={() =>
                  void run(async () => {
                    previewKey.current ??= crypto.randomUUID();
                    setSessionId(
                      (
                        await createPreview(
                          token,
                          { questionVersionIds: readyIds },
                          previewKey.current,
                        )
                      ).id,
                    );
                  })
                }
              >
                Preview soal siap ({readyIds.length})
              </Button>
            </div>
            {excel && (
              <Button
                variant="secondary"
                disabled={
                  busy || editing || !!excel.issues.length || !selectedEnvelope?.questions.length
                }
                onClick={() =>
                  downloadFile(
                    new Blob(
                      [
                        JSON.stringify(
                          {
                            ...selectedEnvelope,
                            ...(directed ? { target: bodyFor(questions).target } : {}),
                          },
                          null,
                          2,
                        ),
                      ],
                      {
                        type: 'application/json',
                      },
                    ),
                    'questions.draft.json',
                  )
                }
              >
                Ekspor JSON{' '}
                {selectedEnvelope?.questions.some((q) =>
                  q.metadata.assetManifest.some((a) => !a.objectKey),
                )
                  ? '(media belum diunggah)'
                  : ''}
              </Button>
            )}
            {busy && <p role="status">{progress || 'Memproses…'}</p>}
            {error && <AdminMessage error message={error} />}
            {sessionId && (
              <Link href={`/admin/content/preview-sessions/${sessionId}`}>Buka sesi preview</Link>
            )}
          </Card>
          {excel && (
            <ContentExcelPreview
              excel={excel}
              selected={selected}
              report={report}
              disabled={busy || !!report?.id}
              editingChanged={setEditing}
              select={(ids) => changePreview(excel, ids)}
              edit={(question) =>
                changePreview(
                  {
                    ...excel,
                    envelope: {
                      ...excel.envelope,
                      questions: excel.envelope.questions.map((q) =>
                        q.externalId === question.externalId ? question : q,
                      ),
                    },
                  },
                  selected,
                )
              }
              retry={() => setError('Pilih ulang Excel jika gambar preview tidak dapat dibaca.')}
              move={(id, direction) => {
                const rows = [...excel.envelope.questions];
                const from = rows.findIndex((q) => q.externalId === id);
                const to = from + direction;
                if (to < 0 || to >= rows.length) return;
                [rows[from], rows[to]] = [rows[to]!, rows[from]!];
                changePreview(
                  {
                    ...excel,
                    envelope: {
                      ...excel.envelope,
                      questions: rows.map((q, i) => ({
                        ...q,
                        metadata: { ...q.metadata, sourceOrder: i + 1 },
                      })),
                    },
                  },
                  selected,
                );
              }}
            />
          )}
          {report && (
            <Card className="content-import-card">
              <h2>Laporan {report.id ? 'impor' : 'validasi'}</h2>
              {report.package && (
                <>
                  <p>
                    {report.package.actualCount}/{report.package.expectedCount} soal ·{' '}
                    {report.package.canSaveDraft ? 'Boleh disimpan DRAFT' : 'Penyimpanan ditolak'} ·
                    belum diterbitkan
                  </p>
                  {report.package.blockers.length > 0 && (
                    <p role="alert">{report.package.blockers.join(', ')}</p>
                  )}
                  <p>
                    {report.items.filter((i) => i.change === 'ADD').length} ditambah ·{' '}
                    {report.items.filter((i) => i.change === 'REVISE').length} direvisi ·{' '}
                    {report.items.filter((i) => i.change === 'KEEP').length} tetap ·{' '}
                    {report.items.filter((i) => i.change === 'REUSE').length} digunakan ulang ·{' '}
                    {report.package.removedVersionIds.length} dilepas dari paket. Soal yang dilepas
                    tetap tersimpan dalam histori.
                  </p>
                  <ul>
                    {report.package.checks.map((c) => (
                      <li key={c.code}>
                        {c.passed ? 'Lolos' : 'Belum'}: {c.detail}
                      </li>
                    ))}
                  </ul>
                </>
              )}
              <ul className="monitoring-list">
                {report.items.map((item, i) => (
                  <li key={`${item.externalId}:${i}`}>
                    <strong>{item.externalId || 'Objek tanpa ID'}</strong>
                    <p>
                      {item.outcome} ·{' '}
                      {item.canImportDraft ? 'Dapat diimpor DRAFT' : 'Impor ditolak'} ·{' '}
                      {item.canPreview ? 'Media siap' : 'Preview tertahan'}
                    </p>
                    <p>
                      {item.blockers.join(', ') ||
                        'Tidak ada blocker teknis. Approval akademik belum diberikan.'}
                    </p>
                    {item.issues?.map((issue) => (
                      <p key={issue.code}>
                        {issue.sheet
                          ? `${issue.sheet}${issue.row ? ` · baris ${issue.row}` : ''}: `
                          : ''}
                        {issue.detail} ({issue.code})
                      </p>
                    ))}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}
    </AdminFrame>
  );
}
