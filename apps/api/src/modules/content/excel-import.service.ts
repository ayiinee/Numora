import { allowSyntheticContent } from '@tka/database';
import { createHash } from 'node:crypto';
import { Inject, Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import ExcelJS from 'exceljs';
import { getDatabase, type ContentAsset, type ContentKind, type RichContent } from '@tka/database';
import { packageContext, packageCounts } from './content-package.rules';
import type { ContentPackageDto } from './content-packages.dto';
import type { WorkbookBindingDto } from './package-context.dto';
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
import { structuralErrors, schemaIssues } from './content-import.validation';
import type { ExcelIntakeDto, IntakeQuestionDto } from './content-intake.dto';
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
  sourcequestionid: 'source_question_id',
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
  bab: 'chapter_code',
  subbab: 'subchapter_code',
  indikator: 'competency_code',
  soal: 'stem',
  kunci: 'answer',
  kesulitan: 'difficulty',
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
export function parseExcel(
  buffer: Buffer,
  sourceNamespace: string,
  bucket: string,
  intake: { id: string; curriculum: AdminCurriculumDto },
): Promise<ExcelIntakeDto>;
export function parseExcel(
  buffer: Buffer,
  sourceNamespace: string,
  bucket: string,
): Promise<ExcelParseDto>;
export async function parseExcel(
  buffer: Buffer,
  sourceNamespace: string,
  bucket: string,
  intake?: { id: string; curriculum: AdminCurriculumDto },
): Promise<ExcelParseDto | ExcelIntakeDto> {
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
  const result: ExcelIntakeDto = {
    envelope: { intakeVersion: 1, sourceNamespace, questions: [] },
    mappingIssues: [],
    media: [],
    issues: [],
    report: null,
  };
  const paket = intake ? undefined : workbook.getWorksheet('Paket');
  if (paket) {
    const fields = new Map<string, string>();
    paket.eachRow((row, index) => {
      if (index > 1) fields.set(text(row.getCell(1)), text(row.getCell(2)));
    });
    if (fields.get('templateVersion') !== '4')
      result.issues.push({
        sheet: 'Paket',
        row: 2,
        cell: 'B2',
        code: 'TEMPLATE_VERSION_UNSUPPORTED',
        detail: 'Gunakan template paket V4.',
      });
    const get = (name: string) => fields.get(name) ?? '';
    (result.envelope as unknown as ExcelParseDto['envelope']).binding = {
      packageId: get('packageId'),
      familyCode: get('familyCode'),
      packageVersion: Number(get('packageVersion')),
      assessmentType: get('assessmentType') as WorkbookBindingDto['assessmentType'],
      chapterCode: get('chapterCode') || null,
      subchapterCode: get('subchapterCode') || null,
      levelNumber: get('levelNumber') ? Number(get('levelNumber')) : null,
      sourceNamespace: get('sourceNamespace'),
      sourceName: get('sourceName'),
      sourceReference: get('sourceReference'),
      isDemo: get('isDemo') === 'TRUE',
    };
    const requiredBinding = [
      'packageId',
      'familyCode',
      'packageVersion',
      'assessmentType',
      'sourceNamespace',
      'sourceName',
      'sourceReference',
      'isDemo',
    ];
    if (requiredBinding.some((key) => !get(key)) || !['TRUE', 'FALSE'].includes(get('isDemo')))
      result.issues.push({
        sheet: 'Paket',
        row: 1,
        cell: 'A1',
        code: 'PACKAGE_BINDING_INVALID',
        detail: 'Identitas paket tidak lengkap. Unduh ulang template.',
      });
  }
  const locations = relationships(parts, 'xl/workbook.xml');
  let mediaBytes = 0,
    questionRows = 0;
  const identities = new Set<string>();
  const orders = new Set<number>();
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
    let readable = false;
    sheet.getRow(1).eachCell((cell, col) => {
      if (text(cell).toLowerCase() === 'bab') readable = true;
      const name = header(text(cell));
      if (columns.has(name)) issue(1, col, 'DUPLICATE_HEADER', `Header ${name} berulang.`);
      columns.set(name, col);
    });
    const required = [
      ...(!intake ? ['chapter_code', 'subchapter_code', 'competency_code', 'source_level'] : []),
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
      if (
        !intake &&
        (!/^\d+$/.test(get('source_level')) || !Number.isSafeInteger(level) || level < 1)
      )
        cellIssue(
          'source_level',
          'LEVEL_INVALID',
          'Level sumber harus bilangan bulat positif dari master kurikulum.',
        );
      const no = intake ? String(questionRows) : get('no');
      if (paket) {
        if (!/^[1-9]\d*$/.test(no) || !Number.isSafeInteger(Number(no)) || Number(no) > 2147483647)
          cellIssue(
            'no',
            'QUESTION_ORDER_REQUIRED',
            'No wajib bilangan bulat positif lintas sheet.',
          );
        else if (orders.has(Number(no)))
          cellIssue(
            'no',
            'QUESTION_ORDER_DUPLICATE',
            'No berulang dalam paket, termasuk pada sheet lain.',
          );
        orders.add(Number(no));
      }
      const externalId = intake
        ? `Q-${createHash('sha256').update(`${intake.id}:${sheet.name}:${rowNum}`).digest('hex').slice(0, 32)}`
        : get('external_id') ||
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
        ...(!intake ? ['chapter_code', 'subchapter_code', 'competency_code'] : []),
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
      const normalize = (v: string) => v.normalize('NFC').trim().toLocaleLowerCase('id-ID');
      // Try to find curriculum item by code first, then by name (case-insensitive)
      const findMaterial = (
        kind: 'CHAPTER' | 'SUBCHAPTER' | 'COMPETENCY',
        field: string,
        parentId?: string,
      ) => {
        const raw = get(field);
        if (!raw) return undefined;
        const candidates =
          intake?.curriculum.items.filter(
            (item) => item.kind === kind && (kind === 'CHAPTER' || item.parentId === parentId),
          ) ?? [];
        // Try exact code match first
        const codeMatch = candidates.find((item) => item.code === raw);
        if (codeMatch) return codeMatch;
        // Try exact name match (case-insensitive)
        const nameMatch = candidates.find((item) => normalize(item.name) === normalize(raw));
        if (nameMatch) return nameMatch;
        // Try partial name match
        const rawLower = normalize(raw);
        const partialMatches = candidates.filter(
          (item) =>
            normalize(item.name).includes(rawLower) || rawLower.includes(normalize(item.name)),
        );
        // Only return if exactly one partial match
        if (partialMatches.length === 1) return partialMatches[0];
        // Return undefined if no match or ambiguous
        return undefined;
      };
      // Find level by number (source_level)
      const findLevel = (subchapterId?: string) => {
        if (!intake || !get('source_level')) return undefined;
        const levelNum = Number(get('source_level'));
        if (!Number.isSafeInteger(levelNum) || levelNum < 1) return undefined;
        const candidates = intake.curriculum.items.filter(
          (item) =>
            item.kind === 'LEVEL' &&
            item.code === String(levelNum) &&
            (!subchapterId || item.parentId === subchapterId),
        );
        return candidates.length === 1 ? candidates[0] : undefined;
      };
      const chapter = intake ? findMaterial('CHAPTER', 'chapter_code') : undefined;
      const sub = intake ? findMaterial('SUBCHAPTER', 'subchapter_code', chapter?.id) : undefined;
      const competency = intake
        ? findMaterial('COMPETENCY', 'competency_code', sub?.id)
        : undefined;
      const mappedLevel = intake ? findLevel(sub?.id) : undefined;
      const difficulty = get('difficulty').toUpperCase();
      const q: IntakeQuestionDto = {
        externalId,
        type,
        chapterCode: chapter?.code ?? (get('chapter_code') || null),
        subchapterCode: sub?.code ?? (get('subchapter_code') || null),
        competencyCode: competency?.code ?? (get('competency_code') || null),
        difficulty: (({ MUDAH: 'EASY', SEDANG: 'MEDIUM', SULIT: 'HARD' } as Record<string, string>)[
          difficulty
        ] ??
          (difficulty || null)) as ExcelQuestionDto['difficulty'],
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
          sourceLevelNumber:
            get('source_level') && Number.isSafeInteger(level) && level > 0 ? level : null,
          ...(/^[1-9]\d*$/.test(no) ? { sourceOrder: Number(no) } : {}),
          ...(!intake && get('source_question_id')
            ? { sourceQuestionId: get('source_question_id') }
            : {}),
          ...(intake
            ? {
                originalExternalId: get('external_id') || null,
                sourceMaterial: {
                  chapter: get('chapter_code'),
                  subchapter: get('subchapter_code'),
                  competency: get('competency_code'),
                  level: get('source_level'),
                  naming: readable ? 'NAME' : 'CODE',
                },
                chapterName: chapter?.name,
                subchapterName: sub?.name,
                competencyName: competency?.name,
                materialIds: {
                  chapterId: chapter?.id ?? null,
                  subchapterId: sub?.id ?? null,
                  competencyId: competency?.id ?? null,
                  levelId: mappedLevel?.id ?? null,
                },
                materialOrigins: chapter
                  ? {
                      chapterId: 'EXCEL',
                      subchapterId: 'EXCEL',
                      competencyId: 'EXCEL',
                      levelId: 'EXCEL',
                    }
                  : {},
              }
            : {}),
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
          if (!alt && !intake) {
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
      for (const code of structuralErrors(q, !!intake)) {
        if (code === 'INVALID_SCHEMA')
          for (const e of schemaIssues(q, !!intake))
            cellIssue(
              e.field.includes('metadata')
                ? 'source_level'
                : e.field.includes('options')
                  ? 'stem'
                  : 'answer',
              code,
              `${e.field}: ${e.detail}`,
            );
        else
          cellIssue(
            code.includes('ASSET') ? 'img_stem' : code.includes('CONTENT') ? 'stem' : 'answer',
            code,
            `Periksa ${code.includes('KEY') ? 'kunci jawaban' : 'konten soal'} (${code}).`,
          );
      }
      if (intake || result.issues.length === startIssues) result.envelope.questions.push(q);
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
  if (intake) return result;
  return {
    envelope: {
      schemaVersion: 2,
      sourceNamespace,
      questions: result.envelope.questions as ExcelQuestionDto[],
      ...(paket
        ? { binding: (result.envelope as unknown as ExcelParseDto['envelope']).binding }
        : {}),
    },
    media: result.media,
    issues: result.issues,
    report: result.report,
  };
}

export function workbookBinding(p: ContentPackageDto): WorkbookBindingDto {
  if (!p.source)
    throw new BadRequestException({
      code: 'PACKAGE_SOURCE_REQUIRED',
      detail: 'Buat paket terarah dengan nama dan referensi sumber.',
    });
  return {
    packageId: p.id,
    familyCode: p.familyCode,
    packageVersion: p.packageVersion,
    assessmentType: p.assessmentType,
    chapterCode: p.chapterCode,
    subchapterCode: p.subchapterCode,
    levelNumber: p.levelNumber,
    ...p.source,
    isDemo: p.isDemo,
  };
}
export async function excelTemplate(
  curriculum: AdminCurriculumDto,
  target?: ContentPackageDto,
  examples = false,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const guide = workbook.addWorksheet('Panduan');
  for (const line of [
    `NUMORA Excel ${target ? 'V4 — satu paket, satu tujuan' : 'V3'} — maksimal 100 soal, .xlsx 10 MiB`,
    ...(target
      ? [
          'Jangan ubah identitas pada sheet Paket. No positif wajib unik lintas PG/MCMA/Kategori.',
          'Simpan DRAFT → review admin → checklist kesiapan. Validasi teknis bukan izin publikasi.',
          'source_question_id opsional: UUID keluarga soal asal jika membuat salinan lintas tujuan.',
        ]
      : []),
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
  if (target) {
    const paket = workbook.addWorksheet('Paket');
    paket.addRow(['field', 'value']);
    paket.addRow(['templateVersion', '4']);
    for (const [key, value] of Object.entries(workbookBinding(target)))
      paket.addRow([key, typeof value === 'boolean' ? (value ? 'TRUE' : 'FALSE') : (value ?? '')]);
    paket.getColumn(1).width = 28;
    paket.getColumn(2).width = 75;
  }
  for (const name of ['PG', 'MCMA', 'Kategori']) {
    const sheet = workbook.addWorksheet(name);
    const headers = [
      'external_id',
      'no',
      ...(target ? ['source_question_id'] : []),
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
        if (h === 'source_level' || h === 'no')
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
  if (examples && target) {
    if (!target.isDemo || !allowSyntheticContent())
      throw new BadRequestException({
        code: 'EXAMPLES_DEMO_ONLY',
        detail: 'Contoh sintetis hanya tersedia di lingkungan pengembangan terisolasi.',
      });
    const competency = curriculum.items.find(
      (item) =>
        item.kind === 'COMPETENCY' &&
        item.status !== 'ARCHIVED' &&
        (() => {
          const sub = curriculum.items.find((s) => s.id === item.parentId);
          const chapter = curriculum.items.find((c) => c.id === sub?.parentId);
          return (
            sub?.status !== 'ARCHIVED' &&
            chapter?.status !== 'ARCHIVED' &&
            !!curriculum.items.find(
              (l) => l.kind === 'LEVEL' && l.parentId === sub?.id && l.status !== 'ARCHIVED',
            ) &&
            (target.assessmentType === 'TRYOUT' || chapter?.code === target.chapterCode) &&
            (target.assessmentType !== 'DRILL' || sub?.code === target.subchapterCode)
          );
        })(),
    );
    const sub = curriculum.items.find((s) => s.id === competency?.parentId);
    const chapter = curriculum.items.find((c) => c.id === sub?.parentId);
    const level =
      target.levelNumber ??
      Number(
        curriculum.items.find(
          (l) => l.kind === 'LEVEL' && l.parentId === sub?.id && l.status !== 'ARCHIVED',
        )?.code,
      );
    if (!competency || !sub || !chapter || !level)
      throw new BadRequestException({ code: 'EXAMPLE_MASTER_REQUIRED' });
    guide.addRow([
      'Contoh aritmetika untuk memeriksa format. Curriculum perlu meninjau konten sebelum publikasi.',
    ]);
    const exampleRows = new Map<string, number>();
    for (let no = 1; no <= packageCounts[target.assessmentType]; no++) {
      const sheet = workbook.getWorksheet(['PG', 'MCMA', 'Kategori'][(no - 1) % 3]!)!;
      const values: Record<string, string | number> = {
        external_id: `DEMO-${target.assessmentType}-${target.id.slice(0, 8)}-${String(no).padStart(3, '0')}`,
        no,
        chapter_code: chapter.code,
        subchapter_code: sub.code,
        competency_code: competency.code,
        source_level: level,
        difficulty: 'EASY',
      };
      if (sheet.name === 'PG')
        Object.assign(values, {
          stem: `Hasil $${no}+${no}$ adalah ....`,
          opt_A: String(no * 2),
          opt_B: String(no * 2 + 1),
          opt_C: String(no * 2 + 2),
          opt_D: String(no * 2 + 3),
          answer: 'A',
          explanation: `$${no}+${no}=${no * 2}$. Jawaban A.`,
        });
      else if (sheet.name === 'MCMA')
        Object.assign(values, {
          stem: 'Pilih semua bilangan genap berikut.',
          opt_A: String(no * 2),
          opt_B: String(no * 2 + 1),
          opt_C: String(no * 2 + 2),
          opt_D: String(no * 2 + 3),
          answer: 'A,C',
          explanation: `Bilangan genap habis dibagi 2. $${no * 2}=2\\times ${no}$ dan $${no * 2 + 2}=2\\times ${no + 1}$. Jawaban A dan C.`,
        });
      else
        Object.assign(values, {
          stem: 'Tentukan benar atau salah setiap pernyataan.',
          statement_A: `$${no}+0=${no}$`,
          statement_B: `$${no}\\times1=${no}$`,
          statement_C: `$${no}+1=${no}$`,
          statement_D: `$0\\times${no}=${no}$`,
          category_1: 'Benar',
          category_2: 'Salah',
          key_A: 'C1',
          key_B: 'C1',
          key_C: 'C2',
          key_D: 'C2',
          explanation:
            'Menambah nol dan mengalikan satu tidak mengubah bilangan. Menambah satu mengubah bilangan; perkalian dengan nol menghasilkan nol.',
        });
      const cells = (sheet.getRow(1).values as ExcelJS.CellValue[])
        .slice(1)
        .map((h) => values[String(h)] ?? '');
      const row = (exampleRows.get(sheet.name) ?? 1) + 1;
      sheet.getRow(row).values = cells;
      exampleRows.set(sheet.name, row);
    }
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
@Injectable()
export class ExcelImportService {
  constructor(
    @Inject(ContentImportService) private readonly importer: ContentImportService,
    @Inject(ContentService) private readonly content: ContentService,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {}
  async parse(buffer: Buffer, sourceNamespace: string, packageId?: string, fileName?: string) {
    this.importer.enabled();
    const result = await parseExcel(
      buffer,
      sourceNamespace,
      this.config.get<string>('R2_BUCKET') || 'numora-bucket',
    );
    if (result.envelope.binding || packageId) {
      const binding = result.envelope.binding;
      const id = packageId ?? binding?.packageId;
      if (!id || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id))
        throw new BadRequestException({ code: 'PACKAGE_BINDING_INVALID' });
      const p = await getDatabase().db.transaction((tx) => packageContext(tx, id));
      const expected = workbookBinding(p);
      if (
        binding &&
        (binding.packageId !== id ||
          Object.entries(expected).some(
            ([key, value]) => binding[key as keyof WorkbookBindingDto] !== value,
          ))
      )
        result.issues.push({
          sheet: 'Paket',
          row: 1,
          cell: 'A1',
          code: 'PACKAGE_BINDING_MISMATCH',
          detail:
            'Template berbeda dari identitas, tujuan, cakupan atau sumber paket server. Unduh template paket yang benar.',
        });
      if (sourceNamespace !== expected.sourceNamespace)
        result.issues.push({
          sheet: 'Paket',
          row: 1,
          cell: 'A1',
          code: 'PACKAGE_SOURCE_MISMATCH',
          detail: 'Namespace berbeda dari sumber paket.',
        });
      for (const q of result.envelope.questions)
        Object.assign(q.metadata, {
          sourceFileName: fileName ?? null,
          sourceFileSha256: createHash('sha256').update(buffer).digest('hex'),
        });
      if (!result.issues.length && binding && result.envelope.questions.length)
        result.report = await this.importer.validate({
          sourceNamespace,
          questions: result.envelope.questions,
          target: {
            packageId: id,
            expectedRevision: p.contentRevision,
            ...(fileName ? { fileName } : {}),
          },
        });
      return result;
    }
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
  async template(packageId?: string, examples = false) {
    this.importer.enabled();
    const target = packageId
      ? await getDatabase().db.transaction((tx) => packageContext(tx, packageId))
      : undefined;
    return excelTemplate(await this.content.curriculum(), target, examples);
  }
}
