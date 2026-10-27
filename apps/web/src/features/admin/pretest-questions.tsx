'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@tka/ui';
import { AdminPagination, useAdminPagination } from './admin-pagination';
import { apiRequest } from '@/lib/api';
import { ContentText } from './content-payload';
import { questionFormat } from './content-question-format';
import { useAdminAccessError } from './admin-workspace';
import type { AdminVersionDto, ContentVersionDetailDto } from './generated-types';

type Label = { stem: string; type: string };
export function usePretestQuestionLabels(token: string, ids: string[]) {
  const onAccessError = useAdminAccessError();
  const [labels, setLabels] = useState<Record<string, Label>>({});
  const [error, setError] = useState(''),
    [loading, setLoading] = useState(false),
    [retry, setRetry] = useState(0);
  const key = ids.join('|');
  const remember = useCallback(
    (versions: AdminVersionDto[]) =>
      setLabels((current) => ({
        ...current,
        ...Object.fromEntries(versions.map((v) => [v.id, { stem: v.stem, type: v.questionType }])),
      })),
    [],
  );
  useEffect(() => {
    let active = true;
    const missing = ids.filter((id) => !labels[id]);
    setError('');
    setLoading(!!missing.length);
    if (!missing.length) return;
    void Promise.allSettled(
      missing.map((id) =>
        apiRequest<ContentVersionDetailDto>(
          `admin/content/versions/${encodeURIComponent(id)}`,
          token,
        ),
      ),
    ).then((results) => {
      if (!active) return;
      const next: Record<string, Label> = {};
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          const { payload } = result.value;
          if (!payload || typeof payload !== 'object') {
            setError('Sebagian isi soal belum dapat dimuat. Versi terpilih tetap dipertahankan.');
            return;
          }
          const stem =
            typeof payload.stem === 'string'
              ? payload.stem
              : typeof (payload.stem as { text?: unknown } | null)?.text === 'string'
                ? String((payload.stem as { text: string }).text)
                : '';
          next[missing[index]!] = { stem, type: String(payload.type ?? '') };
        } else {
          onAccessError(result.reason);
          setError('Sebagian isi soal belum dapat dimuat. Versi terpilih tetap dipertahankan.');
        }
      });
      setLabels((current) => ({ ...current, ...next }));
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [token, key, retry, onAccessError]);
  return { labels, remember, loading, error, retry: () => setRetry((value) => value + 1) };
}
export function PretestQuestions({
  token,
  ids,
  selection,
  onChange,
  busy = false,
}: {
  token: string;
  ids: string[];
  selection?: ReturnType<typeof usePretestQuestionLabels>;
  onChange?: (ids: string[]) => void;
  busy?: boolean;
}) {
  // The read-only detail owns its lookup; the editor passes its cache from the picker.
  return selection ? (
    <QuestionRows ids={ids} selection={selection} onChange={onChange} busy={busy} />
  ) : (
    <ReadOnlyQuestions token={token} ids={ids} />
  );
}
function ReadOnlyQuestions({ token, ids }: { token: string; ids: string[] }) {
  const selection = usePretestQuestionLabels(token, ids);
  return <QuestionRows ids={ids} selection={selection} />;
}
function QuestionRows({
  ids,
  selection,
  onChange,
  busy,
}: {
  ids: string[];
  selection: ReturnType<typeof usePretestQuestionLabels>;
  onChange?: ((ids: string[]) => void) | undefined;
  busy?: boolean;
}) {
  const page = useAdminPagination(ids);
  function move(index: number, by: number) {
    const next = [...ids];
    [next[index], next[index + by]] = [next[index + by]!, next[index]!];
    onChange?.(next);
  }
  return (
    <div className="pretest-selected">
      {selection.loading && (
        <p role="status" className="pretest-inline-note">
          Memuat isi soal...
        </p>
      )}
      {selection.error && (
        <div className="pretest-lookup-error" role="alert">
          <p>{selection.error}</p>
          <Button type="button" variant="secondary" disabled={busy} onClick={selection.retry}>
            Muat ulang isi soal
          </Button>
        </div>
      )}
      {!ids.length ? (
        <p className="pretest-empty-inline">
          Belum ada soal dipilih. Draf kosong tetap dapat disimpan.
        </p>
      ) : (
        <ol aria-label="Urutan soal terpilih" className="pretest-question-order">
          {page.items.map((id, position) => {
            const index = page.pagination.offset + position;
            return (
              <li key={id}>
                <span className="pretest-question-position">{index + 1}</span>
                <div className="pretest-question-copy">
                  <p>
                    <ContentText
                      value={
                        selection.labels[id]?.stem ||
                        (selection.loading
                          ? 'Memuat isi soal...'
                          : 'Isi soal belum tersedia. Buka detail versi untuk memeriksa sumber.')
                      }
                    />
                  </p>
                  {selection.labels[id] && (
                    <small>{questionFormat(selection.labels[id]!.type).label}</small>
                  )}
                  <Link
                    href={`/admin/content/versions/${encodeURIComponent(id)}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Detail versi soal {index + 1}
                    <span className="sr-only"> (tab baru)</span>
                  </Link>
                  <details>
                    <summary>ID versi</summary>
                    <code>{id}</code>
                  </details>
                </div>
                {onChange && (
                  <div className="pretest-order-actions">
                    <Button
                      type="button"
                      variant="secondary"
                      aria-label={`Naikkan soal ${index + 1}`}
                      disabled={busy || index === 0}
                      onClick={() => move(index, -1)}
                    >
                      Naik
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      aria-label={`Turunkan soal ${index + 1}`}
                      disabled={busy || index === ids.length - 1}
                      onClick={() => move(index, 1)}
                    >
                      Turun
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      aria-label={`Keluarkan soal ${index + 1}`}
                      disabled={busy}
                      onClick={() => onChange(ids.filter((value) => value !== id))}
                    >
                      Keluarkan
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
      {ids.length > 5 && (
        <div className="pretest-order-footer">
          <span>
            {page.pagination.offset + 1}–{page.pagination.offset + page.items.length} dari{' '}
            {ids.length} soal
          </span>
          <AdminPagination
            {...page.pagination}
            label="Halaman susunan soal"
            disabled={busy ?? false}
          />
        </div>
      )}
    </div>
  );
}
