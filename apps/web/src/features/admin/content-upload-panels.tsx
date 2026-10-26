'use client';
import { Button } from '@tka/ui';
import type { Dispatch, SetStateAction } from 'react';
import { AdminPagination } from './admin-pagination';
import { AdminMessage } from './admin-presentation';
import { downloadFile } from './content-excel-api';
import { uploadTemplate } from './content-upload-api';
import { labels, typeLabels } from './content-upload-labels';
import type { UploadListDto } from './generated-types';
import { ADMIN_PAGE_SIZE } from './pagination';
type SetValue<T> = Dispatch<SetStateAction<T>>;
type Run = (action: () => Promise<void>) => Promise<void>;

export function UploadSourcePanel({
  busy,
  token,
  run,
  dragging,
  setDragging,
  setError,
  choose,
}: {
  busy: boolean;
  token: string;
  run: Run;
  dragging: boolean;
  setDragging: SetValue<boolean>;
  setError: SetValue<string>;
  choose: (file: File) => void;
}) {
  return (
    <section className="upload-panel" aria-labelledby="upload-heading">
      <h2 id="upload-heading">1. Upload Excel</h2>
      <p>Gunakan template berikut. Jenis paket dan judul dipilih setelah soal diperiksa.</p>
      <Button
        variant="secondary"
        disabled={busy}
        onClick={() =>
          void run(async () => downloadFile(await uploadTemplate(token), 'NUMORA_EXCEL_V5.xlsx'))
        }
      >
        Unduh template Excel
      </Button>
      <div
        className={`excel-dropzone${dragging ? ' excel-dropzone-active' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          if (!busy) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (busy) return;
          if (e.dataTransfer.files.length !== 1) {
            setError('Upload satu file Excel.');
            return;
          }
          choose(e.dataTransfer.files[0]!);
        }}
      >
        <p>Tarik dan lepas file Excel di sini, atau pilih file.</p>
        <label>
          File soal Excel
          <input
            type="file"
            accept=".xlsx"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) choose(file);
            }}
          />
        </label>
        <small>.xlsx, maksimal 10 MiB. Gambar harus tertanam di Excel.</small>
      </div>
    </section>
  );
}

export function UploadHistory({
  busy,
  reset,
  search,
  setSearch,
  filterType,
  setFilterType,
  filterStatus,
  setFilterStatus,
  offset,
  setOffset,
  history,
  historyError,
  historyLoading,
  setReload,
  run,
  open,
}: {
  busy: boolean;
  reset: () => void;
  search: string;
  setSearch: SetValue<string>;
  filterType: string;
  setFilterType: SetValue<string>;
  filterStatus: string;
  setFilterStatus: SetValue<string>;
  offset: number;
  setOffset: SetValue<number>;
  history: UploadListDto;
  historyError: string;
  historyLoading: boolean;
  setReload: SetValue<number>;
  run: Run;
  open: (id: string) => Promise<void>;
}) {
  return (
    <section className="upload-panel">
      <div className="upload-history-heading">
        <h2>Riwayat unggahan</h2>
        <Button disabled={busy} onClick={reset}>
          Upload baru
        </Button>
      </div>
      <div className="upload-history-filters">
        <label>
          Cari file atau judul
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setOffset(0);
            }}
          />
        </label>
        <label>
          Jenis
          <select
            value={filterType}
            onChange={(e) => {
              setFilterType(e.target.value);
              setOffset(0);
            }}
          >
            <option value="">Semua jenis</option>
            {Object.entries(typeLabels).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Status
          <select
            value={filterStatus}
            onChange={(e) => {
              setFilterStatus(e.target.value);
              setOffset(0);
            }}
          >
            <option value="">Semua status</option>
            {Object.entries(labels).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {historyError ? (
        <AdminMessage message={historyError} error retry={() => setReload((n) => n + 1)} />
      ) : historyLoading ? (
        <p role="status">Memuat riwayat…</p>
      ) : !history.items.length ? (
        <p>Belum ada unggahan yang sesuai filter.</p>
      ) : (
        <div
          className="upload-history-scroll"
          role="region"
          aria-label="Tabel riwayat unggahan"
          tabIndex={0}
        >
          <table className="upload-history-table">
            <thead>
              <tr>
                <th>File / waktu</th>
                <th>Admin</th>
                <th>Judul / jenis</th>
                <th>Soal</th>
                <th>Validasi</th>
                <th>Status</th>
                <th>Tindakan</th>
              </tr>
            </thead>
            <tbody>
              {history.items.map((item) => (
                <tr key={item.id}>
                  <td>
                    <strong>{item.fileName}</strong>
                    <small>
                      {new Date(item.createdAt).toLocaleString('id-ID', {
                        timeZone: 'Asia/Jakarta',
                      })}{' '}
                      WIB
                    </small>
                  </td>
                  <td>{item.actorName}</td>
                  <td>
                    {item.title ?? 'Belum dipilih'}
                    <small>
                      {item.assessmentType
                        ? typeLabels[item.assessmentType as keyof typeof typeLabels]
                        : '—'}
                    </small>
                  </td>
                  <td>{item.questionCount}</td>
                  <td>{item.validationResult ?? 'Belum divalidasi'}</td>
                  <td>
                    <span className={`upload-status upload-status-${item.status.toLowerCase()}`}>
                      {labels[item.status] ?? item.status}
                    </span>
                  </td>
                  <td>
                    <Button
                      variant="secondary"
                      disabled={busy}
                      onClick={() => void run(() => open(item.id))}
                    >
                      {['PUBLISHED', 'CLOSED', 'ARCHIVED', 'INVALID'].includes(item.status)
                        ? 'Lihat'
                        : 'Lanjutkan'}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p>{history.total} unggahan</p>
      <AdminPagination
        offset={offset}
        hasNext={offset + ADMIN_PAGE_SIZE < history.total}
        onChange={setOffset}
        disabled={historyLoading || busy}
        label="Halaman riwayat unggahan"
      />
    </section>
  );
}
