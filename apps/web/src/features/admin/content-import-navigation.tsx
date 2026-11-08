'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Button, Dialog } from '@tka/ui';

export function ImportNavigation({
  active,
  disabled = false,
  dirty = false,
  onExcel,
  onHistory,
}: {
  active: 'excel' | 'json' | 'generator' | 'history';
  disabled?: boolean;
  dirty?: boolean;
  onExcel?: () => void;
  onHistory?: () => void;
}) {
  const [leaving, setLeaving] = useState<{ href: string } | null>(null);
  return (
    <>
      <nav className="import-navigation" aria-label="Jalur impor soal">
        {(
          [
            ['excel', 'Upload Excel', '/admin/content/imports', onExcel],
            ['json', 'Impor JSON', '/admin/content/imports?mode=json', undefined],
            ['generator', 'Hasil generator', '/admin/content/generator', undefined],
            ['history', 'Riwayat unggahan', '/admin/content/imports?view=history', onHistory],
          ] as const
        ).map(([key, label, href, action]) =>
          action ? (
            <button
              key={key}
              type="button"
              aria-current={active === key ? 'page' : undefined}
              disabled={disabled}
              onClick={action}
            >
              {label}
            </button>
          ) : (
            <Link
              key={key}
              href={href}
              aria-current={active === key ? 'page' : undefined}
              aria-disabled={disabled || undefined}
              onClick={(event) => {
                if (disabled || dirty) event.preventDefault();
                if (!disabled && dirty) setLeaving({ href });
              }}
            >
              {label}
            </Link>
          ),
        )}
      </nav>
      <Dialog
        open={leaving !== null}
        title="Tinggalkan perubahan preview?"
        description="Perubahan yang belum disimpan akan hilang. Kembali untuk menyimpan progres terlebih dahulu."
        onClose={() => setLeaving(null)}
        className="admin-management-dialog import-leave-dialog"
        actions={
          <>
            <Button variant="secondary" onClick={() => setLeaving(null)}>
              Kembali mengedit
            </Button>
            <Link className="import-leave-link" href={leaving?.href ?? '/admin/content/imports'}>
              Tinggalkan perubahan
            </Link>
          </>
        }
      >
        <p>Konten yang sudah tersimpan tetap tersedia melalui riwayat.</p>
      </Dialog>
    </>
  );
}
