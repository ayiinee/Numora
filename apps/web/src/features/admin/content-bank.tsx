'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Button, Icon } from '@tka/ui';
import { AdminConfirmButton } from './admin-confirm-button';
import { classifyQuestion } from './content-package-api';
import { setContentStatus } from './content-api';
import { ContentText } from './content-payload';
import { questionFormat, contentStatusLabel, usageLabel } from './content-question-format';
import { field, type EditorProps } from './content-editor';
import type { AdminVersionDto } from './generated-types';

export type BankFilters = { usageType: string; status: string; chapterId: string; source: string };
export function ContentBank({
  data,
  token,
  busy,
  run,
  offset,
  onEdit,
  values,
  onApply,
  loading,
}: EditorProps & {
  offset: number;
  onEdit: (version: AdminVersionDto) => void;
  values: BankFilters;
  onApply: (values: BankFilters) => void;
  loading: boolean;
}) {
  const [draft, setDraft] = useState(values);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filterCount = Object.values(values).filter(Boolean).length;
  const change = (key: keyof BankFilters, value: string) =>
    setDraft((current) => ({ ...current, [key]: value }));
  const reset = () => {
    const empty = { usageType: '', status: '', chapterId: '', source: '' };
    setDraft(empty);
    onApply(empty);
  };
  return (
    <section className="assessment-bank" aria-label="Bank soal">
      <div className="assessment-list-heading">
        <div>
          <h3>Versi soal</h3>
          <span>Maksimal 5 soal per halaman</span>
        </div>
        <Button
          variant="secondary"
          type="button"
          aria-expanded={filtersOpen}
          aria-controls="assessment-bank-filters"
          onClick={() => setFiltersOpen((open) => !open)}
        >
          Filter soal{filterCount ? ` (${filterCount})` : ''}
        </Button>
      </div>
      <form
        id="assessment-bank-filters"
        hidden={!filtersOpen}
        className="assessment-bank-filters"
        aria-label="Filter bank soal"
        onSubmit={(event) => {
          event.preventDefault();
          onApply({ ...draft, source: draft.source.trim() });
        }}
      >
        <label>
          <span>Tujuan soal</span>
          <select
            aria-label="Tujuan soal"
            value={draft.usageType}
            disabled={busy}
            onChange={(e) => change('usageType', e.target.value)}
          >
            <option value="">Semua tujuan</option>
            <option value="UNCLASSIFIED">Belum diklasifikasikan</option>
            {['DRILL', 'PRETEST', 'TRYOUT'].map((value) => (
              <option key={value} value={value}>
                {usageLabel(value)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Status versi</span>
          <select
            aria-label="Status versi"
            value={draft.status}
            disabled={busy}
            onChange={(e) => change('status', e.target.value)}
          >
            <option value="">Semua status</option>
            {['DRAFT', 'READY', 'REVISION', 'ARCHIVED'].map((value) => (
              <option key={value} value={value}>
                {contentStatusLabel(value)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Materi soal</span>
          <select
            aria-label="Materi soal"
            value={draft.chapterId}
            disabled={busy}
            onChange={(e) => change('chapterId', e.target.value)}
          >
            <option value="">Semua bab</option>
            {data.curriculum.items
              .filter((c) => c.kind === 'CHAPTER')
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
        </label>
        <label>
          <span>Sumber soal</span>
          <input
            aria-label="Sumber soal"
            type="search"
            maxLength={240}
            value={draft.source}
            placeholder="Nama atau referensi sumber"
            disabled={busy}
            onChange={(e) => change('source', e.target.value)}
          />
        </label>
        <div className="assessment-filter-actions">
          <p>Filter berlaku setelah diterapkan.</p>
          <Button type="button" variant="secondary" disabled={busy} onClick={reset}>
            Reset filter
          </Button>
          <Button type="submit" disabled={busy || loading}>
            Terapkan filter
          </Button>
        </div>
      </form>
      {loading ? (
        <p className="assessment-empty" role="status">
          Memperbarui daftar soal...
        </p>
      ) : !data.versions.items.length ? (
        <div className="assessment-empty">
          <Icon name="search" />
          <h3>Tidak ada soal pada halaman ini</h3>
          <p>Coba pilihan filter lain atau reset untuk melihat daftar awal.</p>
          <Button variant="secondary" onClick={reset}>
            Reset filter
          </Button>
        </div>
      ) : (
        <ul className="monitoring-list assessment-question-list" aria-label="Daftar soal">
          {data.versions.items.map((v, index) => {
            const format = questionFormat(v.questionType);
            return (
              <li className="admin-content-row assessment-question-row" key={v.id}>
                <div className="assessment-question-meta">
                  <span className="assessment-question-number">Soal {offset + index + 1}</span>
                  <span>{format.label}</span>
                  <span>{usageLabel(v.usageType)}</span>
                  <span className="assessment-status" data-status={v.contentStatus}>
                    {contentStatusLabel(v.contentStatus)}
                  </span>
                  <span>Versi {v.versionNumber}</span>
                </div>
                <h3 className="assessment-question-stem">
                  <ContentText
                    value={
                      v.stem || 'Isi soal belum tersedia. Buka detail versi untuk memeriksa sumber.'
                    }
                  />
                </h3>
                <details className="assessment-question-reader" open={index === 0}>
                  <summary>Lihat pilihan &amp; pembahasan</summary>
                  <p className="assessment-question-instruction">{format.instruction}</p>
                  <h4>{format.kind === 'category' ? 'Pernyataan' : 'Pilihan jawaban'}</h4>
                  {v.options.length ? (
                    <ol className="assessment-options">
                      {v.options.map((option, i) => (
                        <li key={option.id}>
                          <span className="assessment-option-label">
                            {format.kind === 'single' ? String.fromCharCode(65 + i) : i + 1}
                          </span>
                          <div>
                            <ContentText value={option.text} />
                          </div>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p>Pilihan belum tersedia pada daftar. Periksa detail versi.</p>
                  )}
                  {v.answerOptionId && (
                    <p className="assessment-key-note">
                      Kunci jawaban:{' '}
                      <strong>
                        {v.options.findIndex((o) => o.id === v.answerOptionId) >= 0
                          ? String.fromCharCode(
                              65 + v.options.findIndex((o) => o.id === v.answerOptionId),
                            )
                          : v.answerOptionId}
                      </strong>
                    </p>
                  )}
                  <div className="assessment-explanation">
                    <h4>Pembahasan</h4>
                    <ContentText
                      value={
                        v.explanation ||
                        'Pembahasan belum tersedia pada daftar. Periksa detail versi.'
                      }
                    />
                  </div>
                  {!v.answerOptionId && (
                    <p className="assessment-reader-note">
                      Kunci lengkap dan kategori jawaban tersedia pada detail versi.
                    </p>
                  )}
                </details>
                <div className="assessment-question-footer">
                  <details className="assessment-source">
                    <summary>Sumber &amp; identitas</summary>
                    <dl>
                      <div>
                        <dt>Sumber</dt>
                        <dd>{v.sourceName ?? 'Belum tercatat'}</dd>
                      </div>
                      {v.sourceReference && (
                        <div>
                          <dt>Referensi</dt>
                          <dd>{v.sourceReference}</dd>
                        </div>
                      )}
                      {v.sourceFileName && (
                        <div>
                          <dt>File</dt>
                          <dd>{v.sourceFileName}</dd>
                        </div>
                      )}
                      <div>
                        <dt>Kode varian</dt>
                        <dd>{v.variantCode}</dd>
                      </div>
                      <div>
                        <dt>ID versi</dt>
                        <dd>{v.id}</dd>
                      </div>
                      <div>
                        <dt>Status keluarga</dt>
                        <dd>{contentStatusLabel(v.questionStatus)}</dd>
                      </div>
                      <div>
                        <dt>Reviewer</dt>
                        <dd>{v.reviewedByUserId ?? 'Belum ditinjau'}</dd>
                      </div>
                      {v.reviewedAt && (
                        <div>
                          <dt>Ditinjau (WIB)</dt>
                          <dd>
                            {new Date(v.reviewedAt).toLocaleString('id-ID', {
                              timeZone: 'Asia/Jakarta',
                            })}
                          </dd>
                        </div>
                      )}
                      {v.sourceQuestionId && (
                        <div>
                          <dt>Disalin dari keluarga</dt>
                          <dd>{v.sourceQuestionId}</dd>
                        </div>
                      )}
                    </dl>
                  </details>
                  <Link className="assessment-detail-link" href={`/admin/content/versions/${v.id}`}>
                    Detail, review &amp; kesiapan
                    <Icon name="chevron" width="16" height="16" />
                  </Link>
                </div>
                {!v.usageType && (
                  <details className="assessment-classify">
                    <summary>Klasifikasikan tujuan soal</summary>
                    <p>Tujuan ini bersifat permanen. Pastikan sesuai sebelum menyimpan.</p>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        const form = new FormData(e.currentTarget);
                        void run(() =>
                          classifyQuestion(token, v.questionId, {
                            usageType: field(form, 'usageType') as 'DRILL' | 'PRETEST' | 'TRYOUT',
                          }),
                        );
                      }}
                    >
                      <label>
                        Klasifikasi tujuan
                        <select name="usageType" required disabled={busy}>
                          <option value="">Pilih tujuan permanen</option>
                          {['DRILL', 'PRETEST', 'TRYOUT'].map((u) => (
                            <option key={u} value={u}>
                              {usageLabel(u)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <Button type="submit" disabled={busy}>
                        Simpan klasifikasi
                      </Button>
                    </form>
                  </details>
                )}
                {!v.imported && (
                  <div className="admin-content-actions assessment-row-actions">
                    {v.questionType === 'SINGLE_CHOICE' && (
                      <Button variant="secondary" disabled={busy} onClick={() => onEdit(v)}>
                        Buat revisi / varian
                      </Button>
                    )}
                    {v.questionStatus !== 'READY' && (
                      <Button
                        disabled={busy}
                        onClick={() =>
                          void run(() =>
                            setContentStatus(token, 'questions', v.questionId, 'READY'),
                          )
                        }
                      >
                        Atur keluarga READY
                      </Button>
                    )}
                    {v.contentStatus === 'DRAFT' && (
                      <AdminConfirmButton
                        disabled={busy}
                        description="Saya sudah meninjau isi, kunci jawaban, pembahasan, dan materi induk versi ini. Publikasikan sebagai READY?"
                        onConfirm={() =>
                          run(() => setContentStatus(token, 'versions', v.id, 'READY'))
                        }
                      >
                        Publikasikan versi
                      </AdminConfirmButton>
                    )}
                    {v.contentStatus !== 'ARCHIVED' && (
                      <AdminConfirmButton
                        variant="danger-outline"
                        disabled={busy}
                        description="Arsipkan versi ini untuk mencegah pengerjaan baru? Riwayat tetap disimpan."
                        onConfirm={() =>
                          run(() => setContentStatus(token, 'versions', v.id, 'ARCHIVED'))
                        }
                      >
                        Arsipkan versi
                      </AdminConfirmButton>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
