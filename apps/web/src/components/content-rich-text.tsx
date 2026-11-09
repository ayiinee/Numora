'use client';
import katex from 'katex';
import { useState } from 'react';
import type { PreviewMediaDto } from '@/features/admin/generated-types';

function Media({ asset, onRetry }: { asset: PreviewMediaDto | undefined; onRetry: () => void }) {
  const [failed, setFailed] = useState(false);
  if (!asset || failed)
    return (
      <span role="status">
        Gambar belum tersedia.{' '}
        <button
          type="button"
          onClick={() => {
            setFailed(false);
            onRetry();
          }}
        >
          Coba muat gambar lagi
        </button>
      </span>
    );
  // Signed private R2 media cannot use a public Next image cache.
  return (
    <img
      className="content-preview-image"
      src={asset.url}
      alt={asset.altText}
      onError={() => setFailed(true)}
    />
  );
}

const delimiters =
  /\[\[asset:([A-Za-z0-9_-]+)\]\]|(\$\$[\s\S]*?\$\$|\$[^$\n]+\$|\\\([\s\S]*?\\\)|\\\[[\s\S]*?\\\])/;
const root = /([+-]?)\\?\bsqrt\(([^()\n]+)\)/;
const fraction = /([+-]?)\(([^()\n]+)\)\s*\/\s*\(([^()\n]+)\)/;
const script = /\^(\{[^{}\n]+\}|-?\d+|[A-Za-z]|\\[A-Za-z]+)/;
const power = new RegExp(/(?:[A-Za-z0-9]+|\([^()\n]+\))/.source + script.source);
// Recognize common commands in mixed prose. Full equations can use explicit delimiters.
const command =
  /\\(sqrt|dfrac|tfrac|frac|times|div|cdot|pm|leq?|geq?|neq?|approx|pi|theta|alpha|beta)(?![A-Za-z])/;
const pi = /(π)/;
const bareMath = [root, fraction, power, command, pi].map(({ source }) => source).join('|');

function braceGroupEnd(text: string, start: number) {
  if (text[start] !== '{') return start;
  let depth = 0;
  for (let i = start; i < text.length && text[i] !== '\n'; i++) {
    if (text[i] === '\\') i++;
    else if (text[i] === '{') depth++;
    else if (text[i] === '}' && --depth === 0) return i + 1;
  }
  return start;
}

function commandEnd(text: string, name: string, end: number) {
  const groups = name === 'sqrt' ? 1 : name.endsWith('frac') ? 2 : 0;
  const argumentPrefix = name === 'sqrt' ? /[ \t]*(?:\[[^\]\n]+\][ \t]*)?/y : /[ \t]*/y;
  for (let i = 0; i < groups; i++) {
    argumentPrefix.lastIndex = end;
    argumentPrefix.exec(text);
    const start = argumentPrefix.lastIndex;
    end = braceGroupEnd(text, start);
    if (end === start) return null;
  }
  return end;
}

function braced(exponent: string) {
  return exponent.startsWith('{') ? exponent : '{' + exponent + '}';
}

function* contentParts(text: string, renderBareMath: boolean) {
  const tokens = new RegExp(delimiters.source + (renderBareMath ? '|' + bareMath : ''), 'g');
  const trailingScript = new RegExp(script.source, 'y');
  let cursor = 0;
  for (let match = tokens.exec(text); match; match = tokens.exec(text)) {
    const [
      ,
      asset,
      delimited,
      rootSign,
      radicand,
      fractionSign,
      numerator,
      denominator,
      exponent,
      command,
      piSymbol,
    ] = match;
    const start = match.index;
    let end = tokens.lastIndex;
    let formula: string | undefined;
    let display = false;
    if (delimited) {
      display = delimited.startsWith('$$') || delimited.startsWith('\\[');
      const trim = display || delimited.startsWith('\\(') ? 2 : 1;
      formula = delimited.slice(trim, -trim);
    } else if (radicand) {
      formula = (rootSign ?? '') + '\\sqrt{' + radicand + '}';
    } else if (numerator && denominator) {
      formula = (fractionSign ?? '') + '\\frac{' + numerator + '}{' + denominator + '}';
    } else if (exponent) {
      formula = text.slice(start, end - exponent.length) + braced(exponent);
    } else if (command) {
      if (text[start - 1] === '\\') continue;
      const argumentEnd = commandEnd(text, command, end);
      if (argumentEnd === null) continue;
      end = argumentEnd;
      formula = text.slice(start, end);
    } else if (piSymbol) {
      formula = piSymbol;
    }
    if (formula !== undefined && (command || radicand || piSymbol)) {
      trailingScript.lastIndex = end;
      const trailingExponent = trailingScript.exec(text)?.[1];
      if (trailingExponent) {
        formula += '^' + braced(trailingExponent);
        end = trailingScript.lastIndex;
      }
    }

    if (start > cursor) yield { text: text.slice(cursor, start) };
    yield { text: text.slice(start, end), asset, formula, display };
    tokens.lastIndex = cursor = end;
  }
  if (cursor < text.length) yield { text: text.slice(cursor) };
}

export function ContentRichText({
  text,
  media,
  retry,
  renderBareMath = false,
  renderMedia = true,
}: {
  text: string;
  media: PreviewMediaDto[];
  retry: () => void;
  renderBareMath?: boolean;
  renderMedia?: boolean;
}) {
  return (
    <span className="content-rich-text">
      {Array.from(contentParts(text, renderBareMath), (part, i) => {
        if (part.asset && renderMedia) {
          const asset = media.find((item) => item.assetId === part.asset);
          return <Media key={`${i}:${asset?.url ?? 'missing'}`} asset={asset} onRetry={retry} />;
        }
        if (part.formula !== undefined) {
          // Only KaTeX output becomes HTML. trust:false rejects HTML/URL commands.
          const html = katex.renderToString(part.formula, {
            displayMode: part.display ?? false,
            throwOnError: false,
            trust: false,
            maxExpand: 1000,
          });
          return <span key={i} dangerouslySetInnerHTML={{ __html: html }} />;
        }
        return <span key={i}>{part.text}</span>;
      })}
    </span>
  );
}
