/** Synthetic QA content, not an approved Curriculum blueprint or PGK rubric. */
export const mockTopics = ['numbers', 'algebra', 'geometry', 'statistics'] as const;
export type MockTopic = (typeof mockTopics)[number];
type Option = { id: string; content: { text: string } };
export type MockQuestion = {
  code: string;
  topic: MockTopic;
  questionType: 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE_MULTIPLE_ANSWER' | 'CATEGORY';
  stem: { text: string };
  optionsOrStatements:
    Option[] | { options: Option[]; categories: { id: string; label: string }[] };
  answerKey:
    | { optionId: string }
    | { optionIds: string[] }
    | { categoryByStatementId: Record<string, string> };
  explanation: { text: string };
};
const ids = ['A', 'B', 'C', 'D'];
const options = (labels: string[]) => labels.map((text, i) => ({ id: ids[i]!, content: { text } }));
function pg(topic: MockTopic, i: number): MockQuestion {
  const n = Math.floor(i / 5) + 2;
  let stem: string, correct: string, explanation: string;
  let distractors: string[];
  const numeric = (value: number) => [String(value + 1), String(value + 2), String(value + 3)];
  switch (topic) {
    case 'numbers': {
      const cases = [
        [`Hasil ${3 * n} − ${n} adalah ...`, 2 * n, `${3 * n} − ${n} = ${2 * n}.`],
        [
          `Hasil ${n}/8 + 3/8 adalah ...`,
          `${n + 3}/8`,
          `Penyebut sama, sehingga pembilang dijumlahkan: (${n} + 3)/8 = ${n + 3}/8.`,
        ],
        [`20% dari ${50 * n} adalah ...`, 10 * n, `20/100 × ${50 * n} = ${10 * n}.`],
        [
          `Nilai 2 pangkat ${n} adalah ...`,
          2 ** n,
          `Mengalikan ${n} faktor 2 menghasilkan ${2 ** n}.`,
        ],
        [
          `Perbandingan bola merah dan biru 2 : 3. Total ${5 * n} bola. Banyak bola merah adalah ...`,
          2 * n,
          `Bagian merah 2/5 dari total: 2/5 × ${5 * n} = ${2 * n}.`,
        ],
      ] as const;
      const c = cases[i % 5]!;
      [stem, correct, explanation] = [c[0], String(c[1]), c[2]];
      distractors =
        i % 5 === 1 ? [`${n + 4}/8`, `${n + 5}/8`, `${n + 6}/8`] : numeric(Number(correct));
      break;
    }
    case 'algebra': {
      const cases = [
        [
          `Akar positif persamaan x² − ${n * n} = 0 adalah ...`,
          n,
          `x² = ${n * n}; akar positifnya ${n}.`,
        ],
        [
          `Nilai minimum y = (x − ${n})² + 2 adalah ...`,
          2,
          `Kuadrat paling kecil 0, saat x = ${n}; nilai minimum y adalah 2.`,
        ],
        [
          `Agar x² + ${2 * n}x + c = (x + ${n})², nilai c adalah ...`,
          n * n,
          `(x + ${n})² = x² + ${2 * n}x + ${n * n}.`,
        ],
        [
          `Jika f(x) = x² + ${n}x + 1, nilai f(2) adalah ...`,
          5 + 2 * n,
          `f(2) = 4 + ${2 * n} + 1 = ${5 + 2 * n}.`,
        ],
        [
          `Jumlah kedua akar x² − ${2 * n + 1}x + ${n * (n + 1)} = 0 adalah ...`,
          2 * n + 1,
          `Persamaan berfaktor (x − ${n})(x − ${n + 1}); jumlah akar ${2 * n + 1}.`,
        ],
      ] as const;
      const c = cases[i % 5]!;
      [stem, correct, explanation] = [c[0], String(c[1]), c[2]];
      distractors = numeric(Number(correct));
      break;
    }
    case 'geometry': {
      const cases = [
        [
          `Segitiga siku-siku memiliki sisi tegak ${3 * n} cm dan ${4 * n} cm. Sisi miringnya ... cm.`,
          5 * n,
          `√(${3 * n}² + ${4 * n}²) = ${5 * n} cm.`,
        ],
        [
          `Kubus bersisi ${n} cm memiliki volume ... cm³.`,
          n ** 3,
          `Volume kubus = sisi³ = ${n}³ = ${n ** 3} cm³.`,
        ],
        [
          `Keliling persegi panjang dengan panjang ${n + 3} cm dan lebar ${n} cm adalah ... cm.`,
          4 * n + 6,
          `2 × (${n + 3} + ${n}) = ${4 * n + 6} cm.`,
        ],
        [
          `Segitiga memiliki alas ${2 * n} cm dan tinggi ${n + 1} cm. Luasnya ... cm².`,
          n * (n + 1),
          `½ × ${2 * n} × ${n + 1} = ${n * (n + 1)} cm².`,
        ],
        [
          `Tabung berjari-jari 7 cm dan tinggi ${n} cm. Dengan π = 22/7, volumenya ... cm³.`,
          154 * n,
          `(22/7) × 7² × ${n} = ${154 * n} cm³.`,
        ],
      ] as const;
      const c = cases[i % 5]!;
      [stem, correct, explanation] = [c[0], String(c[1]), c[2]];
      distractors = numeric(Number(correct));
      break;
    }
    case 'statistics': {
      const cases = [
        [
          `Rata-rata data ${n}, ${n + 2}, ${n + 4} adalah ...`,
          n + 2,
          `Jumlah ${3 * n + 6} dibagi 3 = ${n + 2}.`,
        ],
        [
          `Median data terurut ${n}, ${n + 1}, ${n + 3}, ${n + 5}, ${n + 7} adalah ...`,
          n + 3,
          `Lima data memiliki nilai tengah pada urutan ketiga: ${n + 3}.`,
        ],
        [
          `Modus data ${n}, ${n + 1}, ${n}, ${n + 2}, ${n} adalah ...`,
          n,
          `${n} muncul tiga kali, paling sering.`,
        ],
        [
          `Satu kartu diambil acak dari kartu bernomor 1 sampai ${2 * n}. Peluang nomor genap adalah ...`,
          '1/2',
          `Ada ${n} nomor genap dari ${2 * n} kartu: ${n}/${2 * n} = 1/2.`,
        ],
        [
          `Data terkecil ${n} dan terbesar ${5 * n}. Jangkauannya adalah ...`,
          4 * n,
          `${5 * n} − ${n} = ${4 * n}.`,
        ],
      ] as const;
      const c = cases[i % 5]!;
      [stem, correct, explanation] = [c[0], String(c[1]), c[2]];
      distractors = i % 5 === 3 ? ['1/6', '1/3', '2/3'] : numeric(Number(correct));
    }
  }
  const labels = [...distractors];
  labels.splice(i % 4, 0, correct);
  return {
    code: `PRETEST-${topic}-${String(i + 1).padStart(2, '0')}`,
    topic,
    questionType: 'SINGLE_CHOICE',
    stem: { text: `DEMO · ${stem}` },
    optionsOrStatements: options(labels),
    answerKey: { optionId: ids[i % 4]! },
    explanation: { text: `DEMO QA · ${explanation}` },
  };
}
function statements(topic: MockTopic, n: number): [string, boolean][] {
  switch (topic) {
    case 'numbers':
      return [
        [`${2 * n} adalah bilangan genap.`, true],
        [`${2 * n + 1} adalah bilangan genap.`, false],
        [`20% dari ${50 * n} adalah ${10 * n}.`, true],
        [`${n}/8 + 3/8 = ${n + 3}/16.`, false],
      ];
    case 'algebra':
      return [
        [`${n} merupakan akar x² − ${n * n} = 0.`, true],
        [`−${n} merupakan akar x² − ${n * n} = 0.`, true],
        [`Nilai minimum (x − ${n})² + 2 adalah −2.`, false],
        [`(x + ${n})² = x² + ${n}x + ${n * n}.`, false],
      ];
    case 'geometry':
      return [
        [`Kubus dengan sisi ${n} cm memiliki volume ${n ** 3} cm³.`, true],
        [`Kubus dengan sisi ${n} cm memiliki luas permukaan ${6 * n ** 2} cm².`, true],
        [
          `Segitiga dengan alas ${2 * n} cm dan tinggi ${n} cm memiliki luas ${2 * n ** 2} cm².`,
          false,
        ],
        [
          `Segitiga siku-siku bersisi tegak ${3 * n} dan ${4 * n} memiliki sisi miring ${7 * n}.`,
          false,
        ],
      ];
    case 'statistics':
      return [
        [`Rata-rata ${n}, ${n + 2}, ${n + 4} adalah ${n + 2}.`, true],
        [`Median ${n}, ${n + 2}, ${n + 4} adalah ${n + 4}.`, false],
        [`Jangkauan ${n}, ${n + 2}, ${n + 4} adalah 4.`, true],
        ['Peluang muncul angka genap pada dadu adil bersisi enam adalah 1/3.', false],
      ];
  }
}
export function buildAssessmentMockBank() {
  const pretest = Object.fromEntries(
    mockTopics.map((topic) => [topic, Array.from({ length: 20 }, (_, i) => pg(topic, i))]),
  ) as Record<MockTopic, MockQuestion[]>;
  const tryout = Array.from({ length: 30 }, (_, i): MockQuestion => {
    const topic = mockTopics[i % 4]!;
    const code = `TRYOUT-${String(i + 1).padStart(2, '0')}`;
    if (i % 3 === 0) return { ...pg(topic, Math.floor(i / 3)), code };
    const entries = statements(topic, Math.floor(i / 4) + 2);
    // Rotate positions so the key is not always A/C.
    const offset = Math.floor(i / 3) % 4;
    const rotated = entries.slice(offset).concat(entries.slice(0, offset));
    const category = i % 3 === 2;
    return {
      code,
      topic,
      questionType: category ? 'CATEGORY' : 'MULTIPLE_CHOICE_MULTIPLE_ANSWER',
      stem: {
        text: category
          ? 'DEMO · Tentukan Benar/Salah untuk setiap pernyataan.'
          : 'DEMO · Pilih semua pernyataan yang benar (lebih dari satu jawaban).',
      },
      optionsOrStatements: {
        options: options(rotated.map(([text]) => text)),
        categories: category
          ? [
              { id: 'Y', label: 'Benar' },
              { id: 'N', label: 'Salah' },
            ]
          : [],
      },
      answerKey: category
        ? {
            categoryByStatementId: Object.fromEntries(
              rotated.map(([, truth], j) => [ids[j]!, truth ? 'Y' : 'N']),
            ),
          }
        : { optionIds: rotated.flatMap(([, truth], j) => (truth ? [ids[j]!] : [])) },
      explanation: {
        text: `DEMO QA · ${rotated.map(([text, truth], j) => `${ids[j]}: ${truth ? 'Benar' : 'Salah'} — ${text}`).join(' ')} Gunakan operasi bilangan, faktorisasi, rumus geometri, atau definisi statistik untuk memeriksa pernyataan. Kunci ini bukan rubrik skor parsial PGK.`,
      },
    };
  });
  return {
    demoOnly: true as const,
    version: 1,
    approvedCurriculum: false as const,
    pgkNumericRubric: null,
    pretest,
    tryout,
  };
}
