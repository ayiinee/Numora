'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { QuestionEditor } from './question-editor';
import type { Question, QuestionStatus } from './types';

type Props = {
  questions: Question[];
  setQuestions: React.Dispatch<React.SetStateAction<Question[]>>;
  hidden: boolean;
};

export function QuestionBankSection({ questions, setQuestions, hidden }: Props) {
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [editing, setEditing] = useState<Question | null>(null);
  const [notice, setNotice] = useState('');

  const visibleQuestions = questions.filter((question) => {
    const matchesQuery = `${question.code} ${question.title} ${question.chapter} ${question.subchapter}`
      .toLowerCase()
      .includes(query.toLowerCase());
    return matchesQuery && (statusFilter === 'All' || question.status === statusFilter);
  });

  function saveQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    const form = new FormData(event.currentTarget);
    const updatedQuestion: Question = {
      ...editing,
      title: String(form.get('title')).trim(),
      chapter: String(form.get('chapter')).trim(),
      subchapter: String(form.get('subchapter')).trim(),
      type: form.get('type') === 'PGK' ? 'PGK' : 'PG',
      level: Number(form.get('level')),
      status: editing.status === 'Archived' ? 'Archived' : 'Draft',
      updated: '28 Sep 2026',
    };
    if (!updatedQuestion.title || !updatedQuestion.chapter || !updatedQuestion.subchapter) return;
    setQuestions((current) => {
      if (editing.id === 'new') {
        return [
          {
            ...updatedQuestion,
            id: crypto.randomUUID(),
            code: `NUM-${String(current.length + 1).padStart(4, '0')}`,
          },
          ...current,
        ];
      }
      if (editing.status === 'Ready') {
        const nextVersion = current.filter((question) => question.code.startsWith(`${editing.code}-V`)).length + 2;
        return [
          { ...updatedQuestion, id: crypto.randomUUID(), code: `${editing.code}-V${nextVersion}` },
          ...current,
        ];
      }
      return current.map((question) => question.id === editing.id ? updatedQuestion : question);
    });
    setNotice('Simulasi perubahan di browser. Data akan kembali seperti semula saat halaman dimuat ulang.');
    setEditing(null);
  }

  function setQuestionStatus(question: Question, status: QuestionStatus) {
    setQuestions((current) => current.map((item) => item.id === question.id ? { ...item, status } : item));
    setNotice('Simulasi perubahan status di browser. Tidak ada perubahan pada bank soal sebenarnya.');
  }

  return (
    <div className="admin-content" hidden={hidden}>
      <div className="page-heading">
        <div>
          <p className="eyebrow">PRATINJAU DESAIN <span>·</span> DATA CONTOH</p>
          <h1>Bank soal</h1>
          <p className="page-subtitle">Simulasi tampilan bank soal. Tidak terhubung ke API atau penyimpanan.</p>
        </div>
        <div className="heading-actions">
          <Link className="button button-secondary" href="/admin/content">Kelola konten nyata <span aria-hidden="true">↗</span></Link>
          <button
            className="button button-primary add-question"
            onClick={() => setEditing({ id: 'new', code: 'NUM-NEW', title: '', chapter: '', subchapter: '', type: 'PG', level: 1, updated: '28 Sep 2026', status: 'Draft' })}
          >
            <span aria-hidden="true">＋</span> Simulasi buat soal
          </button>
        </div>
      </div>

      <div className="metric-grid" aria-label="Ringkasan bank soal">
        <div className="metric"><span>Total soal</span><strong>{questions.length.toString().padStart(2, '0')}</strong><small>Seluruh versi aktif</small><span className="metric-mark">▤</span></div>
        <div className="metric"><span>Siap digunakan</span><strong>{questions.filter((question) => question.status === 'Ready').length.toString().padStart(2, '0')}</strong><small><span className="metric-positive">●</span> Tervalidasi</small><span className="metric-mark mint">✓</span></div>
        <div className="metric"><span>Perlu ditinjau</span><strong>{questions.filter((question) => question.status === 'Draft').length.toString().padStart(2, '0')}</strong><small>Menunggu validasi</small><span className="metric-mark amber">◷</span></div>
        <div className="metric metric-note"><span>Status data</span><strong className="metric-note-title">Contoh lokal</strong><small>Tidak tersimpan di server</small><span className="metric-mark mint">⌁</span></div>
      </div>

      <section className="content-section" aria-labelledby="question-list-title">
        <div className="section-heading">
          <div><h2 id="question-list-title">Semua soal</h2><span>{visibleQuestions.length} item ditampilkan</span></div>
          <button className="quiet-button" onClick={() => { setQuery(''); setStatusFilter('All'); }}>Reset filter <span aria-hidden="true">↺</span></button>
        </div>
        <div className="table-toolbar">
          <label className="search-box">
            <span aria-hidden="true">⌕</span>
            <input aria-label="Cari soal" placeholder="Cari judul, kode, atau materi..." value={query} onChange={(event) => setQuery(event.target.value)} />
            <kbd>⌘ K</kbd>
          </label>
          <label className="filter-select">
            <span>Status</span>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="All">Semua status</option><option value="Ready">Siap digunakan</option><option value="Draft">Draf</option><option value="Archived">Diarsipkan</option>
            </select>
          </label>
        </div>
        {notice && <div className="notice" role="status"><span>{notice}</span><button aria-label="Tutup notifikasi" onClick={() => setNotice('')}>×</button></div>}
        <div className="question-table-wrap">
          <table className="question-table">
            <thead><tr><th>SOAL</th><th>MATERI</th><th>TIPE</th><th>LEVEL</th><th>STATUS</th><th>DIUBAH</th><th><span className="sr-only">Aksi</span></th></tr></thead>
            <tbody>
              {visibleQuestions.map((question) => (
                <tr key={question.id}>
                  <td><div className="question-name"><span className="question-glyph">{question.type === 'PG' ? 'x²' : '▦'}</span><span><b>{question.title}</b><small>{question.code}</small></span></div></td>
                  <td><span className="subject-name">{question.chapter}</span><small className="subject-sub">{question.subchapter}</small></td>
                  <td><span className="type-pill">{question.type}</span></td>
                  <td><span className="level-label">L{question.level}</span></td>
                  <td><span className={`status-pill status-${question.status.toLowerCase()}`}><span />{question.status === 'Ready' ? 'Siap digunakan' : question.status === 'Draft' ? 'Draf' : 'Diarsipkan'}</span></td>
                  <td className="date-cell">{question.updated}</td>
                  <td><div className="row-actions">
                    <button title="Edit soal" aria-label={`Edit ${question.title}`} onClick={() => setEditing(question)}>↗</button>
                    <button
                      title={question.status === 'Archived' ? 'Pulihkan sebagai draf' : 'Arsipkan soal'}
                      aria-label={question.status === 'Archived' ? `Pulihkan ${question.title}` : `Arsipkan ${question.title}`}
                      onClick={() => setQuestionStatus(question, question.status === 'Archived' ? 'Draft' : 'Archived')}
                    >{question.status === 'Archived' ? '↶' : '···'}</button>
                  </div></td>
                </tr>
              ))}
              {visibleQuestions.length === 0 && <tr><td colSpan={7}><div className="empty-state"><span>⌕</span><b>Soal tidak ditemukan</b><small>Coba kata kunci atau status yang berbeda.</small></div></td></tr>}
            </tbody>
          </table>
        </div>
        <div className="table-footer">
          <span>Menampilkan <b>{visibleQuestions.length}</b> dari <b>{questions.length}</b> soal</span>
          <div><button disabled aria-label="Halaman sebelumnya">←</button><span>1</span><button disabled aria-label="Halaman berikutnya">→</button></div>
        </div>
      </section>
      <p className="data-caption"><span aria-hidden="true">⌁</span> Semua aksi di halaman ini hanya simulasi desain. Untuk sekolah dan token Guru yang nyata, buka <Link href="/admin/schools">panel Admin</Link>.</p>
      {editing && <QuestionEditor question={editing} onClose={() => setEditing(null)} onSave={saveQuestion} />}
    </div>
  );
}
