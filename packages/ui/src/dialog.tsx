'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';
import { IconButton } from './button';
import { Icon } from './icon';

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  actions?: ReactNode;
  /** Prevent dismissal while an operation is pending; render its status in the content. */
  pending?: boolean;
  className?: string;
  icon?: ReactNode;
}

/** Native modal: the browser traps focus and makes the underlying page inert. */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  actions,
  pending = false,
  className = '',
  icon,
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog || !open) return;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!dialog.open) dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
      if (trigger?.isConnected) trigger.focus();
    };
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={`numora-dialog ${className}`}
      aria-labelledby={`${id}-title`}
      aria-describedby={description ? `${id}-description` : undefined}
      aria-busy={pending || undefined}
      tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key !== 'Tab') return;
        const dialog = event.currentTarget;
        const controls = Array.from(
          dialog.querySelectorAll<HTMLElement>(
            'button, a[href], input, select, textarea, [tabindex]',
          ),
        ).filter(
          (element) =>
            element.tabIndex >= 0 &&
            !element.matches(':disabled') &&
            element.getClientRects().length > 0,
        );
        const first = controls[0];
        const last = controls.at(-1);
        if (!first || !last) {
          event.preventDefault();
          dialog.focus();
        } else if (
          event.shiftKey &&
          (document.activeElement === first || document.activeElement === dialog)
        ) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }}
      onCancel={(event) => {
        event.preventDefault();
        if (!pending) onClose();
      }}
    >
      {icon && <div className="numora-dialog__icon">{icon}</div>}
      <div className="numora-dialog__header">
        <h2 id={`${id}-title`}>{title}</h2>
        <IconButton
          icon={<Icon name="close" />}
          aria-label="Tutup dialog"
          disabled={pending}
          onClick={onClose}
        />
      </div>
      {description && (
        <p id={`${id}-description`} className="numora-dialog__description">
          {description}
        </p>
      )}
      <div className="numora-dialog__content">{children}</div>
      {actions && <div className="numora-dialog__actions">{actions}</div>}
    </dialog>
  );
}
