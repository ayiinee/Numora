import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { apiRequest } from '@/lib/api';
import { AssessmentRichText } from './assessment-rich-text';
import { MathText } from './ui';

vi.mock('@/lib/api', () => ({ apiRequest: vi.fn() }));
vi.mock('./student-session', () => ({ useStudentToken: () => 'TEST ONLY' }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
it('renders imported roots and fractions as notation in assessment text', () => {
  const { container } = render(
    <AssessmentRichText
      value={'Rian: 0,75 gram\nSiti: sqrt(5) gram\nBudi: -(8)/(2) gram\nDewi: sqrt(16) gram'}
      instanceId="TEST"
    />,
  );
  expect(container.querySelectorAll('math msqrt')).toHaveLength(2);
  const fraction = container.querySelector('math mfrac');
  expect(fraction?.children[0]?.textContent).toBe('8');
  expect(fraction?.children[1]?.textContent).toBe('2');
  expect(container.textContent).toContain('Rian: 0,75 gram');
  expect(fraction?.closest('math')?.querySelector('mo')?.textContent).toBe('−');
  expect(container.textContent).not.toContain('sqrt(');
});

it('keeps unresolved asset markers as text in the math-only renderer', () => {
  const { container } = render(<MathText value="sqrt(5) [[asset:diagram]]" />);
  expect(container.querySelector('math msqrt')).toBeTruthy();
  expect(container.textContent).toContain('[[asset:diagram]]');
  expect(screen.queryByRole('button')).toBeNull();
});

it('renders nested bare LaTeX and full exponents while preserving the surrounding prose', () => {
  const { container } = render(
    <MathText
      value={'Hitung \\frac{\\sqrt{9}}{2} dan \\sqrt[3]{8}^2, lalu bandingkan dengan x^-12.'}
    />,
  );
  expect(container.querySelector('math mfrac msqrt')?.textContent).toBe('9');
  expect(container.querySelector('math msup mroot')?.textContent).toBe('83');
  const exponents = container.querySelectorAll('math msup > :nth-child(2)');
  expect(exponents[0]?.textContent).toBe('2');
  expect(exponents[1]?.textContent).toBe('−12');
  expect(container.textContent).toContain(', lalu bandingkan dengan ');
});

it('renders literal pi as math and preserves the following prose', () => {
  const { container } = render(<MathText value="π merupakan bilangan irasional." />);
  expect(container.querySelector('math mi')?.textContent).toBe('π');
  expect(container.querySelector('.katex')?.parentElement?.nextElementSibling?.textContent).toBe(
    ' merupakan bilangan irasional.',
  );
});

it('keeps incomplete commands and HTML as text and blocks trusted-only KaTeX commands', () => {
  const { container } = render(
    <MathText value={'\\sqrt{5 dan <img src="test"> $\\href{https://example.invalid}{Klik}$'} />,
  );
  expect(container.textContent).toContain('\\sqrt{5 dan <img src="test">');
  expect(container.querySelector('msqrt, img, a')).toBeNull();
});

it.each(['$\\sqrt{5}$', '\\(\\sqrt{5}\\)', '$$\\sqrt{5}$$', '\\[\\sqrt{5}\\]'])(
  'renders existing delimited notation %s',
  (value) => {
    const { container } = render(<AssessmentRichText value={value} instanceId="TEST" />);
    expect(container.querySelectorAll('math msqrt')).toHaveLength(1);
  },
);

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
      <AssessmentRichText value="sqrt(5) [[asset:diagram]]" instanceId="TEST" phase="REVIEW" />
    </QueryClientProvider>,
  );
  const image = await screen.findByAltText('Diagram soal');
  expect(document.querySelector('math msqrt')).toBeTruthy();
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
