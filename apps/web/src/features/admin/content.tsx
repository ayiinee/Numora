'use client';
import { useAdminAccessError, withAdminWorkspace } from './admin-workspace';
import { Curriculum } from './content-curriculum-panel';
import { Field, field, type Workbench } from './content-editor';
import { DrillPackages, TryoutEditor } from './content-package-panels';
import { QuestionEditor, Videos } from './content-question-panels';
import { Reports, ServerFilters, VerificationHistory } from './content-report-panels';
import { ADMIN_PAGE_SIZE } from './pagination';
import { ContentBank } from './content-bank';

import { useAuth } from '@/features/onboarding/auth';
import { ApiProblem } from '@/lib/api';
import { Button, Dialog } from '@tka/ui';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { AdminEditorForm, AdminFrame, AdminLoading, AdminMessage } from './admin-presentation';
import { AssessmentPolicySelector } from './assessment-policy-selector';
import { loadAdminWorkbench, publishTryoutPackage } from './content-api';
import { ContentPackageWorkspace } from './content-package-workspace';
import type { AdminDrillPackageDto, AdminTryoutDraftDto, AdminVersionDto } from './generated-types';

export type ContentView =
  | 'curriculum'
  | 'questions'
  | 'verification'
  | 'videos'
  | 'packages'
  | 'drillPackages'
  | 'directedPackages'
  | 'reports'
  | 'irt'
  | 'audit';
type View = ContentView;
const views: { id: View; label: string }[] = [
  { id: 'curriculum', label: 'Materi' },
  { id: 'questions', label: 'Soal' },
  { id: 'verification', label: 'Verifikasi & riwayat' },
  { id: 'videos', label: 'Video' },
  { id: 'packages', label: 'Draf Tryout' },
  { id: 'drillPackages', label: 'Paket Drill' },
  { id: 'directedPackages', label: 'Paket & Pretest' },
  { id: 'reports', label: 'Laporan' },
  { id: 'irt', label: 'IRT' },
  { id: 'audit', label: 'Audit' },
];
const viewGuidance: Record<View, { title: string; description: string }> = {
  curriculum: {
    title: 'Struktur materi',
    description:
      'Atur bab, subbab, kompetensi, dan level agar setiap soal memiliki tempat yang jelas dalam kurikulum.',
  },
  questions: {
    title: 'Bank soal',
    description:
      'Buka detail versi untuk memeriksa isi, kunci, pembahasan, media, dan kesiapan. Tambahkan PG manual atau impor JSON untuk PG, MCMA, dan Kategori.',
  },
  verification: {
    title: 'Riwayat verifikasi konten',
    description:
      'Telusuri keputusan review dan perubahan versi. Ini adalah review konten, bukan verifikasi Guru.',
  },
  videos: {
    title: 'Video pembelajaran',
    description:
      'Hubungkan video ke subbab dan atur urutan rekomendasinya. Periksa tautan dan materi sebelum menjadikannya READY.',
  },
  packages: {
    title: 'Paket Tryout mingguan',
    description:
      'Susun 30 versi soal, lalu pilih policy yang disahkan dan jadwal batch. Rilis nilai serta pembahasan dipantau terpisah di halaman IRT.',
  },
  drillPackages: {
    title: 'Paket Drill per level',
    description:
      'Susun 10 versi soal untuk satu level. Publikasi pengganti mempertahankan versi yang digunakan pada pengerjaan lama.',
  },
  directedPackages: {
    title: 'Paket & Pretest',
    description: 'Kelola tujuan paket, sumber impor, dan kesiapan distribusi.',
  },
  reports: {
    title: 'Antrian moderasi',
    description:
      'Buka detail laporan untuk melihat versi soal atau video yang dilaporkan. Catat tindak lanjut dan hubungkan revisi jika diperlukan.',
  },
  irt: {
    title: 'Riwayat IRT',
    description:
      'Lihat catatan batch dan konfigurasi terdahulu. Gunakan halaman Request IRT & publikasi untuk menyiapkan analisis dan memantau rilis saat ini.',
  },
  audit: {
    title: 'Jejak aktivitas',
    description:
      'Telusuri tindakan pada konten, moderasi, dan IRT menurut pelaku, aksi, target, atau periode.',
  },
};
export function contentView(value: string | null | undefined): View {
  return views.find((item) => item.id === value)?.id ?? 'questions';
}

