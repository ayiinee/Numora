import type { ReactNode } from 'react';

export function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}

export function PreviewNote({ children }: { children: ReactNode }) {
  return (
    <p className="data-caption">
      <span aria-hidden="true">ⓘ</span>
      {children}
    </p>
  );
}
