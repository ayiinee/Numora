'use client';
import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from 'react';
import { loadAdminWorkbench } from './content-api';

export type Workbench = Awaited<ReturnType<typeof loadAdminWorkbench>>;

export type Run = (action: () => Promise<{ id: string }>) => Promise<boolean>;

export type EditorProps = {
  data: Workbench;
  token: string;
  busy: boolean;
  run: Run;
  error?: string;
};

export function Field({
  label,
  name,
  children,
}: {
  label: string;
  name: string;
  children: ReactNode;
}) {
  const labelId = useId();
  return (
    <label className="admin-content-field" data-field={name}>
      <span id={labelId}>{label}</span>
      {isValidElement(children)
        ? cloneElement(children as ReactElement<{ 'aria-labelledby'?: string }>, {
            'aria-labelledby': labelId,
          })
        : children}
    </label>
  );
}

export const field = (form: FormData, name: string) => String(form.get(name) ?? '').trim();

export type View =
  | 'curriculum'
  | 'questions'
  | 'verification'
  | 'videos'
  | 'packages'
  | 'drillPackages'
  | 'directedPackages'
  | 'reports'
  | 'irt'
  | 'audit';
