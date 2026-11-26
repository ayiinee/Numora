import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { QuestionChoices } from './question-choices';
afterEach(cleanup);

it('selects a single answer by clicking a scrollable formula and respects disabled choices', () => {
  const onChange = vi.fn();
  const renderChoice = (text: string) => <span role="region" tabIndex={0}>{text}</span>;
  const fixture = (disabled = false) => (
    <QuestionChoices
      assessment
      kind="SINGLE_CHOICE"
      name="answer"
      options={[{ id: 'A', text: 'Rumus jawaban' }]}
      renderContent={renderChoice}
      value={null}
      onChange={onChange}
      disabled={disabled}
    />
  );
  const view = render(fixture());
  fireEvent.click(screen.getByText('Rumus jawaban'));
  expect(onChange).toHaveBeenCalledExactlyOnceWith('A');

  view.rerender(fixture(true));
  fireEvent.click(screen.getByText('Rumus jawaban'));
  expect(onChange).toHaveBeenCalledTimes(1);
});

it('changes multiple selections independently and preserves option order', () => {
  function Fixture() {
    const [value, setValue] = useState<string | string[] | Record<string, string> | null>(null);
    return (
      <>
        <QuestionChoices
          kind="MULTIPLE_CHOICE_MULTIPLE_ANSWER"
          name="TEST mcma"
          options={[
            { id: 'A', text: 'Dua' },
            { id: 'B', text: 'Tiga' },
          ]}
          value={value}
          onChange={setValue}
        />
        <output>{JSON.stringify(value)}</output>
      </>
    );
  }
  render(<Fixture />);
  fireEvent.click(screen.getByRole('checkbox', { name: /B\./ }));
  fireEvent.click(screen.getByRole('checkbox', { name: /A\./ }));
  expect(screen.getByRole('status').textContent).toBe('["A","B"]');
  fireEvent.click(screen.getByRole('checkbox', { name: /A\./ }));
  expect(screen.getByRole('status').textContent).toBe('["B"]');
});
it('keeps each category statement independent and locks all controls after finalization', () => {
  function Fixture({ disabled = false }: { disabled?: boolean }) {
    const [value, setValue] = useState<string | string[] | Record<string, string> | null>(null);
    return (
      <>
        <QuestionChoices
          kind="CATEGORY"
          name="TEST category"
          options={[]}
          statements={[
            { id: 's1', text: 'Pernyataan satu' },
            { id: 's2', text: 'Pernyataan dua' },
          ]}
          categories={[
            { id: 'true', text: 'Benar' },
            { id: 'false', text: 'Salah' },
          ]}
          value={value}
          onChange={setValue}
          disabled={disabled}
        />
        <output>{JSON.stringify(value)}</output>
      </>
    );
  }
  const view = render(<Fixture />);
  fireEvent.click(screen.getAllByRole('radio', { name: 'Benar' })[0]!);
  fireEvent.click(screen.getAllByRole('radio', { name: 'Salah' })[1]!);
  expect(screen.getByRole('status').textContent).toBe('{"s1":"true","s2":"false"}');
  view.rerender(<Fixture disabled />);
  expect(screen.getAllByRole('group')[0]!.hasAttribute('disabled')).toBe(true);
});
