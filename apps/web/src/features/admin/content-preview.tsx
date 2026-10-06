'use client';
import { useEffect, useRef, useState } from 'react';
import { Badge, Button, Card } from '@tka/ui';
import { useAuth } from '@/features/onboarding/auth';
import { QuestionChoices } from '@/features/core-learning/question-choices';
import { AdminFrame, AdminLoading, AdminMessage } from './admin-presentation';
import { getPreview, savePreview, submitPreview, renewPreviewMedia } from './content-preview-api';
import { ContentRichText } from './content-rich-text';
import { adminAccessDenied } from './operational-query';
import type { PreviewSessionDto, PreviewItemDto, SavePreviewAnswerDto } from './generated-types';

type RawAnswer = SavePreviewAnswerDto['answer'];
function choice(answer: RawAnswer): string | string[] | Record<string, string> | null {
  if (!answer) return null;
  if ('optionId' in answer) return answer.optionId;
  if ('optionIds' in answer) return answer.optionIds;
  return answer.categoryByStatementId;
}
function answerFrom(type: PreviewItemDto['type'], value: ReturnType<typeof choice>): RawAnswer {
  if (value === null) return null;
  if (type === 'SINGLE_CHOICE') return { optionId: value as string };
  if (type === 'MULTIPLE_CHOICE_MULTIPLE_ANSWER') return { optionIds: value as string[] };
  return { categoryByStatementId: value as Record<string, string> };
}
export function ContentPreviewScreen({ id }: { id: string }) {
  const { state } = useAuth();
  const accountKey = state.status === 'ready' ? state.profile.id : state.status;
  return <PreviewContent key={`${accountKey}:${id}`} id={id} />;
}
function PreviewContent({ id }: { id: string }) {
  const { state, refresh } = useAuth();
  const token =
    state.status === 'ready' &&
    state.profile.role === 'ADMIN' &&
    state.profile.status === 'ACTIVE' &&
    state.profile.capabilities?.includes('CONTENT_MANAGE')
      ? state.session.access_token
      : null;
  const [view, setView] = useState<PreviewSessionDto | null>(null),
    [index, setIndex] = useState(0);
  const [draft, setDraft] = useState<RawAnswer>(null),
    [dirty, setDirty] = useState(false),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true);
  const submitKey = useRef<string | null>(null);
  const item = view?.items[index];
  async function load() {
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const work = await getPreview(token, id);
      const next = work.state === 'SUBMITTED' ? await getPreview(token, id, true) : work;
      setView(next);
      setDraft(next.items[index]?.answer ?? null);
      setDirty(false);
    } catch (e) {
      setView(null);
      setError(e instanceof Error ? e.message : 'Gagal memuat sesi.');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    let active = true;
    if (!token) return;
    setView(null);
    setLoading(true);
    setError('');
    getPreview(token, id)
      .then(async (work) => (work.state === 'SUBMITTED' ? getPreview(token, id, true) : work))
      .then(
        (next) => {
          if (active) {
            const requested = Number(new URL(window.location.href).searchParams.get('item') ?? 0);
            const position =
              Number.isInteger(requested) && requested >= 0 && requested < next.items.length
                ? requested
                : 0;
            setView(next);
            setIndex(position);
            setDraft(next.items[position]?.answer ?? null);
            setLoading(false);
          }
        },
        (e) => {
          if (active) {
            setError(e instanceof Error ? e.message : 'Gagal memuat sesi.');
            setLoading(false);
          }
        },
      );
    return () => {
      active = false;
    };
  }, [token, id]);
  async function save() {
    if (!token || !item || !view) return false;
    const ack = await savePreview(token, id, item.instanceId, {
      answer: draft,
      expectedRevision: item.revision,
    });
    setView({
      ...view,
      items: view.items.map((i) => (i.instanceId === item.instanceId ? { ...i, ...ack } : i)),
    });
    setDraft(ack.answer);
    setDirty(false);
    return true;
  }
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (e) {
      if (adminAccessDenied(e)) {
        setView(null);
        setDraft(null);
        setDirty(false);
      }
      setError(
        e instanceof Error ? e.message : 'Permintaan gagal. Jawaban belum dikonfirmasi server.',
      );
    } finally {
      setBusy(false);
    }
  }
  async function navigate(next: number) {
    if (dirty && !(await save())) return;
    setIndex(next);
    setDraft(view!.items[next]?.answer ?? null);
    setDirty(false);
    const url = new URL(window.location.href);
    url.searchParams.set('item', String(next));
    window.history.replaceState(null, '', url);
  }
  async function renew() {
    if (!token || !view || !item) return;
    await run(async () => {
      const links = await renewPreviewMedia(token, id, {
        phase: view.state === 'SUBMITTED' ? 'REVIEW' : 'WORK',
        instanceId: item.instanceId,
        assetIds: view.media.filter((a) => a.instanceId === item.instanceId).map((a) => a.assetId),
      });
      setView({
        ...view,
        media: [...view.media.filter((a) => a.instanceId !== item.instanceId), ...links.media],
      });
    });
  }
  const media = view?.media.filter((a) => a.instanceId === item?.instanceId) ?? [];
  const rich = (text: string) => (
    <ContentRichText text={text} media={media} retry={() => void renew()} />
  );
  return (
    <AdminFrame
      title="Preview soal"
      description="Sesi internal tersimpan; tidak menghasilkan nilai, XP, progres, atau evidence IRT."
      icon="book"
    >
      <Badge>Preview internal — tanpa scoring</Badge>
      {!token ? (
        <AdminMessage
          message="Akses memerlukan Admin konten yang berwenang."
          login={state.status === 'signed_out'}
          {...(state.status === 'ready' ? { retry: () => void refresh() } : {})}
        />
      ) : loading ? (
        <AdminLoading message="Memuat snapshot preview…" />
      ) : !view ? (
        <AdminMessage error message={error || 'Sesi tidak ditemukan.'} retry={() => void load()} />
      ) : !item ? (
        <AdminMessage message="Sesi belum berisi soal." />
      ) : (
        <Card className="content-preview-card">
          <p>
            Soal {index + 1}/{view.items.length} · {item.externalId} · {view.state}
          </p>
          <div className="content-preview-stem">{rich(item.stem.text)}</div>
          <QuestionChoices
            kind={item.type}
            name={item.instanceId}
            options={item.options.map((o) => ({ id: o.id, text: o.content.text }))}
            statements={item.options.map((o) => ({ id: o.id, text: o.content.text }))}
            categories={item.categories.map((c) => ({ id: c.id, text: c.label }))}
            value={choice(draft)}
            disabled={busy || view.state === 'SUBMITTED'}
            renderContent={(text) => rich(text)}
            onChange={(value) => {
              setDraft(answerFrom(item.type, value));
              setDirty(true);
            }}
          />
          {view.state === 'IN_PROGRESS' ? (
            <>
              <p role="status">
                {dirty
                  ? 'Perubahan belum tersimpan.'
                  : `Tersimpan di server · revisi ${item.revision}`}
              </p>
              <div className="admin-content-actions">
                <Button
                  disabled={busy || !dirty}
                  onClick={() =>
                    void run(async () => {
                      await save();
                    })
                  }
                >
                  Simpan jawaban
                </Button>
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() => {
                    setDraft(null);
                    setDirty(true);
                  }}
                >
                  Hapus jawaban
                </Button>
                <Button
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      if (dirty && !(await save())) return;
                      submitKey.current ??= crypto.randomUUID();
                      const result = await submitPreview(token, id, submitKey.current);
                      setView(result);
                      setDraft(result.items[index]?.answer ?? null);
                      setDirty(false);
                    })
                  }
                >
                  Submit & review
                </Button>
              </div>
            </>
          ) : (
            <section>
              <h2>Review tanpa scoring</h2>
              <p>Nilai: — · NOT_SCORED</p>
              <p>Jawaban tersimpan: {JSON.stringify(item.answer)}</p>
              <p>Kunci: {JSON.stringify(item.answerKey)}</p>
              {item.explanation && rich(item.explanation.text)}
            </section>
          )}
          <div className="admin-content-actions">
            <Button
              variant="secondary"
              disabled={busy || index === 0}
              onClick={() => void run(() => navigate(index - 1))}
            >
              Sebelumnya
            </Button>
            <Button
              variant="secondary"
              disabled={busy || index === view.items.length - 1}
              onClick={() => void run(() => navigate(index + 1))}
            >
              Berikutnya
            </Button>
            {media.length > 0 && (
              <Button variant="secondary" disabled={busy} onClick={() => void renew()}>
                Muat ulang media
              </Button>
            )}
          </div>
          {error && <AdminMessage error message={error} retry={() => void load()} />}
        </Card>
      )}
    </AdminFrame>
  );
}
