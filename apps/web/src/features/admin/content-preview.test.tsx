import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { ContentPreviewScreen } from './content-preview';
import { ContentRichText } from './content-rich-text';
import { getPreview, renewPreviewMedia, savePreview, submitPreview } from './content-preview-api';
import type { PreviewSessionDto } from './generated-types';
const auth = vi.hoisted(() => ({ state: {} as Record<string, unknown> }));
vi.mock('@/features/onboarding/auth', () => ({
  useAuth: () => ({ state: auth.state, logout: vi.fn(), refresh: vi.fn() }),
}));
vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/content/imports',
  useRouter: () => ({ replace: vi.fn() }),
}));
vi.mock('./content-preview-api', () => ({
  createPreview: vi.fn(),
  getPreview: vi.fn(),
  importContent: vi.fn(),
  renewPreviewMedia: vi.fn(),
  savePreview: vi.fn(),
  submitPreview: vi.fn(),
  validateImport: vi.fn(),
}));
const work: PreviewSessionDto = {
  id: 'session',
  state: 'IN_PROGRESS',
  scoringStatus: 'NOT_SCORED',
  score: null,
  media: [],
  items: [
    {
      instanceId: 'instance',
      questionVersionId: 'version',
      externalId: 'TEST ONLY',
      type: 'SINGLE_CHOICE',
      stem: { text: 'TEST ONLY $1+1$' },
      options: [
        { id: 'A', content: { text: 'Dua' } },
        { id: 'B', content: { text: 'Tiga' } },
      ],
      categories: [],
      answer: null,
      revision: 0,
      serverSavedAt: '2026-10-04T00:00:00Z',
      score: null,
    },
  ],
};
beforeEach(() => {
  vi.resetAllMocks();
  auth.state = {
    status: 'ready',
    session: { access_token: 'TEST ONLY TOKEN' },
    profile: {
      id: 'admin',
      displayName: 'TEST ONLY Admin',
      role: 'ADMIN',
      status: 'ACTIVE',
      capabilities: ['CONTENT_MANAGE'],
    },
  };
  vi.mocked(getPreview).mockResolvedValue(structuredClone(work));
});
afterEach(cleanup);
describe('internal content preview and importer', () => {
  it('denies Operations without issuing content requests', () => {
    auth.state = {
      status: 'ready',
      session: { access_token: 'TEST ONLY TOKEN' },
      profile: {
        id: 'ops',
        displayName: 'TEST ONLY Operations',
        role: 'ADMIN',
        status: 'ACTIVE',
        capabilities: [],
      },
    };
    render(<ContentPreviewScreen id="session" />);
    expect(screen.getByText(/memerlukan Admin konten/)).toBeTruthy();
    expect(getPreview).not.toHaveBeenCalled();
  });
  it('keeps keys and explanation absent while answering; saves only after server acknowledgement', async () => {
    vi.mocked(savePreview).mockResolvedValue({
      instanceId: 'instance',
      answer: { optionId: 'A' },
      revision: 1,
      serverSavedAt: '2026-10-04T00:01:00Z',
    });
    render(<ContentPreviewScreen id="session" />);
    await screen.findByText('Dua');
    fireEvent.click(screen.getByRole('radio', { name: /Dua/ }));
    expect(screen.getByText('Perubahan belum tersimpan.')).toBeTruthy();
    expect(screen.queryByText(/Kunci:/)).toBe(null);
    fireEvent.click(screen.getByRole('button', { name: 'Simpan jawaban' }));
    await screen.findByText(/revisi 1/);
    expect(savePreview).toHaveBeenCalledWith('TEST ONLY TOKEN', 'session', 'instance', {
      answer: { optionId: 'A' },
      expectedRevision: 0,
    });
  });
  it('resumes saved answers after refresh and shows null scoring review only when submitted', async () => {
    const result = {
      ...work,
      state: 'SUBMITTED' as const,
      items: [
        {
          ...work.items[0]!,
          answer: { optionId: 'B' },
          answerKey: { optionId: 'A' },
          explanation: { text: 'TEST ONLY explanation' },
        },
      ],
    };
    vi.mocked(getPreview).mockResolvedValue(result);
    render(<ContentPreviewScreen id="session" />);
    await screen.findByText('Review tanpa scoring');
    expect(screen.getByText('TEST ONLY explanation')).toBeTruthy();
    expect((screen.getByRole('radio', { name: /Tiga/ }) as HTMLInputElement).checked).toBe(true);
    expect(screen.getByText(/NOT_SCORED/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Submit & review' })).toBe(null);
  });
  it('does not submit when the final answer has a network error', async () => {
    vi.mocked(savePreview).mockRejectedValue(Error('Koneksi gagal; coba lagi.'));
    render(<ContentPreviewScreen id="session" />);
    await screen.findByText('Dua');
    fireEvent.click(screen.getByRole('radio', { name: /Dua/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Submit & review' }));
    await screen.findByRole('alert');
    expect(submitPreview).not.toHaveBeenCalled();
    expect(screen.getByText('Perubahan belum tersimpan.')).toBeTruthy();
  });
  it('handles stale revision conflicts without claiming the answer was saved', async () => {
    vi.mocked(savePreview).mockRejectedValue(Error('ANSWER_REVISION_CONFLICT'));
    render(<ContentPreviewScreen id="session" />);
    await screen.findByText('Dua');
    fireEvent.click(screen.getByRole('radio', { name: /Dua/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Simpan jawaban' }));
    await screen.findByText('ANSWER_REVISION_CONFLICT');
    expect(screen.getByText('Perubahan belum tersimpan.')).toBeTruthy();
  });
  it('supports MCMA and partial Category answers with generated DTO shapes', async () => {
    for (const type of ['MULTIPLE_CHOICE_MULTIPLE_ANSWER', 'CATEGORY'] as const) {
      cleanup();
      const item = {
        ...work.items[0]!,
        type,
        categories:
          type === 'CATEGORY'
            ? [
                { id: 'YES', label: 'Ya' },
                { id: 'NO', label: 'Tidak' },
              ]
            : [],
      };
      vi.mocked(getPreview).mockResolvedValue({ ...work, items: [item] });
      vi.mocked(savePreview).mockResolvedValue({
        instanceId: 'instance',
        answer:
          type === 'CATEGORY' ? { categoryByStatementId: { A: 'YES' } } : { optionIds: ['A'] },
        revision: 1,
        serverSavedAt: '2026-10-04T00:01:00Z',
      });
      render(<ContentPreviewScreen id="session" />);
      await screen.findAllByText('Dua');
      fireEvent.click(
        type === 'CATEGORY'
          ? screen.getAllByRole('radio', { name: 'Ya' })[0]!
          : screen.getByRole('checkbox', { name: /Dua/ }),
      );
      fireEvent.click(screen.getByRole('button', { name: 'Simpan jawaban' }));
      await screen.findByText(/revisi 1/);
    }
  });
  it('shows load failure and can retry the same session', async () => {
    vi.mocked(getPreview).mockRejectedValueOnce(Error('Network error'));
    render(<ContentPreviewScreen id="session" />);
    await screen.findByText('Network error');
    fireEvent.click(screen.getByRole('button', { name: 'Coba lagi' }));
    await screen.findByText('Dua');
  });
  it('keeps storage failure bounded to media renewal', async () => {
    vi.mocked(getPreview).mockResolvedValue({
      ...work,
      media: [
        {
          instanceId: 'instance',
          assetId: 'img',
          altText: 'TEST ONLY image',
          url: 'https://example.invalid/image',
          expiresAt: '2026-10-04T00:01:00Z',
        },
      ],
      items: [{ ...work.items[0]!, stem: { text: '[[asset:img]]' } }],
    });
    vi.mocked(renewPreviewMedia).mockRejectedValue(Error('Storage unavailable'));
    render(<ContentPreviewScreen id="session" />);
    await screen.findByAltText('TEST ONLY image');
    fireEvent.click(screen.getByRole('button', { name: 'Muat ulang media' }));
    await screen.findByText('Storage unavailable');
    expect(renewPreviewMedia).toHaveBeenCalledWith('TEST ONLY TOKEN', 'session', {
      phase: 'WORK',
      instanceId: 'instance',
      assetIds: ['img'],
    });
  });
  it('renders text safely, display math, ordered images and image retry', () => {
    const retry = vi.fn();
    render(
      <ContentRichText
        text={'<script>alert(1)</script>\n$$x^2$$ [[asset:a]] [[asset:b]]'}
        media={[
          {
            instanceId: 'i',
            assetId: 'a',
            altText: 'first',
            url: 'https://example.invalid/a',
            expiresAt: 'soon',
          },
          {
            instanceId: 'i',
            assetId: 'b',
            altText: 'second',
            url: 'https://example.invalid/b',
            expiresAt: 'soon',
          },
        ]}
        retry={retry}
      />,
    );
    expect(document.querySelector('script')).toBe(null);
    expect(document.querySelector('.katex-display')).toBeTruthy();
    expect(screen.getAllByRole('img').map((i) => i.getAttribute('alt'))).toEqual([
      'first',
      'second',
    ]);
    fireEvent.error(screen.getByAltText('first'));
    fireEvent.click(screen.getByRole('button', { name: 'Coba muat gambar lagi' }));
    expect(retry).toHaveBeenCalled();
  });
  it('submits after a successful save, not before it', async () => {
    let resolveSave!: (value: Awaited<ReturnType<typeof savePreview>>) => void;
    vi.mocked(savePreview).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSave = resolve;
        }),
    );
    vi.mocked(submitPreview).mockResolvedValue({
      ...work,
      state: 'SUBMITTED',
      items: [
        {
          ...work.items[0]!,
          answer: { optionId: 'A' },
          answerKey: { optionId: 'A' },
          explanation: { text: 'Review' },
        },
      ],
    });
    render(<ContentPreviewScreen id="session" />);
    await screen.findByText('Dua');
    fireEvent.click(screen.getByRole('radio', { name: /Dua/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Submit & review' }));
    await waitFor(() => expect(savePreview).toHaveBeenCalled());
    expect(submitPreview).not.toHaveBeenCalled();
    resolveSave({
      instanceId: 'instance',
      answer: { optionId: 'A' },
      revision: 1,
      serverSavedAt: 'now',
    });
    await screen.findByText('Review tanpa scoring');
    expect(submitPreview).toHaveBeenCalledTimes(1);
  });
});
