import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { AssessmentExplanation, QuestionReviewDetail } from './assessment-review';
import { RewardSummary } from './reward-summary';
import { TryoutReleasedResult } from './tryout-presentation';
import { HomeActivity } from './dashboard-presentation';
import type { ReviewedQuestionDto } from './generated-types';

afterEach(cleanup);
const question: ReviewedQuestionDto = {
  questionInstanceId: 'TEST ONLY q',
  type: 'MULTIPLE_CHOICE_MULTIPLE_ANSWER',
  stem: 'TEST ONLY MCMA',
  options: [
    { id: 'A', text: 'Satu' },
    { id: 'B', text: 'Dua' },
  ],
  selectedOptionId: null,
  correctOptionId: null,
  answer: { optionIds: ['A'] },
  answerKey: { optionIds: ['A', 'B'] },
  reviewStatus: 'partial',
  awardedPoints: 1.5,
  maximumPoints: 3,
  correctEquivalent: null,
  explanation: 'TEST ONLY pembahasan',
  optionReview: [
    { optionId: 'A', selected: true, isKey: true },
    { optionId: 'B', selected: false, isKey: true },
  ],
};
it('renders a dedicated read-only question layout with explanation underneath and navigates', () => {
  const view = render(
    <AssessmentExplanation
      questions={[question, { ...question, questionInstanceId: 'q2', stem: 'Soal kedua' }]}
      title="Pembahasan Drill"
      resultHref="/student/drill/a/result"
    />,
  );
  expect(screen.getByText('Sebagian benar')).toBeTruthy();
  expect(view.container.querySelector('.practice-question .practice-choices')).toBeTruthy();
  expect(
    view.container.querySelector('.practice-question .drill-review__explanation'),
  ).toBeTruthy();
  expect(screen.getAllByRole('checkbox').every((input) => input.matches(':disabled'))).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Berikutnya' }));
  expect(screen.getByRole('heading', { name: 'Soal kedua' })).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Kembali ke hasil' }).getAttribute('href')).toBe(
    '/student/drill/a/result',
  );
});
it.each(['correct', 'partial', 'incorrect', 'unanswered'] as const)(
  'uses server review status %s',
  (status) => {
    render(<QuestionReviewDetail question={{ ...question, reviewStatus: status }} />);
    expect(
      screen.getByText(
        {
          correct: 'Benar',
          partial: 'Sebagian benar',
          incorrect: 'Salah',
          unanswered: 'Tidak dijawab',
        }[status],
      ),
    ).toBeTruthy();
  },
);
it('shows partial Category responses and per-statement key matching', () => {
  render(
    <QuestionReviewDetail
      question={{
        ...question,
        type: 'CATEGORY',
        categories: [
          { id: 'Y', text: 'Ya' },
          { id: 'N', text: 'Tidak' },
        ],
        answer: { categoryByStatementId: { A: 'Y' } },
        answerKey: { categoryByStatementId: { A: 'Y', B: 'N' } },
        statementReview: [
          { statementId: 'A', status: 'correct' },
          { statementId: 'B', status: 'unanswered' },
        ],
      }}
    />,
  );
  expect(screen.getAllByText('Tidak dijawab', { selector: 'p' })).toBeTruthy();
  expect(screen.getByText('Benar', { selector: 'p' })).toBeTruthy();
});
it('keeps XP prominent and distinguishes XP fallback from result method', () => {
  const view = render(
    <RewardSummary
      kind="tryout"
      xp={200}
      detail={{
        calculationMode: 'FULL_CORRECT_FALLBACK',
        fullCorrectCount: 20,
        partialCorrectEquivalent: null,
        correctEquivalent: 20,
        fallbackReason: null,
      }}
    />,
  );
  expect(screen.getByText('200 XP')).toBeTruthy();
  expect(view.container.querySelector('details')?.open).toBe(false);
  fireEvent.click(screen.getByText('Lihat rincian XP'));
  expect(screen.getByText(/Ini terpisah dari metode nilai TryOut/)).toBeTruthy();
});
it('uses Info nilai and an explanation link rather than exposing review on the result', () => {
  const view = render(
    <TryoutReleasedResult
      result={{
        attemptId: 'a',
        packageTitle: 'TEST',
        score: 50,
        correctCount: 1,
        questionCount: 2,
        xp: 0,
        resultMethod: 'STANDARD',
        resultMethodReason: 'Batas pemrosesan batch terlewati.',
        explanation: [question],
      }}
    />,
  );
  expect(screen.getByText('0 XP')).toBeTruthy();
  expect(view.container.querySelector('details')?.open).toBe(false);
  expect(screen.getByText('Info nilai')).toBeTruthy();
  expect(screen.queryByText('TEST ONLY pembahasan')).toBeNull();
  expect(screen.queryByRole('navigation', { name: 'Matriks jawaban' })).toBeNull();
  expect(screen.getByRole('link', { name: 'Lihat pembahasan' }).getAttribute('href')).toBe(
    '/student/tryout/a/explanation',
  );
});
it('shows zero XP/stars and waiting TryOut XP on the dashboard', () => {
  render(
    <HomeActivity
      item={{
        attemptId: 'a',
        activity: 'tryout',
        title: 'TEST',
        isDemo: false,
        submittedAt: '2026-10-06T00:00:00Z',
        resultState: 'waitingIrt',
        score: null,
        xpState: 'ready',
        xp: 0,
        starsState: 'notApplicable',
      }}
    />,
  );
  expect(screen.getByText('0 XP')).toBeTruthy();
  expect(screen.getByText('Menunggu hasil')).toBeTruthy();
});
