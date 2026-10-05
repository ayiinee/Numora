import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import ExcelJS from 'exceljs';
import type { ContentAsset, ContentKind, RichContent } from '@tka/database';
import { ContentImportService } from './content-import.service';
import { ContentService } from './content.service';
import type { AdminCurriculumDto } from './content.dto';
import type { ExcelParseDto, ExcelQuestionDto } from './excel-import.dto';
import {
  descendants,
  excelError,
  excelParts,
  relationships,
  sheetImages,
  xml,
} from './excel-images';
import { structuralErrors } from './content-import.validation';
import { matchesImageSignature } from './r2-media.storage';

const kinds: Record<string, ContentKind> = {
  PG: 'SINGLE_CHOICE',
  MCMA: 'MULTIPLE_CHOICE_MULTIPLE_ANSWER',
  Kategori: 'CATEGORY',
  Template: 'SINGLE_CHOICE',
  Soal: 'SINGLE_CHOICE',
  'Soal dengan Gambar': 'SINGLE_CHOICE',
};
const aliases: Record<string, string> = {
  no: 'no',
  externalid: 'external_id',
  chapter: 'chapter_code',
  chaptercode: 'chapter_code',
  subchapter: 'subchapter_code',
  subchaptercode: 'subchapter_code',
  competency: 'competency_code',
  competencycode: 'competency_code',
  lv: 'source_level',
  level: 'source_level',
  sourcelevel: 'source_level',
  stem: 'stem',
  stemsoal: 'stem',
  answer: 'answer',
  ans: 'answer',
  explanation: 'explanation',
  pembahasan: 'explanation',
  difficulty: 'difficulty',
  gambar: 'img_stem',
};
function header(value: string) {
  const clean = value.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (aliases[clean]) return aliases[clean];
  if (/^(?:option)?[a-z]$/.test(clean)) return 'opt_' + clean.slice(-1).toUpperCase();
  const match = /^(opt|option|statement|img|alt|key|category)([a-z]|\d+|stem|explanation)$/.exec(
    clean,
  );
  return match
    ? `${match[1] === 'option' ? 'opt' : match[1]}_${/^[a-z]$/.test(match[2]!) ? match[2]!.toUpperCase() : match[2]}`
    : clean;
}
function text(cell: ExcelJS.Cell): string {
  const value = cell.value;
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' || typeof value === 'number') return String(value).trim();
  if (typeof value === 'object' && 'richText' in value)
    return value.richText
      .map((t) => t.text)
      .join('')
      .trim();
  return '';
}
export async function parseExcel(
  buffer: Buffer,
  sourceNamespace: string,
  bucket: string,
): Promise<ExcelParseDto> {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(sourceNamespace))
    excelError(
      'EXCEL_NAMESPACE_INVALID',
      'Namespace sumber wajib stabil (huruf, angka, _ atau -).',
    );
  const parts = await excelParts(buffer);
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  } catch {
    return excelError('EXCEL_FORMAT_INVALID', 'Workbook tidak dapat dibaca.');
  }
  const result: ExcelParseDto = {
    envelope: { schemaVersion: 2, sourceNamespace, questions: [] },
    media: [],
    issues: [],
    report: null,
  };
  const locations = relationships(parts, 'xl/workbook.xml');
  let mediaBytes = 0,
    questionRows = 0;
  const identities = new Set<string>();
  for (const sheetInfo of descendants(xml(parts.get('xl/workbook.xml')!), 'sheet')) {
    const sheet = workbook.getWorksheet(sheetInfo.attrs.name!);
    const type = kinds[sheetInfo.attrs.name!];
    const legacy = ['Template', 'Soal', 'Soal dengan Gambar'].includes(sheetInfo.attrs.name!);
    if (!sheet || !type) continue;
    const issue = (row: number, col: number, code: string, detail: string) =>
      result.issues.push({
        sheet: sheet.name,
        row,
        cell: sheet.getRow(row).getCell(Math.max(1, col)).address,
        code,
        detail,
      });
    if (sheet.rowCount > 10_000 || sheet.columnCount > 512)
      excelError('EXCEL_SHEET_TOO_LARGE', 'Sheet melebihi 10.000 baris atau 512 kolom.');
    const columns = new Map<string, number>();
    sheet.getRow(1).eachCell((cell, col) => {
      const name = header(text(cell));
      if (columns.has(name)) issue(1, col, 'DUPLICATE_HEADER', `Header ${name} berulang.`);
      columns.set(name, col);
    });
    const required = [
      'chapter_code',
      'subchapter_code',
      'competency_code',
      'source_level',
      'stem',
      'explanation',
      ...(type === 'CATEGORY' ? ['category_1', 'category_2'] : ['answer']),
    ];
    for (const name of required)
      if (!columns.has(name)) issue(1, 1, 'HEADER_REQUIRED', `Kolom ${name} belum tersedia.`);
    const sheetPart =
      locations.get(sheetInfo.attrs['r:id']!) ??
      excelError('EXCEL_RELATIONSHIP_INVALID', 'Sheet relationship is missing.');
    const images = sheetImages(parts, sheetPart).sort(
      (a, b) =>
        a.row - b.row || a.col - b.col || a.rowOffset - b.rowOffset || a.colOffset - b.colOffset,
    );
    if (images.some((i) => i.row > 10_000 || i.col > 512))
      excelError('EXCEL_IMAGE_LOCATION_INVALID', 'Jangkar gambar berada di luar batas sheet soal.');
    const handledImages = new Set<(typeof images)[number]>();
    if (required.some((name) => !columns.has(name))) continue;
    const optionCols = [...columns]
      .filter(([name]) =>
        new RegExp(`^${type === 'CATEGORY' ? 'statement' : 'opt'}_[A-Z0-9]+$`).test(name),
      )
      .sort(([a], [b]) => a.localeCompare(b, 'en', { numeric: true }));
    for (let rowNum = 2; rowNum <= sheet.rowCount; rowNum++) {
      const row = sheet.getRow(rowNum);
      const get = (name: string) =>
        columns.has(name) ? text(row.getCell(columns.get(name)!)) : '';
      // Only known legacy instruction rows are skipped; malformed question rows are reported.
      if (
        legacy &&
        rowNum === 2 &&
        !get('external_id') &&
        (/^(nomor|isi|urutan|no\.? soal)/i.test(get('no')) ||
          (get('no').toLowerCase() === 'no' &&
            get('source_level') === '1-5' &&
            /^ketik/i.test(get('stem'))))
      )
        continue;
      const present = [...columns].some(
        ([name, col]) =>
          !/^alt_|^img_/.test(name) &&
          row.getCell(col).value != null &&
          text(row.getCell(col)) !== '',
      );
      if (!present) continue;
      if (++questionRows > 100)
        excelError('EXCEL_TOO_MANY_QUESTIONS', 'Maksimal 100 soal per file.');
      const startIssues = result.issues.length;
      const cellIssue = (name: string, code: string, detail: string) =>
        issue(rowNum, columns.get(name) ?? 1, code, detail);
      row.eachCell((cell, col) => {
        if (
          typeof cell.value === 'object' &&
          cell.value &&
          ('formula' in cell.value || 'sharedFormula' in cell.value)
        )
          issue(
            rowNum,
            col,
            'FORMULA_UNSUPPORTED',
            'Gunakan teks/LaTeX dan gambar tertanam; formula Excel/IMAGE() tidak didukung.',
          );
        else if (
          typeof cell.value === 'object' &&
          cell.value &&
          'error' in cell.value &&
          !images.some((i) => i.row === rowNum && i.col === col && i.mode === 'IN_CELL')
        )
          issue(rowNum, col, 'CELL_ERROR', 'Sel berisi error Excel.');
      });
      const level = Number(get('source_level'));
      if (!/^\d+$/.test(get('source_level')) || !Number.isSafeInteger(level) || level < 1)
        cellIssue(
          'source_level',
          'LEVEL_INVALID',
          'Level sumber harus bilangan bulat positif dari master kurikulum.',
        );
      const no = get('no');
      const externalId =
        get('external_id') ||
        [
          get('chapter_code'),
          get('subchapter_code'),
          get('competency_code'),
          `L${get('source_level')}`,
          `Q${no}`,
        ].join('-');
      if (!get('external_id') && !/^[1-9]\d*$/.test(no))
        cellIssue(
          'no',
          'EXTERNAL_ID_REQUIRED',
          'Isi external_id; template lama memerlukan No positif yang stabil.',
        );
      if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(externalId))
        cellIssue('external_id', 'EXTERNAL_ID_INVALID', 'ID harus 1–128 huruf, angka, _ atau -.');
      if (identities.has(externalId))
        cellIssue('external_id', 'DUPLICATE_EXTERNAL_ID', 'ID soal berulang dalam file.');
      identities.add(externalId);
      for (const name of [
        'chapter_code',
        'subchapter_code',
        'competency_code',
        'stem',
        'explanation',
      ])
        if (!get(name)) cellIssue(name, 'TEXT_REQUIRED', `${name} wajib diisi teks.`);
      const activeOptions = optionCols.filter(
        ([name]) =>
          get(name) ||
          images.some(
            (i) => i.row === rowNum && columns.get('img_' + name.split('_')[1]) === i.col,
          ),
      );
      const q: ExcelQuestionDto = {
        externalId,
        type,
        chapterCode: get('chapter_code'),
        subchapterCode: get('subchapter_code'),
        competencyCode: get('competency_code'),
        difficulty: (get('difficulty').toUpperCase() || null) as ExcelQuestionDto['difficulty'],
        stem: { text: get('stem') },
        options: activeOptions.map(([name]) => ({
          id: name.split('_')[1]!,
          content: { text: get(name) },
        })),
        explanation: { text: get('explanation') },
        answer:
          type === 'SINGLE_CHOICE'
            ? { optionId: get('answer').toUpperCase() }
            : type === 'MULTIPLE_CHOICE_MULTIPLE_ANSWER'
              ? {
                  optionIds: get('answer')
                    .split(',')
                    .map((v) => v.trim().toUpperCase()),
                }
              : {
                  categoryByStatementId: Object.fromEntries(
                    activeOptions.map(([name]) => [
                      name.split('_')[1]!,
                      get('key_' + name.split('_')[1]).toUpperCase(),
                    ]),
                  ),
                },
        metadata: {
          sourceLevelNumber: level,
          sourceSheet: sheet.name,
          sourceRowNumber: rowNum,
          categories:
            type === 'CATEGORY'
              ? [...columns]
                  .filter(([name]) => /^category_\d+$/.test(name) && get(name))
                  .map(([name]) => ({ id: 'C' + name.split('_')[1], label: get(name) }))
              : [],
          assetManifest: [],
        },
      };
      if (type !== 'CATEGORY') delete q.metadata.categories;
      for (const [name] of activeOptions)
        if (!get(name))
          cellIssue(name, 'TEXT_REQUIRED', 'Pilihan/pernyataan tetap wajib memiliki teks.');
      if (q.difficulty && !['EASY', 'MEDIUM', 'HARD'].includes(q.difficulty))
        cellIssue('difficulty', 'DIFFICULTY_INVALID', 'Gunakan EASY, MEDIUM, HARD atau kosong.');
      const placements: {
        column: string;
        text: RichContent;
        placement: ContentAsset['placement'];
        itemId: string | null;
      }[] = [
        { column: 'stem', text: q.stem, placement: 'STEM', itemId: null },
        ...q.options.map((o) => ({
          column: o.id,
          text: o.content,
          placement: type === 'CATEGORY' ? ('STATEMENT' as const) : ('OPTION' as const),
          itemId: o.id,
        })),
        { column: 'explanation', text: q.explanation, placement: 'EXPLANATION', itemId: null },
      ];
      for (const p of placements) {
        const matched = images.filter(
          (i) =>
            i.row === rowNum &&
            i.col ===
              (columns.get('img_' + p.column) ??
                (legacy ? columns.get(p.itemId ? 'opt_' + p.itemId : p.column) : undefined)),
        );
        for (const [index, image] of matched.entries()) {
          handledImages.add(image);
          mediaBytes += image.bytes.length;
          const imageType = ['image/png', 'image/jpeg', 'image/webp'].find((t) =>
            matchesImageSignature(image.bytes, t),
          );
          const alt = get('alt_' + p.column) || image.alt.trim();
          if (!imageType || image.bytes.length > 5 * 1024 * 1024) {
            cellIssue(
              'img_' + p.column,
              'IMAGE_INVALID',
              'Gambar harus PNG/JPEG/WebP dan maksimal 5 MiB.',
            );
            continue;
          }
          if (mediaBytes > 20 * 1024 * 1024)
            excelError('EXCEL_MEDIA_TOO_LARGE', 'Total gambar melebihi 20 MiB.');
          if (!alt) {
            cellIssue(
              'img_' + p.column,
              'IMAGE_ALT_REQUIRED',
              'Isi kolom alt atau Alt Text gambar.',
            );
            continue;
          }
          const assetId = `x${createHash('sha256').update(sourceNamespace).digest('hex').slice(0, 16)}-${p.column.toLowerCase()}-${index + 1}`;
          const textMarker = `[[asset:${assetId}]]`;
          p.text.text += `\n${textMarker}`;
          q.metadata.assetManifest.push({
            externalId,
            assetId,
            textMarker,
            placement: p.placement,
            itemId: p.itemId,
            assetOrder: index + 1,
            altText: alt,
            objectKey: null,
            sha256: createHash('sha256').update(image.bytes).digest('hex'),
            contentType: imageType,
            byteLength: image.bytes.length,
            bucket,
          });
          result.media.push({ externalId, assetId, base64: image.bytes.toString('base64') });
        }
      }
      for (const code of structuralErrors(q))
        cellIssue('answer', code, 'Konten atau kunci jawaban tidak sesuai kontrak soal v2.');
      if (result.issues.length === startIssues) result.envelope.questions.push(q);
    }
    for (const image of images)
      if (!handledImages.has(image))
        issue(
          image.row,
          image.col,
          'IMAGE_UNMAPPED',
          'Gambar harus berada di kolom img_* dan baris soal yang terisi; gunakan sudut kiri atas sebagai jangkar.',
        );
  }
  if (!questionRows)
    result.issues.push({
      sheet: '',
      row: 1,
      cell: 'A1',
      code: 'QUESTIONS_REQUIRED',
      detail: 'Tidak ada soal pada sheet PG, MCMA, Kategori atau template lama yang dikenali.',
    });
  result.media = result.media.filter((m) =>
    result.envelope.questions.some((q) => q.externalId === m.externalId),
  );
  if (Buffer.byteLength(JSON.stringify(result.envelope)) > 2 * 1024 * 1024)
    excelError('EXCEL_JSON_TOO_LARGE', 'JSON soal melebihi 2 MiB.');
  return result;
}

