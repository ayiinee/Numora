import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ProfileEditor } from './profile-editor';
import { deleteProfilePhoto, updateProfileName, uploadProfilePhoto } from '@/lib/api';

const auth = vi.hoisted(() => ({
  refresh: vi.fn(),
  state: {
    status: 'ready',
    session: { access_token: 'self' },
    profile: { id: 'student', displayName: 'Nisa', profilePhotoObjectKey: 'owned-photo' },
  },
}));
vi.mock('./auth', () => ({ useAuth: () => auth }));
vi.mock('@/lib/api', async (original) => ({
  ...(await original<object>()),
  deleteProfilePhoto: vi.fn(),
  updateProfileName: vi.fn(),
  uploadProfilePhoto: vi.fn(),
}));
beforeEach(() => vi.resetAllMocks());
afterEach(cleanup);
function mount() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ProfileEditor />
    </QueryClientProvider>,
  );
}
it('preserves edited name on failure and refreshes all identity surfaces after retry', async () => {
  vi.mocked(updateProfileName)
    .mockRejectedValueOnce(new Error('Koneksi terputus'))
    .mockResolvedValue({} as never);
  mount();
  fireEvent.change(screen.getByLabelText(/Nama tampilan/), { target: { value: '  Nisa Baru  ' } });
  fireEvent.click(screen.getByRole('button', { name: 'Simpan nama' }));
  await screen.findByText('Koneksi terputus');
  expect((screen.getByLabelText(/Nama tampilan/) as HTMLInputElement).value).toBe('  Nisa Baru  ');
  expect(auth.refresh).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Simpan nama' }));
  await screen.findByText('Nama profil disimpan.');
  expect(updateProfileName).toHaveBeenLastCalledWith('self', 'Nisa Baru');
  expect(auth.refresh).toHaveBeenCalledOnce();
});
it('rejects unsuitable files, uploads the selected image, and returns to the default avatar after removal', async () => {
  vi.mocked(uploadProfilePhoto).mockResolvedValue({} as never);
  vi.mocked(deleteProfilePhoto).mockResolvedValue({} as never);
  mount();
  const input = screen.getByLabelText('Foto profil');
  fireEvent.change(input, {
    target: { files: [new File(['<svg/>'], 'avatar.svg', { type: 'image/svg+xml' })] },
  });
  await screen.findByText('Gunakan foto PNG, JPEG, atau WebP berukuran maksimal 2 MB.');
  expect(uploadProfilePhoto).not.toHaveBeenCalled();
  const file = new File(['fixture bytes validated again by API'], 'avatar.png', {
    type: 'image/png',
  });
  fireEvent.change(input, { target: { files: [file] } });
  fireEvent.click(screen.getByRole('button', { name: 'Unggah foto' }));
  await screen.findByText('Foto profil disimpan.');
  expect(uploadProfilePhoto).toHaveBeenCalledWith('self', file);
  fireEvent.click(screen.getByRole('button', { name: 'Hapus foto' }));
  await screen.findByText('Foto dihapus. Avatar inisial digunakan kembali.');
  expect(deleteProfilePhoto).toHaveBeenCalledWith('self');
  await waitFor(() => expect(auth.refresh).toHaveBeenCalledTimes(2));
});
