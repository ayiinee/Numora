'use client';
import { MathText } from './ui';
import { useId, type ReactNode } from 'react';
import { optionLabel } from './assessment-answers';

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
  assessment = false,
}: {
  kind: 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE_MULTIPLE_ANSWER' | 'CATEGORY';
  name: string;
  selectedHint?: string;
  renderContent?: (text: string, itemId: string) => ReactNode;
  options: { id: string; text: string }[];
  value: string | string[] | Record<string, string> | null;
  onChange: (value: string | string[] | Record<string, string> | null) => void;
  disabled?: boolean;
  assessment?: boolean;
  statements?: { id: string; text: string }[];
  categories?: { id: string; text: string }[];
}) {
  const id = useId();
  if (kind === 'CATEGORY') {
    const answers =
      value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {};
    return (
      <fieldset disabled={disabled} className="practice-categories">
        <legend className="font-semibold">Pilih kategori setiap pernyataan</legend>
        {statements.map((statement, index) => {
          const statementId = id + '-statement-' + index;
          return (
            <fieldset
              key={statement.id}
              className="practice-statement"
              aria-labelledby={assessment ? statementId : undefined}
            >
              {!assessment && (
                <legend className="sr-only">
                  <MathText value={statement.text} />
                </legend>
              )}
              <div className="practice-statement__copy" aria-hidden={assessment ? undefined : true}>
                <span aria-hidden="true">{index + 1}</span>
                <div id={assessment ? statementId : undefined}>
                  {renderContent ? (
                    renderContent(statement.text, statement.id)
                  ) : (
                    <MathText value={statement.text} />
                  )}
                </div>
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
          );
        })}
      </fieldset>
    );
  }
  const multiple = kind === 'MULTIPLE_CHOICE_MULTIPLE_ANSWER';
  const selected = Array.isArray(value) ? value : [];
  const nestedControls = multiple
    ? 'input, button, a, [tabindex]'
    : 'input, button, a, [tabindex]:not([role="region"])';
  return (
    <fieldset
      disabled={disabled}
      className={`practice-choices${multiple ? ' practice-choices--multiple' : ''}`}
    >
      <legend className={multiple ? 'practice-choice-instruction' : 'sr-only'}>
        {multiple ? 'Pilih semua jawaban yang sesuai' : 'Pilih satu jawaban'}
      </legend>
      {options.map((option, index) => {
        const letterId = id + '-letter-' + index;
        const textId = id + '-choice-' + index;
        const choice = (
          <>
            <input
              type={multiple ? 'checkbox' : 'radio'}
              name={name}
              value={option.id}
              aria-labelledby={assessment ? letterId + ' ' + textId : undefined}
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
            <span className="practice-option__letter" id={assessment ? letterId : undefined}>
              {optionLabel(option.id, index)}
              <span className="sr-only">.</span>
            </span>
            <span className="practice-option__text" id={assessment ? textId : undefined}>
              {renderContent ? (
                renderContent(option.text, option.id)
              ) : (
                <MathText value={option.text} />
              )}
              {value === option.id && selectedHint && <small>{selectedHint}</small>}
            </span>
          </>
        );
        return assessment ? (
          <div
            key={option.id}
            className="practice-option"
            onClick={(event) => {
              if (
                !(event.target instanceof Element) ||
                event.target.closest(nestedControls) ||
                window.getSelection()?.toString()
              )
                return;
              const input = event.currentTarget.querySelector('input');
              if (!input?.matches(':enabled')) return;
              input.focus({ preventScroll: true });
              input.click();
            }}
          >
            {choice}
          </div>
        ) : (
          <label key={option.id} className="practice-option">
            {choice}
          </label>
        );
      })}
    </fieldset>
  );
}
