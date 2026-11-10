import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ContentRichText } from './content-rich-text';

afterEach(cleanup);

function content(text: string) {
  return render(<ContentRichText text={text} media={[]} retry={vi.fn()} />);
}

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
