'use client';
import { useEffect, useRef, useState } from 'react';
import { Button, Card } from '@tka/ui';
import { useAuth } from '@/features/onboarding/auth';
import { apiRequest, ApiProblem } from '@/lib/api';
import { AdminFrame, AdminMessage } from './admin-presentation';
import { ContentRichText } from './content-rich-text';
import { QuestionChoices } from '@/features/core-learning/question-choices';
import type {
  GeneratorCatalogDto,
  GeneratorRequestDto,
  GeneratorRequestsDto,
  GeneratorPreviewDto,
  GeneratorDraftDto,
} from './generated-types';
const root = 'admin/content/generator';
export function ContentGeneratorScreen() {
  const { state } = useAuth();
  const account = state.status === 'ready' ? state.profile.id : state.status;
  return <GeneratorWorkspace key={account} />;
}
function GeneratorWorkspace() {
  const { state } = useAuth();
  const token =
    state.status === 'ready' &&
    state.profile.role === 'ADMIN' &&
    state.profile.status === 'ACTIVE' &&
    state.profile.capabilities?.includes('CONTENT_MANAGE')
      ? state.session.access_token
      : null;
  const [catalog, setCatalog] = useState<GeneratorCatalogDto | null>(null),
    [requests, setRequests] = useState<GeneratorRequestDto[]>([]);
  const [selected, setSelected] = useState(''),
    [current, setCurrent] = useState<GeneratorRequestDto | null>(null);
  const [preview, setPreview] = useState<GeneratorPreviewDto | null>(null),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false);
  const key = useRef<string | null>(null),
    retryKey = useRef<string | null>(null);
  async function load() {
    if (!token) return;
    try {
      const [c, r] = await Promise.all([
        apiRequest<GeneratorCatalogDto>(`${root}/catalog`, token),
        apiRequest<GeneratorRequestsDto>(`${root}/requests`, token),
      ]);
      setCatalog(c);
      setRequests(r.items);
      setError('');
    } catch (e) {
      setError(
        e instanceof ApiProblem && e.code === 'GENERATOR_DISABLED'
          ? 'Generator belum diaktifkan.'
          : e instanceof Error
            ? e.message
            : 'Gagal memuat generator.',
      );
    }
  }
  useEffect(() => {
    void load();
  }, [token]);
  useEffect(() => {
    if (
      !token ||
      !current ||
      current.executionStatus === 'SUCCEEDED' ||
      current.executionStatus === 'FAILED' ||
      current.executionStatus === 'EXPIRED' ||
      current.status === 'FAILED' ||
      current.status === 'COMPLETED'
    )
      return;
    let active = true;
    const timer = setInterval(() => {
      apiRequest<GeneratorRequestDto>(`${root}/requests/${current.id}`, token)
        .then((r) => {
          if (active) setCurrent(r);
        })
        .catch((e) => {
          if (active) setError(e instanceof Error ? e.message : 'Gagal memuat status.');
        });
    }, 3000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [token, current]);
  async function action(run: () => Promise<void>) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await run();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Permintaan gagal.');
    } finally {
      setBusy(false);
    }
  }
  const rich = (text: string) => <ContentRichText text={text} media={[]} retry={() => {}} />;
  return (
    <AdminFrame
      title="Generator varian"
      description="Buat kandidat dari original yang telah dipetakan dan disetujui, lalu simpan sebagai draft."
      icon="book"
    >
      {process.env.NEXT_PUBLIC_GENERATOR_DEMO === 'true' && (
        <p role="status">
          DEMO LOKAL — Soal TEST ONLY. Data generator terisolasi, bukan approval akademik produksi.
        </p>
      )}
      {!token ? (
        <AdminMessage message="Akses Content Admin diperlukan. Masuk dengan akun Super Admin atau Content/Data/Moderation." />
      ) : (
        <>
          {error && (
            <div role="alert">
              {error}{' '}
              <Button variant="secondary" onClick={() => void load()}>
                Muat ulang
              </Button>
            </div>
          )}
          {notice && <p role="status">{notice}</p>}
          <Card>
            <label htmlFor="generator-original">Original</label>
            <select
              id="generator-original"
              value={selected}
              disabled={busy}
              onChange={(e) => {
                setSelected(e.target.value);
                key.current = null;
              }}
            >
              <option value="">Pilih original</option>
              {catalog?.items.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
            {catalog && !catalog.items.length && (
              <p>Belum ada original dengan mapping, rubric, context dan approval sah.</p>
            )}
            <Button
              disabled={busy || !selected}
              onClick={() =>
                void action(async () => {
                  key.current ??= crypto.randomUUID();
                  const r = await apiRequest<GeneratorRequestDto>(`${root}/requests`, token, {
                    method: 'POST',
                    headers: { 'Idempotency-Key': key.current },
                    body: JSON.stringify({ mappingId: selected }),
                  });
                  setCurrent(r);
                  setPreview(null);
                  retryKey.current = null;
                  key.current = null;
                  await load();
                })
              }
            >
              Generate
            </Button>
          </Card>
          {current && (
            <Card>
              <h2>{current.label}</h2>
              <p role="status">
                {current.executionStatus ?? current.status}
                {current.leaseExpired ? ' — lease kedaluwarsa' : ''}
              </p>
              {current.failureCode && <p role="alert">{current.failureCode}</p>}
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() =>
                  void action(async () =>
                    setCurrent(
                      await apiRequest<GeneratorRequestDto>(
                        `${root}/requests/${current.id}`,
                        token,
                      ),
                    ),
                  )
                }
              >
                Perbarui status
              </Button>
              {(current.status === 'FAILED' ||
                current.executionStatus === 'FAILED' ||
                current.executionStatus === 'EXPIRED' ||
                current.leaseExpired) && (
                <Button
                  disabled={busy}
                  onClick={() =>
                    void action(async () => {
                      retryKey.current ??= crypto.randomUUID();
                      setCurrent(
                        await apiRequest<GeneratorRequestDto>(
                          `${root}/requests/${current.id}/retry`,
                          token,
                          { method: 'POST', headers: { 'Idempotency-Key': retryKey.current } },
                        ),
                      );
                      retryKey.current = null;
                      setPreview(null);
                    })
                  }
                >
                  Coba generate lagi
                </Button>
              )}
              {current.executionStatus === 'SUCCEEDED' && (
                <Button
                  disabled={busy}
                  onClick={() =>
                    void action(async () =>
                      setPreview(
                        await apiRequest<GeneratorPreviewDto>(
                          `${root}/requests/${current.id}/preview`,
                          token,
                        ),
                      ),
                    )
                  }
                >
                  Lihat kandidat
                </Button>
              )}
            </Card>
          )}
          {preview && current && (
            <Card>
              <h2>Preview kandidat</h2>
              <p>Tanpa penilaian. Kandidat belum READY dan belum disetujui untuk distribusi.</p>
              <div>{rich(preview.stem.text)}</div>
              <QuestionChoices
                kind={preview.type}
                name="generator-preview"
                disabled
                options={preview.options.map((o) => ({ id: o.id, text: o.content.text }))}
                statements={preview.options.map((o) => ({ id: o.id, text: o.content.text }))}
                categories={preview.categories.map((c) => ({ id: c.id, text: c.label }))}
                value={
                  preview.answerKey && 'optionId' in preview.answerKey
                    ? preview.answerKey.optionId
                    : preview.answerKey && 'optionIds' in preview.answerKey
                      ? preview.answerKey.optionIds
                      : preview.answerKey && 'categoryByStatementId' in preview.answerKey
                        ? preview.answerKey.categoryByStatementId
                        : null
                }
                onChange={() => {}}
                renderContent={rich}
              />
              <h3>Pembahasan</h3>
              {rich(preview.explanation.text)}
              <Button
                disabled={busy}
                onClick={() =>
                  void action(async () => {
                    await apiRequest<GeneratorDraftDto>(
                      `${root}/requests/${current.id}/draft`,
                      token,
                      { method: 'POST' },
                    );
                    setNotice('Varian tersimpan sebagai DRAFT.');
                    await load();
                  })
                }
              >
                Simpan draft
              </Button>
            </Card>
          )}
          <Card>
            <h2>Riwayat generate</h2>
            {requests.length ? (
              requests.map((r) => (
                <div key={r.id}>
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() => {
                      setCurrent(r);
                      setPreview(null);
                      retryKey.current = null;
                    }}
                  >
                    {r.label} — {r.executionStatus ?? r.status}
                  </Button>
                </div>
              ))
            ) : (
              <p>Belum ada permintaan generate.</p>
            )}
          </Card>
        </>
      )}
    </AdminFrame>
  );
}
