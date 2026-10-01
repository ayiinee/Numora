import { useState, type FormEvent } from 'react';
import { Metric, PreviewNote } from '../shared';
import type { PreviewRecord, School, StateSetter } from '../types';

type Props = {
  schools: School[];
  setSchools: StateSetter<School[]>;
  record: PreviewRecord;
};

export function SchoolsSection({ schools, setSchools, record }: Props) {
  const [showForm, setShowForm] = useState(false);

  function createSchool(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get('name') ?? '').trim();
    const region = String(form.get('region') ?? '').trim();
    if (!name || !region) return;
    setSchools((current) => [
      {
        id: `SCH-DEMO-${String(current.length + 1).padStart(2, '0')}`,
        name,
        region,
        teachers: 0,
        classes: 0,
        students: 0,
        status: 'Aktif',
        tokenStatus: 'Belum terbit',
      },
      ...current,
    ]);
    setShowForm(false);
    record(`menambahkan sekolah ${name}`);
  }

  return (
    <>
      <div className="metric-grid">
        <Metric label="Sekolah" value={String(schools.length).padStart(2, '0')} detail="Termasuk nonaktif" />
        <Metric label="Guru" value={String(schools.reduce((sum, item) => sum + item.teachers, 0))} detail="Jumlah contoh" />
        <Metric label="Kelas" value={String(schools.reduce((sum, item) => sum + item.classes, 0))} detail="Jumlah contoh" />
        <Metric label="Siswa" value={String(schools.reduce((sum, item) => sum + item.students, 0))} detail="Jumlah contoh" />
      </div>
      <div className="heading-actions preview-school-actions">
        <button className="button button-primary" onClick={() => setShowForm((open) => !open)}>
          {showForm ? 'Tutup formulir' : '＋ Tambah sekolah'}
        </button>
      </div>
      {showForm && (
        <form className="preview-inline-form" onSubmit={createSchool}>
          <label>
            Nama sekolah
            <input name="name" required placeholder="Contoh: SMP Tunas Bangsa" />
          </label>
          <label>
            Kota/kabupaten
            <input name="region" required placeholder="Contoh: Bandung" />
          </label>
          <button className="button button-primary" type="submit">Simpan simulasi</button>
        </form>
      )}
      <section className="content-section">
        <div className="section-heading">
          <div>
            <h2>Sekolah demo</h2>
            <span>Aksi sekolah dan token hanya lokal</span>
          </div>
        </div>
        <div className="preview-table-wrap">
          <table className="preview-table">
            <thead>
              <tr>
                <th>SEKOLAH</th>
                <th>STATUS</th>
                <th>GURU / KELAS / SISWA</th>
                <th>TOKEN GURU</th>
                <th>AKSI</th>
              </tr>
            </thead>
            <tbody>
              {schools.map((school) => (
                <tr key={school.id}>
                  <td><b>{school.name}</b><small>{school.id} · {school.region}</small></td>
                  <td>
                    <span className={`status-pill ${school.status === 'Aktif' ? 'status-ready' : 'status-archived'}`}>
                      <span />{school.status}
                    </span>
                  </td>
                  <td>{school.teachers} / {school.classes} / {school.students}</td>
                  <td>{school.tokenStatus}</td>
                  <td>
                    <div className="preview-row-actions">
                      <button onClick={() => {
                        setSchools((current) => current.map((item) => item.id === school.id
                          ? { ...item, status: item.status === 'Aktif' ? 'Nonaktif' : 'Aktif' }
                          : item));
                        record(`mengubah status sekolah ${school.name}`);
                      }}>
                        {school.status === 'Aktif' ? 'Nonaktifkan' : 'Aktifkan'}
                      </button>
                      <button onClick={() => {
                        setSchools((current) => current.map((item) => item.id === school.id
                          ? { ...item, tokenStatus: item.tokenStatus === 'Aktif' ? 'Dicabut' : 'Aktif' }
                          : item));
                        record(`${school.tokenStatus === 'Aktif' ? 'mencabut' : 'menerbitkan ulang'} token Guru untuk ${school.name}`);
                      }}>
                        {school.tokenStatus === 'Aktif' ? 'Cabut token' : school.tokenStatus === 'Dicabut' ? 'Terbitkan ulang' : 'Terbitkan token'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="content-section preview-subsection">
        <div className="section-heading">
          <div><h2>Kelas contoh</h2><span>Ringkasan struktur kelas, bukan daftar anggota nyata</span></div>
        </div>
        <div className="preview-class-list">
          <div><b>IX-A</b><span>SMP Nusantara 01 · Guru demo: R. Putri · 32 siswa</span></div>
          <div><b>IX-B</b><span>SMP Nusantara 01 · Guru demo: A. Hadi · 28 siswa</span></div>
          <div><b>MTs-9A</b><span>MTs Cendekia · Guru demo: N. Sari · 24 siswa</span></div>
        </div>
      </section>
      <PreviewNote>
        Token asli single-use berlaku 3×24 jam. Preview ini tidak menerbitkan token yang dapat dipakai login.
      </PreviewNote>
    </>
  );
}
