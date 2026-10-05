'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { Button, Card } from '@tka/ui';
import { useAuth } from '@/features/onboarding/auth';
import { apiRequest } from '@/lib/api';
import { AdminFrame, AdminLoading, AdminMessage } from './admin-presentation';
import type {
  PretestDto,
  PretestsDto,
  PretestBlueprintsDto,
  AdminCurriculumDto,
} from './generated-types';
export function AdminPretestScreen() {
  const { state } = useAuth();
  const token =
    state.status === 'ready' &&
    state.profile.role === 'ADMIN' &&
    state.profile.capabilities?.includes('CONTENT_MANAGE')
      ? state.session.access_token
      : null;
  return (
    <AdminFrame
      title="Pretest"
      description="Authoring dan review paket 20 soal. Publikasi menunggu blueprint dan consumer Student."
      icon="book"
    >
      {state.status === 'loading' ? (
        <AdminLoading message="Memeriksa akses?" />
      ) : !token ? (
        <AdminMessage error message="Akses Content diperlukan." login />
      ) : (
        <PretestPanel
          key={state.status === 'ready' ? state.profile.id + state.profile.adminRole : ''}
          token={token}
        />
      )}
    </AdminFrame>
  );
}
function PretestPanel({ token }: { token: string }) {
  const [items, setItems] = useState<PretestDto[] | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [revision, setRevision] = useState<PretestDto | null>(null),
    [editing, setEditing] = useState(false),
    [offset, setOffset] = useState(0),
    [generation, setGeneration] = useState(0);
  const [blueprints, setBlueprints] = useState<PretestBlueprintsDto['items']>([]),
    [chapters, setChapters] = useState<AdminCurriculumDto['items']>([]);
  useEffect(() => {
    let current = true;
    setItems(null);
    setError('');
    apiRequest<PretestsDto>(`admin/content/pretest-packages?limit=20&offset=${offset}`, token)
      .then((d) => {
        if (current) setItems(d.items);
      })
      .catch((e) => {
        if (current) setError(e.message);
      });
    return () => {
      current = false;
    };
  }, [token, offset, generation]);
  useEffect(() => {
    let current = true;
    Promise.allSettled([
      apiRequest<PretestBlueprintsDto>('admin/content/pretest-packages/blueprints', token),
      apiRequest<AdminCurriculumDto>('admin/content/curriculum', token),
    ])
      .then(([b, c]) => {
        if (current) {
          if (b.status === 'fulfilled') setBlueprints(b.value.items);
          else setError('Blueprint belum bisa dimuat. Authoring draf tetap tersedia.');
          if (c.status === 'fulfilled')
            setChapters(c.value.items.filter((i) => i.kind === 'CHAPTER'));
          else setError('Bab belum bisa dimuat. Muat ulang halaman untuk mencoba lagi.');
        }
      })
      .catch((e) => {
        if (current) setError(e.message);
      });
    return () => {
      current = false;
    };
  }, [token]);
  async function mutate(path: string, method: string, body?: object) {
    setBusy(true);
    setError('');
    try {
      await apiRequest(path, token, { method, ...(body ? { body: JSON.stringify(body) } : {}) });
      setGeneration((n) => n + 1);
      setRevision(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Permintaan gagal.');
    } finally {
      setBusy(false);
    }
  }
  function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const v = new FormData(e.currentTarget);
    const common = {
      name: String(v.get('name')),
      blueprintVersionId: String(v.get('blueprintVersionId') ?? '') || null,
      questionVersionIds: String(v.get('questions'))
        .split(/[\n,]+/)
        .map((v) => v.trim())
        .filter(Boolean),
    };
    void mutate(
      revision
        ? `admin/content/pretest-packages/${revision.id}${editing ? '' : '/revisions'}`
        : 'admin/content/pretest-packages',
      editing ? 'PUT' : 'POST',
      revision
        ? common
        : {
            ...common,
            familyCode: String(v.get('familyCode')),
            packageVersion: Number(v.get('packageVersion')),
            chapterId: String(v.get('chapterId')),
          },
    );
  }
  return (
    <div className="admin-panel space-y-5">
      {error && <AdminMessage error message={error} />}
      <Card>
        <h2>{revision ? (editing ? 'Edit draf' : 'Buat revisi paket') : 'Buat draf Pretest'}</h2>
        <form key={revision?.id ?? 'new'} onSubmit={save} className="admin-form">
          {!revision && (
            <>
              <label>
                Kode keluarga
                <input name="familyCode" required maxLength={100} />
              </label>
              <label>
                Versi paket
                <input
                  name="packageVersion"
                  type="number"
                  required
                  min={1}
                  max={100000}
                  defaultValue={1}
                />
              </label>
              <label>
                Bab
                <select name="chapterId" required>
                  <option value="">Pilih bab</option>
                  {chapters.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
          {revision && (
            <p>
              Keluarga {revision.familyCode}, versi {revision.packageVersion + (editing ? 0 : 1)}.
              Versi asal tetap dipertahankan.
            </p>
          )}
          <label>
            Nama paket
            <input name="name" required maxLength={200} defaultValue={revision?.name ?? ''} />
          </label>
          <label>
            Blueprint yang disahkan
            <select name="blueprintVersionId" defaultValue={revision?.blueprintVersionId ?? ''}>
              <option value="">Belum tersedia ? authoring internal</option>
              {blueprints.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.code} v{b.version} ? {b.approvalReference}
                </option>
              ))}
            </select>
          </label>
          <label>
            ID versi soal (baris baru atau koma)
            <textarea
              name="questions"
              rows={6}
              defaultValue={revision?.questionVersionIds.join('\n') ?? ''}
            />
          </label>
          <small>
            Review memerlukan 20 soal unik dan READY dari bab yang sama. Draf tidak menghitung skor
            atau XP.
          </small>
          <Button disabled={busy}>Simpan draf</Button>
          {revision && (
            <Button type="button" variant="secondary" onClick={() => setRevision(null)}>
              Batal revisi
            </Button>
          )}
        </form>
      </Card>
      {items === null && !error && <AdminLoading message="Memuat paket?" />}
      {items?.length === 0 && <p>Belum ada paket pada halaman ini.</p>}
      {items?.map((p) => (
        <Card key={p.id}>
          <h2>{p.name}</h2>
          <p>
            {p.familyCode} v{p.packageVersion} ? {p.state} ? {p.questionVersionIds.length}/20 soal
          </p>
          <p>Publikasi terblokir: {p.publicationBlockers.join(', ')}</p>
          <details>
            <summary>Versi soal yang dipin</summary>
            <ul>
              {p.questionVersionIds.map((id) => (
                <li key={id}>
                  <a href={`/admin/content/versions/${id}`}>{id}</a>
                </li>
              ))}
            </ul>
          </details>
          {p.state === 'DRAFT' && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void mutate(`admin/content/pretest-packages/${p.id}/review`, 'POST', {
                  reason: String(new FormData(e.currentTarget).get('reason')),
                });
              }}
            >
              <label>
                Alasan review
                <input name="reason" required minLength={3} maxLength={1000} />
              </label>
              <Button disabled={busy || p.reviewBlockers.length > 0}>
                Sahkan review editorial
              </Button>
              {p.reviewBlockers.length > 0 && (
                <p>Perlu diperbaiki: {p.reviewBlockers.join(', ')}</p>
              )}
            </form>
          )}
          {p.state === 'DRAFT' && (
            <Button
              type="button"
              disabled={busy}
              onClick={() => {
                setEditing(true);
                setRevision(p);
              }}
            >
              Edit draf
            </Button>
          )}
          {p.state === 'REVIEWED' && (
            <Button
              type="button"
              disabled={busy}
              onClick={() => {
                setEditing(false);
                setRevision(p);
              }}
            >
              Buat versi baru
            </Button>
          )}
          {p.state !== 'ARCHIVED' && (
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() => {
                if (window.confirm(`Arsipkan ${p.name}?`))
                  void mutate(`admin/content/pretest-packages/${p.id}/archive`, 'POST');
              }}
            >
              Arsipkan
            </Button>
          )}
        </Card>
      ))}
      <div>
        <Button disabled={offset === 0 || busy} onClick={() => setOffset(Math.max(0, offset - 20))}>
          Sebelumnya
        </Button>
        <Button disabled={items?.length !== 20 || busy} onClick={() => setOffset(offset + 20)}>
          Berikutnya
        </Button>
        <Button variant="secondary" onClick={() => setGeneration((n) => n + 1)}>
          Muat ulang
        </Button>
      </div>
    </div>
  );
}
