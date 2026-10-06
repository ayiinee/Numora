'use client';
import { MathText } from './ui';
import type { ReactNode } from 'react';

/** Presentation-only controls; the caller maps generated answers and the server grades. */
export function QuestionChoices({
  kind,
  name,
  options,
  value,
  onChange,
  disabled = false,
  statements = [],
  categories = [],
  selectedHint,
  renderContent,
}: {
  kind: 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE_MULTIPLE_ANSWER' | 'CATEGORY';
  name: string;
  selectedHint?: string;
  renderContent?: (text: string, itemId: string) => ReactNode;
  options: { id: string; text: string }[];
  value: string | string[] | Record<string, string> | null;
  onChange: (value: string | string[] | Record<string, string> | null) => void;
  disabled?: boolean;
  statements?: { id: string; text: string }[];
  categories?: { id: string; text: string }[];
}) {
  if (kind === 'CATEGORY') {
    const answers =
      value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {};
    return (
      <fieldset disabled={disabled} className="practice-categories">
        <legend className="font-semibold">Pilih kategori setiap pernyataan</legend>
        {statements.map((statement, index) => (
          <fieldset key={statement.id} className="practice-statement">
            <legend className="sr-only">
              <MathText value={statement.text} />
            </legend>
            <div className="practice-statement__copy" aria-hidden="true">
              <span>{index + 1}</span>
              {renderContent ? (
                renderContent(statement.text, statement.id)
              ) : (
                <MathText value={statement.text} />
              )}
            </div>
            <div className="practice-statement__options">
              {categories.map((category) => (
                <label key={category.id} className="practice-category-option">
                  <input
                    type="radio"
                    name={`${name}-${statement.id}`}
                    value={category.id}
                    checked={answers[statement.id] === category.id}
                    onChange={() => onChange({ ...answers, [statement.id]: category.id })}
                  />
                  <MathText value={category.text} />
                </label>
              ))}
            </div>
          </fieldset>
        ))}
      </fieldset>
    );
  }
  const multiple = kind === 'MULTIPLE_CHOICE_MULTIPLE_ANSWER';
  const selected = Array.isArray(value) ? value : [];
  return (
    <fieldset
      disabled={disabled}
      className={`practice-choices${multiple ? ' practice-choices--multiple' : ''}`}
    >
      <legend className={multiple ? 'practice-choice-instruction' : 'sr-only'}>
        {multiple ? 'Pilih semua jawaban yang sesuai' : 'Pilih satu jawaban'}
      </legend>
      {options.map((option, index) => (
        <label key={option.id} className="practice-option">
          <input
            type={multiple ? 'checkbox' : 'radio'}
            name={name}
            value={option.id}
            checked={multiple ? selected.includes(option.id) : value === option.id}
            onChange={() =>
              onChange(
                multiple
                  ? options
                      .filter((item) =>
                        item.id === option.id
                          ? !selected.includes(item.id)
                          : selected.includes(item.id),
                      )
                      .map((item) => item.id)
                  : option.id,
              )
            }
          />
          <span className="practice-option__letter">
            {option.id.length === 1 ? option.id : String.fromCharCode(65 + index)}
            <span className="sr-only">.</span>
          </span>
          <span className="practice-option__text">
            {renderContent ? (
              renderContent(option.text, option.id)
            ) : (
              <MathText value={option.text} />
            )}
            {value === option.id && selectedHint && <small>{selectedHint}</small>}
          </span>
          {!multiple && (
            <span className="practice-option__indicator" aria-hidden="true">
              ✓
            </span>
          )}
        </label>
      ))}
    </fieldset>
  );
}