const message = (error: unknown) =>
  error instanceof Error ? error.message : 'Permintaan gagal. Coba lagi.';

export const AdminContentScreen = withAdminWorkspace(AdminContentScreenProtected, 'content');
function AdminContentScreenProtected({ initialView = 'questions' }: { initialView?: View }) {
  const { state } = useAuth();
  const accountKey =
    state.status === 'ready' ? state.profile.id + ':' + state.profile.adminRole : state.status;
  return <AdminContentScreenContent key={accountKey} initialView={initialView} />;
}

function AdminContentScreenContent({ initialView }: { initialView: View }) {
  const reportAccessError = useAdminAccessError();
  const { state, refresh } = useAuth();
  const contentRole =
    state.status === 'ready' && state.profile.adminRole === 'CONTENT_DATA_MODERATION';
  const canReadAudit =
    state.status === 'ready' && !!state.profile.capabilities?.includes('AUDIT_READ');
  const token =
    state.status === 'ready' &&
    state.profile.role === 'ADMIN' &&
    state.profile.status === 'ACTIVE' &&
    state.profile.capabilities?.includes('CONTENT_MANAGE')
      ? state.session.access_token
      : null;
  const [data, setData] = useState<Workbench | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [revision, setRevision] = useState(0);
  const [offset, setOffset] = useState(0);
  const [view, setView] = useState<View>(initialView);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [editorOpen, setEditorOpen] = useState(false);
  const editorFeedback = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (editorOpen && (error || notice)) {
      const dialog = editorFeedback.current?.closest('dialog');
      if (dialog) dialog.scrollTop = 0;
      editorFeedback.current?.focus({ preventScroll: true });
    }
  }, [editorOpen, error, notice]);
  const [editing, setEditing] = useState<AdminVersionDto | null>(null);
  const [draft, setDraft] = useState<AdminTryoutDraftDto | null>(null);
  const [drillDraft, setDrillDraft] = useState<AdminDrillPackageDto | null>(null);
  const [versionUsage, setVersionUsage] = useState('');
  const [versionStatus, setVersionStatus] = useState('');
  const [versionChapter, setVersionChapter] = useState('');
  const [versionSource, setVersionSource] = useState('');
  const versionQuery = new URLSearchParams({
    ...(versionUsage ? { usageType: versionUsage } : {}),
    ...(versionStatus ? { status: versionStatus } : {}),
    ...(versionChapter ? { chapterId: versionChapter } : {}),
    ...(versionSource ? { source: versionSource } : {}),
  }).toString();
  useEffect(() => {
    if (!token) {
      setData(null);
      return;
    }
    let active = true;
    setError('');
    loadAdminWorkbench(
      token,
      offset,
      view,
      { ...Object.fromEntries(new URLSearchParams(versionQuery)), ...filters },
      contentRole,
    ).then(
      (result) => {
        if (active) {
          setData(result);
          setLoading(false);
          setDenied(false);
        }
      },
      (cause: unknown) => {
        if (active) {
          reportAccessError(cause);
          setError(message(cause));
          setLoading(false);
          setDenied(cause instanceof ApiProblem && [401, 403].includes(cause.status));
        }
      },
    );
    return () => {
      active = false;
    };
  }, [token, offset, revision, versionQuery, view, filters, contentRole]);
  async function run(action: () => Promise<{ id: string }>) {
    if (busy) return false;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await action();
      setNotice('Perubahan tersimpan. Daftar diperbarui dengan data terbaru.');
      setRevision((value) => value + 1);
      return true;
    } catch (cause) {
      reportAccessError(cause);
      setError(message(cause));
      if (cause instanceof ApiProblem && [401, 403].includes(cause.status)) setDenied(true);
      return false;
    } finally {
      setBusy(false);
    }
  }
  function retry() {
    setError('');
    setLoading(true);
    setRevision((value) => value + 1);
  }
  function navigate(next: View) {
    if (view === next) return;
    const url = new URL(window.location.href);
    url.searchParams.set('view', next);
    window.history.pushState(null, '', url);
    resetView(next);
  }
  function resetView(next: View) {
    setData(null);
    setLoading(true);
    setView(next);
    setFilters({});
    setOffset(0);
    setError('');
    setNotice('');
    setEditing(null);
    setEditorOpen(false);
    setDraft(null);
    setDrillDraft(null);
  }
  useEffect(() => {
    const restore = () =>
      resetView(contentView(new URLSearchParams(window.location.search).get('view')));
    window.addEventListener('popstate', restore);
    return () => window.removeEventListener('popstate', restore);
  }, []);
  const profileId = state.status === 'ready' ? state.profile.id : null;
  // Data cached in React must never be shown after logout or an account change.
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  useEffect(() => {
    setData(null);
    setLoadedFor(profileId);
    setLoading(true);
    setDenied(false);
  }, [profileId]);
  if (!token || denied)
    return (
      <AdminFrame
        title="Konten & assessment"
        description="Kelola konten, tinjau laporan, dan pantau proses IRT."
        icon="book"
        management
      >
        {state.status === 'loading' ? (
          <AdminLoading message="Memeriksa akun…" />
        ) : (
          <AdminMessage
            error
            message={error || 'Halaman ini hanya tersedia untuk Admin yang aktif.'}
            login
            retry={() => {
              retry();
              void refresh();
            }}
          />
        )}
      </AdminFrame>
    );
  const current = loadedFor === profileId ? data : null;
  const questionEditor = current && (
    <QuestionEditor
      key={editing?.id ?? 'new'}
      version={editing}
      data={current}
      token={token}
      busy={busy}
      run={run}
      close={() => {
        setEditing(null);
        setEditorOpen(false);
      }}
    />
  );
  const totalItems = current
    ? {
        curriculum: undefined,
        questions: current.versions.total,
        verification: undefined,
        videos: current.videos.totalItems,
        packages: current.packages.totalItems,
        drillPackages: current.drillPackages.totalItems,
        directedPackages: undefined,
        reports: current.reports.total,
        irt: undefined,
        audit: current.audit.totalItems,
      }[view]
    : undefined;
  const hasNext = current
    ? {
        curriculum: false,
        questions: current.versions.hasNext,
        verification: current.versions.hasNext || (canReadAudit && current.audit.hasNext),
        videos: current.videos.hasNext,
        packages: current.packages.hasNext,
        drillPackages: current.drillPackages.hasNext,
        directedPackages: false,
        reports: current.reports.hasNext,
        irt: current.irt.hasNext || current.irtBatches.hasNext,
        audit: current.audit.hasNext,
      }[view]
    : false;
  return (
    <AdminFrame
      title="Konten & assessment"
      description="Kelola konten, tinjau laporan, dan pantau proses IRT."
      icon="book"
      management
    >
      <div className="monitoring-frame admin-content">
        <label className="assessment-mobile-navigation">
          <span>Bagian konten</span>
          <select
            aria-label="Bagian konten"
            value={view}
            disabled={busy}
            onChange={(event) => navigate(contentView(event.target.value))}
          >
            {views
              .filter((item) => item.id !== 'audit' || canReadAudit)
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
          </select>
        </label>
        <nav aria-label="Pengelolaan Admin" className="assessment-navigation">
          {[
            { label: 'Konten', ids: ['questions', 'curriculum', 'videos'] },
            { label: 'Paket assessment', ids: ['directedPackages', 'drillPackages', 'packages'] },
            { label: 'Peninjauan', ids: ['verification', 'reports', 'irt', 'audit'] },
          ].map((group) => (
            <div className="assessment-nav-group" key={group.label}>
              <span>{group.label}</span>
              <div>
                {group.ids
                  .map((id) => views.find((item) => item.id === id)!)
                  .filter((item) => item.id !== 'audit' || canReadAudit)
                  .map((item) => (
                    <Button
                      key={item.id}
                      disabled={busy}
                      variant="ghost"
                      className="admin-view-button"
                      aria-current={view === item.id ? 'page' : undefined}
                      onClick={() => navigate(item.id)}
                    >
                      {item.label}
                    </Button>
                  ))}
              </div>
            </div>
          ))}
        </nav>
        <section className="content-view-intro" aria-labelledby="content-view-title">
          <div>
            <h2 id="content-view-title">{viewGuidance[view].title}</h2>
            <p>{viewGuidance[view].description}</p>
          </div>
          {view === 'questions' && (
            <div className="assessment-heading-actions">
              <Link className="assessment-detail-link" href="/admin/content/imports">
                Impor soal
              </Link>
              <Button
                disabled={busy || !current}
                onClick={() => {
                  setEditing(null);
                  setEditorOpen(true);
                }}
              >
                Tambah soal PG
              </Button>
            </div>
          )}
          {(view === 'irt' || view === 'packages') && (
            <Link className="content-primary-link" href="/admin/irt">
              Request IRT & publikasi
            </Link>
          )}
        </section>
        {notice && !editorOpen && <AdminMessage message={notice} />}
        {error && !editorOpen && (
          <div role="alert" className="form-error">
            <p>{error}</p>
            <Button onClick={retry} disabled={busy}>
              Muat ulang data
            </Button>
          </div>
        )}
        {!current ? (
          error ? (
            <p className="admin-empty-inline" role="status">
              Data belum dapat dimuat.
            </p>
          ) : (
            <AdminLoading message="Memuat data Admin…" />
          )
        ) : (
          <>
            {current.dashboard && (
              <div className="assessment-counts" aria-label="Statistik seluruh bank">
                <span>
                  Keluarga soal{' '}
                  <strong>{current.dashboard.questions?.toLocaleString('id-ID') ?? '—'}</strong>
                </span>
                <span>
                  Versi siap{' '}
                  <strong>{current.dashboard.readyVersions?.toLocaleString('id-ID') ?? '—'}</strong>
                </span>
                <span>
                  Laporan terbuka{' '}
                  <strong>{current.dashboard.openReports?.toLocaleString('id-ID') ?? '—'}</strong>
                </span>
              </div>
            )}
            <div
              className="admin-content-view"
              data-view={view}
              aria-label={views.find((item) => item.id === view)?.label}
              aria-busy={loading}
            >
              {view === 'curriculum' && (
                <Curriculum data={current} token={token} busy={busy} run={run} error={error} />
              )}
              {view === 'questions' && (
                <>
                  <ContentBank
                    data={current}
                    token={token}
                    busy={busy}
                    run={run}
                    offset={offset}
                    loading={loading}
                    values={{
                      usageType: versionUsage,
                      status: versionStatus,
                      chapterId: versionChapter,
                      source: versionSource,
                    }}
                    onApply={(next) => {
                      setLoading(true);
                      setVersionUsage(next.usageType);
                      setVersionStatus(next.status);
                      setVersionChapter(next.chapterId);
                      setVersionSource(next.source);
                      setOffset(0);
                      setRevision((value) => value + 1);
                    }}
                    onEdit={(version) => {
                      setEditing(version);
                      setEditorOpen(true);
                    }}
                  />
                  <div className="assessment-bank-help">
                    <p>
                      {contentRole
                        ? 'Daftar demo diringkas hingga 10 soal unik. Semua versi tersedia di Verifikasi & riwayat.'
                        : 'Revisi menghasilkan versi baru. Riwayat pengerjaan tetap dipertahankan.'}
                    </p>
                    <Link href="/admin/content/generator">Generator varian</Link>
                    <Link href="/admin/content/imports?mode=json">Impor JSON</Link>
                  </div>
                  <Dialog
                    open={editorOpen}
                    pending={busy}
                    title={editing ? 'Revisi / varian soal' : 'Tambah soal PG'}
                    className="admin-management-dialog assessment-editor-dialog"
                    onClose={() => {
                      if (!busy) {
                        setEditorOpen(false);
                      }
                    }}
                  >
                    {editorOpen && (error || notice) && (
                      <div
                        className="assessment-editor-feedback"
                        ref={editorFeedback}
                        tabIndex={-1}
                        aria-label="Status penyimpanan"
                      >
                        {error ? (
                          <AdminMessage error message={error} />
                        ) : (
                          <AdminMessage message={notice} />
                        )}
                      </div>
                    )}
                    {questionEditor}
                  </Dialog>
                </>
              )}
              {view === 'verification' && (
                <VerificationHistory data={current} canReadAudit={canReadAudit} />
              )}
              {view === 'videos' && (
                <Videos data={current} token={token} busy={busy} run={run} error={error} />
              )}
              {view === 'packages' && (
                <>
                  <details className="assessment-authoring" open={draft ? true : undefined}>
                    <summary>{draft ? 'Edit draf Tryout' : 'Buat draf Tryout'}</summary>
                    <TryoutEditor
                      key={draft?.id ?? 'new'}
                      draft={draft}
                      data={current}
                      token={token}
                      busy={busy}
                      run={run}
                      close={() => setDraft(null)}
                    />
                  </details>
                  <ul className="monitoring-list">
                    {current.packages.items.map((p) => (
                      <li key={p.id} className="monitoring-notice admin-content-row">
                        <strong>{p.name}</strong>
                        <p>
                          {p.familyCode} · v{p.packageVersion} · {p.status} ·{' '}
                          {p.questionVersionIds.length} soal
                        </p>
                        <small>{p.id}</small>
                        {p.status === 'DRAFT' && (
                          <>
                            <Button variant="secondary" disabled={busy} onClick={() => setDraft(p)}>
                              Edit draf
                            </Button>
                            <AdminEditorForm
                              busy={busy}
                              onSubmit={(event) => {
                                event.preventDefault();
                                const form = new FormData(event.currentTarget);
                                void run(() =>
                                  publishTryoutPackage(token, p.id, {
                                    scoringPolicyVersionId: field(form, 'scoringPolicyVersionId'),
                                    curriculumApprovalReference: field(
                                      form,
                                      'curriculumApprovalReference',
                                    ),
                                    ...(field(form, 'releaseAt')
                                      ? {
                                          releaseAt: new Date(
                                            `${field(form, 'releaseAt')}:00+07:00`,
                                          ).toISOString(),
                                        }
                                      : {}),
                                  }),
                                );
                              }}
                            >
                              <AssessmentPolicySelector token={token} type="TRYOUT" />
                              <Field
                                label="Referensi persetujuan Curriculum"
                                name="curriculumApprovalReference"
                              >
                                <input
                                  name="curriculumApprovalReference"
                                  required
                                  maxLength={1000}
                                />
                              </Field>
                              <Field label="Jadwal rilis (WIB, opsional)" name="releaseAt">
                                <input type="datetime-local" name="releaseAt" />
                              </Field>
                              <p>
                                Kosong berarti rilis sekarang. Durasi pengerjaan 10 menit; batch
                                berjalan 7 hari dikurangi 1 menit. Deadline mengikuti batas terawal
                                durasi dan batch close.
                              </p>
                              <Button
                                type="submit"
                                disabled={busy || p.questionVersionIds.length !== 30}
                              >
                                Publikasikan batch Tryout
                              </Button>
                            </AdminEditorForm>
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                  {!current.packages.items.length && <p>Belum ada draf Tryout pada halaman ini.</p>}
                </>
              )}
              {view === 'drillPackages' && (
                <DrillPackages
                  data={current}
                  token={token}
                  busy={busy}
                  run={run}
                  draft={drillDraft}
                  setDraft={setDrillDraft}
                />
              )}
              {view === 'directedPackages' && (
                <ContentPackageWorkspace
                  token={token}
                  disabled={busy}
                  refreshKey={0}
                  onSelect={() => {}}
                />
              )}
              {view === 'reports' && (
                <Reports
                  data={current}
                  token={token}
                  busy={busy}
                  run={run}
                  navigate={navigate}
                  filters={filters}
                  onFilter={(next) => {
                    setLoading(true);
                    setOffset(0);
                    setFilters(next);
                  }}
                />
              )}
              {view === 'irt' && (
                <section>
                  <h2>Status dan riwayat batch IRT</h2>
                  <Link href="/admin/irt">Buka request IRT dan SLA publikasi</Link>
                  <p>
                    Status batch dan waktu rilis berasal dari API. Batch SUCCEEDED tidak otomatis
                    berarti hasil Tryout sudah dirilis.
                  </p>
                  {!current.irtBatches.items.length && <p>Belum ada batch IRT pada halaman ini.</p>}
                  <ul className="monitoring-list">
                    {current.irtBatches.items.map((batch) => (
                      <li key={batch.id} className="monitoring-notice admin-content-row">
                        <strong>
                          {batch.batchKind} · {batch.status}
                        </strong>
                        <small>
                          Model {batch.modelVersion} · Batch {batch.id}
                        </small>
                        <p>
                          Mulai {new Date(batch.startedAt).toLocaleString('id-ID')} · Selesai{' '}
                          {batch.finishedAt
                            ? new Date(batch.finishedAt).toLocaleString('id-ID')
                            : 'belum selesai'}
                        </p>
                        <p>
                          Paket {batch.packageId ?? 'tidak terkait'} · Rilis{' '}
                          {batch.resultReleasedAt
                            ? new Date(batch.resultReleasedAt).toLocaleString('id-ID')
                            : 'belum tercatat'}
                        </p>
                        {batch.failureCode && <small>Kode kegagalan: {batch.failureCode}</small>}
                      </li>
                    ))}
                  </ul>
                  <h2>Parameter IRT per versi soal</h2>
                  <p>
                    Parameter hanya tampil untuk batch SUCCEEDED dengan minimal 30 respons. Model
                    dan kebijakan rilis hasil resmi masih mengikuti keputusan Data/PO yang terbuka.
                  </p>
                  {!current.irt.items.length && <p>Belum ada output batch IRT pada halaman ini.</p>}
                  <ul className="monitoring-list">
                    {current.irt.items.map((r) => (
                      <li key={r.id} className="monitoring-notice admin-content-row">
                        <strong>
                          {r.modelVersion} · {r.batchStatus}
                        </strong>
                        <small>Versi soal: {r.questionVersionId}</small>
                        <p>
                          {r.sampleSize} respons · {r.dataStatus}
                        </p>
                        <p>
                          a: {r.discriminationA ?? 'Belum tersedia'} · b:{' '}
                          {r.difficultyB ?? 'Belum tersedia'} · c: {r.guessingC ?? 'Belum tersedia'}
                        </p>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {view === 'audit' && canReadAudit && (
                <section>
                  <h2>Audit perubahan</h2>
                  <ServerFilters
                    audit
                    filters={filters}
                    onApply={(next) => {
                      setLoading(true);
                      setOffset(0);
                      setFilters(next);
                    }}
                  />
                  {!current.audit.items.length && <p>Belum ada audit pada halaman ini.</p>}
                  <ul className="monitoring-list">
                    {current.audit.items.map((r) => (
                      <li key={r.id} className="monitoring-notice admin-content-row">
                        <strong>{r.action}</strong>
                        <p>
                          {r.entityType} · {new Date(r.createdAt).toLocaleString('id-ID')}
                        </p>
                        <small>
                          Entitas: {r.entityId ?? 'Tidak tersedia'} · Aktor:{' '}
                          {r.actorUserId ?? 'Tidak tersedia'}
                        </small>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
            {view !== 'curriculum' && (
              <nav
                className="admin-content-actions assessment-pagination"
                aria-label="Halaman data"
              >
                <Button
                  disabled={offset === 0 || busy || loading}
                  onClick={() => {
                    setLoading(true);
                    setOffset(Math.max(0, offset - ADMIN_PAGE_SIZE));
                  }}
                >
                  Sebelumnya
                </Button>
                <span aria-live="polite">
                  Halaman {offset / ADMIN_PAGE_SIZE + 1}
                  {totalItems !== undefined && ` · Jumlah data: ${totalItems}`}
                </span>
                <Button
                  disabled={!hasNext || busy || loading}
                  onClick={() => {
                    setLoading(true);
                    setOffset(offset + ADMIN_PAGE_SIZE);
                  }}
                >
                  Berikutnya
                </Button>
              </nav>
            )}
          </>
        )}
      </div>
    </AdminFrame>
  );
}
