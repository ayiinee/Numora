import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { apiRequest } from '@/lib/api';
import { AssessmentRichText } from './assessment-rich-text';

vi.mock('@/lib/api', () => ({ apiRequest: vi.fn() }));
vi.mock('./student-session', () => ({ useStudentToken: () => 'TEST ONLY' }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
it('loads only authorized instance media and retries an expired image link', async () => {
  const media = {
    instanceId: 'TEST',
    assetId: 'diagram',
    altText: 'Diagram soal',
    url: 'https://example.invalid/first.png',
    expiresAt: '2099-01-01T00:00:00Z',
  };
  vi.mocked(apiRequest)
    .mockResolvedValueOnce({ media: [media] })
    .mockResolvedValueOnce({ media: [{ ...media, url: 'https://example.invalid/renewed.png' }] });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AssessmentRichText value="TEST [[asset:diagram]]" instanceId="TEST" phase="REVIEW" />
    </QueryClientProvider>,
  );
  const image = await screen.findByAltText('Diagram soal');
  expect(image.getAttribute('src')).toBe(media.url);
  expect(apiRequest).toHaveBeenCalledWith('assessment-items/TEST/media?phase=REVIEW', 'TEST ONLY');
  fireEvent.error(image);
  fireEvent.click(screen.getByRole('button', { name: 'Coba muat gambar lagi' }));
  await vi.waitFor(() =>
    expect(screen.getByAltText('Diagram soal').getAttribute('src')).toBe(
      'https://example.invalid/renewed.png',
    ),
  );
});
