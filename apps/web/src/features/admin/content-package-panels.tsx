'use client';
import { Button } from '@tka/ui';
import { useState, type FormEvent } from 'react';
import { AdminConfirmButton } from './admin-confirm-button';
import { AdminEditorForm } from './admin-presentation';
import {
  archiveDrillPackage,
  createDrillPackage,
  createTryoutDraft,
  publishDrillPackage,
  updateDrillPackage,
  updateTryoutDraft,
} from './content-api';
import { Field, field, type EditorProps } from './content-editor';
import type { AdminDrillPackageDto, AdminTryoutDraftDto } from './generated-types';

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
                <AdminConfirmButton
                  disabled={busy}
                  description={
                    'Terbitkan paket ini? API akan memvalidasi 10 soal, hasil review, materi, dan kebijakan penilaian.'
                  }
                  onConfirm={() => run(() => publishDrillPackage(token, pack.id))}
                >
                  Publikasikan paket
                </AdminConfirmButton>
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

export function DrillPackageEditor({
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
        Publikasi memerlukan kebijakan DRILL_PRD_V06 versi 1; masukkan ID policy yang disediakan
        backend.
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

export function TryoutEditor({
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
