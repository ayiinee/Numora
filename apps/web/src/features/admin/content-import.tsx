'use client';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { Badge, Button, Card } from '@tka/ui';
import { useAuth } from '@/features/onboarding/auth';
import { AdminFrame, AdminLoading, AdminMessage } from './admin-presentation';
import { validateImport, importContent, createPreview } from './content-preview-api';
import type { ImportReportDto, ImportBodyDto } from './generated-types';
import { MediaUpload } from './media-upload';
import { ContentBlockers } from './content-blockers';
import { adminAccessDenied } from './operational-query';

export function ContentImportScreen() {
  const { state } = useAuth();
  return (
    <ContentImportContent
      key={
        state.status === 'ready' ? state.profile.id + ':' + state.profile.adminRole : state.status
      }
    />
  );
}
function ContentImportContent() {
  const { state, refresh } = useAuth();
  const token =
    state.status === 'ready' &&
    state.profile.role === 'ADMIN' &&
    state.profile.status === 'ACTIVE' &&
    state.profile.capabilities?.includes('CONTENT_MANAGE')
      ? state.session.access_token
      : null;
  const [namespace, setNamespace] = useState('CURRICULUM_SHEETS_SAMPLE');
  const [questions, setQuestions] = useState<ImportBodyDto['questions']>([]);
  const [report, setReport] = useState<ImportReportDto | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [denied, setDenied] = useState(false);
  const selection = useRef(0);
  const importKey = useRef<string | null>(null),
    previewKey = useRef<string | null>(null);
  const reset = () => {
    setReport(null);
    setSessionId(null);
    importKey.current = null;
    previewKey.current = null;
  };
  async function choose(file?: File) {
    const current = ++selection.current;
    reset();
    setQuestions([]);
    setError('');
    if (!file) {
      setBusy(false);
      return;
    }
    setBusy(true);
    try {
      if (file.size > 2 * 1024 * 1024) throw Error('Batas file JSON adalah 2 MiB.');
      const parsed: unknown = JSON.parse(await file.text());
      if (current !== selection.current) return;
      if (parsed && typeof parsed === 'object' && 'sourceNamespace' in parsed) {
        if (
          typeof parsed.sourceNamespace !== 'string' ||
          !parsed.sourceNamespace.trim() ||
          parsed.sourceNamespace.trim().length > 128
        )
          throw Error('Namespace sumber pada envelope harus berisi 1–128 karakter.');
        setNamespace(parsed.sourceNamespace.trim());
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
      if (current === selection.current)
        setError(e instanceof Error ? e.message : 'File tidak dapat dibaca.');
    } finally {
      if (current === selection.current) setBusy(false);
    }
  }
  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (e) {
      if (adminAccessDenied(e)) {
        reset();
        setQuestions([]);
        setDenied(true);
      }
      setError(e instanceof Error ? e.message : 'Permintaan gagal. Coba lagi.');
    } finally {
      setBusy(false);
    }
  }
  const readyIds =
    report?.items
      .filter((i) => i.canPreview && i.questionVersionId)
      .map((i) => i.questionVersionId!) ?? [];
  return (
    <AdminFrame
      title="Impor & preview soal"
      description="Masukkan bank soal dari Curriculum. Cek isinya sebelum disimpan dan direview."
      icon="book"
    >
      <Badge>DRAFT — preview internal</Badge>
      {state.status === 'loading' ? (
        <AdminLoading message="Memeriksa akses konten…" />
      ) : !token || denied ? (
        <AdminMessage
          message="Akses memerlukan Super Admin atau Admin Content, Data & Moderation."
          login={state.status === 'signed_out'}
          {...(state.status === 'ready'
            ? {
                retry: () => {
                  setDenied(false);
                  void refresh();
                },
              }
            : {})}
        />
      ) : (
        <>
          <ol className="content-workflow content-import-steps" aria-label="Tahapan impor">
            {[
              ['Pilih file', 'JSON berisi 1–100 soal, maksimal 2 MiB.'],
              ['Validasi isi', 'Periksa format, taxonomy, dan referensi media.'],
              ['Simpan draf', 'Konten masuk bank soal sebagai DRAFT.'],
              ['Coba & review', 'Preview internal tidak menghitung nilai siswa.'],
            ].map(([title, description], index) => (
              <li
                key={title}
                aria-current={
                  index === (sessionId ? 3 : report?.id ? 3 : report ? 2 : questions.length ? 1 : 0)
                    ? 'step'
                    : undefined
                }
              >
                <span className="content-step-number" aria-hidden="true">
                  0{index + 1}
                </span>
                <h3>{title}</h3>
                <p>{description}</p>
              </li>
            ))}
          </ol>
          <Card className="content-import-card">
            <h2>File sumber soal</h2>
            <p>
              Gunakan nama sumber yang konsisten untuk melacak impor dan revisi dari bank yang sama.
            </p>
            <label>
              Namespace sumber
              <input
                value={namespace}
                maxLength={128}
                disabled={busy}
                onChange={(e) => {
                  setNamespace(e.target.value);
                  reset();
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
                disabled={busy || !questions.length || !namespace.trim()}
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
                disabled={busy || !report?.canImportDraft || !!report.id}
                onClick={() =>
                  void run(async () => {
                    importKey.current ??= crypto.randomUUID();
                    setReport(
                      await importContent(
                        token,
                        { sourceNamespace: namespace, questions },
                        importKey.current,
                      ),
                    );
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
            {busy && <p role="status">Memproses…</p>}
            {error && <AdminMessage error message={error} />}
            {sessionId && (
              <Link href={`/admin/content/preview-sessions/${sessionId}`}>Buka sesi preview</Link>
            )}
          </Card>
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
                    {item.questionVersionId && (
                      <Link href={`/admin/content/versions/${item.questionVersionId}`}>
                        Buka detail & review versi
                      </Link>
                    )}
                    <ContentBlockers
                      codes={item.blockers}
                      empty="Tidak ada hambatan teknis. Persetujuan akademik belum diberikan."
                    />
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <details className="content-media-disclosure">
            <summary>Unggah gambar pendukung (opsional)</summary>
            <p>
              Unggah gambar yang dirujuk di dalam JSON. Gunakan referensi aset yang sudah
              diverifikasi, lalu validasi ulang file soal.
            </p>
            <MediaUpload
              token={token}
              onAccessDenied={() => {
                reset();
                setQuestions([]);
                setDenied(true);
              }}
            />
          </details>
        </>
      )}
    </AdminFrame>
  );
}
