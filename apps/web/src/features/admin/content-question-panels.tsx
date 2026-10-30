'use client';
import { Button } from '@tka/ui';
import { useState, type FormEvent } from 'react';
import { ContentTextEdit } from './content-text-edit';
import { AdminEditorForm } from './admin-presentation';
import {
  createQuestion,
  createVariant,
  createVideo,
  reviseQuestion,
  setContentStatus,
  updateVideo,
} from './content-api';
import { Field, field, type EditorProps } from './content-editor';
import type { AdminVersionDto, QuestionContentDto } from './generated-types';

export function QuestionEditor({
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
        Tambahkan soal PG dengan empat opsi A–D sebagai DRAFT. Untuk MCMA atau Kategori, gunakan
        impor JSON; scoring PGK tetap memerlukan rubric yang disahkan.
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

export function Videos({ data, token, busy, run, error }: EditorProps) {
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
      <details className="assessment-authoring">
        <summary>Tambah video</summary>
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
      </details>
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
              <ContentTextEdit
                trigger="Ubah URL"
                title="Ubah tautan video"
                label="URL HTTPS baru"
                value={v.url}
                busy={busy}
                error={error}
                url
                save={(url) => run(() => updateVideo(token, v.mappingId, { url }))}
              />
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
