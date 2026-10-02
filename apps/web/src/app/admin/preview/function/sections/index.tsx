'use client';

import { useEffect, useState } from 'react';
import { initialAudit, initialManagedUsers, initialPackages, initialSchools, initialVideos } from '../fixtures';
import type { AdminPreviewView, DemoPackage, DemoReport, DemoVideo, ManagedUser, PreviewRecord, School, StateSetter } from '../types';
import { AuditSection } from './audit';
import { IrtSection } from './irt';
import { OverviewSection } from './overview';
import { PackagesSection } from './packages';
import { ReportsSection } from './reports';
import { SchoolsSection } from './schools';
import { UsersSection } from './users';
import { VideosSection } from './videos';

const sectionIntro: Record<AdminPreviewView, string> = {
  Ringkasan: 'Ikhtisar operasional dengan data contoh untuk menjelajahi panel Admin.',
  'Bank soal': '',
  Paket: 'Kelola draf paket. Spesifikasi Tryout resmi masih menunggu keputusan produk.',
  'Konten video': 'Kelola metadata rekomendasi video dummy yang dipetakan ke subbab.',
  Laporan: 'Tinjau laporan soal dan video dengan identitas siswa yang disamarkan.',
  'Sekolah & kelas': 'Simulasi status sekolah, token Guru, kelas, dan jumlah anggota.',
  Pengguna: 'Pantau kelas, mentor, peserta, afiliasi, dan status akun demo.',
  'Analitik IRT': 'Pratinjau ambang respons dan status batch tanpa menghitung parameter IRT.',
  Audit: 'Riwayat aktivitas dummy dan aksi selama sesi pratinjau.',
};

type Props = {
  section: AdminPreviewView;
  onNavigate: (section: AdminPreviewView) => void;
  reports: DemoReport[];
  setReports: StateSetter<DemoReport[]>;
};

/**
 * Switches between the admin preview sub-sections (overview, schools, users,
 * packages, videos, reports, IRT, audit) based on the active navigation item.
 */
export function AdminPreviewSections({ section, onNavigate, reports, setReports }: Props) {
  const [schools, setSchools] = useState<School[]>(initialSchools);
  const [users, setUsers] = useState<ManagedUser[]>(initialManagedUsers);
  const [packages, setPackages] = useState<DemoPackage[]>(initialPackages);
  const [videos, setVideos] = useState<DemoVideo[]>(initialVideos);
  const [audit, setAudit] = useState(initialAudit);
  const [notice, setNotice] = useState('');

  /**
   * Shows a transient notice for the given message and appends it to the audit log.
   */
  const record: PreviewRecord = (message) => {
    setNotice(`${message} Perubahan ini hanya tersimpan di browser.`);
    setAudit((current) => [`Admin demo ${message.toLowerCase()} · 01 Okt 2026`, ...current].slice(0, 8));
  };

  useEffect(() => {
    setNotice('');
  }, [section]);

  return (
    <div className="admin-content admin-preview-workspace" hidden={section === 'Bank soal'}>
      <div className="page-heading">
        <div>
          <p className="eyebrow">PRATINJAU DESAIN <span>·</span> DATA DUMMY</p>
          <h1>{section === 'Pengguna' ? 'Manajemen Pengguna, Kelas & Sanksi' : section}</h1>
          <p className="page-subtitle">{sectionIntro[section]}</p>
        </div>
      </div>
      {notice && (
        <div className="notice" role="status">
          <span>{notice}</span>
          <button aria-label="Tutup notifikasi" onClick={() => setNotice('')}>×</button>
        </div>
      )}
      <div hidden={section !== 'Ringkasan'}>
        <OverviewSection schools={schools} reports={reports} packages={packages} onNavigate={onNavigate} />
      </div>
      <div hidden={section !== 'Sekolah & kelas'}>
        <SchoolsSection schools={schools} setSchools={setSchools} record={record} />
      </div>
      <div hidden={section !== 'Pengguna'}>
        <UsersSection schools={schools} users={users} setUsers={setUsers} record={record} />
      </div>
      <div hidden={section !== 'Paket'}>
        <PackagesSection packages={packages} setPackages={setPackages} record={record} />
      </div>
      <div hidden={section !== 'Konten video'}>
        <VideosSection videos={videos} setVideos={setVideos} record={record} />
      </div>
      <div hidden={section !== 'Laporan'}>
        <ReportsSection reports={reports} setReports={setReports} record={record} onNavigate={onNavigate} />
      </div>
      <div hidden={section !== 'Analitik IRT'}>
        <IrtSection record={record} />
      </div>
      <div hidden={section !== 'Audit'}>
        <AuditSection entries={audit} record={record} />
      </div>
      <p className="data-caption">
        <span aria-hidden="true">ⓘ</span>
        Seluruh data dan perubahan pada panel ini bersifat dummy, disimpan di state halaman, dan hilang saat halaman dimuat ulang.
      </p>
    </div>
  );
}
