'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { Button, Dialog } from '@tka/ui';
import { apiRequest } from '@/lib/api';
import { AdminLoading, AdminMessage } from './admin-presentation';
import { AdminPagination } from './admin-pagination';
import { useAdminAccessError } from './admin-workspace';
import { Field } from './content-editor';
import { ContentText } from './content-payload';
import { questionFormat } from './content-question-format';
import { PretestQuestions, usePretestQuestionLabels } from './pretest-questions';
import type {
  PretestDto,
  PretestBlueprintDto,
  AdminTaxonDto,
  AdminVersionsDto,
} from './generated-types';

export function PretestEditor({
  token,
  pack,
  edit,
  busy,
  chapters,
  blueprints,
  referenceLoading,
  referenceError,
  retryReferences,
  feedback,
  onClose,
  onSave,
}: {
  token: string;
  pack: PretestDto | null;
  edit: boolean;
  busy: boolean;
  chapters: AdminTaxonDto[];
  blueprints: PretestBlueprintDto[];
  referenceLoading: boolean;
  referenceError: string;
  retryReferences: () => void;
  feedback: ReactNode;
  onClose: () => void;
  onSave: (body: object) => Promise<boolean>;
}) {
  const [chapter, setChapter] = useState(pack?.chapterId ?? '');
  const [ids, setIds] = useState<string[]>(pack?.questionVersionIds ?? []);
  const [manual, setManual] = useState(ids.join('\n')),
    [validation, setValidation] = useState('');
  const [offset, setOffset] = useState(0),
    [retry, setRetry] = useState(0),
    [page, setPage] = useState<AdminVersionsDto | null>(null),
    [error, setError] = useState('');
  const selection = usePretestQuestionLabels(token, ids);
  const manualDirty = manual !== ids.join('\n');
  const onAccessError = useAdminAccessError();
  useEffect(() => {
    setPage(null);
    setError('');
    if (!chapter) return;
    let active = true;
    const params = new URLSearchParams({
      limit: '5',
      offset: String(offset),
      usageType: 'PRETEST',
      status: 'READY',
      chapterId: chapter,
    });
    void apiRequest<AdminVersionsDto>(`admin/content/versions?${params}`, token).then(
      (result) => {
        if (active) {
          setPage(result);
          selection.remember(result.items);
        }
      },
      (cause) => {
        if (active) {
          onAccessError(cause);
          setError(cause instanceof Error ? cause.message : 'Bank soal belum dapat dimuat.');
        }
      },
    );
    return () => {
      active = false;
    };
  }, [token, chapter, offset, retry, onAccessError, selection.remember]);
  function select(next: string[]) {
    setIds(next);
    setManual(next.join('\n'));
    setValidation('');
  }
  function applyManual() {
    const next = manual
      .split(/[\n,]+/)
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);
    if (next.length > 20) {
      setValidation('Maksimal 20 versi soal. Kurangi ID sebelum menerapkan.');
      return;
    }
    if (new Set(next).size !== next.length) {
      setValidation('Ada ID versi yang berulang. Gunakan setiap versi satu kali.');
      return;
    }
    if (
      next.some(
        (value) =>
          !/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i.test(value) ||
          value.length !== 36,
      )
    ) {
      setValidation('Gunakan UUID versi soal yang valid, satu per baris atau dipisahkan koma.');
      return;
    }
    select(next);
  }
  const title = pack ? (edit ? 'Edit draf' : 'Buat revisi paket') : 'Buat draf Pretest';
  return (
    <Dialog
      open
      pending={busy}
      title={title}
      className="admin-management-dialog pretest-editor-dialog"
      onClose={onClose}
      actions={
        <>
          <span className="pretest-save-count">{ids.length}/20 soal dipilih</span>
          <Button type="button" variant="secondary" disabled={busy} onClick={onClose}>
            Batal
          </Button>
          <Button
            type="submit"
            form="pretest-editor-form"
            disabled={busy || !!validation || manualDirty || ids.length > 20}
          >
            {busy ? 'Menyimpan...' : 'Simpan draf'}
          </Button>
        </>
      }
    >
      {feedback}
      {referenceError && <AdminMessage error message={referenceError} retry={retryReferences} />}
      <form
        id="pretest-editor-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (busy || validation || manualDirty || ids.length > 20) return;
          const form = new FormData(event.currentTarget);
          const common = {
            name: String(form.get('name')).trim(),
            blueprintVersionId: String(form.get('blueprintVersionId') ?? '') || null,
            questionVersionIds: ids,
          };
          void onSave(
            pack
              ? common
              : {
                  ...common,
                  familyCode: String(form.get('familyCode')).trim(),
                  packageVersion: Number(form.get('packageVersion')),
                  chapterId: chapter,
                },
          );
        }}
      >
        <fieldset disabled={busy} className="pretest-editor-fields">
          <section className="pretest-editor-information">
            <h3>Informasi paket</h3>
            <p>Draf boleh belum lengkap. Review memerlukan 20 versi siap dari bab yang sama.</p>
            {pack ? (
              <p className="pretest-source-note">
                {pack.familyCode} · Versi {pack.packageVersion + (edit ? 0 : 1)}
                <br />
                {edit ? 'Perubahan hanya pada draf ini.' : 'Versi asal tetap dipertahankan.'}
              </p>
            ) : (
              <>
                <Field label="Kode keluarga" name="familyCode">
                  <input name="familyCode" required maxLength={100} />
                </Field>
                <Field label="Versi paket" name="packageVersion">
                  <input
                    name="packageVersion"
                    type="number"
                    required
                    min={1}
                    max={100000}
                    defaultValue={1}
                  />
                </Field>
              </>
            )}
            <Field label="Nama paket" name="name">
              <input name="name" required maxLength={200} defaultValue={pack?.name ?? ''} />
            </Field>
            {pack ? (
              <div className="pretest-static-field">
                <span>Bab</span>
                <strong>
                  {chapters.find((c) => c.id === chapter)?.name ?? 'Bab versi asal tersimpan'}
                </strong>
              </div>
            ) : (
              <Field label="Bab" name="chapterId">
                <select
                  name="chapterId"
                  required
                  value={chapter}
                  onChange={(event) => {
                    setChapter(event.target.value);
                    setOffset(0);
                  }}
                >
                  <option value="">{referenceLoading ? 'Memuat bab...' : 'Pilih bab'}</option>
                  {chapters.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <Field label="Blueprint yang disahkan" name="blueprintVersionId">
              <select name="blueprintVersionId" defaultValue={pack?.blueprintVersionId ?? ''}>
                <option value="">Belum dihubungkan — draf internal</option>
                {pack?.blueprintVersionId &&
                  !blueprints.some((b) => b.id === pack.blueprintVersionId) && (
                    <option value={pack.blueprintVersionId}>
                      Blueprint versi asal (tersimpan)
                    </option>
                  )}
                {blueprints.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.code} v{b.version} — {b.approvalReference}
                  </option>
                ))}
              </select>
            </Field>
            <p className="pretest-inline-note">
              Blueprint dapat dihubungkan setelah tersedia. Persetujuan dan kesesuaian bab diperiksa
              server.
            </p>
            {!!ids.length && !pack && (
              <p className="pretest-inline-note">
                Jika mengganti bab, periksa kembali semua soal yang dipilih.
              </p>
            )}
            <details className="pretest-manual">
              <summary>Masukkan ID versi secara manual</summary>
              <label>
                ID versi soal (baris baru atau koma)
                <textarea
                  rows={5}
                  value={manual}
                  onChange={(event) => setManual(event.target.value)}
                />
              </label>
              <p>
                ID manual mengganti seluruh susunan setelah diterapkan. Urutan mengikuti urutan ID.
                Terapkan perubahan ID sebelum menyimpan draf.
              </p>
              <Button type="button" variant="secondary" onClick={applyManual}>
                Terapkan ID
              </Button>
              {validation && <p role="alert">{validation}</p>}
            </details>
          </section>
          <section className="pretest-editor-selection">
            <h3>Pilih soal</h3>
            <p>
              Versi siap untuk Pretest pada bab terpilih. Pilihan tetap tersimpan saat berpindah
              halaman.
            </p>
            {!chapter ? (
              <p className="pretest-picker-empty">Pilih bab untuk melihat soal yang tersedia.</p>
            ) : error ? (
              <AdminMessage error message={error} retry={() => setRetry((value) => value + 1)} />
            ) : !page ? (
              <AdminLoading message="Memuat pilihan soal..." />
            ) : !page.items.length ? (
              <p className="pretest-picker-empty">
                Belum ada versi siap pada halaman ini. Draf tetap dapat disimpan.
              </p>
            ) : (
              <ul className="pretest-picker-list" aria-label="Pilihan soal Pretest">
                {page.items.map((question) => (
                  <li key={question.id}>
                    <label>
                      <input
                        type="checkbox"
                        checked={ids.includes(question.id)}
                        disabled={!ids.includes(question.id) && ids.length >= 20}
                        onChange={(event) =>
                          select(
                            event.target.checked
                              ? [...ids, question.id]
                              : ids.filter((id) => id !== question.id),
                          )
                        }
                      />
                      <span>
                        <ContentText value={question.stem || 'Isi soal belum tersedia'} />
                        <small>
                          {questionFormat(question.questionType).label} · Versi{' '}
                          {question.versionNumber}
                        </small>
                      </span>
                    </label>
                    <LinkToVersion id={question.id} />
                  </li>
                ))}
              </ul>
            )}
            {chapter && (
              <AdminPagination
                label="Halaman pilihan soal Pretest"
                offset={offset}
                hasNext={page?.nextOffset != null}
                disabled={busy || !page}
                onChange={setOffset}
              />
            )}
            <details className="pretest-selected-disclosure">
              <summary>Kelola urutan soal terpilih ({ids.length}/20)</summary>
              <PretestQuestions
                token={token}
                ids={ids}
                selection={selection}
                onChange={select}
                busy={busy}
              />
            </details>
          </section>
        </fieldset>
      </form>
    </Dialog>
  );
}
function LinkToVersion({ id }: { id: string }) {
  return (
    <a href={`/admin/content/versions/${encodeURIComponent(id)}`} target="_blank" rel="noreferrer">
      Lihat detail<span className="sr-only"> versi (tab baru)</span>
    </a>
  );
}
