import ExcelJS from 'exceljs';
import type { AdminCurriculumDto } from './content.dto';
import { excelTemplate } from './excel-import.service';

export async function uploadTemplate(curriculum: AdminCurriculumDto) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load((await excelTemplate(curriculum)) as unknown as ExcelJS.Buffer);
  const guide = workbook.getWorksheet('Panduan')!;
  guide.spliceRows(1, guide.rowCount);
  for (const line of [
    'NUMORA Excel V5 — upload dahulu, pilih jenis paket setelah preview dan validasi.',
    'Satu baris satu soal. Pilih nama Bab/Subbab sesuai sheet Materi. Indikator wajib untuk Drill/Pretest, diabaikan untuk Tryout; identitas dibuat otomatis.',
    'Isi Level 1–5, Kesulitan Mudah/Sedang/Sulit, soal, pilihan, kunci dan pembahasan.',
    'PG: kunci A. MCMA: A,C. Kategori: isi kategori dan kunci C1/C2 untuk setiap pernyataan.',
    'Gambar PNG/JPEG/WebP tertanam di kolom img_*; isi alt_* sebagai deskripsi. Place in Cell dan floating didukung.',
    'Rumus matematika memakai teks LaTeX, bukan formula Excel atau IMAGE().',
    'Maksimal 100 soal dan file 10 MiB. Jangan mengisi kode, penulis atau identitas paket.',
    'Upload → preview/validasi → pilih jenis dan judul → Simpan draft → konfirmasi Publish.',
  ])
    guide.addRow([line]);
  const oldMaster = workbook.getWorksheet('Kurikulum');
  if (oldMaster) workbook.removeWorksheet(oldMaster.id);
  const master = workbook.addWorksheet('Materi');
  master.addRow(['Bab', 'Subbab', 'Indikator', 'Level tersedia']);
  const ready = curriculum.items.filter((i) => i.status === 'READY');
  for (const item of ready.filter((i) => i.kind === 'COMPETENCY')) {
    const sub = ready.find((i) => i.id === item.parentId);
    const chapter = ready.find((i) => i.id === sub?.parentId);
    if (sub && chapter)
      master.addRow([
        chapter.name,
        sub.name,
        item.name,
        ready
          .filter((i) => i.kind === 'LEVEL' && i.parentId === sub.id)
          .map((i) => i.code)
          .join(', '),
      ]);
  }
  master.columns.forEach((c) => {
    c.width = 38;
  });
  const lists = workbook.addWorksheet('_Pilihan', { state: 'veryHidden' });
  for (const [index, kind] of ['CHAPTER', 'SUBCHAPTER', 'COMPETENCY'].entries()) {
    const names = [...new Set(ready.filter((i) => i.kind === kind).map((i) => i.name))];
    names.forEach((name, n) => {
      lists.getCell(n + 1, index + 1).value = name;
    });
  }
  const labels: Record<string, string> = {
    chapter_code: 'Bab',
    subchapter_code: 'Subbab',
    competency_code: 'Indikator',
    source_level: 'Level',
    difficulty: 'Kesulitan',
    stem: 'Soal',
    answer: 'Kunci',
    explanation: 'Pembahasan',
  };
  for (const name of ['PG', 'MCMA', 'Kategori']) {
    const sheet = workbook.getWorksheet(name)!;
    sheet.spliceColumns(1, 2);
    sheet.views = [{ state: 'frozen', ySplit: 1, xSplit: 0 }];
    sheet.getRow(1).eachCell((cell, col) => {
      const field = String(cell.value);
      cell.value = labels[field] ?? field;
      for (let row = 2; row <= 101; row++) {
        const target = sheet.getCell(row, col);
        if (col <= 3) {
          const letter = ['A', 'B', 'C'][col - 1];
          const length = [
            ...new Set(
              ready
                .filter((i) => i.kind === ['CHAPTER', 'SUBCHAPTER', 'COMPETENCY'][col - 1])
                .map((i) => i.name),
            ),
          ].length;
          if (length)
            workbook.definedNames.add(
              `'_Pilihan'!$${letter}$1:$${letter}$${length}`,
              `Materi${col}`,
            );
          if (length)
            target.dataValidation = {
              type: 'list',
              allowBlank: false,
              formulae: [`Materi${col}`],
              showErrorMessage: true,
              error: 'Pilih nama materi dari daftar.',
            };
        }
        if (field === 'difficulty')
          target.dataValidation = {
            type: 'list',
            allowBlank: false,
            formulae: ['"Mudah,Sedang,Sulit"'],
          };
      }
    });
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
