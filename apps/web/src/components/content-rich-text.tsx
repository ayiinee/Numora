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
  const delimiters =
    /\[\[asset:[A-Za-z0-9_-]+\]\]|\$\$[\s\S]*?\$\$|\$[^$\n]+\$|\\\([\s\S]*?\\\)|\\\[[\s\S]*?\\\]/;
  const power = /(?:[A-Za-z0-9]+|\([^()\n]+\))\^(?:\{[^{}\n]+\}|-?\d+|[A-Za-z])/;
  // ponytail: recognize flat source notation; nested expressions should use delimited LaTeX.
  const root = /[+-]?\bsqrt\([^()\n]+\)/;
  const fraction = /[+-]?\([^()\n]+\)\s*\/\s*\([^()\n]+\)/;
  const bareMath = `${root.source}|${fraction.source}|${power.source}`;
  const parts = text.split(
    new RegExp(`(${delimiters.source}${renderBareMath ? `|${bareMath}` : ''})`, 'g'),
  );
  return (
    <span className="content-rich-text">
      {parts.map((part, i) => {
        const asset = /^\[\[asset:([^\]]+)\]\]$/.exec(part);
        if (asset && renderMedia)
          return (
            <Media
              key={`${i}:${media.find((a) => a.assetId === asset[1])?.url ?? 'missing'}`}
              asset={media.find((a) => a.assetId === asset[1])}
              onRetry={retry}
            />
          );
        const dollar = part.startsWith('$') && part.endsWith('$');
        const bracket = part.startsWith('\\(') || part.startsWith('\\[');
        const bare = renderBareMath && new RegExp(`^(?:${bareMath})$`).test(part);
        if (dollar || bracket || bare) {
          const display = part.startsWith('$$') || part.startsWith('\\[');
          const trim = bracket || display ? 2 : 1;
          // Only KaTeX output becomes HTML. trust:false rejects HTML/URL commands.
          const formula = bare
            ? part
                .replace(/^([+-]?)sqrt\(([^()\n]+)\)$/, '$1\\sqrt{$2}')
                .replace(/^([+-]?)\(([^()\n]+)\)\s*\/\s*\(([^()\n]+)\)$/, '$1\\frac{$2}{$3}')
            : part.slice(trim, -trim);
          const html = katex.renderToString(formula, {
            displayMode: display,
            throwOnError: false,
            trust: false,
            maxExpand: 1000,
          });
          return <span key={i} dangerouslySetInnerHTML={{ __html: html }} />;
        }
        return <span key={i}>{part}</span>;
      })}
    </span>
  );
}
