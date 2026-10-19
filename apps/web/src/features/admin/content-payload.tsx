'use client';

import { useState } from 'react';
import { ContentRichText } from './content-rich-text';

const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const text = (value: unknown): string =>
  typeof value === 'string'
    ? value
    : typeof object(value).text === 'string'
      ? (object(value).text as string)
      : '';

// The detail endpoint deliberately supports both legacy and imported payloads.
// Media is shown only through the existing signed preview, never a guessed public URL.
export function ContentText({ value }: { value: string }) {
  return (
    <ContentRichText
      text={value.replace(/\[\[asset:([^\]]+)\]\]/g, '[Gambar $1 — buka preview konten dan media]')}
      media={[]}
      retry={() => {}}
    />
  );
}

export function ContentPayload({ payload }: { payload: Record<string, unknown> }) {
  const [sourceOpen, setSourceOpen] = useState(false);
  const options = Array.isArray(payload.options) ? payload.options : [];
  const statements = Array.isArray(payload.statements) ? payload.statements : [];
  const answer = payload.answer ?? payload.answerKey;
  const answerObject = object(answer);
  const rawCategories = object(payload.metadata).categories;
  const categories = Array.isArray(rawCategories) ? rawCategories : [];
  const categoryLabel = (id: unknown) =>
    text(object(categories.find((c) => object(c).id === id)).label) || String(id);
  const keys = answerObject.categoryByStatementId
    ? Object.entries(object(answerObject.categoryByStatementId)).map(
        ([id, value]) => [id, categoryLabel(value)] as const,
      )
    : Object.entries(answerObject);
  const taxonomy = ['chapterCode', 'subchapterCode', 'competencyCode', 'difficulty']
    .filter((key) => typeof payload[key] === 'string' || typeof payload[key] === 'number')
    .map(
      (key) =>
        `${({ chapterCode: 'Bab', subchapterCode: 'Subbab', competencyCode: 'Kompetensi', difficulty: 'Kesulitan' } as Record<string, string>)[key]}: ${String(payload[key])}`,
    );
  return (
    <div className="content-payload">
      <div className="content-payload-meta">
        <span>
          {(
            {
              SINGLE_CHOICE: 'Pilihan ganda',
              MCMA: 'Pilihan ganda kompleks · MCMA',
              CATEGORY: 'Pilihan ganda kompleks · Kategori',
            } as Record<string, string>
          )[String(payload.type)] ?? 'Format soal'}
        </span>
        {typeof object(payload.metadata).sourceLevelNumber === 'number' &&
          Number(object(payload.metadata).sourceLevelNumber) > 0 && (
            <span>Level: {String(object(payload.metadata).sourceLevelNumber)}</span>
          )}
        {taxonomy.map((value, index) => (
          <span key={index}>{String(value)}</span>
        ))}
      </div>
      <section>
        <h3>Isi soal</h3>
        <p className="content-question-stem">
          <ContentText value={text(payload.stem) || 'Isi soal belum tersedia pada versi ini.'} />
        </p>
      </section>
      {!!(options.length || statements.length) && (
        <ol className="content-options">
          {(options.length ? options : statements).map((option, index) => {
            const item = object(option);
            return (
              <li key={String(item.id ?? index)}>
                <span>{String(item.id ?? index + 1)}</span>
                <ContentText value={text(item.content ?? item.text ?? option)} />
              </li>
            );
          })}
        </ol>
      )}
      <section className="content-answer-section">
        <h3>Kunci jawaban · hanya untuk review Admin</h3>
        {keys.length ? (
          <dl>
            {keys.map(([key, value]) => (
              <div key={key}>
                <dt>{key === 'optionId' || key === 'optionIds' ? 'Pilihan benar' : key}</dt>
                <dd>
                  {typeof value === 'string'
                    ? value
                    : Array.isArray(value)
                      ? value.join(', ')
                      : JSON.stringify(value)}
                </dd>
              </div>
            ))}
          </dl>
        ) : (
          <p>
            {answer == null
              ? 'Kunci belum tersedia.'
              : typeof answer === 'string'
                ? answer
                : JSON.stringify(answer)}
          </p>
        )}
      </section>
      <section>
        <h3>Pembahasan</h3>
        <p>
          <ContentText value={text(payload.explanation) || 'Pembahasan belum tersedia.'} />
        </p>
      </section>
      <details onToggle={(event) => setSourceOpen(event.currentTarget.open)}>
        <summary>Data sumber (JSON)</summary>
        {sourceOpen && <pre>{JSON.stringify(payload, null, 2)}</pre>}
      </details>
    </div>
  );
}
