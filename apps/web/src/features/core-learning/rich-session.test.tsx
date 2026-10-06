import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { AssessmentSession } from './assessment-session';
import type { DrillQuestionDto, SavedAnswerDto } from './generated-types';
afterEach(cleanup);
const q: DrillQuestionDto = {
  questionInstanceId: 'test',
  stem: 'TEST',
  selectedOptionId: null,
  options: [
    { id: 'A', text: 'Alpha' },
    { id: 'B', text: 'Beta' },
  ],
  richStem: { text: 'TEST' },
  richOptions: [
    { id: 'A', content: { text: 'Alpha' } },
    { id: 'B', content: { text: 'Beta' } },
  ],
  type: 'MULTIPLE_CHOICE_MULTIPLE_ANSWER',
  answer: null,
};
function mount(
  question: DrillQuestionDto,
  save: (id: string, answer: SavedAnswerDto['answer']) => Promise<SavedAnswerDto>,
) {
  render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
        })
      }
    >
      <AssessmentSession
        questions={[question]}
        title="TEST"
        submitLabel="Kirim"
        confirmMessage={() => 'TEST'}
        onSave={vi.fn()}
        onSaveTyped={save}
        onSubmit={vi.fn()}
        onSubmitted={vi.fn()}
      />
    </QueryClientProvider>,
  );
}
it('saves MCMA through the generated answer contract and clears selection only after acknowledgement', async () => {
  const save = vi.fn(async (id, answer) => ({
    questionInstanceId: id,
    selectedOptionId: null,
    answer,
  }));
  mount(q, save);
  fireEvent.click(screen.getByRole('checkbox', { name: /Alpha/ }));
  await waitFor(() => expect(save).toHaveBeenCalledWith('test', { optionIds: ['A'] }));
  await waitFor(() => expect(screen.queryByText('Belum tersimpan')).toBeNull());
  fireEvent.click(screen.getByRole('checkbox', { name: /Beta/ }));
  await waitFor(() => expect(save).toHaveBeenLastCalledWith('test', { optionIds: ['A', 'B'] }));
  await waitFor(() =>
    expect((screen.getByRole('checkbox', { name: /Beta/ }) as HTMLInputElement).disabled).toBe(
      false,
    ),
  );
  fireEvent.click(screen.getByText('Kosongkan jawaban'));
  await waitFor(() => expect(save).toHaveBeenLastCalledWith('test', null));
});
it('retains a category selection when the server rejects the save and offers an explicit retry', async () => {
  const category = {
    ...q,
    type: 'CATEGORY' as const,
    categories: [
      { id: 'Y', text: 'Ya' },
      { id: 'N', text: 'Tidak' },
    ],
  };
  const save = vi
    .fn()
    .mockRejectedValueOnce(new Error('TEST failure'))
    .mockImplementation(async (id, answer) => ({
      questionInstanceId: id,
      selectedOptionId: null,
      answer,
    }));
  mount(category, save);
  fireEvent.click(screen.getAllByRole('radio', { name: 'Ya' })[0]!);
  await screen.findByText('TEST failure');
  expect((screen.getAllByRole('radio', { name: 'Ya' })[0] as HTMLInputElement).checked).toBe(true);
  fireEvent.click(screen.getByText('Coba simpan lagi'));
  await waitFor(() =>
    expect(save).toHaveBeenLastCalledWith('test', { categoryByStatementId: { A: 'Y' } }),
  );
  await waitFor(() => expect(screen.queryByText('TEST failure')).toBeNull());
});
