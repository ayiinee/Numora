'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Button, Dialog, Icon } from '@tka/ui';
import { useAuth } from '@/features/onboarding/auth';
import { apiRequest } from '@/lib/api';
import { AdminFrame, AdminLoading, AdminMessage } from './admin-presentation';
import { withAdminWorkspace, useAdminAccessError } from './admin-workspace';
import { useAdminUrl, adminOffset } from './admin-url';
import { AdminPagination } from './admin-pagination';
import { ADMIN_PAGE_SIZE, adminPage } from './pagination';
import { ContentBlockers } from './content-blockers';
import { PretestEditor } from './pretest-editor';
import { PretestQuestions } from './pretest-questions';
import type {
  PretestDto,
  PretestsDto,
  PretestBlueprintsDto,
  AdminCurriculumDto,
} from './generated-types';

export const pretestStateLabel = (state: PretestDto['state']) =>
  ({ DRAFT: 'Draf', REVIEWED: 'Sudah direview', ARCHIVED: 'Diarsipkan' })[state];
export const AdminPretestScreen = withAdminWorkspace(PretestScreen, 'content');
function PretestScreen() {
  const { state } = useAuth();
  if (state.status !== 'ready') return null;
  return (
    <AdminFrame
      title="Pretest Authoring"
      description="Susun paket 20 soal per bab, lalu periksa review editorial dan kesiapan publikasinya."
      icon="book"
      management
    >
      <PretestPanel token={state.session.access_token} />
    </AdminFrame>
  );
}
function PretestPanel({ token }: { token: string }) {
  const onAccessError = useAdminAccessError();
  const url = useAdminUrl();
  const selectedId = url.params.get('packageId') ?? '';
  const offset = adminOffset(url.params.get('offset'));
  const [items, setItems] = useState<PretestDto[] | null>(null);
  const [detail, setDetail] = useState<PretestDto | null>(null);
  const [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false),
    [generation, setGeneration] = useState(0),
    [hasNext, setHasNext] = useState(false);
  const [referenceError, setReferenceError] = useState(''),
    [referenceRetry, setReferenceRetry] = useState(0),
    [referenceLoading, setReferenceLoading] = useState(true);
  const [blueprints, setBlueprints] = useState<PretestBlueprintsDto['items']>([]),
    [chapters, setChapters] = useState<AdminCurriculumDto['items']>([]);
  const [editor, setEditor] = useState<{ pack: PretestDto | null; edit: boolean } | null>(null);
  const [action, setAction] = useState<{ kind: 'review' | 'archive'; pack: PretestDto } | null>(
    null,
  );
  const feedback = useRef<HTMLDivElement>(null);
  const detailHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (error && (editor || action)) {
      const modal = feedback.current?.closest('dialog');
      if (modal) modal.scrollTop = 0;
      const content = feedback.current?.closest<HTMLElement>('.numora-dialog__content');
      if (content) content.scrollTop = 0;
      feedback.current?.focus({ preventScroll: true });
    }
  }, [error, editor, action]);
  useEffect(() => {
    if (url.search === null) return;
    let active = true;
    setError('');
    setItems(null);
    setDetail(null);
    const pending = selectedId
      ? apiRequest<PretestDto>(
          `admin/content/pretest-packages/${encodeURIComponent(selectedId)}`,
          token,
        ).then((pack) => {
          if (active) setDetail(pack);
        })
      : apiRequest<PretestsDto>(
          `admin/content/pretest-packages?limit=${ADMIN_PAGE_SIZE + 1}&offset=${offset}`,
          token,
        ).then((data) => {
          if (active) {
            const page = adminPage(data.items);
            setItems(page.items);
            setHasNext(page.hasNext);
          }
        });
    void pending.catch((cause) => {
      if (active) {
        onAccessError(cause);
        setError(cause instanceof Error ? cause.message : 'Paket belum dapat dimuat.');
      }
    });
    return () => {
      active = false;
    };
  }, [token, selectedId, offset, generation, onAccessError, url.search === null]);
  useEffect(() => {
    let active = true;
    setReferenceError('');
    setReferenceLoading(true);
    void Promise.allSettled([
      apiRequest<PretestBlueprintsDto>('admin/content/pretest-packages/blueprints', token),
      apiRequest<AdminCurriculumDto>('admin/content/curriculum', token),
    ]).then(([b, c]) => {
      if (!active) return;
      const failures: string[] = [];
      if (b.status === 'fulfilled') setBlueprints(b.value.items);
      else {
        onAccessError(b.reason);
        failures.push('Blueprint belum bisa dimuat. Draf tanpa blueprint tetap dapat disimpan.');
      }
      if (c.status === 'fulfilled')
        setChapters(c.value.items.filter((item) => item.kind === 'CHAPTER'));
      else {
        onAccessError(c.reason);
        failures.push('Bab belum bisa dimuat. Muat ulang referensi untuk mencoba lagi.');
      }
      setReferenceError(failures.join(' '));
      setReferenceLoading(false);
    });
    return () => {
      active = false;
    };
  }, [token, referenceRetry, onAccessError]);
  useEffect(() => {
    if (detail) {
      detailHeading.current?.focus({ preventScroll: true });
      window.scrollTo(0, 0);
    }
  }, [selectedId, detail?.id]);
  async function mutate(path: string, method: string, message: string, body?: object) {
    if (busy) return false;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await apiRequest(path, token, { method, ...(body ? { body: JSON.stringify(body) } : {}) });
      setGeneration((value) => value + 1);
      setReferenceRetry((value) => value + 1);
      setNotice(message);
      return true;
    } catch (cause) {
      onAccessError(cause);
      setError(cause instanceof Error ? cause.message : 'Perubahan belum tersimpan.');
      return false;
    } finally {
      setBusy(false);
    }
  }
  function openEditor(pack: PretestDto | null, edit = false) {
    setError('');
    setNotice('');
    setEditor({ pack, edit });
  }
  const chapterName = (id: string) =>
    chapters.find((chapter) => chapter.id === id)?.name ?? 'Nama bab belum tersedia';
  const blueprint = blueprints.find((b) => b.id === detail?.blueprintVersionId);
  const dialogError = error && (
    <div ref={feedback} tabIndex={-1} className="pretest-feedback" aria-label="Status penyimpanan">
      <AdminMessage error message={error} />
    </div>
  );
  return (
    <div className="pretest-workspace">
      <div className="pretest-page-actions">
        <Link href="/admin/content">Bank soal &amp; assessment</Link>
        <Button disabled={busy} onClick={() => openEditor(null)}>
          Buat draf Pretest
        </Button>
      </div>
      {notice && <AdminMessage message={notice} />}
      {error && !editor && !action && (
        <AdminMessage error message={error} retry={() => setGeneration((value) => value + 1)} />
      )}
      {referenceError && !editor && (
        <AdminMessage
          error
          message={referenceError}
          retry={() => setReferenceRetry((value) => value + 1)}
        />
      )}
      {!selectedId ? (
        <section className="pretest-surface" aria-label="Daftar paket Pretest">
          <header className="pretest-section-heading">
            <div>
              <h2>Daftar paket</h2>
              <p>Maksimal 5 paket per halaman. Pilih paket untuk memeriksa isinya.</p>
            </div>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => {
                setGeneration((value) => value + 1);
                setReferenceRetry((value) => value + 1);
              }}
            >
              Muat ulang
            </Button>
          </header>
          {items === null ? (
            !error && <AdminLoading message="Memuat paket..." />
          ) : !items.length ? (
            <div className="pretest-empty">
              <Icon name="clipboard" />
              <h3>Belum ada paket pada halaman ini</h3>
              <p>Buat draf baru atau kembali ke halaman sebelumnya.</p>
            </div>
          ) : (
            <table className="pretest-table" role="table">
              <caption className="sr-only">
                Paket Pretest beserta bab, status dan jumlah soal
              </caption>
              <thead>
                <tr>
                  <th scope="col">Paket &amp; bab</th>
                  <th scope="col">Status</th>
                  <th scope="col">Komposisi</th>
                  <th scope="col">Tindakan</th>
                </tr>
              </thead>
              <tbody>
                {items.map((pack) => (
                  <tr key={pack.id}>
                    <td>
                      <strong>{pack.name}</strong>
                      <span>{chapterName(pack.chapterId)}</span>
                      <small>Versi {pack.packageVersion}</small>
                    </td>
                    <td>
                      <span className="pretest-status" data-state={pack.state}>
                        {pretestStateLabel(pack.state)}
                      </span>
                    </td>
                    <td>
                      <span>{pack.questionVersionIds.length}/20 soal</span>
                      <small>
                        {pack.reviewBlockers.length
                          ? 'Perlu pemeriksaan isi'
                          : 'Periksa review & kesiapan'}
                      </small>
                    </td>
                    <td>
                      <Button
                        variant="secondary"
                        onClick={() => url.update({ packageId: pack.id })}
                      >
                        Lihat detail
                        <Icon name="chevron" width="14" height="14" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <footer className="pretest-directory-footer">
            <span>
              {items?.length
                ? `Menampilkan ${offset + 1}–${offset + items.length}`
                : '0 ditampilkan'}
            </span>
            <AdminPagination
              label="Halaman paket Pretest"
              offset={offset}
              hasNext={hasNext}
              disabled={busy || items === null}
              onChange={(next) => url.update({ offset: next || null })}
            />
          </footer>
        </section>
      ) : (
        <section className="pretest-detail" aria-label="Detail paket Pretest">
          <Button variant="ghost" onClick={() => url.update({ packageId: null })}>
            <Icon name="back" />
            Kembali ke daftar
          </Button>
          <h2 ref={detailHeading} tabIndex={-1} className="sr-only">
            Detail paket
          </h2>
          {!detail ? (
            !error && <AdminLoading message="Memuat detail paket..." />
          ) : (
            <>
              <section className="pretest-surface pretest-overview">
                <div className="pretest-detail-title">
                  <div>
                    <h2>{detail.name}</h2>
                    <p>
                      {chapterName(detail.chapterId)} · Versi {detail.packageVersion}
                    </p>
                  </div>
                  <span className="pretest-status" data-state={detail.state}>
                    {pretestStateLabel(detail.state)}
                  </span>
                </div>
                <dl className="pretest-metadata">
                  <div>
                    <dt>Komposisi</dt>
                    <dd>{detail.questionVersionIds.length}/20 soal</dd>
                  </div>
                  <div>
                    <dt>Blueprint</dt>
                    <dd>
                      {blueprint
                        ? `${blueprint.code} v${blueprint.version}`
                        : detail.blueprintVersionId
                          ? 'Versi asal tersimpan'
                          : 'Belum dihubungkan'}
                    </dd>
                  </div>
                  <div>
                    <dt>Review editorial</dt>
                    <dd>
                      {detail.state === 'REVIEWED'
                        ? 'Tercatat'
                        : detail.state === 'ARCHIVED'
                          ? 'Paket diarsipkan'
                          : 'Belum disahkan'}
                    </dd>
                  </div>
                </dl>
                <div className="pretest-detail-actions">
                  {detail.state === 'DRAFT' && (
                    <Button onClick={() => openEditor(detail, true)}>Edit draf</Button>
                  )}
                  {detail.state === 'REVIEWED' && (
                    <Button onClick={() => openEditor(detail)}>Buat versi baru</Button>
                  )}
                  {detail.state !== 'ARCHIVED' && (
                    <Button
                      variant="danger-outline"
                      disabled={busy}
                      onClick={() => {
                        setError('');
                        setAction({ kind: 'archive', pack: detail });
                      }}
                    >
                      Arsipkan
                    </Button>
                  )}
                </div>
                <details className="pretest-identifiers">
                  <summary>Identitas paket &amp; blueprint</summary>
                  <dl>
                    <div>
                      <dt>Kode keluarga</dt>
                      <dd>{detail.familyCode}</dd>
                    </div>
                    <div>
                      <dt>ID paket</dt>
                      <dd>{detail.id}</dd>
                    </div>
                    <div>
                      <dt>ID bab</dt>
                      <dd>{detail.chapterId}</dd>
                    </div>
                    <div>
                      <dt>ID blueprint</dt>
                      <dd>{detail.blueprintVersionId ?? 'Belum dihubungkan'}</dd>
                    </div>
                    {blueprint && (
                      <div>
                        <dt>Referensi persetujuan</dt>
                        <dd>{blueprint.approvalReference}</dd>
                      </div>
                    )}
                  </dl>
                </details>
              </section>
              <div className="pretest-readiness-grid">
                <section className="pretest-surface pretest-readiness">
                  <h3>Review editorial</h3>
                  <p>
                    Memeriksa komposisi dan kesiapan isi. Review tidak otomatis mempublikasikan
                    paket.
                  </p>
                  <ContentBlockers
                    codes={detail.reviewBlockers}
                    empty="Tidak ada hambatan review yang dilaporkan server."
                  />
                  {detail.state === 'DRAFT' && (
                    <Button
                      disabled={busy || !!detail.reviewBlockers.length}
                      onClick={() => {
                        setError('');
                        setAction({ kind: 'review', pack: detail });
                      }}
                    >
                      Review paket
                    </Button>
                  )}
                </section>
                <section className="pretest-surface pretest-readiness">
                  <h3>Kesiapan publikasi</h3>
                  <ContentBlockers
                    codes={detail.publicationBlockers}
                    empty="Tidak ada hambatan tambahan yang dilaporkan. Publikasi tetap diperiksa server."
                  />
                </section>
              </div>
              <section className="pretest-surface pretest-composition">
                <header className="pretest-section-heading">
                  <div>
                    <h3>Susunan soal</h3>
                    <p>Urutan dan versi yang digunakan paket ini tetap dipertahankan.</p>
                  </div>
                  <span>{detail.questionVersionIds.length} soal</span>
                </header>
                <PretestQuestions token={token} ids={detail.questionVersionIds} />
              </section>
            </>
          )}
        </section>
      )}
      {editor && (
        <PretestEditor
          token={token}
          pack={editor.pack}
          edit={editor.edit}
          busy={busy}
          chapters={chapters}
          blueprints={blueprints}
          referenceLoading={referenceLoading}
          referenceError={referenceError}
          retryReferences={() => setReferenceRetry((value) => value + 1)}
          feedback={dialogError}
          onClose={() => setEditor(null)}
          onSave={async (body) => {
            const pack = editor.pack;
            const saved = await mutate(
              pack
                ? `admin/content/pretest-packages/${pack.id}${editor.edit ? '' : '/revisions'}`
                : 'admin/content/pretest-packages',
              pack && editor.edit ? 'PUT' : 'POST',
              pack
                ? 'Draf paket tersimpan. Versi asal untuk revisi tetap dipertahankan.'
                : 'Draf Pretest tersimpan.',
              body,
            );
            if (saved) setEditor(null);
            return saved;
          }}
        />
      )}
      {action && (
        <Dialog
          open
          pending={busy}
          title={action.kind === 'review' ? 'Review editorial paket' : 'Arsipkan paket?'}
          onClose={() => setAction(null)}
          className="admin-management-dialog pretest-action-dialog"
        >
          {dialogError}
          <p>
            <strong>{action.pack.name}</strong>
          </p>
          <p>
            {action.kind === 'review'
              ? 'Keputusan ini mencatat review editorial. Persetujuan blueprint dan kesiapan publikasi tetap diperiksa terpisah.'
              : 'Paket dihentikan untuk penggunaan baru. Riwayat dan versi yang sudah digunakan tetap dipertahankan.'}
          </p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              void mutate(
                `admin/content/pretest-packages/${action.pack.id}/${action.kind}`,
                'POST',
                action.kind === 'review' ? 'Review editorial tersimpan.' : 'Paket diarsipkan.',
                action.kind === 'review'
                  ? { reason: String(form.get('reason')).trim() }
                  : undefined,
              ).then((saved) => {
                if (saved) setAction(null);
              });
            }}
          >
            {action.kind === 'review' && (
              <label>
                Alasan review
                <textarea name="reason" required minLength={3} maxLength={1000} disabled={busy} />
              </label>
            )}
            <div className="pretest-dialog-actions">
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={() => setAction(null)}
              >
                Batal
              </Button>
              <Button
                type="submit"
                variant={action.kind === 'archive' ? 'danger-outline' : 'primary'}
                disabled={busy}
              >
                {busy
                  ? 'Menyimpan...'
                  : action.kind === 'review'
                    ? 'Sahkan review editorial'
                    : 'Arsipkan paket'}
              </Button>
            </div>
          </form>
        </Dialog>
      )}
    </div>
  );
}
