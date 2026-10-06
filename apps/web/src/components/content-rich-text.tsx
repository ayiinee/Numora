'use client';
import katex from 'katex';
import { useState } from 'react';
import type { PreviewMediaDto } from '@/features/core-learning/generated-types';

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
}: {
  text: string;
  media: PreviewMediaDto[];
  retry: () => void;
}) {
  const parts = text.split(/(\[\[asset:[A-Za-z0-9_-]+\]\]|\$\$[\s\S]*?\$\$|\$[^$\n]+\$)/g);
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
        if (part.startsWith('$') && part.endsWith('$')) {
          const display = part.startsWith('$$');
          // Only KaTeX output becomes HTML. trust:false rejects HTML/URL commands.
          const html = katex.renderToString(part.slice(display ? 2 : 1, display ? -2 : -1), {
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
