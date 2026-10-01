import type { DemoVideo, PreviewRecord, StateSetter } from '../types';

type Props = {
  videos: DemoVideo[];
  setVideos: StateSetter<DemoVideo[]>;
  record: PreviewRecord;
};

export function VideosSection({ videos, setVideos, record }: Props) {
  function addVideo() {
    const id = Math.max(0, ...videos.map((item) => item.id)) + 1;
    setVideos((current) => [
      { id, title: `Video demo baru ${id}`, subchapter: 'Belum dipetakan', status: 'Diarsipkan' },
      ...current,
    ]);
    record('menambahkan metadata video demo');
  }

  return (
    <section className="content-section">
      <div className="section-heading">
        <div><h2>Metadata rekomendasi</h2><span>Video dummy untuk pemetaan subbab</span></div>
          <button className="button button-primary" onClick={addVideo}>＋ Tambah metadata</button>
      </div>
      <div className="preview-table-wrap">
        <table className="preview-table">
          <thead><tr><th>VIDEO</th><th>SUBBAB</th><th>STATUS</th><th>AKSI</th></tr></thead>
          <tbody>
            {videos.map((video) => (
              <tr key={video.id}>
                <td><b>{video.title}</b><small>VID-DEMO-{String(video.id).padStart(3, '0')}</small></td>
                <td>{video.subchapter}</td>
                <td>
                  <span className={`status-pill ${video.status === 'Aktif' ? 'status-ready' : 'status-archived'}`}>
                    <span />{video.status}
                  </span>
                </td>
                <td>
                  <div className="preview-row-actions">
                    <button onClick={() => {
                      setVideos((current) => current.map((item) => item.id === video.id
                        ? { ...item, status: item.status === 'Aktif' ? 'Diarsipkan' : 'Aktif' }
                        : item));
                      record(`${video.status === 'Aktif' ? 'mengarsipkan' : 'mengaktifkan'} ${video.title}`);
                    }}>
                      {video.status === 'Aktif' ? 'Arsipkan' : 'Aktifkan'}
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
