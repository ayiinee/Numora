'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Badge, Button } from '@tka/ui';
import { useAuth } from '@/features/onboarding/auth';
import { ApiProblem } from '@/lib/api';
import { classifyQuestion } from './content-package-api';
import { ContentPackageWorkspace } from './content-package-workspace';
import { AdminPagination, useAdminPagination } from './admin-pagination';
import {
  setChapterCategory,
  createChapter,
  createCompetency,
  createDrillPackage,
  createLevel,
  createQuestion,
  createSubchapter,
  createTryoutDraft,
  createVariant,
  createVideo,
  loadAdminWorkbench,
  archiveDrillPackage,
  publishDrillPackage,
  renameTaxon,
  resolveReport,
  reviseQuestion,
  setContentStatus,
  updateDrillPackage,
  updateTryoutDraft,
  updateVideo,
} from './content-api';
import type {
  AdminTaxonDto,
  AdminDrillPackageDto,
  AdminTryoutDraftDto,
  AdminVersionDto,
  QuestionContentDto,
} from './generated-types';
import {
  AdminFrame,
  AdminLoading,
  AdminMessage,
  AdminStats,
  AdminEditorForm,
} from './admin-presentation';

type Workbench = Awaited<ReturnType<typeof loadAdminWorkbench>>;
type View =
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
const field = (form: FormData, name: string) => String(form.get(name) ?? '').trim();
const message = (error: unknown) =>
  error instanceof Error ? error.message : 'Permintaan gagal. Coba lagi.';
type Run = (action: () => Promise<{ id: string }>) => Promise<boolean>;

export function AdminContentScreen() {
  const { state } = useAuth();
  const accountKey =
    state.status === 'ready'
      ? `${state.profile.id}:${state.profile.adminRole ?? 'unassigned'}`
      : state.status;
  return <AdminContentScreenContent key={accountKey} />;
}

