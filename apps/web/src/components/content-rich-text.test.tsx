import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ContentRichText } from './content-rich-text';

afterEach(cleanup);

function content(text: string) {
  return render(<ContentRichText text={text} media={[]} retry={vi.fn()} />);
}

it('renders complete nested imported math and preserves currency and malformed formulas', () => {
  const { container } = content(
    'sqrt((x+1)^2), sqrt(sqrt(16)), (2 + 3) ^ 2, x_1^2. Dari $10 menjadi $20. Salah: $\\sqrt{5$.',
  );
  expect(container.querySelector('msqrt msup')?.textContent).toBe('(x+1)2');
  expect(container.querySelector('msqrt msqrt')?.textContent).toBe('16');
  expect(container.querySelector('msubsup')?.textContent).toBe('x12');
  expect(container.querySelectorAll('math')).toHaveLength(4);
  expect(container.querySelector('.katex-error')).toBeNull();
  expect(container.textContent).toContain('Dari $10 menjadi $20. Salah: $\\sqrt{5$.');
});

it('presents authored steps and wide formulas as separate reading blocks', () => {
  render(
    <ContentRichText
      text={'Tentukan luas.\n\n2. Hitung sisi.\n3. Substitusi.\n\n$$\\sqrt{16}=4$$'}
      layout="reading"
      media={[]}
      retry={vi.fn()}
    />,
  );
  const steps = screen.getByRole('list');
  expect(within(steps).getAllByRole('listitem')).toHaveLength(2);
  expect(steps.firstElementChild?.getAttribute('value')).toBe('2');
  expect(screen.getByRole('region', { name: 'Rumus' }).querySelector('msqrt')).toBeTruthy();
});

it('keeps delimited math with units and literal dollar amounts in the same sentence', () => {
  const { container } = content('Dari $10 menjadi $20, dengan panjang $2 cm$.');
  expect(container.querySelectorAll('math')).toHaveLength(1);
  expect(container.querySelector('math')?.textContent).toContain('2cm');
  expect(container.textContent).toContain('Dari $10 menjadi $20, dengan panjang ');
});

it('distinguishes initial media loading from a recoverable media failure', () => {
  const retry = vi.fn();
  const { rerender } = render(
    <ContentRichText text="[[asset:diagram]]" media={[]} retry={retry} mediaPending />,
  );
  expect(screen.getByRole('status').textContent).toBe('Memuat gambar…');
  expect(screen.queryByRole('button')).toBeNull();
  rerender(<ContentRichText text="[[asset:diagram]]" media={[]} retry={retry} />);
  fireEvent.click(screen.getByRole('button', { name: 'Coba muat gambar lagi' }));
  expect(retry).toHaveBeenCalledOnce();
});

it('renders imported notation by default in Admin and preserves parenthesized powers', () => {
  const { container } = content('Luas m^(2), sqrt(16), dan \\frac{3}{4}.');
  expect(container.querySelector('math msup')?.textContent).toBe('m2');
  expect(container.querySelector('math msqrt')?.textContent).toBe('16');
  expect(container.querySelector('math mfrac')?.textContent).toBe('34');
  expect(container.textContent).toContain('Luas ');
});

it.each(['\n', '\r\n'])(
  'renders pipe tables and math in their cells with %j line endings',
  (newline) => {
    content(
      [
        'Perhatikan tabel berikut.',
        '| Siswa | Elevasi |',
        '| :--- | ---: |',
        '| Rani | $\\sqrt{2}$ m |',
        '| Budi | -1,4 m |',
        '',
        'Bandingkan keduanya.',
      ].join(newline),
    );
    const table = screen.getByRole('table', { name: 'Data soal' });
    expect(within(table).getAllByRole('columnheader')).toHaveLength(2);
    expect(within(table).getAllByRole('row')).toHaveLength(3);
    expect(table.querySelector('math msqrt')?.textContent).toBe('2');
    const cells = within(table).getAllByRole('cell');
    expect(cells[3]?.textContent).toBe('-1,4 m');
    expect(cells[3]?.style.textAlign).toBe('right');
    expect(screen.getByText('Perhatikan tabel berikut.')).toBeTruthy();
    expect(screen.getByText('Bandingkan keduanya.')).toBeTruthy();
  },
);

it('preserves math absolute-value pipes and escaped literal pipes in cells', () => {
  content('Bentuk | Makna\n--- | ---\n$|x|$ | nilai mutlak\na \\| b | teks biasa');
  const table = screen.getByRole('table');
  expect(within(table).getAllByRole('cell')).toHaveLength(4);
  expect(within(table).getAllByRole('cell')[2]?.textContent).toBe('a | b');
  expect(table.querySelector('math')).toBeTruthy();
});

it('leaves ordinary pipes, malformed tables and fenced examples as text', () => {
  const text = 'Peluang P(A | B)\nA | B\n-- | ---\n```\nA | B\n--- | ---\n1 | 2\n```';
  const { container } = content(text);
  expect(screen.queryByRole('table')).toBeNull();
  expect(container.textContent).toBe(text);
});

it('keeps HTML in table cells inert and retains malformed rows after the table', () => {
  const { container } = content(
    '| A | B |\n| --- | --- |\n| <img src=x onerror=alert(1)> | 2 |\nextra | cells | here',
  );
  expect(container.querySelector('img, script')).toBeNull();
  expect(container.textContent).toContain('<img src=x onerror=alert(1)>');
  expect(container.textContent).toContain('extra | cells | here');
});

it('scopes repeated asset IDs to preview instance', () => {
  render(
    <>
      <ContentRichText
        text="[[asset:diagram-1]]"
        instanceId="first"
        media={[
          {
            instanceId: 'first',
            assetId: 'diagram-1',
            altText: 'First diagram',
            url: 'https://example.invalid/first.png',
            expiresAt: '2099-01-01T00:00:00Z',
          },
          {
            instanceId: 'second',
            assetId: 'diagram-1',
            altText: 'Second diagram',
            url: 'https://example.invalid/second.png',
            expiresAt: '2099-01-01T00:00:00Z',
          },
        ]}
        retry={vi.fn()}
      />
      <ContentRichText
        text="[[asset:diagram-1]]"
        instanceId="second"
        media={[
          {
            instanceId: 'first',
            assetId: 'diagram-1',
            altText: 'First diagram',
            url: 'https://example.invalid/first.png',
            expiresAt: '2099-01-01T00:00:00Z',
          },
          {
            instanceId: 'second',
            assetId: 'diagram-1',
            altText: 'Second diagram',
            url: 'https://example.invalid/second.png',
            expiresAt: '2099-01-01T00:00:00Z',
          },
        ]}
        retry={vi.fn()}
      />
    </>,
  );
  expect(screen.getByAltText('First diagram').getAttribute('src')).toBe(
    'https://example.invalid/first.png',
  );
  expect(screen.getByAltText('Second diagram').getAttribute('src')).toBe(
    'https://example.invalid/second.png',
  );
});

it('renders imported academic tables without a separator row', () => {
  content(
    'Tabel jarak.\n\nWaktu (jam) | 1 | 2 | 3 | 4\nJarak (km) | 45 | 90 | 135 | 180\n\nPilih pernyataan.',
  );
  const table = screen.getByRole('table');
  expect(within(table).getAllByRole('columnheader')).toHaveLength(5);
  expect(
    within(table)
      .getAllByRole('cell')
      .map((cell) => cell.textContent),
  ).toEqual(['Jarak (km)', '45', '90', '135', '180']);
  expect(screen.getByText('Pilih pernyataan.')).toBeTruthy();
});
