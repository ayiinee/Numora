import { Metric, PreviewNote } from '../shared';
import type { AdminPreviewView, DemoPackage, DemoReport, School } from '../types';

type Props = {
  schools: School[];
  reports: DemoReport[];
  packages: DemoPackage[];
  onNavigate: (section: AdminPreviewView) => void;
};

/**
 * Dashboard overview showing summary metrics and shortcuts to other admin
 * preview sections.
 */
export function OverviewSection({ schools, reports, packages, onNavigate }: Props) {
  const openReports = reports.filter((report) => report.status !== 'Selesai').length;
  const draftPackages = packages.filter((item) => item.status === 'Draf').length;

  return (
    <>
      <div className="metric-grid">
        <Metric
          label="Sekolah aktif"
          value={String(schools.filter((item) => item.status === 'Aktif').length).padStart(2, '0')}
          detail="Termasuk data demo"
        />
        <Metric label="Soal siap digunakan" value="12" detail="Versi dummy" />
        <Metric
          label="Laporan terbuka"
          value={String(openReports).padStart(2, '0')}
          detail="Perlu ditinjau"
        />
        <Metric
          label="Paket draf"
          value={String(draftPackages).padStart(2, '0')}
          detail="Belum diterbitkan"
        />
      </div>
      <section className="content-section">
        <div className="section-heading">
              <div>
            <h2>Akses cepat</h2>
            <span>Pilih area untuk mencoba alurnya</span>
          </div>
              <button className="button button-secondary" onClick={() => onNavigate('Audit')}>
                Lihat audit
              </button>
        </div>
        <div className="preview-shortcuts">
          {(
            [
              'Sekolah & kelas',
              'Bank soal',
              'Paket',
              'Konten video',
              'Laporan',
              'Analitik IRT',
            ] as AdminPreviewView[]
          ).map((item) => (
            <button className="shortcut-row" key={item} onClick={() => onNavigate(item)}>
              <span>{item}</span>
              <span aria-hidden="true">↗</span>
            </button>
          ))}
        </div>
      </section>
      <PreviewNote>Ringkasan memakai angka fixture, bukan data operasional.</PreviewNote>
    </>
  );
}
