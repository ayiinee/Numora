import assert from 'node:assert/strict';
import { test } from 'node:test';
import { reviseContent } from './revise-tryout-curriculum.mjs';

test('the four editorial changes preserve question format and recompute the answer when needed', () => {
  const rent = reviseContent(10, {
    stem: {
      text: 'Klaim I: range adalah (27.000, 27.000, 31.000, 35.000). Klaim II: Rp39.000,00.',
    },
    answerKey: { optionId: 'D' },
    explanation: { text: 'Old explanation' },
  });
  assert.match(rent.stem.text, /\{23\.000, 27\.000, 31\.000, 35\.000\}/);
  assert.equal(rent.answerKey.optionId, 'B');
  assert.match(rent.explanation.text, /5 jam/);
  assert.throws(() => reviseContent(10, rent), /SOURCE_TEXT_MISMATCH/);

  const spin = reviseContent(16, {
    stem: { text: 'Pemutar fair diputar satu kali.' },
    answerKey: { optionId: 'A' },
  });
  assert.equal(spin.stem.text, 'Sebuah pemutar seimbang diputar satu kali.');
  assert.equal(spin.answerKey.optionId, 'A');

  const frequency = reviseContent(17, {
    stem: {
      text: 'Frekuensi waktu belajar harian: 1 jam=5 siswa; 2 jam=10; 3 jam=3; 4 jam=5; 5 jam=7. Efektif berarti waktu belajar.',
    },
    answerKey: { optionId: 'C' },
  });
  assert.deepEqual(
    frequency.stem.text.split('\n').filter((line) => line.startsWith('\u2022')),
    [
      '\u2022 1 jam = 5 siswa',
      '\u2022 2 jam = 10 siswa',
      '\u2022 3 jam = 3 siswa',
      '\u2022 4 jam = 5 siswa',
      '\u2022 5 jam = 7 siswa',
    ],
  );
  assert.equal(frequency.answerKey.optionId, 'C');

  const answerKey = { categoryByStatementId: { A: 'C1', B: 'C2', C: 'C1' } };
  const algebra = reviseContent(27, {
    questionType: 'CATEGORY',
    stem: { text: 'P=4(x+3)\u22123(x\u22124) dan Q=1x+24.' },
    answerKey,
    explanation: { text: 'P=1x+24=Q.' },
  });
  assert.equal(algebra.questionType, 'CATEGORY');
  assert.deepEqual(algebra.answerKey, answerKey);
  assert.match(algebra.stem.text, /P=4\(x\+3\)\u22123\(x\u22124\) dan Q=x\+24/);
  assert.equal(algebra.explanation.text, 'P=x+24=Q.');
});
