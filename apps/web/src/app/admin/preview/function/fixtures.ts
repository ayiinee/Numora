import type {
  DemoClass,
  DemoPackage,
  DemoReport,
  DemoVideo,
  ManagedUser,
  Question,
  School,
} from './types';

export const initialQuestions: Question[] = [
  { id: '1', code: 'NUM-0421', title: 'Operasi pecahan campuran', chapter: 'Bilangan', subchapter: 'Pecahan', type: 'PG', level: 2, updated: '28 Sep 2026', status: 'Ready' },
  { id: '2', code: 'NUM-0420', title: 'Perbandingan senilai', chapter: 'Bilangan', subchapter: 'Perbandingan', type: 'PG', level: 1, updated: '27 Sep 2026', status: 'Draft' },
  { id: '3', code: 'ALG-0318', title: 'Persamaan linear satu variabel', chapter: 'Aljabar', subchapter: 'Persamaan linear', type: 'PG', level: 3, updated: '26 Sep 2026', status: 'Ready' },
  { id: '4', code: 'GEO-0206', title: 'Keliling dan luas segitiga', chapter: 'Geometri', subchapter: 'Bangun datar', type: 'PGK', level: 2, updated: '25 Sep 2026', status: 'Draft' },
  { id: '5', code: 'DAT-0109', title: 'Membaca diagram batang', chapter: 'Data', subchapter: 'Penyajian data', type: 'PG', level: 1, updated: '24 Sep 2026', status: 'Archived' },
];

export const initialSchools: School[] = [
  { id: 'SCH-DEMO-01', name: 'SMP Nusantara 01', region: 'Bandung', teachers: 8, classes: 12, students: 286, status: 'Aktif', tokenStatus: 'Aktif' },
  { id: 'SCH-DEMO-02', name: 'MTs Cendekia', region: 'Yogyakarta', teachers: 4, classes: 6, students: 142, status: 'Aktif', tokenStatus: 'Belum terbit' },
  { id: 'SCH-DEMO-03', name: 'SMP Harapan Belajar', region: 'Surabaya', teachers: 0, classes: 0, students: 0, status: 'Nonaktif', tokenStatus: 'Dicabut' },
];

export const initialManagedUsers: ManagedUser[] = [
  { id: 'USR-DEMO-01', name: 'Rani Putri', role: 'Mentor', affiliation: 'Sekolah', schoolId: 'SCH-DEMO-01', classId: 'CLS-DEMO-01', status: 'Aktif', restrictionReason: null },
  { id: 'USR-DEMO-02', name: 'Wahyu Hadi', role: 'Mentor', affiliation: 'Sekolah', schoolId: 'SCH-DEMO-01', classId: 'CLS-DEMO-02', status: 'Aktif', restrictionReason: null },
  { id: 'USR-DEMO-03', name: 'Nisa Sari', role: 'Mentor', affiliation: 'Sekolah', schoolId: 'SCH-DEMO-02', classId: 'CLS-DEMO-03', status: 'Aktif', restrictionReason: null },
  { id: 'USR-DEMO-04', name: 'Nabila Putri', role: 'Peserta', affiliation: 'Sekolah', schoolId: 'SCH-DEMO-01', classId: 'CLS-DEMO-01', status: 'Aktif', restrictionReason: null },
  { id: 'USR-DEMO-05', name: 'Dimas Pratama', role: 'Peserta', affiliation: 'Sekolah', schoolId: 'SCH-DEMO-01', classId: 'CLS-DEMO-01', status: 'Dibatasi', restrictionReason: 'Contoh alasan untuk pratinjau' },
  { id: 'USR-DEMO-06', name: 'Rafi Ahmad', role: 'Peserta', affiliation: 'Sekolah', schoolId: 'SCH-DEMO-01', classId: 'CLS-DEMO-02', status: 'Aktif', restrictionReason: null },
  { id: 'USR-DEMO-07', name: 'Alya Rahman', role: 'Peserta', affiliation: 'Sekolah', schoolId: 'SCH-DEMO-02', classId: 'CLS-DEMO-03', status: 'Aktif', restrictionReason: null },
  { id: 'USR-DEMO-08', name: 'Raka Wicaksono', role: 'Peserta', affiliation: 'Mandiri', schoolId: null, classId: null, status: 'Aktif', restrictionReason: null },
  { id: 'USR-DEMO-09', name: 'Sita Aulia', role: 'Peserta', affiliation: 'Mandiri', schoolId: null, classId: null, status: 'Aktif', restrictionReason: null },
];

export const initialClasses: DemoClass[] = [
  { id: 'CLS-DEMO-01', name: 'IX-A', schoolId: 'SCH-DEMO-01', mentorId: 'USR-DEMO-01' },
  { id: 'CLS-DEMO-02', name: 'IX-B', schoolId: 'SCH-DEMO-01', mentorId: 'USR-DEMO-02' },
  { id: 'CLS-DEMO-03', name: 'MTs-9A', schoolId: 'SCH-DEMO-02', mentorId: 'USR-DEMO-03' },
];

export const initialPackages: DemoPackage[] = [
  { id: 1, name: 'Paket Tryout Demo A', status: 'Draf' },
  { id: 2, name: 'Paket Tryout Demo B', status: 'Ditinjau' },
];

export const initialVideos: DemoVideo[] = [
  { id: 1, title: 'Menyederhanakan pecahan', subchapter: 'Bilangan · Pecahan', status: 'Aktif' },
  { id: 2, title: 'Perbandingan dalam soal cerita', subchapter: 'Bilangan · Perbandingan', status: 'Aktif' },
  { id: 3, title: 'Membaca diagram batang', subchapter: 'Data · Penyajian data', status: 'Diarsipkan' },
];

export const initialReports: DemoReport[] = [
  { id: 'RPT-DEMO-104', item: 'NUM-0421 · Operasi pecahan', reason: 'Pembahasan kurang jelas', status: 'Baru' },
  { id: 'RPT-DEMO-103', item: 'VID-001 · Menyederhanakan pecahan', reason: 'Tautan video tidak sesuai', status: 'Ditinjau' },
  { id: 'RPT-DEMO-102', item: 'ALG-0318 · Persamaan linear', reason: 'Pilihan jawaban berulang', status: 'Selesai' },
];

export const initialAudit = [
  'Admin demo mengarsipkan VID-003 · 01 Okt 2026',
  'Admin demo membuat revisi NUM-0421 · 30 Sep 2026',
  'Admin demo menerbitkan token sekolah · 30 Sep 2026',
];
