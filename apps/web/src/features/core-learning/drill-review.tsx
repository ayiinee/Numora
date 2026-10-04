'use client';

import { Card, Icon } from '@tka/ui';
import type { ReactNode } from 'react';
import type { DrillResult } from './types';
import { MathText } from './ui';

export function AnswerMatrix({
  questions,
  selected,
  onSelect,
}: {
  questions: Pick<
    DrillResult['questions'][number],
    'questionInstanceId' | 'selectedOptionId' | 'correctOptionId'
  >[];
  selected: number;
  onSelect: (index: number) => void;
}) {
  return (
    <nav className="answer-matrix" aria-label="Matriks jawaban">
      {questions.map((question, index) => {
        const correct = question.selectedOptionId === question.correctOptionId;
        return (
          <button
            key={question.questionInstanceId}
            className={correct ? 'answer-matrix__correct' : 'answer-matrix__incorrect'}
            aria-current={selected === index ? 'step' : undefined}
            aria-label={`Pembahasan soal ${index + 1}, ${correct ? 'benar' : 'salah'}`}
            onClick={() => onSelect(index)}
          >
            <strong>#{index + 1}</strong>
            <Icon name={correct ? 'check' : 'close'} width={16} height={16} />
          </button>
        );
      })}
    </nav>
  );
}

export function DrillReview({
  result,
  selected,
  onSelect,
  report,
}: {
  result: DrillResult;
  selected: number;
  onSelect: (index: number) => void;
  report: ReactNode;
}) {
  const question = result.questions[selected];
  return (
    <Card className="drill-review">
      <div className="drill-review__title">
        <h2>Matriks Jawaban</h2>
        <span>{result.questionCount} Soal</span>
      </div>
      <p className="drill-review__notice">
        <Icon name="info" width={16} height={16} />
        Pembahasan mengikuti versi soal yang digunakan saat latihan.
      </p>
      <AnswerMatrix questions={result.questions} selected={selected} onSelect={onSelect} />
      {question ? (
        <article className="drill-review__question">
          <div className="drill-review__question-heading">
            <span>Soal #{selected + 1}</span>
            {report}
          </div>
          <h3>
            <MathText value={question.stem} />
          </h3>
          <div
            className={`drill-review__answer ${question.selectedOptionId === question.correctOptionId ? 'drill-review__answer--correct' : 'drill-review__answer--wrong'}`}
          >
            <Icon
              name={question.selectedOptionId === question.correctOptionId ? 'check' : 'close'}
              width={18}
              height={18}
            />
            <span>
              <strong>Jawabanmu: </strong>
              {question.selectedOptionId ? (
                <>
                  {question.selectedOptionId}.{' '}
                  <MathText
                    value={
                      question.options.find((option) => option.id === question.selectedOptionId)
                        ?.text ?? ''
                    }
                  />
                </>
              ) : (
                'Tidak dijawab'
              )}
            </span>
          </div>
          <div className="drill-review__answer drill-review__answer--correct">
            <Icon name="check" width={18} height={18} />
            <span>
              <strong>Jawaban benar: </strong>
              {question.correctOptionId}.{' '}
              <MathText
                value={
                  question.options.find((option) => option.id === question.correctOptionId)?.text ??
                  ''
                }
              />
            </span>
          </div>
          <div className="drill-review__explanation">
            <strong>
              <Icon name="info" width={18} height={18} />
              Pembahasan Numora
            </strong>
            <p>
              <MathText value={question.explanation} />
            </p>
          </div>
        </article>
      ) : (
        <p>Pembahasan soal belum tersedia.</p>
      )}
    </Card>
  );
}
