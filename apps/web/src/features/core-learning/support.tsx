'use client';

import { useId, useRef, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Dialog } from '@tka/ui';
import { learningApi } from './api';
import { recordLearningInteraction } from './learning-interactions';
import { DataState, Panel, PrimaryButton } from './ui';

export const QUESTION_REPORT_CATEGORIES = [
  { value: 'QUESTION', label: 'Soal' },
  { value: 'OPTION', label: 'Pilihan jawaban' },
  { value: 'ANSWER_KEY', label: 'Kunci jawaban' },
  { value: 'EXPLANATION', label: 'Pembahasan' },
] as const;

export function ReportForm<T extends string = string>({
  submit,
  label,
  categories,
  modal = false,
}: {
  submit: (category: T, details: string, clientRequestId: string) => Promise<unknown>;
  label: string;
  categories?: readonly { value: T; label: string }[];
  modal?: boolean;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState('');
  const [details, setDetails] = useState('');
  const [state, setState] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [error, setError] = useState('');
  const sending = useRef(false);
  const request = useRef<{ payload: string; id: string } | null>(null);
  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending.current || !category.trim()) return;
    sending.current = true;
    setState('saving');
    try {
      const payload = JSON.stringify([category.trim(), details.trim()]);
      if (request.current?.payload !== payload)
        request.current = { payload, id: crypto.randomUUID() };
      await submit(category.trim() as T, details.trim(), request.current.id);
      setState('success');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Laporan belum terkirim.');
      setState('error');
    } finally {
      sending.current = false;
    }
  }
  if (state === 'success')
    return (
      <p className="mt-4 text-sm" role="status">
        Laporan terkirim untuk ditinjau Admin.
      </p>
    );
  if (!open)
    return (
      <button
        type="button"
        className="mt-3 min-h-11 text-sm font-semibold text-[var(--numora-purple)] underline"
        onClick={() => setOpen(true)}
      >
        {label}
      </button>
    );
  const form = (
    <form onSubmit={(event) => void send(event)} className="mt-4 space-y-3" aria-label={label}>
      <label className="block text-sm font-semibold" htmlFor={`${id}-category`}>
        Jenis masalah
      </label>
      {categories ? (
        <select
          id={`${id}-category`}
          className="min-h-11 w-full rounded-xl border border-slate-300 px-3"
          required
          value={category}
          disabled={state === 'saving'}
          onChange={(event) => setCategory(event.target.value)}
        >
          <option value="">Pilih jenis masalah</option>
          {categories.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          id={`${id}-category`}
          className="min-h-11 w-full rounded-xl border border-slate-300 px-3"
          required
          maxLength={80}
          value={category}
          onChange={(event) => setCategory(event.target.value)}
          disabled={state === 'saving'}
        />
      )}
      <label className="block text-sm font-semibold" htmlFor={`${id}-details`}>
        Keterangan tambahan (opsional)
      </label>
      <textarea
        id={`${id}-details`}
        className="min-h-24 w-full rounded-xl border border-slate-300 p-3"
        maxLength={2000}
        value={details}
        onChange={(event) => setDetails(event.target.value)}
        disabled={state === 'saving'}
      />
      <p className="text-xs text-slate-600">Hindari memasukkan data pribadi dalam laporan.</p>
      {state === 'error' && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-4">
        <PrimaryButton type="submit" disabled={state === 'saving' || !category.trim()}>
          {state === 'saving'
            ? 'Mengirim…'
            : state === 'error'
              ? 'Kirim ulang laporan'
              : 'Kirim laporan'}
        </PrimaryButton>
        <button
          type="button"
          className="min-h-11 underline"
          disabled={state === 'saving'}
          onClick={() => setOpen(false)}
        >
          Batal
        </button>
      </div>
    </form>
  );
  return modal ? (
    <Dialog open={open} onClose={() => setOpen(false)} title={label} pending={state === 'saving'}>
      {form}
    </Dialog>
  ) : (
    form
  );
}

export function RecommendedVideos({ token, attemptId }: { token: string; attemptId: string }) {
  const query = useQuery({
    queryKey: ['drill-videos', attemptId],
    queryFn: () => learningApi.videos(token, attemptId),
  });
  if (query.isPending || query.isError)
    return (
      <section aria-label="Rekomendasi video">
        <DataState
          pending={query.isPending}
          error={query.error}
          retry={() => void query.refetch()}
        />
      </section>
    );
  if (!query.data.items.length) return null;
  return (
    <section aria-label="Rekomendasi video" className="space-y-3">
      <h2 className="text-xl font-bold">Video untuk melanjutkan belajar</h2>
      {query.data.items.map((video) => (
        <Panel key={video.mappingId}>
          <a
            href={video.url}
            onClick={() =>
              void recordLearningInteraction(token, {
                eventName: 'video_clicked',
                attemptId,
                mappingId: video.mappingId,
              }).catch(() => {})
            }
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center font-semibold text-[var(--numora-purple)] underline"
          >
            {video.title} <span className="sr-only">(membuka tab baru)</span>
          </a>
          <p className="text-sm text-slate-600">Sumber: {video.source}</p>
          <ReportForm
            label={`Laporkan video ${video.title}`}
            submit={(category, details, clientRequestId) =>
              learningApi.reportVideo(token, {
                clientRequestId,
                attemptId,
                mappingId: video.mappingId,
                category,
                details,
              })
            }
          />
        </Panel>
      ))}
    </section>
  );
}
