'use client';
import katex from 'katex';
import { useState } from 'react';
import type { PreviewMediaDto } from './generated-types';

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
}: {
  text: string;
  media: PreviewMediaDto[];
  retry: () => void;
  renderBareMath?: boolean;
}) {
  const delimiters =
    /\[\[asset:[A-Za-z0-9_-]+\]\]|\$\$[\s\S]*?\$\$|\$[^$\n]+\$|\\\([\s\S]*?\\\)|\\\[[\s\S]*?\\\]/;
  const power = /(?:[A-Za-z0-9]+|\([^()\n]+\))\^(?:\{[^{}\n]+\}|-?\d+|[A-Za-z])/;
  const parts = text.split(
    new RegExp(`(${delimiters.source}${renderBareMath ? `|${power.source}` : ''})`, 'g'),
  );
  return (
    <span className="content-rich-text">
      {parts.map((part, i) => {
        const asset = /^\[\[asset:([^\]]+)\]\]$/.exec(part);
        if (asset)
          return (
            <Media
              key={`${i}:${media.find((a) => a.assetId === asset[1])?.url ?? 'missing'}`}
              asset={media.find((a) => a.assetId === asset[1])}
              onRetry={retry}
            />
          );
        const dollar = part.startsWith('$') && part.endsWith('$');
        const bracket = part.startsWith('\\(') || part.startsWith('\\[');
        const bare = renderBareMath && new RegExp(`^${power.source}$`).test(part);
        if (dollar || bracket || bare) {
          const display = part.startsWith('$$') || part.startsWith('\\[');
          const trim = bracket || display ? 2 : 1;
          // Only KaTeX output becomes HTML. trust:false rejects HTML/URL commands.
          const html = katex.renderToString(bare ? part : part.slice(trim, -trim), {
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
