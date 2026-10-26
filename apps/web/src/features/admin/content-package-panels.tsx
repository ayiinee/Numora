'use client';
import { Button } from '@tka/ui';
import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { AdminConfirmButton } from './admin-confirm-button';
import { AdminEditorForm, AdminLoading, AdminMessage } from './admin-presentation';
import { AssessmentPolicySelector } from './assessment-policy-selector';
import {
  archiveDrillPackage,
  createDrillPackage,
  createTryoutDraft,
  publishDrillPackage,
  updateDrillPackage,
  updateTryoutDraft,
} from './content-api';
import { Field, field, type EditorProps } from './content-editor';
import type {
  AdminDrillPackageDto,
  AdminTryoutDraftDto,
  AdminVersionsDto,
} from './generated-types';
import { useOperationalQuery } from './operational-query';

export function DrillPackages({
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
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    const reference = field(
                      new FormData(event.currentTarget),
                      'curriculumApprovalReference',
                    );
                    if (
                      window.confirm(
                        'Terbitkan susunan paket yang sudah ditinjau dan disetujui Curriculum?',
                      )
                    )
                      void run(() =>
                        publishDrillPackage(token, pack.id, {
                          curriculumApprovalReference: reference,
                        }),
                      );
                  }}
                >
                  <Field
                    label="Referensi persetujuan Curriculum"
                    name="curriculumApprovalReference"
                  >
                    <input name="curriculumApprovalReference" required maxLength={1000} />
                  </Field>
                  <Button type="submit" disabled={busy}>
                    Publikasikan paket
                  </Button>
                </form>
              </div>
            )}
            {pack.status !== 'ARCHIVED' && (
              <AdminConfirmButton
                variant="danger-outline"
                disabled={busy}
                description={
                  'Arsipkan paket? Riwayat dan item paket tetap disimpan, dan paket tidak dapat diterbitkan ulang.'
                }
                onConfirm={() => run(() => archiveDrillPackage(token, pack.id))}
              >
                Arsipkan paket
              </AdminConfirmButton>
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
            <input name="variantIndex" type="number" min={1} max={1} value={1} readOnly required />
            <small>MVP memakai satu varian per level.</small>
          </Field>
        </>
      )}
      <Field label="Nama paket" name="name">
        <input name="name" required maxLength={160} defaultValue={draft?.name ?? ''} />
      </Field>
      <AssessmentPolicySelector
        token={token}
        type="DRILL"
        defaultValue={draft?.scoringPolicyVersionId ?? ''}
      />
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

export function TryoutEditor({
  draft,
  token,
  busy,
  run,
  close,
}: EditorProps & { draft: AdminTryoutDraftDto | null; close: () => void }) {
  // Preserve pinned IDs outside the current question page while editing a package.
  const [selected, setSelected] = useState<string[]>(draft?.questionVersionIds ?? []);
  const [questionOffset, setQuestionOffset] = useState(0);
  const versions = useOperationalQuery<AdminVersionsDto>(
    `admin/content/versions?limit=20&offset=${questionOffset}`,
    token,
  );
  useEffect(() => {
    if (versions.denied) setSelected([]);
  }, [versions.denied]);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy || versions.denied) return;
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
  if (versions.denied)
    return <AdminMessage error message="Akses bank soal dicabut. Muat ulang akses admin." />;
  return (
    <AdminEditorForm busy={busy} onSubmit={(e) => void submit(e)}>
      <h2>{draft ? 'Edit draf Tryout' : 'Susun draf Tryout'}</h2>
      <p>
        Simpan susunan soal sebagai draf terlebih dahulu. Publikasi memerlukan 30 versi soal yang
        siap dan policy yang disahkan. Nilai serta pembahasan dirilis melalui proses IRT; parameter
        produk tetap mengikuti aturan MVP.
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
        <legend>Versi READY ({selected.length} versi dipilih)</legend>
        <p>Pilihan tetap tersimpan saat berpindah halaman soal.</p>
        {!!selected.length && (
          <details>
            <summary>Kelola versi yang dipilih</summary>
            <p>
              Versi dari halaman lain atau yang sudah diarsipkan tetap tercatat di sini sampai
              dikeluarkan dari draf.
            </p>
            <ul>
              {selected.map((id) => (
                <li key={id}>
                  <Link href={`/admin/content/versions/${id}`} target="_blank" rel="noreferrer">
                    Detail versi {id}
                  </Link>{' '}
                  <Button
                    type="button"
                    variant="secondary"
                    aria-label={`Keluarkan versi ${id}`}
                    onClick={() => setSelected((ids) => ids.filter((value) => value !== id))}
                  >
                    Keluarkan
                  </Button>
                </li>
              ))}
            </ul>
          </details>
        )}
        {versions.error ? (
          <AdminMessage error message={versions.error} retry={versions.retry} />
        ) : !versions.data ? (
          <AdminLoading message="Memuat pemilih soal Tryout…" />
        ) : null}
        {versions.data?.items
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
        {versions.data &&
          !versions.data.items.some(
            (v) => v.contentStatus === 'READY' && v.questionStatus === 'READY',
          ) && <p>Belum ada versi READY pada halaman ini. Draf kosong boleh disimpan.</p>}
        <nav aria-label="Halaman pemilih soal Tryout" className="admin-content-actions">
          <Button
            type="button"
            variant="secondary"
            disabled={busy || !versions.data || questionOffset === 0}
            onClick={() => setQuestionOffset((n) => Math.max(0, n - 20))}
          >
            Soal sebelumnya
          </Button>
          <span>Halaman {Math.floor(questionOffset / 20) + 1}</span>
          <Button
            type="button"
            variant="secondary"
            disabled={busy || !versions.data || versions.data.nextOffset == null}
            onClick={() => setQuestionOffset(versions.data!.nextOffset!)}
          >
            Soal berikutnya
          </Button>
        </nav>
      </fieldset>
      <Button type="submit" disabled={busy}>
        Simpan draf paket
      </Button>
    </AdminEditorForm>
  );
}
