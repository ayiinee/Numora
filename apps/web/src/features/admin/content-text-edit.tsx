'use client';
import { useState } from 'react';
import { Button, Dialog } from '@tka/ui';

/** One explicit save for the existing text/URL mutations; rejected drafts stay open. */
export function ContentTextEdit({
  trigger,
  title,
  label,
  value,
  save,
  busy,
  error,
  url = false,
  maxLength = url ? 2000 : 160,
}: {
  trigger: string;
  title: string;
  label: string;
  value: string;
  save: (value: string) => Promise<boolean>;
  busy: boolean;
  error?: string | undefined;
  url?: boolean;
  maxLength?: number;
}) {
  const [open, setOpen] = useState(false),
    [draft, setDraft] = useState(value),
    [failed, setFailed] = useState(false);
  return (
    <>
      <Button
        variant="secondary"
        disabled={busy}
        onClick={() => {
          setDraft(value);
          setFailed(false);
          setOpen(true);
        }}
      >
        {trigger}
      </Button>
      {open && (
        <Dialog
          open
          pending={busy}
          title={title}
          onClose={() => setOpen(false)}
          className="admin-management-dialog assessment-text-dialog"
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              setFailed(false);
              void save(draft.trim()).then((saved) => {
                if (saved) setOpen(false);
                else setFailed(true);
              });
            }}
          >
            <label>
              <span>{label}</span>
              <input
                type={url ? 'url' : 'text'}
                pattern={url ? 'https://.*' : '.*\\S.*'}
                maxLength={maxLength}
                required
                value={draft}
                disabled={busy}
                onChange={(event) => setDraft(event.target.value)}
              />
            </label>
            {failed && (
              <p role="alert">
                {error || 'Perubahan belum tersimpan. Periksa isian dan koneksi, lalu coba lagi.'}
              </p>
            )}
            <div className="assessment-heading-actions">
              <Button
                variant="secondary"
                type="button"
                disabled={busy}
                onClick={() => setOpen(false)}
              >
                Batal
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? 'Menyimpan...' : 'Simpan perubahan'}
              </Button>
            </div>
          </form>
        </Dialog>
      )}
    </>
  );
}
