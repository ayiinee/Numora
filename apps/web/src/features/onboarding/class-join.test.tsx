import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { ClassJoinScreen } from './class-join';

const mocks = vi.hoisted(() => ({
  joinClass: vi.fn(),
  refresh: vi.fn(),
  replace: vi.fn(),
  profile: {
    id: 'student-id',
    role: 'STUDENT',
    status: 'ACTIVE',
    displayName: 'Siswa',
    email: 'student@example.test',
    teacherVerified: null,
    studentAffiliation: 'MANDIRI',
  } as {
    id: string;
    role: string;
    status: string;
    displayName: string;
    email: string;
    teacherVerified: string | null;
    studentAffiliation: string | null;
  },
}));

vi.mock('@/components/shell', () => ({
  StudentLayout: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: mocks.replace }) }));
vi.mock('@/features/core-learning/student-session', () => ({
  useStudentToken: () => 'test-token',
}));
vi.mock('@/features/onboarding/auth', () => ({
  useAuth: () => ({
    state: { status: 'ready', session: { access_token: 'test-token' }, profile: mocks.profile },
    refresh: mocks.refresh,
  }),
}));
vi.mock('@/lib/api', () => ({
  joinClass: mocks.joinClass,
  ApiProblem: class ApiProblem extends Error {
    constructor(
      public status: number,
      public code: string,
      message: string,
    ) {
      super(message);
    }
  },
}));

const joined = { class: { id: 'c1', name: 'IX A' }, joined: true };

async function problem(status: number, code: string, detail: string) {
  const { ApiProblem } = await import('@/lib/api');
  return new ApiProblem(status, code, detail);
}

function mount(code: string | undefined, client = new QueryClient()) {
  render(
    <QueryClientProvider client={client}>
      <ClassJoinScreen code={code} />
    </QueryClientProvider>,
  );
  return client;
}

beforeEach(() => {
  mocks.joinClass.mockReset();
  mocks.refresh.mockReset();
  mocks.replace.mockReset();
  mocks.profile.studentAffiliation = 'MANDIRI';
});

afterEach(() => {
  cleanup();
});

