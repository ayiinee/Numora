'use client';
import { useRef, useState } from 'react';
import { Button, Card } from '@tka/ui';
import { apiRequest, ApiProblem } from '@/lib/api';
import type {
  CreateMediaUploadDto,
  MediaUploadReceiptDto,
  MediaUploadReservationDto,
} from './generated-types';
import { AdminMessage } from './admin-presentation';

export function putMedia(
  url: string,
  headers: Record<string, string>,
  file: File,
  progress: (value: number) => void,
) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    // No Auth bearer token or cookies are sent to storage. Content-Length is browser-owned.
    Object.entries(headers)
      .filter(([key]) => key.toLowerCase() !== 'content-length')
      .forEach(([k, v]) => xhr.setRequestHeader(k, v));
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) progress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onerror = () =>
      reject(Error('Upload gagal. Periksa koneksi atau CORS storage lalu coba lagi.'));
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(
            Error('Storage menolak upload. Coba lagi; reservasi yang kedaluwarsa akan diperbarui.'),
          );
    xhr.send(file);
  });
}
export function MediaUpload({
  token,
  onAccessDenied,
}: {
  token: string;
  onAccessDenied?: () => void;
}) {
  const [file, setFile] = useState<File | null>(null),
    [externalId, setExternalId] = useState(''),
    [assetId, setAssetId] = useState(''),
    [version, setVersion] = useState(1),
    [progress, setProgress] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [receipt, setReceipt] = useState<MediaUploadReceiptDto | null>(null);
  const op = useRef<string | null>(null),
    reservation = useRef<MediaUploadReservationDto | null>(null),
    uploaded = useRef(false);
  function reset() {
    op.current = null;
    reservation.current = null;
    uploaded.current = false;
    setReceipt(null);
    setProgress(0);
    setError('');
  }
  async function upload() {
    if (!file || busy) return;
    setBusy(true);
    setError('');
    try {
      if (
        !['image/png', 'image/jpeg', 'image/webp'].includes(file.type) ||
        !file.size ||
        file.size > 5_242_880
      )
        throw Error('Pilih PNG/JPEG/WebP berukuran 1 byte–5 MiB.');
      const sha256 = Array.from(
        new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer())),
        (b) => b.toString(16).padStart(2, '0'),
      ).join('');
      const body: CreateMediaUploadDto = {
        externalId,
        assetId,
        contentVersion: version,
        contentType: file.type as CreateMediaUploadDto['contentType'],
        byteLength: file.size,
        sha256,
      };
      if (reservation.current && Date.parse(reservation.current.expiresAt) <= Date.now()) {
        op.current = null;
        reservation.current = null;
        uploaded.current = false;
      }
      op.current ??= crypto.randomUUID();
      const r =
        reservation.current ??
        (await apiRequest<MediaUploadReservationDto>('admin/content/media/uploads', token, {
          method: 'POST',
          headers: { 'Idempotency-Key': op.current },
          body: JSON.stringify(body),
        }));
      reservation.current = r;
      if (r.status === 'VERIFIED') {
        setReceipt(r);
        setProgress(100);
        return;
      }
      if (!uploaded.current) {
        if (!r.uploadUrl || !r.headers) throw Error('Reservasi upload tidak lengkap.');
        await putMedia(r.uploadUrl, r.headers, file, setProgress);
        uploaded.current = true;
      }
      const verified = await apiRequest<MediaUploadReceiptDto>(
        `admin/content/media/uploads/${r.uploadId}/complete`,
        token,
        { method: 'POST' },
      );
      if (verified.status !== 'VERIFIED') throw Error('Media belum terverifikasi.');
      setReceipt(verified);
      setProgress(100);
    } catch (e) {
      if (e instanceof ApiProblem && [401, 403].includes(e.status)) {
        reset();
        setFile(null);
        onAccessDenied?.();
      }
      if (e instanceof ApiProblem && e.status === 410) {
        op.current = null;
        reservation.current = null;
        uploaded.current = false;
      }
      setError(e instanceof Error ? e.message : 'Upload gagal.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card className="content-import-card">
      <h2>Upload media soal</h2>
      <p>
        Media baru dapat digunakan setelah receipt VERIFIED. Simpan object key dan metadata receipt
        pada assetManifest JSON.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void upload();
        }}
      >
        <label>
          ID soal sumber
          <input
            value={externalId}
            required
            maxLength={128}
            pattern="[A-Za-z0-9][A-Za-z0-9_-]{0,127}"
            disabled={busy}
            onChange={(e) => {
              reset();
              setExternalId(e.target.value);
            }}
          />
        </label>
        <label>
          ID asset
          <input
            value={assetId}
            required
            pattern="[a-z0-9][a-z0-9-]{0,63}"
            disabled={busy}
            onChange={(e) => {
              reset();
              setAssetId(e.target.value);
            }}
          />
        </label>
        <label>
          Versi konten
          <input
            type="number"
            min={1}
            max={100000}
            value={version}
            disabled={busy}
            onChange={(e) => {
              reset();
              setVersion(Number(e.target.value));
            }}
          />
        </label>
        <label>
          File gambar
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            disabled={busy}
            onChange={(e) => {
              reset();
              setFile(e.target.files?.[0] ?? null);
            }}
          />
        </label>
        <Button disabled={busy || !file || receipt !== null}>
          {busy ? 'Memproses…' : error ? 'Coba upload / verifikasi lagi' : 'Upload dan verifikasi'}
        </Button>
      </form>
      <progress value={progress} max={100} aria-label="Progress upload" />
      <p role="status">
        {progress}% {receipt ? '— VERIFIED' : ''}
      </p>
      {error && <AdminMessage error message={error} />}
      {receipt && (
        <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
          {JSON.stringify(receipt, null, 2)}
        </pre>
      )}
    </Card>
  );
}
