'use client';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { Badge, Button, Card } from '@tka/ui';
import { useAuth } from '@/features/onboarding/auth';
import { AdminFrame, AdminLoading, AdminMessage } from './admin-presentation';
import { validateImport, importContent, createPreview } from './content-preview-api';
import type { ImportReportDto, ImportBodyDto, ExcelParseDto } from './generated-types';
import {
  downloadExcelTemplate,
  downloadFile,
  parseExcelFile,
  uploadExcelMedia,
  type UploadCache,
} from './content-excel-api';
import { ContentRichText } from './content-rich-text';

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
  const [busy, setBusy] = useState(false);
  const [excel, setExcel] = useState<ExcelParseDto | null>(null);
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
    uploadCache.current.clear();
    setQuestions([]);
    setError('');
    if (!file) return;
    try {
      if (file.size > 2 * 1024 * 1024) throw Error('Batas file JSON adalah 2 MiB.');
      const parsed: unknown = JSON.parse(await file.text());
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        if ('schemaVersion' in parsed && parsed.schemaVersion !== 2)
          throw Error('Versi envelope JSON tidak didukung.');
        if ('sourceNamespace' in parsed) {
          if (
            typeof parsed.sourceNamespace !== 'string' ||
            !/^[A-Za-z0-9_-]{1,128}$/.test(parsed.sourceNamespace)
          )
            throw Error('Namespace pada JSON tidak valid.');
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
          <Card className="content-import-card">
            <label>
              Namespace sumber
              <input
                value={namespace}
                maxLength={128}
                disabled={busy}
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
                disabled={busy}
                onClick={() =>
                  void run(async () =>
                    downloadFile(await downloadExcelTemplate(token), 'NUMORA_EXCEL_V3.xlsx'),
                  )
                }
              >
                Unduh template Excel
              </Button>
            </div>
            <label>
              File soal Excel
              <input
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                disabled={busy || !namespace}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  reset();
                  setExcel(null);
                  setQuestions([]);
                  uploadCache.current.clear();
                  void run(async () => {
                    if (file.size > 10 * 1024 * 1024)
                      throw Error('Batas file Excel adalah 10 MiB.');
                    const parsed = await parseExcelFile(token, file, namespace);
                    setExcel(parsed);
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
                disabled={busy}
                onChange={(e) => void choose(e.target.files?.[0])}
              />
            </label>
            <p>
              {questions.length
                ? `${questions.length} soal dipilih.`
                : 'Belum ada file. Pilih questions.draft.json atau envelope questions.'}
            </p>
            <div className="admin-content-actions">
              <Button
                disabled={
                  busy || !questions.length || !namespace || !!excel?.issues.length || !!report?.id
                }
                onClick={() =>
                  void run(async () =>
                    setReport(
                      await validateImport(token, { sourceNamespace: namespace, questions }),
                    ),
                  )
                }
              >
                Validasi JSON
              </Button>
              <Button
                variant="secondary"
                disabled={busy || !report?.canImportDraft || !!report.id || !!excel?.issues.length}
                onClick={() =>
                  void run(async () => {
                    let body: ImportBodyDto = { sourceNamespace: namespace, questions };
                    if (excel) {
                      const uploaded = await uploadExcelMedia(
                        token,
                        excel.envelope,
                        excel.media,
                        uploadCache.current,
                        setProgress,
                      );
                      body = {
                        sourceNamespace: uploaded.sourceNamespace,
                        questions: uploaded.questions,
                      };
                      setExcel({ ...excel, envelope: uploaded });
                      setQuestions(uploaded.questions);
                      const validated = await validateImport(token, body);
                      setReport(validated);
                      if (!validated.canImportDraft || validated.items.some((i) => !i.canPreview))
                        throw Error('Validasi media/konten belum lolos. Soal belum disimpan.');
                    }
                    importKey.current ??= crypto.randomUUID();
                    setReport(await importContent(token, body, importKey.current));
                  })
                }
              >
                Impor sebagai DRAFT
              </Button>
              <Button
                variant="secondary"
                disabled={busy || !report?.id || !readyIds.length}
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
                disabled={busy || !!excel.issues.length || !excel.envelope.questions.length}
                onClick={() =>
                  downloadFile(
                    new Blob([JSON.stringify(excel.envelope, null, 2)], {
                      type: 'application/json',
                    }),
                    'questions.draft.json',
                  )
                }
              >
                Ekspor JSON{' '}
                {excel.envelope.questions.some((q) =>
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
            <Card className="content-import-card">
              <h2>Preview Excel sebelum simpan</h2>
              {excel.issues.length > 0 && (
                <div role="alert">
                  <p>Perbaiki file sebelum menyimpan:</p>
                  <ul>
                    {excel.issues.map((issue, i) => (
                      <li key={i}>
                        {issue.sheet} {issue.cell || `baris ${issue.row}`}: {issue.detail} (
                        {issue.code})
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {excel.envelope.questions.map((q) => {
                const media = q.metadata.assetManifest.map((a) => ({
                  instanceId: q.externalId,
                  assetId: a.assetId,
                  altText: a.altText,
                  url: `data:${a.contentType};base64,${excel.media.find((m) => m.externalId === q.externalId && m.assetId === a.assetId)?.base64 ?? ''}`,
                  expiresAt: '',
                }));
                const rich = (value: string) => (
                  <ContentRichText
                    text={value}
                    media={media}
                    retry={() =>
                      setError('Pilih ulang Excel jika gambar preview tidak dapat dibaca.')
                    }
                  />
                );
                return (
                  <article key={q.externalId}>
                    <h3>
                      {q.externalId} · {q.type}
                    </h3>
                    <p>{rich(q.stem.text)}</p>
                    <ul>
                      {q.options.map((o) => (
                        <li key={o.id}>
                          {o.id}. {rich(o.content.text)}
                        </li>
                      ))}
                    </ul>
                    {!!q.metadata.categories?.length && (
                      <p>{q.metadata.categories.map((c) => `${c.id}: ${c.label}`).join(' · ')}</p>
                    )}
                    <p>Kunci: {JSON.stringify(q.answer)}</p>
                    <p>Pembahasan: {rich(q.explanation.text)}</p>
                  </article>
                );
              })}
            </Card>
          )}
          {report && (
            <Card className="content-import-card">
              <h2>Laporan {report.id ? 'impor' : 'validasi'}</h2>
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
