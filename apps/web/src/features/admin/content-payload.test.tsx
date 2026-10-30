import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { ContentPayload } from './content-payload';

afterEach(cleanup);
it.each([
  ['SINGLE_CHOICE', { optionId: 'A' }, 'A'],
  ['MCMA', { optionIds: ['A', 'C'] }, '1, C'],
  ['CATEGORY', { categoryByStatementId: { S1: 'TRUE' } }, 'Benar'],
])('renders %s keys from the pinned payload without assuming scoring', (type, answer, expected) => {
  render(
    <ContentPayload
      payload={{
        type,
        stem: { text: 'Soal versi historis' },
        options: [{ id: 'A', content: { text: 'Pilihan pertama' } }],
        answer,
        explanation: { text: 'Pembahasan historis' },
        metadata: { categories: [{ id: 'TRUE', label: 'Benar' }] },
      }}
    />,
  );
  expect(screen.getByText('Soal versi historis')).toBeTruthy();
  expect(screen.getByText('Pilihan pertama')).toBeTruthy();
  expect(
    within(
      screen.getByText('Kunci jawaban · hanya untuk review Admin').closest('section')!,
    ).getByText(expected as string),
  ).toBeTruthy();
  expect(screen.getByText('Pembahasan historis')).toBeTruthy();
  expect(document.querySelector('pre')).toBeNull();
  const source = screen.getByText('Data sumber (JSON)').closest('details')!;
  source.open = true;
  fireEvent(source, new Event('toggle'));
  expect(source.querySelector('pre')?.textContent).toContain('Soal versi historis');
});
it('handles legacy and incomplete content without unsafe HTML or fetching private media', () => {
  render(
    <ContentPayload
      payload={{ stem: '<script>private</script> [[asset:image-1]]', options: null }}
    />,
  );
  expect(screen.getByText(/Gambar image-1/)).toBeTruthy();
  expect(screen.getByText('Kunci belum tersedia.')).toBeTruthy();
  expect(document.querySelector('script')).toBeNull();
  expect(document.querySelector('img')).toBeNull();
});

it('maps long imported identifiers to the same statement numbers without changing mathematics or keys', () => {
  render(
    <ContentPayload
      payload={{
        type: 'MULTIPLE_CHOICE_MULTIPLE_ANSWER',
        stem: 'Choisissez les réponses correctes.',
        options: [
          { id: 'source-statement-083125b756f4107d143ade49f3ccd824-1', text: '$60\\div(-6)=6$' },
          { id: 'source-statement-083125b756f4107d143ade49f3ccd824-2', text: '$8\\times(-2)=-16$' },
        ],
        answer: { optionIds: ['source-statement-083125b756f4107d143ade49f3ccd824-2'] },
      }}
    />,
  );
  const keys = screen.getByText('Kunci jawaban · hanya untuk review Admin').closest('section')!;
  expect(within(keys).getByText('2')).toBeTruthy();
  expect(screen.getAllByText('Jawaban benar')).toHaveLength(1);
  expect(document.querySelectorAll('.assessment-options > li')).toHaveLength(2);
  expect(document.querySelector('.katex-mathml')?.textContent).toContain('=6');
  expect(document.querySelector('.assessment-options')?.textContent).not.toContain(
    'source-statement',
  );
});

it('keeps an unknown answer identifier visible instead of inventing an option mapping', () => {
  render(
    <ContentPayload
      payload={{
        type: 'SINGLE_CHOICE',
        options: [{ id: 'source-A', text: 'Pertama' }],
        answer: { optionId: 'missing-source-key' },
      }}
    />,
  );
  expect(screen.getByText('missing-source-key')).toBeTruthy();
  expect(screen.queryByText('Jawaban benar')).toBeNull();
});