export async function excelTemplate(curriculum: AdminCurriculumDto): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const guide = workbook.addWorksheet('Panduan');
  for (const line of [
    'NUMORA Excel V3 — maksimal 100 soal, .xlsx 10 MiB',
    'Satu baris satu soal. Isi external_id stabil, kode master dan source_level.',
    'Teks wajib pada stem, pilihan/pernyataan dan explanation. Gambar melengkapi teks.',
    'Gambar PNG/JPEG/WebP: Place in Cell atau floating di img_*. Sudut kiri atas harus di sel tujuan. Isi alt_*.',
    'PG: answer=A. MCMA: answer=A,C. Kategori: category_1/2 label dan key_A/B/...=C1/C2.',
    'Tambah opt_E/img_E/alt_E atau statement_E/img_E/alt_E/key_E sesuai kebutuhan (2–100 item).',
    'Level dan kode harus sesuai hubungan Kurikulum; label C1/C2 mengacu category_1/2.',
    'Jangan isi formula IMAGE(), link eksternal atau mengubah gambar menjadi isi stem.',
    'Unggah → preview lokal → upload/verify R2 → validasi → simpan DRAFT atomik.',
    'Namespace sumber harus tetap sama saat impor ulang. Kunci R2 diperlukan sebelum simpan soal bergambar.',
  ])
    guide.addRow([line]);
  guide.getColumn(1).width = 120;
  for (const name of ['PG', 'MCMA', 'Kategori']) {
    const sheet = workbook.addWorksheet(name);
    const headers = [
      'external_id',
      'no',
      'chapter_code',
      'subchapter_code',
      'competency_code',
      'source_level',
      'difficulty',
      'stem',
      'img_stem',
      'alt_stem',
    ];
    for (const id of ['A', 'B', 'C', 'D'])
      headers.push(
        `${name === 'Kategori' ? 'statement' : 'opt'}_${id}`,
        `img_${id}`,
        `alt_${id}`,
        ...(name === 'Kategori' ? [`key_${id}`] : []),
      );
    headers.push(
      ...(name === 'Kategori' ? ['category_1', 'category_2'] : ['answer']),
      'explanation',
      'img_explanation',
      'alt_explanation',
    );
    sheet.addRow(headers);
    sheet.views = [{ state: 'frozen', ySplit: 1, xSplit: 2 }];
    headers.forEach((h, i) => {
      sheet.getColumn(i + 1).width = /stem|explanation|^opt_|^statement_/.test(h) ? 36 : 24;
      const cell = sheet.getRow(1).getCell(i + 1);
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF244F48' } };
      for (let row = 2; row <= 101; row++) {
        const target = sheet.getRow(row).getCell(i + 1);
        target.alignment = { vertical: 'top', wrapText: true };
        if (h === 'source_level')
          target.dataValidation = {
            type: 'whole',
            operator: 'greaterThan',
            formulae: [0],
            allowBlank: false,
            showErrorMessage: true,
            error: 'Isi level positif dari master.',
          };
        if (h === 'difficulty')
          target.dataValidation = {
            type: 'list',
            formulae: ['"EASY,MEDIUM,HARD"'],
            allowBlank: true,
            showErrorMessage: true,
          };
        if (h.startsWith('key_'))
          target.dataValidation = {
            type: 'list',
            formulae: ['"C1,C2"'],
            allowBlank: true,
            showErrorMessage: true,
          };
      }
    });
  }
  const master = workbook.addWorksheet('Kurikulum');
  master.addRow(['kind', 'code', 'parent_kind', 'parent_code', 'name', 'status']);
  for (const item of curriculum.items) {
    const parent = curriculum.items.find((p) => p.id === item.parentId);
    master.addRow([
      item.kind,
      item.code,
      parent?.kind ?? '',
      parent?.code ?? '',
      item.name,
      item.status,
    ]);
  }
  master.columns.forEach((c) => {
    c.width = 28;
  });
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
@Injectable()
export class ExcelImportService {
  constructor(
    @Inject(ContentImportService) private readonly importer: ContentImportService,
    @Inject(ContentService) private readonly content: ContentService,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {}
  async parse(buffer: Buffer, sourceNamespace: string) {
    this.importer.enabled();
    const result = await parseExcel(
      buffer,
      sourceNamespace,
      this.config.get<string>('R2_BUCKET') || 'numora-bucket',
    );
    if (!result.issues.length) {
      result.report = await this.importer.validate(result.envelope);
      result.report.items.forEach((item, index) => {
        for (const code of item.blockers.filter((b) => b !== 'MEDIA_NOT_READY'))
          result.issues.push({
            sheet: result.envelope.questions[index]!.metadata.sourceSheet,
            row: result.envelope.questions[index]!.metadata.sourceRowNumber,
            cell: '',
            code,
            detail: `${item.externalId}: ${code}`,
          });
      });
    }
    return result;
  }
  async template() {
    this.importer.enabled();
    return excelTemplate(await this.content.curriculum());
  }
}
