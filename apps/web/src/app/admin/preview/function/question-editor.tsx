import type { Question } from './types';

export function QuestionEditor({
  question,
  onClose,
  onSave,
}: {
  question: Question;
  onClose: () => void;
  onSave: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="question-modal" role="dialog" aria-modal="true" aria-labelledby="editor-title">
        <div className="modal-heading">
          <div>
            <p className="eyebrow">SIMULASI · {question.id === 'new' ? 'KONTEN BARU' : question.code}</p>
            <h2 id="editor-title">{question.id === 'new' ? 'Buat soal' : 'Edit soal'}</h2>
          </div>
          <button className="modal-close" aria-label="Tutup editor" onClick={onClose}>×</button>
        </div>
        <form onSubmit={onSave}>
          <label htmlFor="question-title">Judul soal</label>
          <input id="question-title" name="title" defaultValue={question.title} required placeholder="Contoh: Operasi pecahan campuran" />
          <div className="form-row">
            <div>
              <label htmlFor="question-chapter">Bab</label>
              <input id="question-chapter" name="chapter" defaultValue={question.chapter} required placeholder="Bilangan" />
            </div>
            <div>
              <label htmlFor="question-subchapter">Subbab</label>
              <input id="question-subchapter" name="subchapter" defaultValue={question.subchapter} required placeholder="Pecahan" />
            </div>
          </div>
          <div className="form-row">
            <div>
              <label htmlFor="question-type">Tipe soal</label>
              <select id="question-type" name="type" defaultValue={question.type}>
                <option value="PG">Pilihan ganda (PG)</option>
                <option value="PGK">Pilihan ganda kompleks (PGK)</option>
              </select>
            </div>
            <div>
              <label htmlFor="question-level">Level</label>
              <select id="question-level" name="level" defaultValue={question.level}>
                {[1, 2, 3, 4, 5].map((level) => <option key={level} value={level}>Level {level}</option>)}
              </select>
            </div>
          </div>
          <div className="version-callout">
            <span>⌁</span>
            <p>
              <b>Hanya simulasi di browser.</b> Form ini belum memuat isi soal, opsi, kunci,
              pembahasan, atau versi konten di server.
            </p>
          </div>
          <div className="modal-actions">
            <button type="button" className="button button-secondary" onClick={onClose}>Batal</button>
            <button type="submit" className="button button-primary">Terapkan simulasi <span aria-hidden="true">↗</span></button>
          </div>
        </form>
      </section>
    </div>
  );
}