function AdminContentScreenContent() {
  const { state, refresh } = useAuth();
  const canReadAudit = state.status === 'ready' && state.profile.adminRole === 'SUPER_ADMIN';
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
  const [view, setView] = useState<View>('questions');
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
    if (!token) return;
    let active = true;
    setLoading(true);
    setError('');
    loadAdminWorkbench(token, offset, versionQuery, canReadAudit).then(
      (result) => {
        if (active) {
          setData(result);
          setLoading(false);
          setDenied(false);
        }
      },
      (cause: unknown) => {
        if (active) {
          setError(message(cause));
          setLoading(false);
          setDenied(cause instanceof ApiProblem && [401, 403].includes(cause.status));
        }
      },
    );
    return () => {
      active = false;
    };
  }, [token, offset, revision, versionQuery, canReadAudit]);
  async function run(action: () => Promise<{ id: string }>) {
    if (busy) return false;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await action();
      setNotice(`Perubahan tersimpan. ID: ${result.id}`);
      setRevision((value) => value + 1);
      return true;
    } catch (cause) {
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
    setView(next);
    setOffset(0);
    setError('');
  }
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
    >
      <div className="monitoring-frame admin-content">
        <nav aria-label="Pengelolaan Admin" className="admin-content-nav">
          {views
            .filter((item) => canReadAudit || item.id !== 'audit')
            .map((item) => (
              <Button
                key={item.id}
                disabled={busy}
                variant={view === item.id ? 'primary' : 'secondary'}
                className="admin-view-button"
                aria-current={view === item.id ? 'page' : undefined}
                onClick={() => navigate(item.id)}
              >
                {item.label}
              </Button>
            ))}
        </nav>
        {notice && <AdminMessage message={notice} />}
        {error && (
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
            <AdminStats
              items={[
                { label: 'Keluarga soal', value: current.dashboard.questions, icon: 'book' },
                { label: 'Versi READY', value: current.dashboard.readyVersions, icon: 'check' },
                { label: 'Laporan terbuka', value: current.dashboard.openReports, icon: 'chat' },
              ]}
            />
            <div
              className="admin-content-view"
              aria-label={views.find((item) => item.id === view)?.label}
              aria-busy={loading}
            >
              {view === 'curriculum' && (
                <Curriculum data={current} token={token} busy={busy} run={run} />
              )}
              {view === 'questions' && (
                <>
                  <div className="admin-search-toolbar">
                    <label>
                      Tujuan soal
                      <select
                        value={versionUsage}
                        disabled={busy}
                        onChange={(e) => {
                          setVersionUsage(e.target.value);
                          setOffset(0);
                        }}
                      >
                        <option value="">Semua tujuan</option>
                        <option value="UNCLASSIFIED">Belum diklasifikasikan</option>
                        {['DRILL', 'PRETEST', 'TRYOUT'].map((u) => (
                          <option key={u}>{u}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Status versi
                      <select
                        value={versionStatus}
                        disabled={busy}
                        onChange={(e) => {
                          setVersionStatus(e.target.value);
                          setOffset(0);
                        }}
                      >
                        <option value="">Semua status</option>
                        {['DRAFT', 'READY', 'ARCHIVED'].map((s) => (
                          <option key={s}>{s}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Materi soal
                      <select
                        value={versionChapter}
                        disabled={busy}
                        onChange={(e) => {
                          setVersionChapter(e.target.value);
                          setOffset(0);
                        }}
                      >
                        <option value="">Semua bab</option>
                        {current.curriculum.items
                          .filter((c) => c.kind === 'CHAPTER')
                          .map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                      </select>
                    </label>
                    <label>
                      Sumber soal
                      <input
                        value={versionSource}
                        maxLength={240}
                        disabled={busy}
                        onChange={(e) => {
                          setVersionSource(e.target.value);
                          setOffset(0);
                        }}
                      />
                    </label>
                  </div>
                  <QuestionEditor
                    key={editing?.id ?? 'new'}
                    version={editing}
                    data={current}
                    token={token}
                    busy={busy}
                    run={run}
                    close={() => setEditing(null)}
                  />
                  <section>
                    <h2>Versi soal</h2>
                    <Link href="/admin/content/imports">
                      Impor Excel/JSON, paket & preview internal
                    </Link>

                    {!current.versions.items.length && (
                      <p>Belum ada versi soal pada halaman ini.</p>
                    )}
                    <ul className="monitoring-list">
                      {current.versions.items.map((v) => (
                        <li className="monitoring-notice admin-content-row" key={v.id}>
                          <strong>{v.stem || `Konten ${v.questionType}`}</strong>
                          <small>
                            {v.variantCode} · v{v.versionNumber} · {v.questionType}
                          </small>
                          <p>
                            Keluarga: {v.questionStatus} · Versi: {v.contentStatus}
                          </p>
                          <Badge>{v.usageType ?? 'Belum diklasifikasikan'}</Badge>
                          {v.sourceQuestionId && (
                            <small>Salinan dari keluarga soal: {v.sourceQuestionId}</small>
                          )}
                          <small>
                            Sumber: {v.sourceName ?? 'Belum tercatat'} {v.sourceReference ?? ''}{' '}
                            {v.sourceFileName ? `· ${v.sourceFileName}` : ''}
                          </small>
                          {!v.usageType && (
                            <form
                              onSubmit={(e) => {
                                e.preventDefault();
                                const f = new FormData(e.currentTarget);
                                void run(() =>
                                  classifyQuestion(token, v.questionId, {
                                    usageType: field(f, 'usageType') as
                                      'DRILL' | 'PRETEST' | 'TRYOUT',
                                  }),
                                );
                              }}
                            >
                              <label>
                                Klasifikasi tujuan
                                <select name="usageType" required disabled={busy}>
                                  <option value="">Pilih tujuan permanen</option>
                                  {['DRILL', 'PRETEST', 'TRYOUT'].map((u) => (
                                    <option key={u}>{u}</option>
                                  ))}
                                </select>
                              </label>
                              <Button type="submit" disabled={busy}>
                                Simpan klasifikasi
                              </Button>
                            </form>
                          )}
                          {v.reviewedByUserId && <small>Direview oleh: {v.reviewedByUserId}</small>}
                          <small>ID versi: {v.id}</small>
                          {v.reviewedAt && (
                            <small>
                              Ditinjau: {new Date(v.reviewedAt).toLocaleString('id-ID')}
                            </small>
                          )}
                          <div className="admin-content-actions">
                            {v.imported && (
                              <span>Konten impor hanya dibaca; revisi melalui JSON.</span>
                            )}
                            {!v.imported && v.questionType === 'SINGLE_CHOICE' && (
                              <Button
                                variant="secondary"
                                disabled={busy}
                                onClick={() => setEditing(v)}
                              >
                                Buat revisi / varian
                              </Button>
                            )}
                            {!v.imported && v.questionStatus !== 'READY' && (
                              <Button
                                disabled={busy}
                                onClick={() =>
                                  void run(() =>
                                    setContentStatus(token, 'questions', v.questionId, 'READY'),
                                  )
                                }
                              >
                                Atur keluarga READY
                              </Button>
                            )}
                            {!v.imported && v.contentStatus === 'DRAFT' && (
                              <Button
                                disabled={busy}
                                onClick={() => {
                                  if (
                                    window.confirm(
                                      'Saya sudah meninjau isi, kunci jawaban, pembahasan, dan materi induk versi ini. Publikasikan sebagai READY?',
                                    )
                                  )
                                    void run(() =>
                                      setContentStatus(token, 'versions', v.id, 'READY'),
                                    );
                                }}
                              >
                                Publikasikan versi
                              </Button>
                            )}
                            {!v.imported && v.contentStatus !== 'ARCHIVED' && (
                              <Button
                                variant="danger-outline"
                                disabled={busy}
                                onClick={() => {
                                  if (
                                    window.confirm(
                                      'Arsipkan versi ini untuk mencegah pengerjaan baru? Riwayat tetap disimpan.',
                                    )
                                  )
                                    void run(() =>
                                      setContentStatus(token, 'versions', v.id, 'ARCHIVED'),
                                    );
                                }}
                              >
                                Arsipkan versi
                              </Button>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </section>
                </>
              )}
              {view === 'verification' && (
                <VerificationHistory data={current} canReadAudit={canReadAudit} />
              )}
              {view === 'videos' && <Videos data={current} token={token} busy={busy} run={run} />}
              {view === 'packages' && (
                <>
                  <TryoutEditor
                    key={draft?.id ?? 'new'}
                    draft={draft}
                    data={current}
                    token={token}
                    busy={busy}
                    run={run}
                    close={() => setDraft(null)}
                  />
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
                          <Button variant="secondary" disabled={busy} onClick={() => setDraft(p)}>
                            Edit draf
                          </Button>
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
                <Reports data={current} token={token} busy={busy} run={run} navigate={navigate} />
              )}
              {view === 'irt' && (
                <section>
                  <h2>Status dan riwayat batch IRT</h2>
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
            {view !== 'curriculum' && view !== 'directedPackages' && (
              <AdminPagination
                offset={offset}
                hasNext={hasNext}
                disabled={busy || loading}
                onChange={setOffset}
              />
            )}
          </>
        )}
      </div>
    </AdminFrame>
  );
}

function Field({ label, name, children }: { label: string; name: string; children: ReactNode }) {
  return (
    <label className="admin-content-field" data-field={name}>
      <span>{label}</span>
      {children}
    </label>
  );
}
type EditorProps = { data: Workbench; token: string; busy: boolean; run: Run };

function Reports({
  data,
  token,
  busy,
  run,
  navigate,
}: EditorProps & { navigate: (view: View) => void }) {
  type Report = Workbench['reports']['items'][number];
  const [kind, setKind] = useState<Report['kind'] | 'ALL'>('ALL');
  const [status, setStatus] = useState<Report['status'] | 'ALL'>('ALL');
  const visible = data.reports.items.filter(
    (report) =>
      (kind === 'ALL' || report.kind === kind) && (status === 'ALL' || report.status === status),
  );
  return (
    <section>
      <h2>Laporan soal dan video</h2>
      <p>
        Daftar ini berisi laporan pada halaman yang dimuat. Filter tidak mengubah data di server.
      </p>
      <div className="admin-search-toolbar">
        <label>
          Jenis laporan
          <select
            aria-label="Jenis laporan"
            value={kind}
            onChange={(event) => setKind(event.target.value as typeof kind)}
          >
            <option value="ALL">Semua jenis</option>
            <option value="QUESTION">Soal</option>
            <option value="VIDEO">Video</option>
          </select>
        </label>
        <label>
          Status laporan
          <select
            aria-label="Filter status laporan"
            value={status}
            onChange={(event) => setStatus(event.target.value as typeof status)}
          >
            <option value="ALL">Semua status</option>
            {(['OPEN', 'IN_REVIEW', 'RESOLVED', 'REJECTED'] as const).map((value) => (
              <option key={value} value={value}>
                {reportStatusLabel(value)}
              </option>
            ))}
          </select>
        </label>
        <span role="status">{visible.length} laporan ditampilkan</span>
      </div>
      {!data.reports.items.length ? (
        <p>Belum ada laporan pada halaman ini.</p>
      ) : !visible.length ? (
        <p>Tidak ada laporan yang cocok dengan filter ini.</p>
      ) : (
        <ul className="monitoring-list">
          {visible.map((report) => {
            const video =
              report.kind === 'VIDEO'
                ? data.videos.items.find((item) => item.mappingId === report.referenceId)
                : undefined;
            const subchapter = video
              ? data.curriculum.items.find((item) => item.id === video.subchapterId)
              : undefined;
            return (
              <li
                key={`${report.kind}-${report.id}`}
                className="monitoring-notice admin-content-row"
                data-testid={`report-${report.id}`}
              >
                <div className="admin-report-heading">
                  <strong>{report.kind === 'QUESTION' ? 'Laporan soal' : 'Laporan video'}</strong>
                  <Badge
                    className="status-badge"
                    variant={
                      report.status === 'RESOLVED'
                        ? 'success'
                        : report.status === 'IN_REVIEW'
                          ? 'warning'
                          : report.status === 'OPEN'
                            ? 'primary'
                            : 'default'
                    }
                  >
                    {reportStatusLabel(report.status)}
                  </Badge>
                </div>
                <p>Kategori: {report.category}</p>
                <p>{report.details || 'Pelapor tidak menambahkan rincian.'}</p>
                <small>Diterima {new Date(report.reportedAt).toLocaleString('id-ID')}</small>
                {report.kind === 'VIDEO' ? (
                  video ? (
                    <div>
                      <p>
                        Mapping: {video.title} · {video.source} · subbab{' '}
                        {subchapter?.name ?? video.subchapterId} · urutan{' '}
                        {video.recommendationOrder}
                      </p>
                      {video.url.startsWith('https://') ? (
                        <a href={video.url} target="_blank" rel="noreferrer">
                          Buka video terkait
                        </a>
                      ) : (
                        <p>URL mapping video belum menggunakan HTTPS.</p>
                      )}
                    </div>
                  ) : (
                    <p>Mapping video tidak ada pada halaman metadata yang sedang dimuat.</p>
                  )
                ) : (
                  <p>
                    Referensi jawaban/attempt: <code>{report.referenceId}</code>
                  </p>
                )}
                {report.followUp && (
                  <p>
                    <strong>Tindak lanjut tersimpan:</strong> {report.followUp}
                  </p>
                )}
                <div className="admin-content-actions">
                  <Button
                    type="button"
                    className="secondary-button"
                    disabled={busy}
                    onClick={() => navigate(report.kind === 'VIDEO' ? 'videos' : 'questions')}
                  >
                    {report.kind === 'VIDEO' ? 'Kelola metadata video' : 'Buka daftar soal'}
                  </Button>
                </div>
                <AdminEditorForm
                  busy={busy}
                  className="admin-content-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const form = new FormData(event.currentTarget);
                    void run(() =>
                      resolveReport(token, report.kind, report.id, {
                        status: field(form, 'status') as Report['status'],
                        followUp: field(form, 'followUp'),
                      }),
                    );
                  }}
                >
                  <Field label="Status tindak lanjut" name="status">
                    <select name="status" defaultValue={report.status}>
                      {(['OPEN', 'IN_REVIEW', 'RESOLVED', 'REJECTED'] as const).map((value) => (
                        <option key={value} value={value}>
                          {reportStatusLabel(value)}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Catatan tindak lanjut" name="followUp">
                    <textarea
                      name="followUp"
                      defaultValue={report.followUp ?? ''}
                      required
                      maxLength={2000}
                    />
                  </Field>
                  <small>{report.followUp?.length ?? 0}/2000 karakter tersimpan</small>
                  <Button type="submit" disabled={busy}>
                    Simpan status dan tindak lanjut
                  </Button>
                </AdminEditorForm>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function reportStatusLabel(status: 'OPEN' | 'IN_REVIEW' | 'RESOLVED' | 'REJECTED') {
  return {
    OPEN: 'Terbuka',
    IN_REVIEW: 'Sedang ditinjau',
    RESOLVED: 'Selesai ditindaklanjuti',
    REJECTED: 'Ditolak',
  }[status];
}

function VerificationHistory({ data, canReadAudit }: { data: Workbench; canReadAudit: boolean }) {
  return (
    <>
      <section>
        <h2>Verifikasi versi konten</h2>
        <p>
          Status dan metadata peninjauan ditampilkan dari API; layar ini tidak mengubah status
          sendiri.
        </p>
        {!data.versions.items.length && <p>Belum ada versi konten pada halaman ini.</p>}
        <ul className="monitoring-list">
          {data.versions.items.map((version) => (
            <li className="monitoring-notice admin-content-row" key={version.id}>
              <strong>
                {version.variantCode} · v{version.versionNumber} · {version.questionType}
              </strong>
              <p>
                Keluarga {version.questionStatus} · Versi {version.contentStatus}
              </p>
              <small>{version.stem || `Soal ${version.questionId}`}</small>
              <small>Reviewer: {version.reviewedByUserId ?? 'Belum tercatat'}</small>
              <small>
                Waktu review:{' '}
                {version.reviewedAt
                  ? new Date(version.reviewedAt).toLocaleString('id-ID')
                  : 'Belum ditinjau'}
              </small>
              <small>ID versi: {version.id}</small>
            </li>
          ))}
        </ul>
      </section>
      {canReadAudit && (
        <section>
          <h2>Riwayat perubahan Admin</h2>
          {!data.audit.items.length && <p>Belum ada riwayat pada halaman ini.</p>}
          <ul className="monitoring-list">
            {data.audit.items.map((entry) => (
              <li className="monitoring-notice admin-content-row" key={entry.id}>
                <strong>{entry.action}</strong>
                <p>
                  {entry.entityType} · {new Date(entry.createdAt).toLocaleString('id-ID')}
                </p>
                <small>
                  Entitas: {entry.entityId ?? 'Tidak tersedia'} · Aktor:{' '}
                  {entry.actorUserId ?? 'Tidak tersedia'}
                </small>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function DrillPackages({
  data,
  token,
  busy,
  run,
  draft,
  setDraft,
}: EditorProps & {
  draft: AdminDrillPackageDto | null;
  setDraft: (value: AdminDrillPackageDto | null) => void;
}) {
  return (
    <section>
      <h2>Publisher paket Drill</h2>
      <p>
        Publikasi divalidasi oleh API. Paket harus berisi 10 versi soal yang sudah ditinjau dan
        materi serta kebijakan penilaiannya harus siap.
      </p>
      <DrillPackageEditor
        key={draft?.id ?? 'new-drill-package'}
        data={data}
        token={token}
        busy={busy}
        run={run}
        draft={draft}
        close={() => setDraft(null)}
      />
      {!data.drillPackages.items.length && <p>Belum ada paket Drill pada halaman ini.</p>}
      <ul className="monitoring-list">
        {data.drillPackages.items.map((pack) => (
          <li className="monitoring-notice admin-content-row" key={pack.id}>
            <strong>{pack.name}</strong>
            <p>
              {pack.familyCode} · v{pack.packageVersion} · {pack.status} ·{' '}
              {pack.questionVersionIds.length} versi soal
            </p>
            <small>
              Level {pack.levelId} · Varian {pack.variantIndex ?? 'Belum tersedia'} · Kebijakan{' '}
              {pack.scoringPolicyVersionId ?? 'Belum tersedia'}
            </small>
            <small>
              Waktu publikasi:{' '}
              {pack.releaseAt ? new Date(pack.releaseAt).toLocaleString('id-ID') : 'Belum terbit'}
            </small>
            <ul>
              {pack.questionVersionIds.map((versionId, index) => {
                const version = data.versions.items.find((item) => item.id === versionId);
                return (
                  <li key={versionId}>
                    <small>
                      {index + 1}. {version?.variantCode ?? 'Versi di luar halaman verifikasi'}
                      {version ? ` v${version.versionNumber} · ${version.contentStatus}` : ''}
                      {version?.reviewedAt
                        ? ` · Direview ${new Date(version.reviewedAt).toLocaleString('id-ID')}`
                        : ''}
                    </small>
                    {!version && <small>ID versi: {versionId}</small>}
                  </li>
                );
              })}
            </ul>
            {pack.status === 'DRAFT' && (
              <div className="admin-content-actions">
                <Button variant="secondary" disabled={busy} onClick={() => setDraft(pack)}>
                  Edit draf
                </Button>
                <Button
                  disabled={busy}
                  onClick={() => {
                    if (
                      window.confirm(
                        'Terbitkan paket ini? API akan memvalidasi 10 soal, hasil review, materi, dan kebijakan penilaian.',
                      )
                    )
                      void run(() => publishDrillPackage(token, pack.id));
                  }}
                >
                  Publikasikan paket
                </Button>
              </div>
            )}
            {pack.status !== 'ARCHIVED' && (
              <Button
                variant="danger-outline"
                disabled={busy}
                onClick={() => {
                  if (
                    window.confirm(
                      'Arsipkan paket? Riwayat dan item paket tetap disimpan, dan paket tidak dapat diterbitkan ulang.',
                    )
                  )
                    void run(() => archiveDrillPackage(token, pack.id));
                }}
              >
                Arsipkan paket
              </Button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function DrillPackageEditor({
  draft,
  data,
  token,
  busy,
  run,
  close,
}: EditorProps & { draft: AdminDrillPackageDto | null; close: () => void }) {
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const questionVersionIds = field(values, 'questionVersionIds')
      .split(/[\s,]+/)
      .filter(Boolean);
    const result = await run(() =>
      draft
        ? updateDrillPackage(token, draft.id, {
            name: field(values, 'name'),
            scoringPolicyVersionId: field(values, 'scoringPolicyVersionId'),
            questionVersionIds,
          })
        : createDrillPackage(token, {
            familyCode: field(values, 'familyCode'),
            packageVersion: Number(field(values, 'packageVersion')),
            name: field(values, 'name'),
            levelId: field(values, 'levelId'),
            variantIndex: Number(field(values, 'variantIndex')),
            scoringPolicyVersionId: field(values, 'scoringPolicyVersionId'),
            questionVersionIds,
          }),
    );
    if (result) {
      if (draft) close();
      else form.reset();
    }
  }
  return (
    <AdminEditorForm busy={busy} onSubmit={(event) => void submit(event)}>
      <h3>{draft ? 'Edit draf paket Drill' : 'Susun draf paket Drill'}</h3>
      {draft ? (
        <>
          <p>
            {draft.familyCode} · v{draft.packageVersion} · Level {draft.levelId} · Varian{' '}
            {draft.variantIndex ?? 'Belum tersedia'}
          </p>
          <Button variant="secondary" type="button" disabled={busy} onClick={close}>
            Batal edit
          </Button>
        </>
      ) : (
        <>
          <Field label="Kode keluarga" name="familyCode">
            <input
              name="familyCode"
              required
              pattern="[A-Za-z0-9]+(-[A-Za-z0-9]+)*"
              maxLength={64}
            />
          </Field>
          <Field label="Versi paket" name="packageVersion">
            <input name="packageVersion" type="number" min={1} max={100000} required />
          </Field>
          <Field label="Level" name="levelId">
            <select name="levelId" required defaultValue="">
              <option value="">Pilih level</option>
              {data.curriculum.items
                .filter((taxon) => taxon.kind === 'LEVEL')
                .map((level) => (
                  <option key={level.id} value={level.id}>
                    {level.name} · {level.code}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Indeks varian" name="variantIndex">
            <input name="variantIndex" type="number" min={1} max={100000} required />
          </Field>
        </>
      )}
      <Field label="Nama paket" name="name">
        <input name="name" required maxLength={160} defaultValue={draft?.name ?? ''} />
      </Field>
      <Field label="ID versi kebijakan penilaian" name="scoringPolicyVersionId">
        <input
          name="scoringPolicyVersionId"
          required
          defaultValue={draft?.scoringPolicyVersionId ?? ''}
          aria-describedby="drill-policy-help"
        />
      </Field>
      <small id="drill-policy-help">
        API saat ini hanya dapat menerbitkan policy DRILL_PG_DEMO versi 1; masukkan ID policy yang
        disediakan backend.
      </small>
      <Field label="ID versi soal (pisahkan dengan baris baru atau koma)" name="questionVersionIds">
        <textarea
          name="questionVersionIds"
          defaultValue={draft?.questionVersionIds.join('\n') ?? ''}
          aria-describedby="drill-questions-help"
        />
      </Field>
      <small id="drill-questions-help">
        Draf boleh belum lengkap. Sebelum terbit, API memerlukan tepat 10 versi unik yang READY dan
        ditinjau.
      </small>
      <Button
        type="submit"
        disabled={
          busy || (!draft && !data.curriculum.items.some((taxon) => taxon.kind === 'LEVEL'))
        }
      >
        Simpan draf paket
      </Button>
    </AdminEditorForm>
  );
}

function Curriculum({ data, token, busy, run }: EditorProps) {
  const [kind, setKind] = useState<AdminTaxonDto['kind']>('CHAPTER');
  const page = useAdminPagination(data.curriculum.items);
  const parents = data.curriculum.items.filter(
    (r) => r.kind === (kind === 'SUBCHAPTER' ? 'CHAPTER' : 'SUBCHAPTER'),
  );
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const name = field(f, 'name'),
      code = field(f, 'code'),
      parent = field(f, 'parent'),
      order = Number(field(f, 'order'));
    const result = await run(() =>
      kind === 'CHAPTER'
        ? createChapter(token, {
            code,
            name,
            displayOrder: order,
            materialCategory: field(f, 'category')
              ? (field(f, 'category') as NonNullable<AdminTaxonDto['materialCategory']>)
              : null,
          })
        : kind === 'SUBCHAPTER'
          ? createSubchapter(token, { chapterId: parent, code, name, displayOrder: order })
          : kind === 'COMPETENCY'
            ? createCompetency(token, { subchapterId: parent, code, description: name })
            : createLevel(token, { subchapterId: parent, levelNumber: order, description: name }),
    );
    if (result) form.reset();
  }
  const resources = {
    CHAPTER: 'chapters',
    SUBCHAPTER: 'subchapters',
    COMPETENCY: 'competencies',
    LEVEL: 'levels',
  } as const;
  return (
    <section>
      <h2>Materi dan kompetensi</h2>
      <AdminEditorForm busy={busy} onSubmit={(e) => void submit(e)}>
        <Field label="Jenis materi" name="kind">
          <select
            name="kind"
            value={kind}
            onChange={(e) => setKind(e.target.value as AdminTaxonDto['kind'])}
          >
            {['CHAPTER', 'SUBCHAPTER', 'COMPETENCY', 'LEVEL'].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </Field>
        {kind !== 'CHAPTER' && (
          <Field label="Materi induk" name="parent">
            <select name="parent" required defaultValue="">
              <option value="">Pilih materi induk</option>
              {parents.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.code})
                </option>
              ))}
            </select>
          </Field>
        )}
        {kind !== 'LEVEL' && (
          <Field label="Kode unik" name="code">
            <input name="code" required maxLength={64} pattern="[A-Za-z0-9]+(-[A-Za-z0-9]+)*" />
          </Field>
        )}
        {kind === 'CHAPTER' && (
          <Field label="Kategori bab" name="category">
            <CategorySelect name="category" />
          </Field>
        )}
        <Field
          label={kind === 'COMPETENCY' ? 'Deskripsi kompetensi' : 'Nama / deskripsi'}
          name="name"
        >
          <input name="name" required maxLength={160} />
        </Field>
        {kind !== 'COMPETENCY' && (
          <Field label={kind === 'LEVEL' ? 'Nomor level' : 'Urutan'} name="order">
            <input
              name="order"
              type="number"
              min={1}
              max={kind === 'LEVEL' ? 1000 : 100000}
              required
            />
          </Field>
        )}
        <Button type="submit" disabled={busy || (kind !== 'CHAPTER' && !parents.length)}>
          Simpan draf materi
        </Button>
      </AdminEditorForm>
      {!data.curriculum.items.length && <p>Belum ada materi. Mulai dengan Bab.</p>}
      <ul className="monitoring-list">
        {page.items.map((r) => (
          <li key={r.id} className="monitoring-notice admin-content-row">
            <strong>{r.name}</strong>
            <small>
              {r.kind} · {r.code} · {r.status} · Induk:{' '}
              {data.curriculum.items.find((p) => p.id === r.parentId)?.name ?? '—'}
            </small>
            {r.kind === 'CHAPTER' && (
              <label>
                Kategori bab: {r.name}
                <CategorySelect
                  value={r.materialCategory ?? ''}
                  disabled={busy}
                  onChange={(e) =>
                    void run(() => setChapterCategory(token, r.id, e.target.value || null))
                  }
                />
              </label>
            )}
            <div className="admin-content-actions">
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => {
                  const name = window.prompt('Nama / deskripsi baru', r.name);
                  if (name?.trim()) void run(() => renameTaxon(token, r, name.trim()));
                }}
              >
                Ubah nama / deskripsi
              </Button>
              {r.status !== 'READY' && (
                <Button
                  disabled={busy}
                  onClick={() =>
                    void run(() => setContentStatus(token, resources[r.kind], r.id, 'READY'))
                  }
                >
                  Atur READY
                </Button>
              )}
              {r.status !== 'ARCHIVED' && (
                <Button
                  variant="danger-outline"
                  disabled={busy}
                  onClick={() => {
                    if (
                      window.confirm(
                        'Arsipkan materi ini? Materi dapat hilang dari katalog untuk pengerjaan baru.',
                      )
                    )
                      void run(() => setContentStatus(token, resources[r.kind], r.id, 'ARCHIVED'));
                  }}
                >
                  Arsipkan
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>
      <AdminPagination {...page.pagination} disabled={busy} label="Halaman materi" />
    </section>
  );
}

function QuestionEditor({
  version,
  data,
  token,
  busy,
  run,
  close,
}: EditorProps & { version: AdminVersionDto | null; close: () => void }) {
  const [variant, setVariant] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const body: QuestionContentDto = {
      stem: field(f, 'stem'),
      options: ['A', 'B', 'C', 'D'].map((id) => ({ id, text: field(f, id) })),
      answerOptionId: field(f, 'answer'),
      explanation: field(f, 'explanation'),
      difficulty: field(f, 'difficulty'),
    };
    const result = await run(() =>
      !version
        ? createQuestion(token, {
            ...body,
            primaryCompetencyId: field(f, 'competency'),
            variantCode: field(f, 'variantCode'),
            usageType: field(f, 'usageType') as 'DRILL' | 'PRETEST' | 'TRYOUT',
          })
        : variant
          ? createVariant(token, version.questionId, {
              ...body,
              originalVariantId: version.originalVariantId ?? version.variantId,
              variantCode: field(f, 'variantCode'),
            })
          : reviseQuestion(token, version.id, body),
    );
    if (result) {
      if (version) close();
      else form.reset();
    }
  }
  return (
    <AdminEditorForm busy={busy} onSubmit={(e) => void submit(e)}>
      <h2>
        {version ? `Revisi ${version.variantCode} v${version.versionNumber}` : 'Buat soal PG'}
      </h2>
      <p>
        Editor awal mendukung empat opsi A–D. Soal tersimpan sebagai DRAFT. PGK menunggu OPEN-04.
      </p>
      {version ? (
        <>
          <Button variant="secondary" type="button" disabled={busy} onClick={close}>
            Batal revisi
          </Button>
          <label>
            <input
              type="checkbox"
              checked={variant}
              onChange={(e) => setVariant(e.target.checked)}
            />{' '}
            Buat varian setara dalam keluarga soal ini
          </label>
        </>
      ) : (
        <Field label="Kompetensi" name="competency">
          <select name="competency" defaultValue="" required>
            <option value="">Pilih kompetensi</option>
            {data.curriculum.items
              .filter((r) => r.kind === 'COMPETENCY')
              .map((r) => (
                <option key={r.id} value={r.id}>
                  {r.code}: {r.name}
                </option>
              ))}
          </select>
        </Field>
      )}
      {(!version || variant) && (
        <Field label="Kode varian unik" name="variantCode">
          <input
            name="variantCode"
            required
            pattern="[A-Za-z0-9]+(-[A-Za-z0-9]+)*"
            maxLength={64}
          />
        </Field>
      )}
      {!version && (
        <Field label="Tujuan soal permanen" name="usageType">
          <select name="usageType" required defaultValue="">
            <option value="">Pilih tujuan</option>
            {['DRILL', 'PRETEST', 'TRYOUT'].map((u) => (
              <option key={u}>{u}</option>
            ))}
          </select>
        </Field>
      )}
      <Field label="Teks soal (LaTeX inline diperbolehkan)" name="stem">
        <textarea name="stem" required maxLength={8000} defaultValue={version?.stem ?? ''} />
      </Field>
      {['A', 'B', 'C', 'D'].map((id) => (
        <Field label={`Opsi ${id}`} name={id} key={id}>
          <input
            name={id}
            required
            maxLength={4000}
            defaultValue={version?.options.find((o) => o.id === id)?.text ?? ''}
          />
        </Field>
      ))}
      <Field label="Kunci jawaban" name="answer">
        <select name="answer" defaultValue={version?.answerOptionId ?? 'A'}>
          {['A', 'B', 'C', 'D'].map((id) => (
            <option key={id}>{id}</option>
          ))}
        </select>
      </Field>
      <Field label="Pembahasan" name="explanation">
        <textarea
          name="explanation"
          required
          maxLength={8000}
          defaultValue={version?.explanation ?? ''}
        />
      </Field>
      <Field label="Label kesulitan dari Curriculum" name="difficulty">
        <input
          name="difficulty"
          required
          maxLength={80}
          defaultValue={version?.difficulty ?? 'DEMO'}
        />
      </Field>
      <Button
        type="submit"
        disabled={busy || (!version && !data.curriculum.items.some((r) => r.kind === 'COMPETENCY'))}
      >
        Simpan versi DRAFT
      </Button>
    </AdminEditorForm>
  );
}

function Videos({ data, token, busy, run }: EditorProps) {
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const result = await run(() =>
      createVideo(token, {
        title: field(f, 'title'),
        url: field(f, 'url'),
        source: field(f, 'source'),
        subchapterId: field(f, 'subchapter'),
        recommendationOrder: Number(field(f, 'order')),
      }),
    );
    if (result) form.reset();
  }
  return (
    <section>
      <h2>Metadata video</h2>
      <AdminEditorForm busy={busy} onSubmit={(e) => void submit(e)}>
        <Field label="Judul video" name="title">
          <input name="title" required maxLength={240} />
        </Field>
        <Field label="URL HTTPS" name="url">
          <input name="url" type="url" pattern="https://.*" required maxLength={2000} />
        </Field>
        <Field label="Sumber / penyedia" name="source">
          <input name="source" required maxLength={160} />
        </Field>
        <Field label="Subbab" name="subchapter">
          <select name="subchapter" required defaultValue="">
            <option value="">Pilih subbab</option>
            {data.curriculum.items
              .filter((r) => r.kind === 'SUBCHAPTER')
              .map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
          </select>
        </Field>
        <Field label="Urutan rekomendasi" name="order">
          <input name="order" type="number" min={1} max={100000} required />
        </Field>
        <Button type="submit" disabled={busy}>
          Simpan draf video
        </Button>
      </AdminEditorForm>
      {!data.videos.items.length && <p>Belum ada video pada halaman ini.</p>}
      <ul className="monitoring-list">
        {data.videos.items.map((v) => (
          <li key={v.mappingId} className="monitoring-notice admin-content-row">
            <strong>{v.title}</strong>
            {v.url.startsWith('https://') ? (
              <a href={v.url} target="_blank" rel="noreferrer">
                Buka video ({v.source})
              </a>
            ) : (
              <p>URL lama perlu diperbarui ke HTTPS.</p>
            )}
            <p>
              Urutan {v.recommendationOrder} · {v.status}
            </p>
            <div className="admin-content-actions">
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => {
                  const url = window.prompt('URL HTTPS baru', v.url);
                  if (url?.trim())
                    void run(() => updateVideo(token, v.mappingId, { url: url.trim() }));
                }}
              >
                Ubah URL
              </Button>
              {v.status !== 'READY' && (
                <Button
                  disabled={busy}
                  onClick={() =>
                    void run(() => setContentStatus(token, 'videos', v.mappingId, 'READY'))
                  }
                >
                  Atur READY
                </Button>
              )}
              {v.status !== 'ARCHIVED' && (
                <Button
                  variant="danger-outline"
                  disabled={busy}
                  onClick={() =>
                    void run(() => setContentStatus(token, 'videos', v.mappingId, 'ARCHIVED'))
                  }
                >
                  Arsipkan pemetaan
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function TryoutEditor({
  draft,
  data,
  token,
  busy,
  run,
  close,
}: EditorProps & { draft: AdminTryoutDraftDto | null; close: () => void }) {
  // Preserve pinned IDs outside the current question page while editing a package.
  const [selected, setSelected] = useState<string[]>(draft?.questionVersionIds ?? []);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const body = { name: field(f, 'name'), questionVersionIds: selected };
    const result = await run(() =>
      draft
        ? updateTryoutDraft(token, draft.id, body)
        : createTryoutDraft(token, {
            ...body,
            familyCode: field(f, 'familyCode'),
            packageVersion: Number(field(f, 'packageVersion')),
          }),
    );
    if (result) {
      if (draft) close();
      else {
        form.reset();
        setSelected([]);
      }
    }
  }
  return (
    <AdminEditorForm busy={busy} onSubmit={(e) => void submit(e)}>
      <h2>{draft ? 'Edit draf Tryout' : 'Susun draf Tryout'}</h2>
      <p>
        Belum diterbitkan ke Siswa. Konfigurasi resmi Tryout, scoring, dan release IRT masih OPEN;
        parameter produk tidak dapat diubah di sini.
      </p>
      {draft ? (
        <Button variant="secondary" type="button" onClick={close}>
          Batal edit
        </Button>
      ) : (
        <>
          <Field label="Kode keluarga paket" name="familyCode">
            <input
              name="familyCode"
              required
              pattern="[A-Za-z0-9]+(-[A-Za-z0-9]+)*"
              maxLength={64}
            />
          </Field>
          <Field label="Versi paket" name="packageVersion">
            <input name="packageVersion" type="number" min={1} max={100000} required />
          </Field>
        </>
      )}
      <Field label="Nama paket" name="name">
        <input name="name" required maxLength={160} defaultValue={draft?.name ?? ''} />
      </Field>
      <fieldset>
        <legend>Versi READY pada halaman soal saat ini ({selected.length} versi dipilih)</legend>
        {data.versions.items
          .filter((v) => v.contentStatus === 'READY' && v.questionStatus === 'READY')
          .map((v) => (
            <label key={v.id}>
              <input
                type="checkbox"
                checked={selected.includes(v.id)}
                onChange={(e) =>
                  setSelected(
                    e.target.checked ? [...selected, v.id] : selected.filter((id) => id !== v.id),
                  )
                }
              />
              {v.variantCode} v{v.versionNumber}: {v.stem}
            </label>
          ))}
        {!data.versions.items.some(
          (v) => v.contentStatus === 'READY' && v.questionStatus === 'READY',
        ) && <p>Belum ada versi READY pada halaman ini. Draf kosong boleh disimpan.</p>}
      </fieldset>
      <Button type="submit" disabled={busy}>
        Simpan draf paket
      </Button>
    </AdminEditorForm>
  );
}

function CategorySelect(props: React.ComponentProps<'select'>) {
  return (
    <select {...props}>
      <option value="">Belum dipetakan</option>
      <option value="algebra">Aljabar & Fungsi</option>
      <option value="geometry">Geometri & Ruang</option>
      <option value="numbers">Bilangan & Eksponen</option>
      <option value="statistics">Statistika & Peluang</option>
    </select>
  );
}
