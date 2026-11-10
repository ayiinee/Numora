import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { PretestResult } from './pretest-screens';
import type { PretestResultDto } from './generated-types';

afterEach(cleanup);
const result: PretestResultDto = {
  attemptId: 'attempt',
  chapterId: 'chapter',
  chapterTitle: 'Bilangan',
  isDemo: false,
  score: 56.67,
  correctCount: 8,
  questionCount: 20,
  initialLevel: 2,
  mappingStatus: 'applied',
  unlockedLevels: [
    { id: 'level-1', title: 'Indikator 1 · Level 1' },
    { id: 'level-2', title: 'Indikator 1 · Level 2' },
  ],
};
it('shows persisted score, placement and complete level details without inferring a percent from correct answers', () => {
  const { container } = render(<PretestResult result={result} />);
  expect(screen.getByText('56,67')).toBeTruthy();
  expect(screen.getByText('Level 2', { exact: true })).toBeTruthy();
  expect(screen.getByText('8')).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Lanjut Drill' }).getAttribute('href')).toBe(
    '/student/learn/chapter',
  );
  expect(container.querySelector('details')?.open).toBe(false);
  expect(container.querySelectorAll('details li')).toHaveLength(2);
  expect(screen.getByRole('heading', { level: 2 }).textContent).toContain('Hasil Pretest Bilangan');
});
it('preserves zero and does not invent a placement when mapping is unavailable', () => {
  const { container } = render(
    <PretestResult
      result={{
        ...result,
        score: 0,
        correctCount: 0,
        mappingStatus: 'unavailable',
        initialLevel: null,
        unlockedLevels: [],
        isDemo: true,
      }}
    />,
  );
  expect(screen.getByText('Hasil tersimpan')).toBeTruthy();
  expect(screen.getByText('DEMO')).toBeTruthy();
  expect(screen.queryByText('Level 0')).toBeNull();
  expect(container.querySelector('details')).toBeNull();
  expect(container.querySelector('dd')?.textContent).toBe('0');
});
it('keeps unavailable scores distinct from zero', () => {
  render(<PretestResult result={{ ...result, score: null, correctCount: null }} />);
  expect(screen.getByText('Belum tersedia')).toBeTruthy();
});
