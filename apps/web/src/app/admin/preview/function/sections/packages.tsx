import { PreviewNote } from '../shared';
import type { DemoPackage, PreviewRecord, StateSetter } from '../types';

type Props = {
  packages: DemoPackage[];
  setPackages: StateSetter<DemoPackage[]>;
  record: PreviewRecord;
};

/**
 * Lists draft Tryout packages and allows simulating draft creation and
 * marking packages as reviewed.
 */
export function PackagesSection({ packages, setPackages, record }: Props) {
  /**
   * Adds a new draft package to local state and records the action.
   */
  function addPackage() {
    const id = Math.max(0, ...packages.map((item) => item.id)) + 1;
    setPackages((current) => [
      { id, name: `Paket Tryout Demo ${String.fromCharCode(64 + id)}`, status: 'Draf' },
      ...current,
    ]);
    record('membuat draf paket Tryout');
  }

  return (
    <>
      <div className="notice notice-info" role="note">
        OPEN-05: jumlah soal, durasi, domain, dan komposisi Tryout resmi belum diputuskan. Paket di sini hanya draf demo dan tidak bisa diterbitkan.
      </div>
      <section className="content-section">
        <div className="section-heading">
          <div>
            <h2>Draf paket Tryout</h2>
            <span>Rilis mingguan 00:00 WIB ditampilkan sebagai aturan, bukan dijalankan oleh preview</span>
          </div>
          <button className="button button-primary" onClick={addPackage}>＋ Buat draf</button>
        </div>
        <div className="preview-table-wrap">
          <table className="preview-table">
            <thead><tr><th>NAMA PAKET</th><th>STATUS</th><th>PERIODE</th><th>AKSI</th></tr></thead>
            <tbody>
              {packages.map((item) => (
                <tr key={item.id}>
                  <td><b>{item.name}</b><small>Konten dan konfigurasi contoh</small></td>
                  <td>
                    <span className={`status-pill ${item.status === 'Ditinjau' ? 'status-ready' : 'status-draft'}`}>
                      <span />{item.status}
                    </span>
                  </td>
                  <td>Belum ditetapkan</td>
                  <td>
                    <div className="preview-row-actions">
                      <button
                        disabled={item.status === 'Ditinjau'}
                        onClick={() => {
                          setPackages((current) => current.map((entry) => entry.id === item.id
                            ? { ...entry, status: 'Ditinjau' }
                            : entry));
                          record(`menandai ${item.name} sudah ditinjau`);
                        }}
                      >
                        {item.status === 'Ditinjau' ? 'Sudah ditinjau' : 'Tandai ditinjau'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <PreviewNote>
        Hasil Tryout sungguhan baru tersedia setelah batch IRT terkait selesai; tidak ada skor atau rilis resmi dalam demo ini.
      </PreviewNote>
    </>
  );
}
