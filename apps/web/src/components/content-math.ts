type ContentPart = { text: string; asset?: string; formula?: string; display?: boolean };

const markup =
  /(\[\[asset:[A-Za-z0-9_-]+\]\])|((?<!\\)\$\$[\s\S]*?(?<!\\)\$\$|\\\[[\s\S]*?\\\])|((?<![\\$])\$(?:\\.|[^\\$\n])+\$(?![\d$])|\\\([\s\S]*?\\\))/;
const imported =
  /((?<![\p{L}\p{N}_\\])[+-]?\\?sqrt[ \t]*(?=\())|([+-]?\()|\\(sqrt|dfrac|tfrac|frac|times|div|cdot|pm|leq?|geq?|neq?|approx|pi|theta|alpha|beta)(?![A-Za-z])|((?<![\p{L}\p{N}_\\])[A-Za-z0-9]+)(?=[ \t]*\^)|((?<![\p{L}\p{N}_\\])[A-Za-z])(?=[ \t]*_)|(π)/u;

function groupEnd(text: string, start: number) {
  const opener = text[start];
  const closer = opener === '(' ? ')' : opener === '{' ? '}' : opener === '[' ? ']' : '';
  if (!closer) return start;
  let depth = 0;
  for (let i = start; i < text.length && text[i] !== '\n'; i++) {
    if (text[i] === '\\') i++;
    else if (text[i] === opener) depth++;
    else if (text[i] === closer && --depth === 0) return i + 1;
  }
  return start;
}

function skipSpace(text: string, position: number) {
  while (text[position] === ' ' || text[position] === '\t') position++;
  return position;
}

function commandEnd(text: string, name: string, end: number) {
  const groups = name === 'sqrt' ? 1 : name.endsWith('frac') ? 2 : 0;
  if (name === 'sqrt') {
    const start = skipSpace(text, end);
    if (text[start] === '[') {
      end = groupEnd(text, start);
      if (end === start) return null;
    }
  }
  for (let i = 0; i < groups; i++) {
    const start = skipSpace(text, end);
    if (text[start] !== '{') return null;
    end = groupEnd(text, start);
    if (end === start) return null;
  }
  return end;
}

function mathScripts(text: string, start: number, depth: number) {
  let end = start;
  let suffix = '';
  const used = new Set<string>();
  for (let i = 0; i < 2; i++) {
    const operator = skipSpace(text, end);
    const mark = text[operator];
    if ((mark !== '^' && mark !== '_') || used.has(mark)) break;
    const valueStart = skipSpace(text, operator + 1);
    const valueEnd = groupEnd(text, valueStart);
    if (valueEnd > valueStart) {
      suffix +=
        mark + '{' + normalizeExpression(text.slice(valueStart + 1, valueEnd - 1), depth) + '}';
      end = valueEnd;
    } else {
      const single = /(?:[+-]?\d+|[A-Za-z]|\\[A-Za-z]+)/y;
      single.lastIndex = valueStart;
      const value = single.exec(text)?.[0];
      if (!value) break;
      suffix += mark + '{' + value + '}';
      end = single.lastIndex;
    }
    used.add(mark);
  }
  return { end, suffix };
}

function normalizeExpression(text: string, depth: number): string {
  // Contain recursion in deeply nested imported expressions.
  if (depth >= 24) return text;
  return Array.from(contentParts(text, true, depth + 1), (part) => part.formula ?? part.text).join(
    '',
  );
}

export function* contentParts(
  text: string,
  renderBareMath: boolean,
  depth = 0,
): Generator<ContentPart> {
  const tokens = new RegExp(markup.source + (renderBareMath ? '|' + imported.source : ''), 'gu');
  let cursor = 0;
  for (let match = tokens.exec(text); match; match = tokens.exec(text)) {
    const [, asset, display, delimited, root, group, command, base, subscript, pi] = match;
    const start = match.index;
    let end = tokens.lastIndex;
    let formula: string | undefined;
    if (display || delimited) {
      const wrapped = (display ?? delimited)!;
      if (
        /^\$\s*\d.*[ \t]\$$/.test(wrapped) &&
        /[\\A-Za-z]/.test(text[end] ?? '') &&
        /\s\p{L}{2,}\b/u.test(wrapped)
      ) {
        tokens.lastIndex = start + 1;
        continue;
      }
      const size = display || wrapped.startsWith('\\(') ? 2 : 1;
      formula = wrapped.slice(size, -size);
    } else if (root) {
      const startGroup = end;
      end = groupEnd(text, startGroup);
      if (end === startGroup) {
        // Leave an incomplete root intact through the end of its line.
        const nextLine = text.indexOf('\n', startGroup);
        tokens.lastIndex = nextLine === -1 ? text.length : nextLine;
        continue;
      }
      const sign = /^[+-]/.exec(root)?.[0] ?? '';
      formula =
        sign + '\\sqrt{' + normalizeExpression(text.slice(startGroup + 1, end - 1), depth) + '}';
    } else if (group) {
      const first = end - 1;
      const firstEnd = groupEnd(text, first);
      if (firstEnd === first) continue;
      const slash = skipSpace(text, firstEnd);
      const second = skipSpace(text, slash + 1);
      const secondEnd =
        text[slash] === '/' && text[second] === '(' ? groupEnd(text, second) : second;
      if (secondEnd > second) {
        const numerator = normalizeExpression(text.slice(first + 1, firstEnd - 1), depth);
        const denominator = normalizeExpression(text.slice(second + 1, secondEnd - 1), depth);
        formula = group.slice(0, -1) + '\\frac{' + numerator + '}{' + denominator + '}';
        end = secondEnd;
      } else {
        if (!/[\^_]/.test(text[slash] ?? '')) continue;
        formula =
          group.slice(0, -1) + '{' + normalizeExpression(text.slice(first, firstEnd), depth) + '}';
        end = firstEnd;
      }
    } else if (command) {
      if (text[start - 1] === '\\') continue;
      const argumentEnd = commandEnd(text, command, end);
      if (argumentEnd === null) continue;
      end = argumentEnd;
      formula = text.slice(start, end);
    } else {
      formula = base ?? subscript ?? pi;
    }

    if (formula !== undefined && !display && !delimited) {
      const scripts = mathScripts(text, end, depth);
      if ((base || subscript || (group && !formula.includes('\\frac{'))) && !scripts.suffix)
        continue;
      formula += scripts.suffix;
      end = scripts.end;
    }
    if (start > cursor) yield { text: text.slice(cursor, start) };
    yield {
      text: text.slice(start, end),
      ...(asset && { asset: asset.slice(8, -2) }),
      ...(formula !== undefined && { formula, display: !!display }),
    };
    tokens.lastIndex = cursor = end;
  }
  if (cursor < text.length) yield { text: text.slice(cursor) };
}
