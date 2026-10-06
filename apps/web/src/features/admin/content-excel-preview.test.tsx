import { useState } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ContentExcelPreview } from './content-excel-preview';
import type { ExcelParseDto } from './generated-types';

afterEach(cleanup);

it('pages five Excel questions while retaining selections and protecting an open edit', () => {
  const excel: ExcelParseDto = {
    envelope: {
      schemaVersion: 2,
      sourceNamespace: 'TEST ONLY',
      questions: Array.from({ length: 6 }, (_, n) => ({
        externalId: `TEST-${n}`,
        type: 'SINGLE_CHOICE',
        chapterCode: 'TEST',
        subchapterCode: 'TEST',
        competencyCode: 'TEST',
        difficulty: null,
        stem: { text: `Soal TEST ${n}` },
        explanation: { text: 'Pembahasan TEST' },
        options: [
          { id: 'A', content: { text: 'Dua' } },
          { id: 'B', content: { text: 'Tiga' } },
        ],
        answer: { optionId: 'A' },
        metadata: {
          sourceLevelNumber: 1,
          sourceSheet: 'PG',
          sourceRowNumber: n + 2,
          assetManifest: [],
        },
      })),
    },
    media: [],
    issues: [],
    report: null,
  };
  function Preview() {
    const [selected, select] = useState(new Set(excel.envelope.questions.map((q) => q.externalId)));
    return (
      <ContentExcelPreview
        excel={excel}
        selected={selected}
        select={select}
        report={null}
        disabled={false}
        edit={vi.fn()}
        retry={vi.fn()}
        editingChanged={vi.fn()}
      />
    );
  }
  render(<Preview />);
  expect(screen.getAllByRole('button', { name: /Edit soal TEST-/ })).toHaveLength(5);
  fireEvent.click(screen.getByLabelText('Pilih soal TEST-0'));
  const nav = screen.getByRole('navigation', { name: 'Halaman preview soal Excel' });
  fireEvent.click(within(nav).getByRole('button', { name: 'Berikutnya' }));
  expect(screen.getAllByRole('button', { name: /Edit soal TEST-/ })).toHaveLength(1);
  expect((screen.getByLabelText('Pilih soal TEST-5') as HTMLInputElement).checked).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Edit soal TEST-5' }));
  expect(
    (within(nav).getByRole('button', { name: 'Sebelumnya' }) as HTMLButtonElement).disabled,
  ).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Batal edit' }));
  fireEvent.click(within(nav).getByRole('button', { name: 'Sebelumnya' }));
  expect((screen.getByLabelText('Pilih soal TEST-0') as HTMLInputElement).checked).toBe(false);
  expect(screen.getByText('5 dari 6 soal dipilih')).toBeTruthy();
});
