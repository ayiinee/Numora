'use client';

import { Button, Dialog, type ButtonProps } from '@tka/ui';
import { useState, type ReactNode } from 'react';

export function AdminConfirmButton({
  children,
  description,
  onConfirm,
  ...props
}: Omit<ButtonProps, 'onClick'> & {
  children: ReactNode;
  description: string;
  onConfirm: () => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  async function confirm() {
    if (pending) return;
    setPending(true);
    try {
      await onConfirm();
      setOpen(false);
    } finally {
      setPending(false);
    }
  }
  return (
    <>
      <Button {...props} type="button" onClick={() => setOpen(true)}>
        {children}
      </Button>
      <Dialog
        open={open}
        title="Konfirmasi tindakan"
        description={description}
        pending={pending}
        onClose={() => setOpen(false)}
        actions={
          <>
            <Button variant="secondary" disabled={pending} onClick={() => setOpen(false)}>
              Batal
            </Button>
            <Button
              variant={props.variant ?? 'primary'}
              disabled={pending}
              onClick={() => void confirm()}
            >
              {pending ? 'Memproses…' : 'Konfirmasi'}
            </Button>
          </>
        }
      >
        {pending && <p role="status">Menunggu respons server…</p>}
      </Dialog>
    </>
  );
}
