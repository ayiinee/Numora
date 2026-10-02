import { Metric, PreviewNote } from '../shared';
import type { PreviewRecord } from '../types';

export function IrtSection({ record }: { record: PreviewRecord }) {
  return (
    <>
      <div className="metric-grid">
        <Metric label="Respons terkumpul" value="42" detail="Data fixture untuk item demo" />
        <Metric label="Ambang minimum" value="30" detail="PRD v0.5 sebelum hasil ditampilkan" />
        <Metric label="Batch terakhir" value="01 Okt 2026" detail="Status contoh, bukan proses nyata" />
        <Metric label="Model IRT" value="OPEN-12" detail="Parameter final belum diputuskan" />
      </div>
      <section className="content-section">
        <div className="section-heading">
          <div>
            <h2>Kecukupan data per soal</h2>
            <span>Preview hanya menampilkan ambang minimum</span>
          </div>
          <button className="button button-secondary" onClick={() => record('menjalankan simulasi batch IRT')}>
            Jalankan simulasi batch
          </button>
        </div>
        <div className="preview-table-wrap">
          <table className="preview-table">
            <thead>
              <tr>
                <th>SOAL DEMO</th>
                <th>RESPONDEN</th>
                <th>STATUS</th>
                <th>HASIL</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <b>NUM-0421 · Operasi pecahan</b>
                  <small>Versi demo V2</small>
                </td>
                <td>42</td>
                <td>
                  <span className="status-pill status-ready">
                    <span />
                    Cukup untuk ditampilkan
                  </span>
                </td>
                <td>Parameter tidak dihitung pada preview</td>
              </tr>
              <tr>
                <td>
                  <b>ALG-0318 · Persamaan linear</b>
                  <small>Versi demo V1</small>
                </td>
                <td>18</td>
                <td>
                  <span className="status-pill status-draft">
                    <span />
                    Data belum cukup
                  </span>
                </td>
                <td>Perlu minimal 30 responden</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
      <PreviewNote>
        PRD menetapkan batch harian dan minimum 30 respons. Model serta parameter IRT masih OPEN-12.
      </PreviewNote>
    </>
  );
}
