import type { ReactNode } from 'react';

/**
 * Displays a labelled metric card with a value and a short supporting detail.
 */
export function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}

/**
 * Renders a small annotated caption used to clarify preview-only behavior.
 */
export function PreviewNote({ children }: { children: ReactNode }) {
  return (
    <p className="data-caption">
      <span aria-hidden="true">ⓘ</span>
      {children}
    </p>
  );
}
