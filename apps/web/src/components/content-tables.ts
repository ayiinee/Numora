type TableBlock = {
  type: 'table';
  headers: string[];
  rows: string[][];
  alignments: ('left' | 'center' | 'right')[];
};

// Protect delimited math, escaped pipes and inline code from column splitting.
const rowTokens = /\\\||\$\$.*?\$\$|\$[^$]+\$|\\\(.*?\\\)|\\\[.*?\\\]|`[^`]*`|[^|$\\`]+|[\s\S]/g;

function tableRow(line: string): string[] | null {
  const cells = [''];
  for (const token of line.trim().match(rowTokens) ?? []) {
    if (token === '|') cells.push('');
    else cells[cells.length - 1] += token === '\\|' ? '|' : token;
  }
  if (cells.length === 1) return null;
  if (cells[0] === '') cells.shift();
  if (cells.at(-1) === '') cells.pop();
  return cells.map((cell) => cell.trim());
}

export function contentBlocks(text: string): ({ type: 'text'; text: string } | TableBlock)[] {
  const blocks: ({ type: 'text'; text: string } | TableBlock)[] = [];
  const lines = text.split(/\r?\n/);
  let prose: string[] = [];
  let fence: string | undefined;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]!;
    const marker = line.trim().match(/^(`{3,}|~{3,})/)?.[1];
    if (marker) fence = fence?.[0] === marker[0] ? undefined : marker;
    const headers = !fence && !marker ? tableRow(line) : null;
    const separators = headers && tableRow(lines[index + 1] ?? '');
    if (
      !headers?.length ||
      separators?.length !== headers.length ||
      !separators.every((cell) => /^:?-{3,}:?$/.test(cell))
    ) {
      prose.push(line);
      continue;
    }
    if (prose.length) blocks.push({ type: 'text', text: prose.join('\n') });
    prose = [];
    const table: TableBlock = {
      type: 'table',
      headers,
      rows: [],
      alignments: separators.map((cell) =>
        cell.endsWith(':') ? (cell.startsWith(':') ? 'center' : 'right') : 'left',
      ),
    };
    index++;
    while (index + 1 < lines.length) {
      const row = tableRow(lines[index + 1]!);
      if (row?.length !== headers.length) break;
      table.rows.push(row);
      index++;
    }
    blocks.push(table);
  }
  if (prose.length) blocks.push({ type: 'text', text: prose.join('\n') });
  return blocks;
}
