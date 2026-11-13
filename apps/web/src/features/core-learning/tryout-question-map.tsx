import { Button, Icon } from '@tka/ui';

const states = {
  empty: { label: 'Kosong', mark: '○' },
  incomplete: { label: 'Kategori belum lengkap', mark: '½' },
  saved: { label: 'Tersimpan', mark: '✓' },
  saving: { label: 'Menyimpan', mark: '…' },
  failed: { label: 'Gagal simpan', mark: '!' },
} as const;

export type TryoutQuestionState = keyof typeof states;

export function TryoutQuestionMap({
  items,
  current,
  onSelect,
  canSubmit,
  onSubmit,
}: {
  items: { state: TryoutQuestionState; flagged: boolean }[];
  current: number;
  onSelect: (index: number) => void;
  canSubmit: boolean;
  onSubmit: () => void;
}) {
  return (
    <div className="tryout-question-map">
      <nav aria-label="Navigasi soal" className="tryout-question-map__grid">
        {items.map(({ state, flagged }, index) => (
          <button
            type="button"
            key={index}
            data-state={state}
            aria-current={current === index ? 'step' : undefined}
            aria-label={`Soal ${index + 1}, ${states[state].label.toLowerCase()}${flagged ? ', ragu-ragu' : ''}`}
            onClick={() => onSelect(index)}
          >
            <span>{index + 1}</span>
            <span aria-hidden="true">
              {states[state].mark}
              {flagged && ' ⚑'}
            </span>
          </button>
        ))}
      </nav>
      <ul className="tryout-question-map__legend" aria-label="Legenda peta soal">
        {Object.values(states).map(({ label, mark }) => (
          <li key={label}>
            <span aria-hidden="true">{mark} </span>
            {label}
          </li>
        ))}
        <li>
          <span aria-hidden="true">⚑ </span>Ragu-ragu
        </li>
      </ul>
      <Button fullWidth disabled={!canSubmit} onClick={onSubmit}>
        <Icon name="check" width={16} height={16} />
        Kumpulkan jawaban
      </Button>
    </div>
  );
}