describe('class join link destination', () => {
  it('joins with the trimmed link code, then refreshes identity and leaves the screen', async () => {
    mocks.joinClass.mockResolvedValue(joined);
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries').mockResolvedValue(void 0);
    mount('  ABC123  ', client);

    fireEvent.click(screen.getByRole('button', { name: 'Gabung kelas' }));
    await vi.waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/student'));

    expect(mocks.joinClass).toHaveBeenCalledWith('test-token', 'ABC123');
    expect(invalidate).toHaveBeenCalled();
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it('keeps legacy capitalization untouched while submitting', async () => {
    mocks.joinClass.mockResolvedValue(joined);
    mount('aB3_-xY9qT');

    fireEvent.click(screen.getByRole('button', { name: 'Gabung kelas' }));
    await vi.waitFor(() =>
      expect(mocks.joinClass).toHaveBeenCalledWith('test-token', 'aB3_-xY9qT'),
    );
  });

  it('blocks a second request while one is still pending', async () => {
    let finish!: (value: typeof joined) => void;
    mocks.joinClass.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    mount('ABC123');

    fireEvent.click(screen.getByRole('button', { name: 'Gabung kelas' }));
    fireEvent.click(screen.getByRole('button', { name: 'Menghubungkan…' }));

    expect(mocks.joinClass).toHaveBeenCalledTimes(1);
    finish(joined);
    await vi.waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/student'));
  });

  it('reports an unknown code without refreshing identity or navigating', async () => {
    mocks.joinClass.mockRejectedValue(
      await problem(404, 'CLASS_NOT_FOUND', 'Kode Class tidak valid.'),
    );
    mount('ZZZ999');

    fireEvent.click(screen.getByRole('button', { name: 'Gabung kelas' }));

    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'Kode Class tidak valid. Kode bisa salah, kelas sudah diarsipkan, atau sekolah tidak aktif.',
    );
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it('explains the one-class conflict returned by the server', async () => {
    mocks.joinClass.mockRejectedValue(
      await problem(409, 'ALREADY_IN_CLASS', 'Siswa sudah menjadi anggota Class lain.'),
    );
    mount('ABC123');

    fireEvent.click(screen.getByRole('button', { name: 'Gabung kelas' }));

    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'Siswa sudah menjadi anggota Class lain. Satu Siswa hanya boleh aktif pada satu kelas. Keluar atau pindah kelas tidak dapat dilakukan sendiri.',
    );
  });

  it('surfaces the rate-limit copy returned by the server', async () => {
    mocks.joinClass.mockRejectedValue(
      await problem(
        429,
        'CODE_ATTEMPT_LIMIT',
        'Terlalu banyak percobaan kode. Coba lagi setelah jeda.',
      ),
    );
    mount('ABC123');

    fireEvent.click(screen.getByRole('button', { name: 'Gabung kelas' }));

    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'Terlalu banyak percobaan kode. Coba lagi setelah jeda. Tunggu beberapa saat sebelum mencoba kode lagi.',
    );
  });

  it('keeps join available when the code limiter is unavailable', async () => {
    mocks.joinClass.mockRejectedValue(
      await problem(503, 'CODE_LIMITER_UNAVAILABLE', 'Verifikasi kode sementara tidak tersedia.'),
    );
    mount('ABC123');

    fireEvent.click(screen.getByRole('button', { name: 'Gabung kelas' }));

    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'Verifikasi kode sementara tidak tersedia. Pemeriksaan kode sementara tidak tersedia. Coba lagi nanti.',
    );
    expect(screen.getByRole('button', { name: 'Gabung kelas' })).toBeTruthy();
  });

  it('offers re-login when the session was rejected', async () => {
    mocks.joinClass.mockRejectedValue(await problem(401, 'UNAUTHORIZED', 'Sesi berakhir.'));
    mount('ABC123');

    fireEvent.click(screen.getByRole('button', { name: 'Gabung kelas' }));

    expect((await screen.findByRole('alert')).textContent).toBe('Sesi berakhir. Masuk kembali');
    expect(screen.getByRole('link', { name: 'Masuk kembali' }).getAttribute('href')).toBe('/');
  });

  it('keeps the retry on the same code after a failed join', async () => {
    mocks.joinClass
      .mockRejectedValueOnce(await problem(0, 'NETWORK_ERROR', 'Koneksi ke server gagal.'))
      .mockResolvedValueOnce(joined);
    mount('ABC123');

    fireEvent.click(screen.getByRole('button', { name: 'Gabung kelas' }));
    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'Koneksi ke server gagal. Periksa koneksi lalu coba lagi.',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Gabung kelas' }));
    await vi.waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/student'));
    expect(mocks.joinClass).toHaveBeenCalledTimes(2);
    expect(mocks.joinClass).toHaveBeenLastCalledWith('test-token', 'ABC123');
  });

  it('points to manual entry when the opened link carries no code', () => {
    mount(undefined);

    expect(screen.getByRole('heading', { name: 'Kode kelas tidak tersedia' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Gabung dengan kode' }).getAttribute('href')).toBe(
      '/student/profile',
    );
    expect(screen.queryByRole('button')).toBeNull();
    expect(mocks.joinClass).not.toHaveBeenCalled();
  });

  it('refuses a malformed link code before any request', () => {
    mount('ab!');

    expect(screen.getByRole('alert')).toHaveProperty(
      'textContent',
      'Format kode kelas tidak dikenali.',
    );
    expect(screen.queryByRole('button')).toBeNull();
    expect(mocks.joinClass).not.toHaveBeenCalled();
  });

  it('warns an already affiliated Student without claiming the outcome', async () => {
    mocks.profile.studentAffiliation = 'SCHOOL';
    mocks.joinClass.mockResolvedValue(joined);
    mount('ABC123');

    expect(
      screen.getByText(
        'Akunmu sudah terhubung dengan sebuah kelas. Hasil akhir tetap ditentukan server.',
      ),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Gabung kelas' }));
    await vi.waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/student'));
  });
});
