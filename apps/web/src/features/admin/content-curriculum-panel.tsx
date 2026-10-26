'use client';
import { useAuth } from '@/features/onboarding/auth';
import { Button } from '@tka/ui';
import { useState, type FormEvent } from 'react';
import { AdminConfirmButton } from './admin-confirm-button';
import { AdminPagination, useAdminPagination } from './admin-pagination';
import { AdminEditorForm } from './admin-presentation';
import {
  createChapter,
  createCompetency,
  createLevel,
  createSubchapter,
  renameTaxon,
  setChapterCategory,
  setContentStatus,
} from './content-api';
import { Field, field, type EditorProps } from './content-editor';
import type { AdminTaxonDto } from './generated-types';

export function Curriculum({ data, token, busy, run }: EditorProps) {
  const { state } = useAuth();
  const contentRole =
    state.status === 'ready' && state.profile.adminRole === 'CONTENT_DATA_MODERATION';
  const [showAllDemos, setShowAllDemos] = useState(false);
  const [kind, setKind] = useState<AdminTaxonDto['kind']>('CHAPTER');
  const demoIds = new Set(
    data.curriculum.items
      .filter((r) => r.code.startsWith('DEMO-') || r.code === 'NUMORA-PVP-DEMO-V1')
      .map((r) => r.id),
  );
  // Level codes are numbers; inherit the fixture marker from their parent taxonomy.
  for (let depth = 0; depth < 3; depth++) {
    for (const r of data.curriculum.items)
      if (r.parentId && demoIds.has(r.parentId)) demoIds.add(r.id);
  }
  let demoCount = 0;
  const visibleItems = data.curriculum.items.filter(
    (r) => !contentRole || showAllDemos || !demoIds.has(r.id) || ++demoCount <= 6,
  );
  const page = useAdminPagination(visibleItems, showAllDemos);
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
              max={kind === 'LEVEL' ? 5 : 100000}
              required
            />
          </Field>
        )}
        <Button type="submit" disabled={busy || (kind !== 'CHAPTER' && !parents.length)}>
          Simpan draf materi
        </Button>
      </AdminEditorForm>
      {contentRole && demoIds.size > 6 && (
        <label className="admin-content-actions">
          <input
            type="checkbox"
            checked={showAllDemos}
            onChange={(e) => {
              setShowAllDemos(e.target.checked);
            }}
          />
          Tampilkan seluruh materi demo ({demoIds.size} entri)
        </label>
      )}
      {contentRole && (
        <p role="status">
          {visibleItems.length} entri materi · 3 per halaman
          {!showAllDemos && demoIds.size > 6 ? ' · Demo diringkas menjadi 6 entri.' : ''}
        </p>
      )}
      {!data.curriculum.items.length && <p>Belum ada materi. Mulai dengan Bab.</p>}
      <ul className="monitoring-list" aria-label="Daftar materi">
        {page.items.map((r) => (
          <li key={r.id} className="monitoring-notice admin-content-row">
            <strong>{r.name}</strong>
            {contentRole && (
              <span className="content-item-status" data-status={r.status}>
                {r.status}
              </span>
            )}
            <small>
              {r.kind} · {r.code}
              {!contentRole && ` · ${r.status}`} · Induk:{' '}
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
                <AdminConfirmButton
                  variant="danger-outline"
                  disabled={busy}
                  description={
                    'Arsipkan materi ini? Materi dapat hilang dari katalog untuk pengerjaan baru.'
                  }
                  onConfirm={() =>
                    run(() => setContentStatus(token, resources[r.kind], r.id, 'ARCHIVED'))
                  }
                >
                  Arsipkan
                </AdminConfirmButton>
              )}
            </div>
          </li>
        ))}
      </ul>
      <AdminPagination {...page.pagination} disabled={busy} label="Halaman materi" />
    </section>
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
