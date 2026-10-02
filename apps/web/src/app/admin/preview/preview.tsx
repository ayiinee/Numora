'use client';

import Link from 'next/link';
import { useState } from 'react';
import { AdminPreviewSections } from './function/sections';
import { initialQuestions, initialReports } from './function/fixtures';
import { QuestionBankSection } from './function/question-bank';
import type { AdminPreviewView, DemoReport, Question } from './function/types';
import './preview.css';

const navigation: { label: AdminPreviewView; icon: string }[] = [
  { label: 'Ringkasan', icon: '◫' },
  { label: 'Bank soal', icon: '▤' },
  { label: 'Paket', icon: '▧' },
  { label: 'Konten video', icon: '▷' },
  { label: 'Laporan', icon: '⚑' },
  { label: 'Sekolah & kelas', icon: '⌂' },
  { label: 'Pengguna', icon: '♙' },
  { label: 'Analitik IRT', icon: '⌁' },
  { label: 'Audit', icon: '◷' },
];

/**
 * Renders the admin preview shell, toggling between the login screen and the
 * demo workspace (sidebar, topbar, question bank, and preview sections).
 */
export default function AdminPage() {
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [questions, setQuestions] = useState<Question[]>(initialQuestions);
  const [reports, setReports] = useState<DemoReport[]>(initialReports);
  const [activeNav, setActiveNav] = useState<AdminPreviewView>('Bank soal');
  const reportsToReview = reports.filter((report) => report.status !== 'Selesai');

  if (!isSignedIn) {
    return (
      <main className="admin-preview admin-login-shell">
        <div className="login-brand">
          <span className="brand-mark">n.</span>
          <span>NUMORA <i>/ ADMIN</i></span>
        </div>
        <section className="login-panel" aria-labelledby="login-title">
          <div className="login-ornament" aria-hidden="true">
            <span>01</span><span>∑</span><span>π</span>
          </div>
          <p className="eyebrow">RUANG PENGELOLA</p>
          <h1 id="login-title">Selamat datang<br />kembali.</h1>
          <p className="login-copy">
            Pratinjau visual untuk diskusi desain. Panel Admin sebenarnya tersedia di halaman sekolah dan token Guru.
          </p>
          <button className="button button-primary login-submit" type="button" onClick={() => setIsSignedIn(true)}>
            Lihat pratinjau bank soal <span aria-hidden="true">↗</span>
          </button>
          <Link className="preview-live-link" href="/admin/content">
            Buka pengelolaan konten yang tersimpan di server
          </Link>
          <p className="prototype-note">
            <span aria-hidden="true">i</span> Hanya tersedia saat development. Contoh data dan aksi di sini tidak tersimpan.
          </p>
        </section>
        <footer className="login-footer">
          <span>NUMORA · Admin internal</span>
          <span>Konten yang diterbitkan tetap berversi.</span>
        </footer>
      </main>
    );
  }

  return (
    <main className="admin-preview admin-app">
      <aside className="admin-sidebar">
        <Link className="sidebar-brand" href="/admin" aria-label="NUMORA Admin beranda">
          <span className="brand-mark">n.</span>
          <span>NUMORA <i>ADMIN</i></span>
        </Link>
        <div className="workspace-label">WORKSPACE</div>
        <nav className="admin-nav" aria-label="Navigasi admin">
          {navigation.map((item) => (
            <button
              key={item.label}
              className={`nav-item ${activeNav === item.label ? 'is-active' : ''}`}
              onClick={() => setActiveNav(item.label)}
            >
              <span className="nav-icon" aria-hidden="true">{item.icon}</span>
              {item.label}
              {item.label === 'Laporan' && reportsToReview.length > 0 && (
                <span className="nav-count">{reportsToReview.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="system-status">
            <span className="status-dot" />
            <span><b>Pratinjau development</b><small>Data hanya di browser ini</small></span>
          </div>
          <button className="admin-user" onClick={() => setIsSignedIn(false)}>
            <span className="user-avatar">A</span>
            <span><b>Admin NUMORA</b><small>Keluar dari panel</small></span>
            <span className="user-menu">···</span>
          </button>
        </div>
      </aside>

      <section className="admin-main">
        <header className="admin-topbar">
          <div className="breadcrumb">Admin <span>/</span> <b>{activeNav}</b></div>
          <div className="topbar-right">
            <span className="environment-tag"><span /> DEMO LOKAL</span>
            <button className="help-button" aria-label="Bantuan" title="Bantuan">?</button>
          </div>
        </header>
        <QuestionBankSection
          questions={questions}
          setQuestions={setQuestions}
          hidden={activeNav !== 'Bank soal'}
        />
        <AdminPreviewSections
          section={activeNav}
          onNavigate={setActiveNav}
          reports={reports}
          setReports={setReports}
        />
      </section>
    </main>
  );
}
