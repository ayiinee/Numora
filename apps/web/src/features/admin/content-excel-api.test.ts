import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { apiRequest, ApiProblem } from '@/lib/api';
import { parseExcelFile, uploadExcelMedia, type UploadCache } from './content-excel-api';
import type { ExcelEnvelopeDto, MediaUploadReservationDto } from './generated-types';
vi.mock('@/lib/api', async (original) => ({
  ...(await original<typeof import('@/lib/api')>()),
  apiRequest: vi.fn(),
}));
const asset = {
  externalId: 'TEST',
  assetId: 'x-test',
  textMarker: '[[asset:x-test]]',
  placement: 'STEM' as const,
  itemId: null,
  assetOrder: 1,
  altText: 'TEST ONLY image',
  objectKey: null,
  sha256: 'a'.repeat(64),
  contentType: 'image/png',
  byteLength: 3,
  bucket: 'test-bucket',
};
const envelope: ExcelEnvelopeDto = {
  schemaVersion: 2,
  sourceNamespace: 'TEST',
  questions: [
    {
      externalId: 'TEST',
      type: 'SINGLE_CHOICE',
      chapterCode: 'TEST',
      subchapterCode: 'TEST',
      competencyCode: 'TEST',
      difficulty: null,
      stem: { text: 'TEST [[asset:x-test]]' },
      options: [],
      answer: { optionId: 'A' },
      explanation: { text: 'TEST' },
      metadata: {
        sourceLevelNumber: 1,
        sourceSheet: 'PG',
        sourceRowNumber: 2,
        assetManifest: [asset],
      },
    },
  ],
};
const pending: MediaUploadReservationDto = {
  ...asset,
  uploadId: 'upload',
  status: 'PENDING',
  objectKey: 'question-media/TEST/v1/x-test.png',
  verifiedAt: null,
  uploadUrl: 'https://abcd.r2.cloudflarestorage.com/TEST',
  method: 'PUT',
  headers: { 'Content-Type': 'image/png', 'Content-Length': '3' },
  expiresAt: '2099-01-01T00:00:00Z',
};
const verified = { ...pending, status: 'VERIFIED' as const, verifiedAt: '2026-10-05T00:00:00Z' };
const media = [{ externalId: 'TEST', assetId: 'x-test', base64: 'AQID' }];
beforeEach(() => {
  vi.resetAllMocks();
});
afterEach(() => {
  vi.unstubAllGlobals();
});
describe('Excel multipart and verified-media orchestration', () => {
  it('uses multipart without serializing the file or adding JSON content type', async () => {
    await parseExcelFile('TEST TOKEN', new File(['TEST'], 'test.xlsx'), 'TEST');
    const options = vi.mocked(apiRequest).mock.calls[0]![2]!;
    expect(options.body).toBeInstanceOf(FormData);
    expect((options.body as FormData).get('sourceNamespace')).toBe('TEST');
    expect(options.headers).toBeUndefined();
  });
  it('keeps final keys unset after failed PUT, retries same reservation, and reuses verified receipts', async () => {
    const put = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', put);
    vi.mocked(apiRequest).mockImplementation(async (path) =>
      path.endsWith('/complete') ? verified : pending,
    );
    const cache: UploadCache = new Map();
    await expect(uploadExcelMedia('TEST TOKEN', envelope, media, cache, vi.fn())).rejects.toThrow(
      'belum disimpan',
    );
    expect(envelope.questions[0]!.metadata.assetManifest[0]!.objectKey).toBeNull();
    expect(vi.mocked(apiRequest).mock.calls.some(([path]) => path.endsWith('/complete'))).toBe(
      false,
    );
    const body = await uploadExcelMedia('TEST TOKEN', envelope, media, cache, vi.fn());
    expect(body.questions[0]!.metadata.assetManifest[0]!.objectKey).toBe(verified.objectKey);
    expect(vi.mocked(apiRequest).mock.calls[0]![2]!.headers).toEqual(
      vi.mocked(apiRequest).mock.calls[1]![2]!.headers,
    );
    expect(put.mock.calls[1]![1]).toMatchObject({
      credentials: 'omit',
      headers: { 'Content-Type': 'image/png' },
    });
    expect(JSON.stringify(put.mock.calls)).not.toContain('TEST TOKEN');
    const calls = vi.mocked(apiRequest).mock.calls.length;
    await uploadExcelMedia('TEST TOKEN', envelope, media, cache, vi.fn());
    expect(apiRequest).toHaveBeenCalledTimes(calls);
    expect(JSON.stringify(body)).not.toContain('https://');
  });
  it('rejects foreign PUT hosts and mismatched verification receipts', async () => {
    const put = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', put);
    vi.mocked(apiRequest).mockResolvedValue({ ...pending, uploadUrl: 'https://attacker.invalid' });
    await expect(uploadExcelMedia('TEST', envelope, media, new Map(), vi.fn())).rejects.toThrow(
      'tidak valid',
    );
    expect(put).not.toHaveBeenCalled();
    vi.mocked(apiRequest).mockResolvedValue({ ...verified, sha256: 'b'.repeat(64) });
    await expect(uploadExcelMedia('TEST', envelope, media, new Map(), vi.fn())).rejects.toThrow(
      'Receipt',
    );
  });
  it('replaces an expired reservation key on retry instead of repeating the same 410', async () => {
    vi.mocked(apiRequest)
      .mockRejectedValueOnce(new ApiProblem(410, 'MEDIA_UPLOAD_EXPIRED', 'TEST ONLY expired'))
      .mockResolvedValue(verified);
    const cache: UploadCache = new Map();
    await expect(uploadExcelMedia('TEST', envelope, media, cache, vi.fn())).rejects.toMatchObject({
      status: 410,
    });
    const uploaded = await uploadExcelMedia('TEST', envelope, media, cache, vi.fn());
    expect(vi.mocked(apiRequest).mock.calls[0]![2]!.headers).not.toEqual(
      vi.mocked(apiRequest).mock.calls[1]![2]!.headers,
    );
    expect(uploaded.questions[0]!.metadata.assetManifest[0]!.objectKey).toBe(verified.objectKey);
  });
  it('uploads at most three images concurrently and returns only verified object keys', async () => {
    const assets = Array.from({ length: 7 }, (_, i) => ({
      ...asset,
      assetId: `image-${i}`,
      textMarker: `[[asset:image-${i}]]`,
    }));
    const input = structuredClone(envelope);
    input.questions[0]!.metadata.assetManifest = assets;
    const extracted = assets.map((a) => ({
      externalId: a.externalId,
      assetId: a.assetId,
      base64: 'AQID',
    }));
    let active = 0,
      peak = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        active++;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active--;
        return { ok: true };
      }),
    );
    vi.mocked(apiRequest).mockImplementation(async (path, _token, options) => {
      const id = path.endsWith('/complete')
        ? path.split('/').at(-2)!
        : JSON.parse(options!.body as string).assetId;
      return {
        ...pending,
        assetId: id,
        uploadId: id,
        objectKey: `question-media/${id}.png`,
        ...(path.endsWith('/complete')
          ? { status: 'VERIFIED', verifiedAt: verified.verifiedAt }
          : {}),
      };
    });
    const result = await uploadExcelMedia('TEST', input, extracted, new Map(), vi.fn());
    expect(peak).toBe(3);
    expect(
      result.questions[0]!.metadata.assetManifest.every(
        (a) => a.objectKey === `question-media/${a.assetId}.png`,
      ),
    ).toBe(true);
    expect(input.questions[0]!.metadata.assetManifest.every((a) => a.objectKey === null)).toBe(
      true,
    );
  });
});
