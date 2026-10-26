import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { ContentPayload } from './content-payload';

afterEach(cleanup);
it.each([
  ['SINGLE_CHOICE', { optionId: 'A' }, 'A'],
  ['MCMA', { optionIds: ['A', 'C'] }, 'A, C'],
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
