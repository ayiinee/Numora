'use client';
import { Fragment, useState } from 'react';
import { Badge, Button, Card } from '@tka/ui';
import { ContentRichText } from './content-rich-text';
import { AdminPagination, useAdminPagination } from './admin-pagination';
import type {
  ExcelParseDto,
  IntakeQuestionDto,
  ExcelQuestionDto,
  ImportReportDto,
} from './generated-types';

function QuestionEditor<Q extends ExcelQuestionDto | IntakeQuestionDto>({
  question,
  save,
  cancel,
}: {
  question: Q;
  save: (question: Q) => void;
  cancel: () => void;
}) {
  const [draft, setDraft] = useState(() => structuredClone(question));
  const update = (next: Partial<ExcelQuestionDto | IntakeQuestionDto>) =>
    setDraft({ ...draft, ...next } as Q);
  return (
    <form
      className="excel-question-editor"
      onSubmit={(event) => {
        event.preventDefault();
        save(draft);
      }}
    >
      <h3>
        Edit soal · {String(question.metadata.sourceSheet)} baris{' '}
        {String(question.metadata.sourceRowNumber)}
      </h3>
      <p>
        Rumus: {'$x^2$'}, {'\\(\\frac{1}{2}\\)'} atau {'$$x^2 + 2x + 1$$'}. Pertahankan penanda
        gambar [[asset:...]].
      </p>
      <label>
        Kesulitan
        <select
          value={draft.difficulty ?? ''}
          onChange={(e) => update({ difficulty: e.target.value as ExcelQuestionDto['difficulty'] })}
        >
          <option value="" disabled>
            Pilih kesulitan
          </option>
          <option value="EASY">Mudah</option>
          <option value="MEDIUM">Sedang</option>
          <option value="HARD">Sulit</option>
        </select>
      </label>
      <label>
        Teks soal
        <textarea
          required
          rows={4}
          value={draft.stem.text}
          onChange={(e) => update({ stem: { text: e.target.value } })}
        />
      </label>
      {draft.metadata.categories?.map((category, index) => (
        <label key={category.id}>
          Label kategori {category.id}
          <input
            required
            value={category.label}
            onChange={(e) =>
              update({
                metadata: {
                  ...draft.metadata,
                  categories: draft.metadata.categories!.map((c, i) =>
                    i === index ? { ...c, label: e.target.value } : c,
                  ),
                },
              })
            }
          />
        </label>
      ))}
      <div className="excel-editor-options">
        {draft.options.map((option, index) => (
          <div key={option.id}>
            <label>
              {draft.type === 'CATEGORY' ? 'Pernyataan' : 'Pilihan'} {option.id}
              <textarea
                required
                rows={3}
                value={option.content.text}
                onChange={(e) =>
                  update({
                    options: draft.options.map((o, i) =>
                      i === index ? { ...o, content: { text: e.target.value } } : o,
                    ),
                  })
                }
              />
            </label>
            {'optionId' in draft.answer ? (
              <label className="excel-choice">
                <input
                  type="radio"
                  name={`answer-${question.externalId}`}
                  checked={draft.answer.optionId === option.id}
                  onChange={() => update({ answer: { optionId: option.id } })}
                />
                Kunci {option.id}
              </label>
            ) : 'optionIds' in draft.answer ? (
              <label className="excel-choice">
                <input
                  type="checkbox"
                  checked={draft.answer.optionIds.includes(option.id)}
                  onChange={(e) => {
                    if ('optionIds' in draft.answer)
                      update({
                        answer: {
                          optionIds: e.target.checked
                            ? [...draft.answer.optionIds, option.id]
                            : draft.answer.optionIds.filter((id) => id !== option.id),
                        },
                      });
                  }}
                />
                Kunci {option.id}
              </label>
            ) : (
              <label>
                Kunci {option.id}
                <select
                  value={draft.answer.categoryByStatementId[option.id] ?? ''}
                  onChange={(e) => {
                    if ('categoryByStatementId' in draft.answer)
                      update({
                        answer: {
                          categoryByStatementId: {
                            ...draft.answer.categoryByStatementId,
                            [option.id]: e.target.value,
                          },
                        },
                      });
                  }}
                >
                  <option value="" disabled>
                    Pilih kategori
                  </option>
                  {draft.metadata.categories?.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        ))}
      </div>
      <label>
        Pembahasan
        <textarea
          required
          rows={4}
          value={draft.explanation.text}
          onChange={(e) => update({ explanation: { text: e.target.value } })}
        />
      </label>
      {draft.metadata.assetManifest.map((asset, index) => (
        <label key={asset.assetId}>
          Deskripsi gambar {asset.placement.toLowerCase()} {asset.itemId ?? ''}
          <input
            required
            value={asset.altText}
            onChange={(e) =>
              update({
                metadata: {
                  ...draft.metadata,
                  assetManifest: draft.metadata.assetManifest.map((a, i) =>
                    i === index ? { ...a, altText: e.target.value } : a,
                  ),
                },
              })
            }
          />
        </label>
      ))}
      <div className="admin-content-actions">
        <Button type="submit">Simpan perubahan preview</Button>
        <Button type="button" variant="secondary" onClick={cancel}>
          Batal edit
        </Button>
      </div>
    </form>
  );
}

export function ContentExcelPreview<Q extends ExcelQuestionDto | IntakeQuestionDto>({
  excel,
  selected,
  report,
  disabled,
  hideIndicator = false,
  sourceFormat = 'Excel',
  select,
  edit,
  retry,
  editingChanged,
  move,
}: {
  excel: {
    envelope: { questions: Q[] };
    media: ExcelParseDto['media'];
    issues: ExcelParseDto['issues'];
  };
  selected: Set<string>;
  report: ImportReportDto | null;
  disabled: boolean;
  hideIndicator?: boolean;
  sourceFormat?: 'Excel' | 'JSON';
  select: (ids: Set<string>) => void;
  edit: (question: Q) => void;
  retry: () => void;
  editingChanged: (editing: boolean) => void;
  move?: (id: string, direction: -1 | 1) => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const changeEditing = (id: string | null) => {
    setEditing(id);
    editingChanged(id !== null);
  };
  const questions = excel.envelope.questions;
  const questionPage = useAdminPagination(questions);
  const imageCount = questions.reduce((total, q) => total + q.metadata.assetManifest.length, 0);
  const imageIssues = excel.issues.filter((i) => i.code.startsWith('IMAGE_'));
  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    select(next);
  };
  return (
    <Card className="content-import-card excel-preview-card">
      <div className="excel-preview-heading">
        <div>
          <h2>Preview {sourceFormat} sebelum simpan</h2>
          <p>
            {sourceFormat === 'JSON'
              ? 'Periksa seluruh soal, kunci dan pembahasan dalam paket hasil generator.'
              : 'Periksa soal, gambar, kunci, dan pembahasan. Pilih soal yang ingin diimpor atau edit sebelum validasi.'}
          </p>
        </div>
        <Badge variant="primary">
          {selected.size} dari {questions.length} soal dipilih
        </Badge>
      </div>
      <div className="excel-preview-summary">
        <Badge variant="info">{imageCount} gambar terbaca</Badge>
        {imageIssues.length > 0 && (
          <Badge variant="danger">{imageIssues.length} masalah gambar</Badge>
        )}
        <span>
          {sourceFormat === 'JSON'
            ? 'Preview memakai konten asli dari hasil generator.'
            : 'Gambar pada preview berasal dari file Excel. Status unggah ditampilkan terpisah.'}
        </span>
      </div>
      {excel.issues.length > 0 && (
        <div className="excel-issues" role="alert">
          <h3>Perbaiki file sebelum menyimpan</h3>
          <p>
            Periksa lokasi masalah. Koreksi konten pada preview; formula atau gambar yang tidak
            terbaca perlu diperbaiki di Excel.
          </p>
          <ul>
            {excel.issues.map((issue, i) => (
              <li key={i}>
                <strong>
                  {issue.sheet} · {issue.cell || `baris ${issue.row}`}
                </strong>
                <span>{issue.detail}</span>
                {issue.code === 'IMAGE_UNMAPPED' && (
                  <span>
                    Letakkan sudut kiri atas gambar dalam sel img_stem, img_A, img_B, atau
                    img_explanation pada baris soal yang sesuai.
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {!questions.length ? (
        <p>Belum ada soal yang dapat ditampilkan. Perbaiki file lalu pilih ulang Excel.</p>
      ) : (
        <div
          className="excel-preview-scroll"
          role="region"
          aria-label="Tabel preview soal Excel"
          tabIndex={0}
        >
          <table className="excel-preview-table">
            <caption>Isi soal dari Excel</caption>
            <thead>
              <tr>
                <th scope="col">
                  <label className="excel-select-control">
                    <input
                      type="checkbox"
                      aria-label="Pilih semua soal"
                      checked={selected.size === questions.length}
                      disabled={disabled || editing !== null}
                      onChange={(e) =>
                        select(new Set(e.target.checked ? questions.map((q) => q.externalId) : []))
                      }
                    />
                  </label>
                </th>
                <th scope="col">Soal / gambar</th>
                <th scope="col">Format / materi</th>
                <th scope="col">Kunci</th>
                <th scope="col">Status</th>
                <th scope="col">Tindakan</th>
              </tr>
            </thead>
            <tbody>
              {questionPage.items.map((q) => {
                const media = q.metadata.assetManifest.flatMap((a) => {
                  const source = excel.media.find(
                    (m) => m.externalId === q.externalId && m.assetId === a.assetId,
                  );
                  return source && (source.base64 || source.url)
                    ? [
                        {
                          instanceId: q.externalId,
                          assetId: a.assetId,
                          altText: a.altText,
                          url: source.url ?? `data:${a.contentType};base64,${source.base64}`,
                          expiresAt: '',
                        },
                      ]
                    : [];
                });
                const rich = (text: string) => (
                  <ContentRichText text={text} media={media} retry={retry} renderBareMath />
                );
                const validation = report?.items.find((item) => item.externalId === q.externalId);
                const key = q.answer;
                return (
                  <Fragment key={q.externalId}>
                    <tr className={selected.has(q.externalId) ? '' : 'excel-row-unselected'}>
                      <td>
                        <label className="excel-select-control">
                          <input
                            type="checkbox"
                            aria-label={`Pilih soal ${q.externalId}`}
                            checked={selected.has(q.externalId)}
                            disabled={disabled || editing !== null}
                            onChange={() => toggle(q.externalId)}
                          />
                        </label>
                        <span>{questions.indexOf(q) + 1}</span>
                      </td>
                      <th scope="row">
                        <div className="excel-preview-stem">{rich(q.stem.text)}</div>
                        <details>
                          <summary>Pilihan dan pembahasan</summary>
                          <ol className="excel-preview-options">
                            {q.options.map((o) => (
                              <li key={o.id}>
                                <strong>{o.id}.</strong>
                                <div>{rich(o.content.text)}</div>
                              </li>
                            ))}
                          </ol>
                          <strong>Pembahasan</strong>
                          {rich(q.explanation.text)}
                        </details>
                      </th>
                      <td>
                        <Badge>
                          {q.type === 'SINGLE_CHOICE'
                            ? 'PG'
                            : q.type === 'CATEGORY'
                              ? 'Kategori'
                              : 'MCMA'}
                        </Badge>
                        <p>
                          {String(q.metadata.chapterName ?? q.chapterCode ?? 'Bab belum dipetakan')}
                          <br />
                          {String(
                            q.metadata.subchapterName ??
                              q.subchapterCode ??
                              'Subbab belum dipetakan',
                          )}
                          {!hideIndicator && (
                            <>
                              <br />
                              {String(
                                q.metadata.competencyName ??
                                  q.competencyCode ??
                                  'Indikator belum dipetakan',
                              )}
                            </>
                          )}
                        </p>
                        <small>
                          Level {q.metadata.sourceLevelNumber ?? 'belum dipilih'} ·{' '}
                          {q.difficulty === 'EASY'
                            ? 'Mudah'
                            : q.difficulty === 'MEDIUM'
                              ? 'Sedang'
                              : q.difficulty === 'HARD'
                                ? 'Sulit'
                                : 'Kesulitan belum diisi'}
                        </small>
                        <small>
                          {String(q.metadata.sourceSheet)} · baris{' '}
                          {String(q.metadata.sourceRowNumber)}
                        </small>
                      </td>
                      <td>
                        {'optionId' in key ? (
                          <Badge variant="success">{key.optionId}</Badge>
                        ) : 'optionIds' in key ? (
                          <span className="excel-answer-options">
                            {key.optionIds.map((id) => (
                              <Badge key={id} variant="success">
                                {id}
                              </Badge>
                            ))}
                          </span>
                        ) : (
                          <ul className="excel-category-keys">
                            {q.options.map((o) => (
                              <li key={o.id}>
                                <strong>{o.id}:</strong>{' '}
                                {q.metadata.categories?.find(
                                  (c) => c.id === key.categoryByStatementId[o.id],
                                )?.label ?? key.categoryByStatementId[o.id]}
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                      <td>
                        <div className="excel-row-actions">
                          <Badge variant={q.metadata.assetManifest.length ? 'info' : 'default'}>
                            {q.metadata.assetManifest.length
                              ? `${media.length}/${q.metadata.assetManifest.length} gambar terbaca`
                              : 'Tanpa gambar'}
                          </Badge>
                          {q.metadata.assetManifest.length > 0 && (
                            <span>
                              {q.metadata.assetManifest.every((a) => a.objectKey)
                                ? 'Gambar sudah diunggah'
                                : 'Gambar belum diunggah'}
                            </span>
                          )}
                          <Badge variant={validation?.canImportDraft ? 'success' : 'warning'}>
                            {validation?.canImportDraft
                              ? report?.id
                                ? 'DRAFT tersimpan'
                                : 'Validasi lolos'
                              : 'Perlu validasi'}
                          </Badge>
                        </div>
                      </td>
                      <td>
                        <div className="excel-row-actions">
                          {' '}
                          {move && (
                            <div className="admin-content-actions">
                              <Button
                                variant="secondary"
                                disabled={
                                  disabled ||
                                  editing !== null ||
                                  questions[0]?.externalId === q.externalId
                                }
                                aria-label={`Naikkan soal ${q.externalId}`}
                                onClick={() => move(q.externalId, -1)}
                              >
                                ↑
                              </Button>
                              <Button
                                variant="secondary"
                                disabled={
                                  disabled ||
                                  editing !== null ||
                                  questions.at(-1)?.externalId === q.externalId
                                }
                                aria-label={`Turunkan soal ${q.externalId}`}
                                onClick={() => move(q.externalId, 1)}
                              >
                                ↓
                              </Button>
                            </div>
                          )}
                          <Button
                            variant="secondary"
                            disabled={disabled || editing !== null}
                            aria-label={`Edit soal ${q.externalId}`}
                            onClick={() => changeEditing(q.externalId)}
                          >
                            Edit soal
                          </Button>
                        </div>
                      </td>
                    </tr>
                    {editing === q.externalId && (
                      <tr>
                        <td colSpan={6}>
                          <QuestionEditor
                            question={q}
                            save={(updated) => {
                              edit(updated);
                              changeEditing(null);
                            }}
                            cancel={() => changeEditing(null)}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <AdminPagination
        {...questionPage.pagination}
        disabled={disabled || editing !== null}
        label="Halaman preview soal Excel"
      />
    </Card>
  );
}
