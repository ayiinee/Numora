import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ConfigService } from '@nestjs/config';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { describe, expect, it, vi } from 'vitest';
import { excelTemplate, parseExcel, ExcelImportService } from './excel-import.service';
import { ContentImportService } from './content-import.service';
import { ContentService } from './content.service';

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aBZkAAAAASUVORK5CYII=',
  'base64',
);
async function book() {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load((await excelTemplate({ items: [] })) as unknown as ExcelJS.Buffer);
  return workbook;
}
function fill(
  sheet: ExcelJS.Worksheet,
  row: number,
  overrides: Record<string, string | number> = {},
) {
  const data = {
    external_id: `TEST-${sheet.name}-${row}`,
    no: row,
    chapter_code: 'TEST-CH',
    subchapter_code: 'TEST-SC',
    competency_code: 'TEST-CP',
    source_level: 1,
    stem: 'TEST ONLY $1+1$',
    opt_A: 'Dua',
    opt_B: 'Tiga',
    statement_A: 'Dua',
    statement_B: 'Tiga',
    key_A: 'C1',
    key_B: 'C2',
    category_1: 'Benar',
    category_2: 'Salah',
    answer: sheet.name === 'MCMA' ? 'A,B' : 'A',
    explanation: 'TEST ONLY pembahasan',
    alt_stem: 'Gambar stem',
    alt_A: 'Gambar A',
    alt_explanation: 'Gambar pembahasan',
    ...overrides,
  };
  sheet.getRow(1).eachCell((cell, col) => {
    const value = data[cell.text as keyof typeof data];
    if (value !== undefined) sheet.getRow(row).getCell(col).value = value;
  });
}
const bytes = async (workbook: ExcelJS.Workbook) => Buffer.from(await workbook.xlsx.writeBuffer());
describe('Excel import at the trust boundary', { timeout: 20_000 }, () => {
  it('keeps all intake rows and native image bytes when metadata is blank or content needs correction', async () => {
    const workbook = await book();
    const sheet = workbook.getWorksheet('PG')!;
    fill(sheet, 2, {
      chapter_code: '',
      subchapter_code: '',
      competency_code: '',
      source_level: '',
      answer: 'Z',
    });
    const image = workbook.addImage({ buffer: png as unknown as ExcelJS.Buffer, extension: 'png' });
    let col = 0;
    sheet.getRow(1).eachCell((cell, i) => {
      if (cell.text === 'img_stem') col = i - 1;
    });
    sheet.addImage(image, { tl: { col, row: 1 }, ext: { width: 10, height: 10 } });
    const result = await parseExcel(await bytes(workbook), 'TEST_INTAKE', 'test', {
      id: 'test-upload',
      curriculum: { items: [] },
    });
    expect(result.envelope.questions).toHaveLength(1);
    expect(result.envelope.questions[0]!.metadata.sourceLevelNumber).toBeNull();
    expect(result.envelope.questions[0]!.metadata.sourceMaterial).toMatchObject({
      competency: '',
      level: '',
    });
    expect(result.media).toHaveLength(1);
    expect(Buffer.from(result.media[0]!.base64, 'base64')).toEqual(png);
    expect(result.issues.some((i) => i.code === 'INVALID_KEY')).toBe(true);
  });
  it.skipIf(!process.env.NUMORA_REAL_XLSX_DIR)(
    'reads the supplied academic workbooks without discarding unresolved metadata',
    async () => {
      for (const [file, count, images] of [
        ['TryOut.xlsx', 30, 5],
        ['NUMORA_Pretest_Aljabar_10_Soal_V3.xlsx', 10, 3],
      ] as const) {
        const result = await parseExcel(
          await readFile(resolve(process.env.NUMORA_REAL_XLSX_DIR!, file)),
          'TEST_REAL_SOURCE',
          'test',
          { id: 'test-real-source', curriculum: { items: [] } },
        );
        expect(result.envelope.questions).toHaveLength(count);
        expect(result.media).toHaveLength(images);
        expect(result.issues).toEqual([]);
        if (file === 'TryOut.xlsx')
          expect(
            result.envelope.questions.every(
              (q) =>
                q.metadata.sourceLevelNumber === null &&
                q.metadata.sourceMaterial?.competency === '',
            ),
          ).toBe(true);
        else
          expect(
            result.envelope.questions.every((q) => q.metadata.sourceMaterial?.chapter === 'CH-ALG'),
          ).toBe(true);
      }
    },
  );
  it('reads PG/MCMA/Category and floating pictures by native row/column despite gaps and fractions', async () => {
    const workbook = await book();
    const id = workbook.addImage({ buffer: png as unknown as ExcelJS.Buffer, extension: 'png' });
    for (const name of ['PG', 'MCMA', 'Kategori']) {
      const sheet = workbook.getWorksheet(name)!;
      fill(sheet, 2);
      fill(sheet, 5);
      let imageCol = 0;
      sheet.getRow(1).eachCell((cell, col) => {
        if (cell.text === 'img_stem') imageCol = col - 1;
      });
      sheet.addImage(id, { tl: { col: imageCol + 0.4, row: 4.7 }, ext: { width: 10, height: 10 } });
    }
    // Master and instructions must never become questions.
    workbook.getWorksheet('Panduan')!.addRow(['no', 'chapter_code']);
    const result = await parseExcel(await bytes(workbook), 'TEST', 'test-bucket');
    expect(result.issues).toEqual([]);
    expect(result.envelope.questions).toHaveLength(6);
    expect(result.media).toHaveLength(3);
    for (const question of result.envelope.questions) {
      expect(question.metadata.assetManifest.length).toBe(
        question.externalId.endsWith('-5') ? 1 : 0,
      );
      expect(question.metadata.sourceRowNumber).toBe(question.externalId.endsWith('-5') ? 5 : 2);
      expect(question.metadata.assetManifest[0]?.objectKey ?? null).toBeNull();
    }
    expect(result.envelope.questions.find((q) => q.type === 'CATEGORY')!.answer).toEqual({
      categoryByStatementId: { A: 'C1', B: 'C2' },
    });
    expect(
      result.envelope.questions.find((q) => q.type === 'MULTIPLE_CHOICE_MULTIPLE_ANSWER')!.answer,
    ).toEqual({ optionIds: ['A', 'B'] });
  });
  it('reads independently generated native Place in Cell and floating fixtures for all three types', async () => {
    const result = await parseExcel(
      await readFile(resolve('src/modules/content/fixtures/excel-v3-mixed.xlsx')),
      'TEST',
      'test-bucket',
    );
    expect(result.issues).toEqual([]);
    expect(result.envelope.questions).toHaveLength(6);
    expect(result.media).toHaveLength(18);
    for (const q of result.envelope.questions) {
      expect(q.metadata.assetManifest.map((a) => [a.placement, a.itemId, a.altText])).toEqual([
        ['STEM', null, 'stem'],
        [q.type === 'CATEGORY' ? 'STATEMENT' : 'OPTION', 'A', 'option'],
        ['EXPLANATION', null, 'explanation'],
      ]);
      for (const a of q.metadata.assetManifest)
        expect(
          Buffer.from(
            result.media.find((m) => m.externalId === q.externalId && m.assetId === a.assetId)!
              .base64,
            'base64',
          ),
        ).toEqual(png);
    }
  });
  it('keeps identities stable across filename/row changes and namespaces separate for media', async () => {
    const workbook = await book();
    const sheet = workbook.getWorksheet('PG')!;
    fill(sheet, 2, { external_id: '', no: 9 });
    const id = workbook.addImage({ buffer: png as unknown as ExcelJS.Buffer, extension: 'png' });
    sheet.addImage(id, { tl: { col: 8, row: 1 }, ext: { width: 10, height: 10 } });
    const original = await parseExcel(await bytes(workbook), 'TEST', 'b');
    sheet.getRow(6).values = sheet.getRow(2).values;
    sheet.getRow(2).values = [];
    const moved = await parseExcel(await bytes(workbook), 'TEST', 'b');
    expect(moved.envelope.questions[0]!.externalId).toBe(
      original.envelope.questions[0]!.externalId,
    );
    const other = await parseExcel(await bytes(workbook), 'OTHER', 'b');
    expect(other.envelope.questions[0]!.externalId).toBe(
      original.envelope.questions[0]!.externalId,
    );
    const originalOther = await parseExcel(
      await bytes(
        await (async () => {
          const w = await book();
          fill(w.getWorksheet('PG')!, 2);
          w.getWorksheet('PG')!.addImage(
            w.addImage({ buffer: png as unknown as ExcelJS.Buffer, extension: 'png' }),
            { tl: { col: 8, row: 1 }, ext: { width: 10, height: 10 } },
          );
          return w;
        })(),
      ),
      'OTHER',
      'b',
    );
    expect(originalOther.envelope.questions[0]!.metadata.assetManifest[0]!.assetId).not.toBe(
      original.envelope.questions[0]!.metadata.assetManifest[0]!.assetId,
    );
  });
  it('reports empty text, unknown keys, duplicates and misplaced images instead of fixing data silently', async () => {
    const workbook = await book();
    const sheet = workbook.getWorksheet('PG')!;
    fill(sheet, 2, { stem: '', answer: 'Z' });
    fill(sheet, 3, { external_id: 'TEST-PG-2' });
    sheet.addImage(
      workbook.addImage({ buffer: png as unknown as ExcelJS.Buffer, extension: 'png' }),
      { tl: { col: 8, row: 7 }, ext: { width: 10, height: 10 } },
    );
    const result = await parseExcel(await bytes(workbook), 'TEST', 'b');
    expect(result.issues.map((i) => i.code)).toEqual(
      expect.arrayContaining([
        'TEXT_REQUIRED',
        'INVALID_KEY',
        'DUPLICATE_EXTERNAL_ID',
        'IMAGE_UNMAPPED',
      ]),
    );
    expect(result.issues.find((i) => i.code === 'TEXT_REQUIRED')!.cell).toBe('H2');
  });
  it('accepts legacy aliases/instruction rows and a stem-anchored image without parsing example sheets', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Template');
    sheet.addRow([
      'No',
      'Chapter Code',
      'Subchapter Code',
      'Competency Code',
      'Level',
      'Stem (Soal)',
      'Option A',
      'Option B',
      'Answer',
      'Explanation',
      'Difficulty',
      'alt_stem',
    ]);
    sheet.addRow([
      'Isi nomor soal',
      'Kode bab',
      'Kode subbab',
      'Kode kompetensi',
      'Level (1-5)',
      'Ketik soal',
    ]);
    sheet.addRow([
      7,
      'TEST-CH',
      'TEST-SC',
      'TEST-CP',
      2,
      'TEST ONLY soal',
      'Dua',
      'Tiga',
      'A',
      'TEST pembahasan',
      'Easy',
      'TEST legacy gambar',
    ]);
    workbook.addWorksheet('Contoh').addRow(sheet.getRow(3).values);
    sheet.addImage(
      workbook.addImage({ buffer: png as unknown as ExcelJS.Buffer, extension: 'png' }),
      { tl: { col: 5.4, row: 2.7 }, ext: { width: 10, height: 10 } },
    );
    const result = await parseExcel(await bytes(workbook), 'TEST', 'b');
    expect(result.issues).toEqual([]);
    expect(result.envelope.questions).toHaveLength(1);
    expect(result.envelope.questions[0]).toMatchObject({
      externalId: 'TEST-CH-TEST-SC-TEST-CP-L2-Q7',
      difficulty: 'EASY',
    });
    expect(result.envelope.questions[0]!.metadata.assetManifest[0]!.placement).toBe('STEM');
  });
  it('rejects .xls, excess questions, expanded ZIP bombs and external IMAGE formulas', async () => {
    await expect(parseExcel(Buffer.from('xls'), 'TEST', 'b')).rejects.toThrow();
    const workbook = await book();
    const sheet = workbook.getWorksheet('PG')!;
    for (let row = 2; row <= 102; row++) fill(sheet, row);
    await expect(parseExcel(await bytes(workbook), 'TEST', 'b')).rejects.toThrow();
    const zip = new JSZip();
    zip.file('xl/workbook.xml', '<workbook/>');
    zip.file('padding', Buffer.alloc(51 * 1024 * 1024));
    await expect(
      parseExcel(
        await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }),
        'TEST',
        'b',
      ),
    ).rejects.toThrow();
    const formulas = await book();
    fill(formulas.getWorksheet('PG')!, 2);
    formulas.getWorksheet('PG')!.getCell('I2').value = {
      formula: 'IMAGE("https://example.invalid/image")',
    };
    expect(
      (await parseExcel(await bytes(formulas), 'TEST', 'b')).issues.some(
        (i) => i.code === 'FORMULA_UNSUPPORTED',
      ),
    ).toBe(true);
  });
  it('validates through the existing importer and never writes during parsing', async () => {
    const importer = {
      enabled: vi.fn(),
      validate: vi.fn().mockResolvedValue({
        id: null,
        sourceNamespace: 'TEST',
        canImportDraft: true,
        items: [{ externalId: 'TEST-PG-2', blockers: ['MEDIA_NOT_READY'] }],
      }),
    };
    const workbook = await book();
    fill(workbook.getWorksheet('PG')!, 2);
    const service = new ExcelImportService(
      importer as unknown as ContentImportService,
      {} as ContentService,
      new ConfigService(),
    );
    expect((await service.parse(await bytes(workbook), 'TEST')).issues).toEqual([]);
    expect(importer.validate).toHaveBeenCalledOnce();
    importer.validate.mockClear();
    fill(workbook.getWorksheet('PG')!, 2, { answer: 'Z' });
    await service.parse(await bytes(workbook), 'TEST');
    expect(importer.validate).not.toHaveBeenCalled();
  });
});
