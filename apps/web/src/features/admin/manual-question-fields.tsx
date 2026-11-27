'use client';
export function ManualQuestionFields({
  json,
  disabled,
  change,
  section = 'all',
}: {
  section?: 'all' | 'content' | 'metadata';
  json: string;
  disabled: boolean;
  change: (json: string) => void;
}) {
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(json);
  } catch {
    return <p>JSON belum valid. Perbaiki sintaks pada Data lengkap JSON untuk membuka formulir.</p>;
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const object = (value: unknown): Record<string, unknown> =>
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const text = (value: unknown) => (typeof value === 'string' ? value : '');
  const update = (values: Record<string, unknown>) =>
    change(JSON.stringify({ ...payload, ...values }, null, 2));
  const options = Array.isArray(payload.options) ? payload.options.map(object) : [];
  const answer = object(payload.answer);
  return (
    <fieldset disabled={disabled} className="excel-question-editor">
      <legend>{section === 'metadata' ? 'Metadata soal' : 'Isi soal'}</legend>
      {section !== 'metadata' && (
        <>
          {(['stem', 'explanation'] as const).map((key) => {
            const content = object(payload[key]);
            const value =
              typeof payload[key] === 'string' ? text(payload[key]) : text(content.text);
            return (
              <label key={key}>
                {key === 'stem' ? 'Teks soal' : 'Pembahasan'}
                {!value.trim() && <small> — Wajib dilengkapi</small>}
                <textarea
                  required
                  maxLength={8000}
                  value={value}
                  onChange={(e) => update({ [key]: { ...content, text: e.target.value } })}
                />
              </label>
            );
          })}
          {options.map((option, index) => {
            const content = object(option.content);
            return (
              <label key={index}>
                Pilihan/pernyataan {text(option.id)}
                <textarea
                  required
                  value={text(content.text)}
                  onChange={(e) =>
                    update({
                      options: options.map((o, i) =>
                        i === index ? { ...o, content: { ...content, text: e.target.value } } : o,
                      ),
                    })
                  }
                />
              </label>
            );
          })}
          {payload.type === 'SINGLE_CHOICE' && (
            <label>
              Kunci jawaban
              <select
                required
                value={text(answer.optionId)}
                onChange={(e) => update({ answer: { ...answer, optionId: e.target.value } })}
              >
                <option value="">Pilih jawaban benar</option>
                {options.map((o) => (
                  <option key={text(o.id)} value={text(o.id)}>
                    {text(o.id)}
                  </option>
                ))}
              </select>
            </label>
          )}
          {payload.type === 'MULTIPLE_CHOICE_MULTIPLE_ANSWER' && (
            <fieldset>
              <legend>Jawaban benar (pilih semua yang sesuai)</legend>
              {options.map((o) => {
                const id = text(o.id),
                  ids = Array.isArray(answer.optionIds) ? answer.optionIds : [];
                return (
                  <label key={id}>
                    <input
                      type="checkbox"
                      checked={ids.includes(id)}
                      onChange={(e) =>
                        update({
                          answer: {
                            ...answer,
                            optionIds: e.target.checked
                              ? [...ids, id]
                              : ids.filter((v) => v !== id),
                          },
                        })
                      }
                    />
                    {id}
                  </label>
                );
              })}
            </fieldset>
          )}
          {payload.type === 'CATEGORY' && (
            <fieldset>
              <legend>Kunci kategori tiap pernyataan</legend>
              {options.map((o) => {
                const id = text(o.id),
                  mapping = object(answer.categoryByStatementId);
                const metadata = object(payload.metadata);
                const categories = Array.isArray(metadata.categories)
                  ? metadata.categories.map(object)
                  : [];
                return (
                  <label key={id}>
                    Pernyataan {id}
                    <select
                      required
                      value={text(mapping[id])}
                      onChange={(e) =>
                        update({
                          answer: {
                            ...answer,
                            categoryByStatementId: { ...mapping, [id]: e.target.value },
                          },
                        })
                      }
                    >
                      <option value="">Pilih kategori</option>
                      {categories.map((c) => (
                        <option key={text(c.id)} value={text(c.id)}>
                          {text(c.label) || text(c.id)}
                        </option>
                      ))}
                    </select>
                  </label>
                );
              })}
            </fieldset>
          )}
        </>
      )}
      {section !== 'content' && (
        <>
          <label>
            Kesulitan
            <select
              required={section === 'all'}
              value={text(payload.difficulty)}
              onChange={(e) => update({ difficulty: e.target.value })}
            >
              <option value="">Pilih kesulitan</option>
              <option value="EASY">Mudah</option>
              <option value="MEDIUM">Sedang</option>
              <option value="HARD">Sulit</option>
            </select>
          </label>
          {(['chapterCode', 'subchapterCode', 'competencyCode'] as const).map((key) => (
            <label key={key}>
              {
                {
                  chapterCode: 'Kode bab',
                  subchapterCode: 'Kode subbab',
                  competencyCode: 'Kode indikator',
                }[key]
              }
              <input
                value={text(payload[key])}
                onChange={(e) => update({ [key]: e.target.value || null })}
              />
            </label>
          ))}
          <p>
            Perubahan kode materi harus sesuai struktur materi existing. Jika server meminta
            identitas baru, revisi ini tidak boleh mengubah keluarga soal lama.
          </p>
        </>
      )}
    </fieldset>
  );
}
