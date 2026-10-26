'use client';

import { Button } from '@tka/ui';
import { useState } from 'react';
import { ADMIN_PAGE_SIZE } from './pagination';

export function AdminPagination({
  offset,
  hasNext,
  onChange,
  disabled = false,
  label = 'Halaman data',
  previousLabel = 'Sebelumnya',
  nextLabel = 'Berikutnya',
}: {
  offset: number;
  hasNext: boolean;
  onChange: (offset: number) => void;
  disabled?: boolean;
  label?: string;
  previousLabel?: string;
  nextLabel?: string;
}) {
  return (
    <nav className="admin-content-actions admin-pagination" aria-label={label}>
      <Button
        variant="secondary"
        disabled={disabled || offset === 0}
        onClick={() => onChange(Math.max(0, offset - ADMIN_PAGE_SIZE))}
      >
        {previousLabel}
      </Button>
      <span aria-live="polite">Halaman {Math.floor(offset / ADMIN_PAGE_SIZE) + 1}</span>
      <Button
        variant="secondary"
        disabled={disabled || !hasNext}
        onClick={() => onChange(offset + ADMIN_PAGE_SIZE)}
      >
        {nextLabel}
      </Button>
    </nav>
  );
}

// Unpaginated contracts remain intact, including all choices used by editors.
export function useAdminPagination<T>(
  items: T[],
  resetKey?: unknown,
  controlled?: { offset: number; onChange: (offset: number) => void },
) {
  const [position, setPosition] = useState({ offset: 0, resetKey });
  const lastOffset = Math.max(0, Math.ceil(items.length / ADMIN_PAGE_SIZE) - 1) * ADMIN_PAGE_SIZE;
  const offset = controlled
    ? Math.min(controlled.offset, lastOffset)
    : position.resetKey === resetKey
      ? Math.min(position.offset, lastOffset)
      : 0;
  return {
    items: items.slice(offset, offset + ADMIN_PAGE_SIZE),
    pagination: {
      offset,
      hasNext: offset + ADMIN_PAGE_SIZE < items.length,
      onChange: (nextOffset: number) =>
        controlled
          ? controlled.onChange(nextOffset)
          : setPosition({ offset: nextOffset, resetKey }),
    },
  };
}
