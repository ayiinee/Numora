'use client';
import { AdminConfirmButton } from './admin-confirm-button';
import { useAdminAccessError, withAdminWorkspace } from './admin-workspace';
import { Curriculum } from './content-curriculum-panel';
import { type Workbench } from './content-editor';
import { field, type View } from './content-editor';
import { DrillPackages, TryoutEditor } from './content-package-panels';
import { QuestionEditor, Videos } from './content-question-panels';
import { Reports, VerificationHistory } from './content-report-panels';
import { ADMIN_PAGE_SIZE } from './pagination';

import { useAuth } from '@/features/onboarding/auth';
import { ApiProblem } from '@/lib/api';
import { Badge, Button } from '@tka/ui';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AdminFrame, AdminLoading, AdminMessage, AdminStats } from './admin-presentation';
import { loadAdminWorkbench, setContentStatus } from './content-api';
import { classifyQuestion } from './content-package-api';
import { ContentPackageWorkspace } from './content-package-workspace';
import type { AdminDrillPackageDto, AdminTryoutDraftDto, AdminVersionDto } from './generated-types';

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
const message = (error: unknown) =>
  error instanceof Error ? error.message : 'Permintaan gagal. Coba lagi.';

export const AdminContentScreen = withAdminWorkspace(AdminContentScreenProtected, 'content');
function AdminContentScreenProtected() {
  const { state } = useAuth();
  const accountKey =
    state.status === 'ready'
      ? `${state.profile.id}:${state.profile.adminRole ?? 'unassigned'}`
      : state.status;
  return <AdminContentScreenContent key={accountKey} />;
}

function AdminContentScreenContent() {
  const reportAccessError = useAdminAccessError();
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
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('view') === 'curriculum')
      setView('curriculum');
  }, []);
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
        reportAccessError(cause);
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
        <p className="admin-context-note">
          <span>Konten berversi</span> Revisi soal disimpan sebagai versi baru; riwayat pengerjaan
          tetap dipertahankan.
        </p>
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
                  {editing && (
                    <QuestionEditor
                      key={editing.id}
                      version={editing}
                      data={current}
                      token={token}
                      busy={busy}
                      run={run}
                      close={() => setEditing(null)}
                    />
                  )}
                  <section>
                    <h2>Versi soal</h2>
                    <Link href="/admin/content/generator">Generator varian</Link>
                    <Link href="/admin/content/imports">Upload soal dari template Excel</Link>
                    <div className="excel-editor-options">
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
                              <AdminConfirmButton
                                disabled={busy}
                                description={
                                  'Saya sudah meninjau isi, kunci jawaban, pembahasan, dan materi induk versi ini. Publikasikan sebagai READY?'
                                }
                                onConfirm={() =>
                                  run(() => setContentStatus(token, 'versions', v.id, 'READY'))
                                }
                              >
                                Publikasikan versi
                              </AdminConfirmButton>
                            )}
                            {!v.imported && v.contentStatus !== 'ARCHIVED' && (
                              <AdminConfirmButton
                                variant="danger-outline"
                                disabled={busy}
                                description={
                                  'Arsipkan versi ini untuk mencegah pengerjaan baru? Riwayat tetap disimpan.'
                                }
                                onConfirm={() =>
                                  run(() => setContentStatus(token, 'versions', v.id, 'ARCHIVED'))
                                }
                              >
                                Arsipkan versi
                              </AdminConfirmButton>
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
            {view !== 'curriculum' && (
              <nav className="admin-content-actions" aria-label="Halaman data">
                <Button
                  disabled={offset === 0 || busy || loading}
                  onClick={() => {
                    setLoading(true);
                    setOffset(Math.max(0, offset - ADMIN_PAGE_SIZE));
                  }}
                >
                  Sebelumnya
                </Button>
                <span>Halaman {offset / ADMIN_PAGE_SIZE + 1}</span>
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
