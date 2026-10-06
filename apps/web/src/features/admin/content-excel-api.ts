import { apiRequest, ApiProblem } from '@/lib/api';
import type {
  ExcelAssetDto,
  ExcelEnvelopeDto,
  ExcelParseDto,
  ExcelMediaDto,
  MediaUploadReceiptDto,
  MediaUploadReservationDto,
} from './generated-types';

export function parseExcelFile(
  token: string,
  file: File,
  sourceNamespace: string,
  packageId?: string,
) {
  const body = new FormData();
  body.append('file', file);
  body.append('sourceNamespace', sourceNamespace);
  if (packageId) body.append('packageId', packageId);
  return apiRequest<ExcelParseDto>('admin/content/excel-parses', token, { method: 'POST', body });
}
export const downloadExcelTemplate = (token: string, packageId?: string, examples = false) =>
  apiRequest<Blob>(
    `admin/content/excel-template${packageId ? `?packageId=${encodeURIComponent(packageId)}&examples=${examples}` : ''}`,
    token,
    undefined,
    'blob',
  );
export function downloadFile(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export type UploadCache = Map<string, { key: string; receipt?: MediaUploadReceiptDto }>;
function verifyReceipt(asset: ExcelAssetDto, receipt: MediaUploadReceiptDto) {
  if (
    receipt.status !== 'VERIFIED' ||
    receipt.externalId !== asset.externalId ||
    receipt.assetId !== asset.assetId ||
    receipt.sha256 !== asset.sha256 ||
    receipt.byteLength !== asset.byteLength ||
    receipt.contentType !== asset.contentType ||
    !receipt.objectKey ||
    !receipt.bucket
  )
    throw Error('Receipt gambar tidak sesuai; soal belum disimpan.');
}
export async function uploadExcelMedia(
  token: string,
  envelope: ExcelEnvelopeDto,
  media: ExcelMediaDto[],
  cache: UploadCache,
  progress: (message: string) => void,
): Promise<ExcelEnvelopeDto> {
  const body = structuredClone(envelope);
  const assets = body.questions.flatMap((q) => q.metadata.assetManifest);
  for (const [index, asset] of assets.entries()) {
    progress(`Mengunggah dan memverifikasi gambar ${index + 1}/${assets.length}…`);
    const identity = `${asset.externalId}:${asset.assetId}:${asset.sha256}`;
    let entry = cache.get(identity);
    if (!entry) {
      entry = { key: crypto.randomUUID() };
      cache.set(identity, entry);
    }
    if (!entry.receipt) {
      const dto = {
        externalId: asset.externalId,
        assetId: asset.assetId,
        contentVersion: 1,
        contentType: asset.contentType,
        byteLength: asset.byteLength,
        sha256: asset.sha256,
      };
      const reserved = await apiRequest<MediaUploadReservationDto>(
        'admin/content/media/uploads',
        token,
        { method: 'POST', body: JSON.stringify(dto), headers: { 'Idempotency-Key': entry.key } },
      );
      if (reserved.status === 'VERIFIED') entry.receipt = reserved;
      else {
        if (Date.parse(reserved.expiresAt) <= Date.now()) {
          cache.delete(identity);
          throw Error(
            'Reservasi gambar kedaluwarsa. Coba simpan lagi untuk membuat reservasi baru.',
          );
        }
        const extracted = media.find(
          (m) => m.externalId === asset.externalId && m.assetId === asset.assetId,
        );
        if (!extracted || !reserved.uploadUrl || reserved.method !== 'PUT')
          throw Error('Data unggah gambar belum lengkap.');
        const url = new URL(reserved.uploadUrl);
        if (
          url.protocol !== 'https:' ||
          !/^[a-f0-9]+\.r2\.cloudflarestorage\.com$/i.test(url.hostname)
        )
          throw Error('Alamat unggah R2 tidak valid.');
        const bytes = Uint8Array.from(atob(extracted.base64), (c) => c.charCodeAt(0));
        if (bytes.length !== asset.byteLength) throw Error('Ukuran gambar lokal tidak sesuai.');
        const uploaded = await fetch(url, {
          method: 'PUT',
          headers: { 'Content-Type': asset.contentType },
          body: new Blob([bytes], { type: asset.contentType }),
          credentials: 'omit',
        });
        if (!uploaded.ok)
          throw Error(
            `Unggah gambar gagal (${uploaded.status}); soal belum disimpan. Coba simpan lagi.`,
          );
        try {
          entry.receipt = await apiRequest<MediaUploadReceiptDto>(
            `admin/content/media/uploads/${encodeURIComponent(reserved.uploadId)}/complete`,
            token,
            { method: 'POST' },
          );
        } catch (error) {
          if (error instanceof ApiProblem && error.status === 410) cache.delete(identity);
          throw error;
        }
      }
    }
    verifyReceipt(asset, entry.receipt);
    asset.objectKey = entry.receipt.objectKey;
    asset.bucket = entry.receipt.bucket;
  }
  return body;
}
