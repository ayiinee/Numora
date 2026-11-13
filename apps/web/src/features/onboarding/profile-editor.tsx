'use client';
import { useId, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Card, Input, SectionHeader } from '@tka/ui';
import { deleteProfilePhoto, updateProfileName, uploadProfilePhoto } from '@/lib/api';
import { useAuth } from './auth';
import './profile-editor.css';

export function ProfileEditor({ embedded = false }: { embedded?: boolean }) {
  const { state, refresh } = useAuth();
  const cache = useQueryClient();
  const photoId = useId();
  const [name, setName] = useState(state.status === 'ready' ? state.profile.displayName : '');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  if (state.status !== 'ready') return null;
  const token = state.session.access_token;
  async function mutate(operation: () => Promise<unknown>, message: string) {
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await operation();
      await cache.invalidateQueries();
      await refresh();
      setNotice(message);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Profil belum dapat disimpan.');
    } finally {
      setBusy(false);
    }
  }
  function rename(event: FormEvent) {
    event.preventDefault();
    if (name.trim())
      void mutate(() => updateProfileName(token, name.trim()), 'Nama profil disimpan.');
  }
  const Container = embedded ? 'div' : Card;
  return (
    <Container className={`profile-editor${embedded ? ' profile-editor--embedded' : ''}`}>
      {!embedded && (
        <SectionHeader
          title="Edit profil"
          subtitle="Email dan role akun tidak dapat diubah di sini."
        />
      )}
      <form onSubmit={rename}>
        <Input
          label="Nama tampilan"
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
          maxLength={120}
          disabled={busy}
        />
        <Button
          type="submit"
          disabled={busy || !name.trim() || name.trim() === state.profile.displayName}
        >
          Simpan nama
        </Button>
      </form>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (file) void mutate(() => uploadProfilePhoto(token, file), 'Foto profil disimpan.');
        }}
      >
        <span>Foto profil</span>
        <label className="profile-editor__file" htmlFor={photoId}>
          <span className="button-link button-link--secondary">Pilih foto</span>
          <span aria-live="polite">{file?.name ?? 'Belum ada foto dipilih'}</span>
          <input
            id={photoId}
            className="sr-only"
            aria-label="Foto profil"
            aria-describedby={`${photoId}-help`}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            disabled={busy}
            onChange={(event) => {
              const selected = event.target.files?.[0] ?? null;
              setError('');
              setNotice('');
              setFile(null);
              if (
                selected &&
                (!['image/png', 'image/jpeg', 'image/webp'].includes(selected.type) ||
                  selected.size > 2 * 1024 * 1024 ||
                  !selected.size)
              ) {
                setError('Gunakan foto PNG, JPEG, atau WebP berukuran maksimal 2 MB.');
                event.target.value = '';
                return;
              }
              setFile(selected);
            }}
          />
        </label>
        <p id={`${photoId}-help`}>
          PNG, JPEG, atau WebP, maksimal 2 MB. Tanpa foto, aplikasi memakai avatar inisial.
        </p>
        <Button type="submit" disabled={busy || !file}>
          Unggah foto
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={busy || !state.profile.profilePhotoObjectKey}
          onClick={() =>
            void mutate(
              () => deleteProfilePhoto(token),
              'Foto dihapus. Avatar inisial digunakan kembali.',
            )
          }
        >
          Hapus foto
        </Button>
      </form>
      {busy && <p role="status">Menyimpan profil…</p>}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
    </Container>
  );
}
