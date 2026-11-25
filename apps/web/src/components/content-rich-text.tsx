'use client';
import katex from 'katex';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { PreviewMediaDto } from '@/features/admin/generated-types';
import { contentParts } from './content-math';
import { contentBlocks } from './content-tables';

function Media({
  asset,
  pending,
  onRetry,
}: {
  asset: PreviewMediaDto | undefined;
  pending: boolean;
  onRetry: () => void;
}) {
  const [failed, setFailed] = useState(false);
  if (pending && (!asset || failed)) return <span role="status">Memuat gambar…</span>;
  if (!asset || failed)
    return (
      <span className="content-media-message">
        <span role="status">Gambar belum tersedia.</span>{' '}
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

function ScrollContent({
  children,
  className,
  label,
  showHint = false,
}: {
  children: ReactNode;
  className: string;
  label: string;
  showHint?: boolean;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [overflow, setOverflow] = useState(false);
  useEffect(() => {
    const region = ref.current;
    if (!region) return;
    // Inline KaTeX can paint a few pixels beyond its box, for example at the end of a radical.
    const tolerance = showHint ? 1 : 3;
    const measure = () => setOverflow(region.scrollWidth > region.clientWidth + tolerance);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(region);
    if (region.firstElementChild) observer.observe(region.firstElementChild);
    return () => observer.disconnect();
  }, [showHint]);
  return (
    <>
      {showHint && overflow && (
        <span className="assessment-scroll-hint">Geser untuk melihat selengkapnya</span>
      )}
      <span
        ref={ref}
        className={className}
        role={overflow || showHint ? 'region' : undefined}
        aria-label={overflow || showHint ? label : undefined}
        tabIndex={overflow ? 0 : undefined}
      >
        {children}
      </span>
    </>
  );
}

function readingProse(text: string, inline: (value: string) => ReactNode) {
  const blocks: ReactNode[] = [];
  let paragraph: string[] = [];
  let items: { text: string; number?: number }[] = [];
  let ordered = false;
  function flushParagraph() {
    if (paragraph.length) blocks.push(<p key={blocks.length}>{inline(paragraph.join('\n'))}</p>);
    paragraph = [];
  }
  function flushList() {
    if (!items.length) return;
    const List = ordered ? 'ol' : 'ul';
    blocks.push(
      <List key={blocks.length}>
        {items.map((item, i) => (
          <li key={i} value={item.number}>
            {inline(item.text)}
          </li>
        ))}
      </List>,
    );
    items = [];
  }
  for (const [index, value] of text.split(/(\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\])/).entries()) {
    if (index % 2) {
      flushParagraph();
      flushList();
      blocks.push(<div key={blocks.length}>{inline(value)}</div>);
      continue;
    }
    for (const line of value.split(/\r?\n/)) {
      const item = /^\s*(?:(\d{1,4})[.)]|[-*•])\s+(.+)$/.exec(line);
      if (item) {
        flushParagraph();
        const number = item[1] === undefined ? undefined : Number(item[1]);
        if (items.length && ordered !== (number !== undefined)) flushList();
        ordered = number !== undefined;
        items.push({ text: item[2]!, ...(number !== undefined && { number }) });
      } else {
        flushList();
        if (line.trim()) paragraph.push(line);
        else flushParagraph();
      }
    }
  }
  flushParagraph();
  flushList();
  return blocks;
}

export function ContentRichText({
  text,
  media,
  instanceId,
  retry,
  renderBareMath = true,
  renderMedia = true,
  mediaPending = false,
  layout = 'default',
}: {
  text: string;
  media: PreviewMediaDto[];
  instanceId?: string | undefined;
  retry: () => void;
  renderBareMath?: boolean;
  renderMedia?: boolean;
  mediaPending?: boolean;
  layout?: 'default' | 'reading' | 'choice';
}) {
  const instanceMedia = instanceId ? media.filter((item) => item.instanceId === instanceId) : media;
  const normalizedText = instanceMedia.length
    ? text.replace(/\[Gambar ([A-Za-z0-9_-]+) [^\]]+\]/g, (whole, assetId: string) =>
        instanceMedia.some((item) => item.assetId === assetId) ? `[[asset:${assetId}]]` : whole,
      )
    : text;
  const inline = (value: string) =>
    Array.from(contentParts(value, renderBareMath), (part, i) => {
      if (part.asset && renderMedia) {
        const asset = instanceMedia.find((item) => item.assetId === part.asset);
        return (
          <Media
            key={`${i}:${asset?.url ?? 'missing'}`}
            asset={asset}
            pending={mediaPending}
            onRetry={retry}
          />
        );
      }
      if (part.formula !== undefined) {
        // Only KaTeX output becomes HTML. trust:false rejects HTML/URL commands.
        try {
          const html = katex.renderToString(part.formula, {
            displayMode: part.display ?? false,
            trust: false,
            maxExpand: 1000,
          });
          const formula = <span dangerouslySetInnerHTML={{ __html: html }} />;
          if (layout !== 'default')
            return (
              <ScrollContent
                key={i + ':' + part.text}
                className={part.display ? 'assessment-formula-scroll' : 'assessment-formula-inline'}
                label="Rumus"
                showHint={part.display ?? false}
              >
                {formula}
              </ScrollContent>
            );
          return <span key={i} dangerouslySetInnerHTML={{ __html: html }} />;
        } catch (error) {
          if (!(error instanceof katex.ParseError)) throw error;
        }
      }
      return <span key={i}>{part.text}</span>;
    });
  const Container = layout === 'reading' ? 'div' : 'span';
  return (
    <Container
      className={layout === 'reading' ? 'content-rich-text assessment-copy' : 'content-rich-text'}
    >
      {contentBlocks(normalizedText).map((block, index) => {
        if (block.type === 'text') {
          return layout === 'reading' ? (
            <div key={index} className="assessment-copy__flow">
              {readingProse(block.text, inline)}
            </div>
          ) : (
            <span key={index}>{inline(block.text)}</span>
          );
        }
        const table = (
          <span
            className="content-rich-table"
            role="table"
            aria-label="Data soal"
            style={{ minWidth: `${block.headers.length * 96}px` }}
          >
            <span role="rowgroup">
              <span role="row">
                {block.headers.map((cell, column) => (
                  <span
                    role="columnheader"
                    key={column}
                    style={{ textAlign: block.alignments[column] }}
                  >
                    {inline(cell)}
                  </span>
                ))}
              </span>
            </span>
            <span role="rowgroup">
              {block.rows.map((row, rowIndex) => (
                <span role="row" key={rowIndex}>
                  {row.map((cell, column) => (
                    <span role="cell" key={column} style={{ textAlign: block.alignments[column] }}>
                      {inline(cell)}
                    </span>
                  ))}
                </span>
              ))}
            </span>
          </span>
        );
        return layout === 'default' ? (
          <span
            key={index}
            className="content-table-scroll"
            role="region"
            aria-label="Tabel pada soal"
            tabIndex={0}
          >
            {table}
          </span>
        ) : (
          <ScrollContent
            key={index}
            className="content-table-scroll"
            label="Tabel pada soal"
            showHint
          >
            {table}
          </ScrollContent>
        );
      })}
    </Container>
  );
}
