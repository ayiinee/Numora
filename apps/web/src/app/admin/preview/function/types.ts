import type { Dispatch, SetStateAction } from 'react';

export type AdminPreviewView =
  | 'Ringkasan'
  | 'Bank soal'
  | 'Paket'
  | 'Konten video'
  | 'Laporan'
  | 'Sekolah & kelas'
  | 'Pengguna'
  | 'Analitik IRT'
  | 'Audit';

export type QuestionStatus = 'Ready' | 'Draft' | 'Archived';
export type QuestionType = 'PG' | 'PGK';
export type Question = {
  id: string;
  code: string;
  title: string;
  chapter: string;
  subchapter: string;
  type: QuestionType;
  level: number;
  updated: string;
  status: QuestionStatus;
};

export type School = {
  id: string;
  name: string;
  region: string;
  teachers: number;
  classes: number;
  students: number;
  status: 'Aktif' | 'Nonaktif';
  tokenStatus: 'Belum terbit' | 'Aktif' | 'Dicabut';
};
export type ManagedUser = {
  id: string;
  name: string;
  role: 'Mentor' | 'Peserta';
  affiliation: 'Mandiri' | 'Sekolah';
  schoolId: string | null;
  classId: string | null;
  status: 'Aktif' | 'Dibatasi';
  restrictionReason: string | null;
};
export type DemoClass = { id: string; name: string; schoolId: string; mentorId: string };
export type DemoPackage = { id: number; name: string; status: 'Draf' | 'Ditinjau' };
export type DemoVideo = { id: number; title: string; subchapter: string; status: 'Aktif' | 'Diarsipkan' };
export type DemoReport = {
  id: string;
  item: string;
  reason: string;
  status: 'Baru' | 'Ditinjau' | 'Selesai';
};

export type PreviewRecord = (message: string) => void;
export type StateSetter<T> = Dispatch<SetStateAction<T>>;
