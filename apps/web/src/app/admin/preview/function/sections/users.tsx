'use client';

import { useState, type FormEvent } from 'react';
import { Metric } from '../shared';
import { initialClasses } from '../fixtures';
import type { ManagedUser, PreviewRecord, School, StateSetter } from '../types';

type Props = {
  schools: School[];
  users: ManagedUser[];
  setUsers: StateSetter<ManagedUser[]>;
  record: PreviewRecord;
};

export function UsersSection({ schools, users, setUsers, record }: Props) {
  const [schoolFilter, setSchoolFilter] = useState('all');
  const [affiliationFilter, setAffiliationFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [blockingUserId, setBlockingUserId] = useState<string | null>(null);
  const [banReason, setBanReason] = useState('');

  const visibleUsers = users.filter((user) => {
    const matchesSchool = schoolFilter === 'all' || user.schoolId === schoolFilter;
    const matchesAffiliation = affiliationFilter === 'all' || user.affiliation === affiliationFilter;
    const matchesQuery = `${user.id} ${user.name} ${user.role} ${user.affiliation}`
      .toLowerCase()
      .includes(query.toLowerCase());
    return matchesSchool && matchesAffiliation && matchesQuery;
  });
  const visibleClasses = initialClasses.filter(
    (item) => schoolFilter === 'all' || item.schoolId === schoolFilter,
  );

  function applyRestriction(event: FormEvent<HTMLFormElement>, user: ManagedUser) {
    event.preventDefault();
    const reason = banReason.trim();
    if (!reason) return;
    setUsers((current) => current.map((item) => item.id === user.id
      ? { ...item, status: 'Dibatasi', restrictionReason: reason }
      : item));
    setBlockingUserId(null);
    setBanReason('');
    record(`membatasi akun ${user.name}: ${reason}`);
  }

  function removeRestriction(user: ManagedUser) {
    setUsers((current) => current.map((item) => item.id === user.id
      ? { ...item, status: 'Aktif', restrictionReason: null }
      : item));
    record(`membuka blokir akun ${user.name}`);
  }

  return (
    <>
      <div className="preview-management-toolbar">
        <label className="preview-filter">
          Sekolah
          <select value={schoolFilter} onChange={(event) => setSchoolFilter(event.target.value)}>
            <option value="all">Semua sekolah</option>
            {schools.map((school) => <option key={school.id} value={school.id}>{school.name}</option>)}
          </select>
        </label>
        <label className="preview-filter">
          Afiliasi
          <select value={affiliationFilter} onChange={(event) => setAffiliationFilter(event.target.value)}>
            <option value="all">Semua pengguna</option>
            <option value="Mandiri">Mandiri</option>
            <option value="Sekolah">Sekolah</option>
          </select>
        </label>
        <label className="preview-filter preview-user-search">
          Cari pengguna
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nama atau ID pengguna" />
        </label>
      </div>
      <div className="metric-grid">
        <Metric label="Pengguna ditampilkan" value={String(visibleUsers.length).padStart(2, '0')} detail="Mengikuti filter di atas" />
        <Metric label="Mentor" value={String(visibleUsers.filter((user) => user.role === 'Mentor').length).padStart(2, '0')} detail="Guru pada data demo" />
        <Metric label="Peserta" value={String(visibleUsers.filter((user) => user.role === 'Peserta').length).padStart(2, '0')} detail="Siswa Mandiri dan Sekolah" />
        <Metric label="Akun dibatasi" value={String(visibleUsers.filter((user) => user.status === 'Dibatasi').length).padStart(2, '0')} detail="Status contoh, bukan blokir nyata" />
      </div>
      <section className="content-section">
        <div className="section-heading">
          <div><h2>Kelas per sekolah</h2><span>Mentor dan jumlah peserta pada data dummy</span></div>
        </div>
        <div className="preview-table-wrap">
          <table className="preview-table">
            <thead><tr><th>KELAS</th><th>SEKOLAH</th><th>MENTOR</th><th>PESERTA</th></tr></thead>
            <tbody>
              {visibleClasses.map((item) => {
                const school = schools.find((entry) => entry.id === item.schoolId);
                const mentor = users.find((entry) => entry.id === item.mentorId);
                const students = users.filter((entry) => entry.role === 'Peserta' && entry.classId === item.id).length;
                return (
                  <tr key={item.id}>
                    <td><b>{item.name}</b><small>{item.id}</small></td>
                    <td>{school?.name ?? 'Sekolah demo'}</td>
                    <td>{mentor?.name ?? 'Belum ditetapkan'}</td>
                    <td>{students}</td>
                  </tr>
                );
              })}
              {visibleClasses.length === 0 && <tr><td colSpan={4}>Belum ada kelas pada sekolah ini.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
      <section className="content-section preview-subsection">
        <div className="section-heading">
          <div><h2>Pengguna dan status akun</h2><span>Afiliasi Mandiri/Sekolah serta sanksi demo</span></div>
        </div>
        <div className="preview-table-wrap">
          <table className="preview-table">
            <thead><tr><th>PENGGUNA</th><th>PERAN</th><th>AFILIASI</th><th>KELAS / SEKOLAH</th><th>STATUS / ALASAN</th><th>AKSI</th></tr></thead>
            <tbody>
              {visibleUsers.map((user) => {
                const school = schools.find((item) => item.id === user.schoolId);
                const className = initialClasses.find((item) => item.id === user.classId)?.name;
                return (
                  <tr key={user.id}>
                    <td><b>{user.name}</b><small>{user.id}</small></td>
                    <td>{user.role}</td>
                    <td>{user.affiliation}</td>
                    <td>{user.affiliation === 'Mandiri' ? 'Tidak terafiliasi' : `${school?.name ?? 'Sekolah demo'}${className ? ` · ${className}` : ''}`}</td>
                    <td>
                      <span className={`status-pill ${user.status === 'Aktif' ? 'status-ready' : 'status-draft'}`}><span />{user.status}</span>
                      {user.restrictionReason && <small className="preview-restriction-reason">Alasan: {user.restrictionReason}</small>}
                    </td>
                    <td>
                      {user.status === 'Dibatasi' ? (
                        <button className="preview-inline-action" onClick={() => removeRestriction(user)}>Buka blokir</button>
                      ) : blockingUserId === user.id ? (
                        <form className="preview-ban-form" onSubmit={(event) => applyRestriction(event, user)}>
                          <label className="sr-only" htmlFor={`restriction-${user.id}`}>Alasan pembatasan untuk {user.name}</label>
                          <input id={`restriction-${user.id}`} required value={banReason} onChange={(event) => setBanReason(event.target.value)} placeholder="Alasan pembatasan" />
                          <button type="submit">Simpan</button>
                          <button type="button" onClick={() => { setBlockingUserId(null); setBanReason(''); }}>Batal</button>
                        </form>
                      ) : (
                        <button className="preview-inline-action" onClick={() => { setBlockingUserId(user.id); setBanReason(''); }}>Blokir akun</button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {visibleUsers.length === 0 && <tr><td colSpan={6}>Tidak ada pengguna yang cocok dengan filter.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
      <div className="notice notice-info" role="note">
        OPEN-13: kebijakan blokir belum diputuskan. Status dan alasan di sini hanya simulasi; tidak mengubah akses atau sesi akun.
      </div>
    </>
  );
}
