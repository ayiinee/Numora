import { type Dispatch, type SetStateAction } from 'react';
import type { DemoReport, PreviewRecord } from '../types';

type Props = {
  reports: DemoReport[];
  setReports: Dispatch<SetStateAction<DemoReport[]>>;
  record: PreviewRecord;
  onNavigate: (section: 'Audit') => void;
};

/**
 * Lists incoming demo reports with anonymized details and lets the user
 * advance a report's review status.
 */
export function ReportsSection({ reports, setReports, record, onNavigate }: Props) {
  return (
    <section className="content-section">
      <div className="section-heading">
        <div><h2>Laporan masuk</h2><span>ID siswa dan detail personal disamarkan</span></div>
          <button className="button button-secondary" onClick={() => onNavigate('Audit')}>Buka audit</button>
      </div>
      <div className="preview-table-wrap">
        <table className="preview-table">
          <thead><tr><th>REFERENSI</th><th>ALASAN</th><th>STATUS</th><th>AKSI</th></tr></thead>
          <tbody>
            {reports.map((report) => (
              <tr key={report.id}>
                <td><b>{report.item}</b><small>{report.id} · Siswa demo</small></td>
                <td>{report.reason}</td>
                <td>
                  <span className={`status-pill ${report.status === 'Selesai' ? 'status-ready' : 'status-draft'}`}>
                    <span />{report.status}
                  </span>
                </td>
                <td>
                  <div className="preview-row-actions">
                    <button
                      disabled={report.status === 'Selesai'}
                      onClick={() => {
                        const status = report.status === 'Baru' ? 'Ditinjau' : 'Selesai';
                        setReports((current) => current.map((item) => item.id === report.id ? { ...item, status } : item));
                        record(`mengubah status laporan ${report.id} menjadi ${status}`);
                      }}
                    >
                      {report.status === 'Baru' ? 'Mulai tinjau' : report.status === 'Ditinjau' ? 'Tandai selesai' : 'Selesai'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
