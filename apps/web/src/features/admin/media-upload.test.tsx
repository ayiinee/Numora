import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { MediaUpload, putMedia } from './media-upload';
import { ApiProblem } from '@/lib/api';
const api = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', async (original) => ({ ...(await original<object>()), apiRequest: api }));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});
it('notifies the importer and clears its reservation when the server revokes upload access', async () => {
  const denied = vi.fn();
  api.mockRejectedValueOnce(new ApiProblem(403, 'FORBIDDEN', 'Upload access revoked'));
  const file = new File(['TEST'], 'test.png', { type: 'image/png' });
  Object.defineProperty(file, 'arrayBuffer', {
    value: async () => new TextEncoder().encode('TEST').buffer,
  });
  render(<MediaUpload token="TEST_ONLY" onAccessDenied={denied} />);
  fireEvent.change(screen.getByLabelText('ID soal sumber'), { target: { value: 'Q1' } });
  fireEvent.change(screen.getByLabelText('ID asset'), { target: { value: 'stem-1' } });
  fireEvent.change(screen.getByLabelText('File gambar'), { target: { files: [file] } });
  fireEvent.click(screen.getByRole('button', { name: 'Upload dan verifikasi' }));
  await screen.findByText('Upload access revoked');
  expect(denied).toHaveBeenCalledTimes(1);
});
it('puts exact bytes without API credentials and excludes browser-owned Content-Length', async () => {
  const headers: Record<string, string> = {};
  class Xhr {
    upload = {
      onprogress: null as
        ((e: { lengthComputable: boolean; loaded: number; total: number }) => void) | null,
    };
    status = 200;
    onload: (() => void) | null = null;
    open = vi.fn();
    setRequestHeader(k: string, v: string) {
      headers[k] = v;
    }
    send() {
      this.upload.onprogress?.({ lengthComputable: true, loaded: 10, total: 10 });
      this.onload?.();
    }
  }
  vi.stubGlobal('XMLHttpRequest', Xhr);
  const progress = vi.fn();
  await putMedia(
    'https://storage.example.test/signed',
    { 'Content-Type': 'image/png', 'Content-Length': '10' },
    new File(['TEST'], 'test.png', { type: 'image/png' }),
    progress,
  );
  expect(headers).toEqual({ 'Content-Type': 'image/png' });
  expect(progress).toHaveBeenCalledWith(100);
});
it('retries completion after provider failure and shows only the VERIFIED durable receipt', async () => {
  const send = vi.fn();
  class Xhr {
    upload = {};
    status = 200;
    onload: (() => void) | null = null;
    open() {}
    setRequestHeader() {}
    send() {
      send();
      this.onload?.();
    }
  }
  vi.stubGlobal('XMLHttpRequest', Xhr);
  const receipt = {
    uploadId: 'upload',
    externalId: 'Q1',
    assetId: 'stem-1',
    status: 'VERIFIED',
    bucket: 'TEST',
    objectKey: 'durable/key',
    sha256: 'a'.repeat(64),
    byteLength: 10,
    contentType: 'image/png',
    verifiedAt: '2026-10-05T00:00:00Z',
  };
  api
    .mockResolvedValueOnce({
      ...receipt,
      status: 'PENDING',
      uploadUrl: 'https://storage.example.test/SECRET_SIGNED_URL',
      headers: { 'Content-Type': 'image/png' },
      expiresAt: new Date(Date.now() + 600000).toISOString(),
    })
    .mockRejectedValueOnce(Error('TEST R2 outage'))
    .mockResolvedValueOnce(receipt);
  const file = new File(['TEST bytes'], 'test.png', { type: 'image/png' });
  Object.defineProperty(file, 'arrayBuffer', {
    value: async () => new TextEncoder().encode('TEST bytes').buffer,
  });
  render(<MediaUpload token="TEST_ONLY" />);
  fireEvent.change(screen.getByLabelText('ID soal sumber'), { target: { value: 'Q1' } });
  fireEvent.change(screen.getByLabelText('ID asset'), { target: { value: 'stem-1' } });
  fireEvent.change(screen.getByLabelText('File gambar'), { target: { files: [file] } });
  fireEvent.click(screen.getByRole('button', { name: 'Upload dan verifikasi' }));
  await screen.findByText('TEST R2 outage');
  fireEvent.click(screen.getByRole('button', { name: 'Coba upload / verifikasi lagi' }));
  await waitFor(() => expect(screen.getByText(/durable\/key/)).toBeTruthy());
  expect(send).toHaveBeenCalledTimes(1);
  expect(api.mock.calls.map(([path]) => path)).toEqual([
    'admin/content/media/uploads',
    'admin/content/media/uploads/upload/complete',
    'admin/content/media/uploads/upload/complete',
  ]);
  expect(document.body.textContent).not.toContain('SECRET_SIGNED_URL');
});
