import { onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AssessmentSession } from './assessment-session';

afterEach(() => {
  cleanup();
  onlineManager.setOnline(true);
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const question = {
  questionInstanceId: 'question-1',
  stem: 'Berapakah $2+3$?',
  options: [
    { id: 'A', text: '5' },
    { id: 'B', text: '6' },
  ],
  selectedOptionId: null,
};

function mount(
  onSave: (
    questionId: string,
    optionId: string | null,
  ) => Promise<{ questionInstanceId: string; selectedOptionId: string | null }>,
  questions = [question],
  deadlineAt?: string,
  submit?: () => Promise<unknown>,
  redesign = false,
  sessionKind: 'drill' | 'tryout' = 'drill',
) {
  const onSubmit = submit ? vi.fn(submit) : vi.fn().mockResolvedValue({});
  const onSubmitted = vi.fn();
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <AssessmentSession
        redesign={redesign}
        sessionKind={sessionKind}
        title="Level 1"
        questions={questions}
        submitLabel="Kirim Drill"
        confirmMessage={(empty) => `${empty} kosong`}
        onSave={onSave}
        onSubmit={onSubmit}
        onSubmitted={onSubmitted}
        deadlineAt={deadlineAt}
        serverTime={new Date().toISOString()}
      />
    </QueryClientProvider>,
  );
  return { onSubmit, onSubmitted };
}

describe('sesi asesmen', () => {
  it('reports a save failure when already offline and requires an acknowledged retry', async () => {
    onlineManager.setOnline(false);
    const onSave = vi
      .fn()
      .mockRejectedValueOnce(new Error('Jaringan putus'))
      .mockResolvedValueOnce({ questionInstanceId: 'question-1', selectedOptionId: 'A' });
    const { onSubmit } = mount(onSave);
    fireEvent.click(screen.getByRole('radio', { name: /^A\./ }));
    await screen.findByText('Jaringan putus');
    expect(onSave).toHaveBeenCalledOnce();
    expect(screen.getByRole('status').textContent).toBe('Belum tersimpan');
    expect(screen.getByRole('button', { name: 'Kirim Drill' }).hasAttribute('disabled')).toBe(true);
    onlineManager.setOnline(true);
    // Reconnection alone must not claim persistence or silently create another save.
    expect(onSave).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Coba simpan lagi' }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Tersimpan'));
    expect(onSave).toHaveBeenCalledTimes(2);
    expect(onSubmit).not.toHaveBeenCalled();
  });
  it('locks answers after successful finalization while navigation is still pending', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const save = vi.fn();
    const { onSubmitted, onSubmit } = mount(save);
    fireEvent.click(screen.getByRole('button', { name: 'Kirim Drill' }));
    await waitFor(() => expect(onSubmitted).toHaveBeenCalledOnce());
    expect(
      screen.getByRole('radio', { name: /^A\./ }).closest('fieldset')?.hasAttribute('disabled'),
    ).toBe(true);
    expect(screen.getByRole('button', { name: 'Kirim Drill' }).hasAttribute('disabled')).toBe(true);
    fireEvent.click(screen.getByRole('radio', { name: /^A\./ }));
    expect(save).not.toHaveBeenCalled();
    expect(onSubmit).toHaveBeenCalledOnce();
  });
  it('uses one finalizer when manual submit is still pending at the server deadline', async () => {
    let elapsed = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => elapsed);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    let finish!: (value: object) => void;
    const { onSubmit, onSubmitted } = mount(
      vi.fn(),
      [question],
      new Date(Date.now() + 2000).toISOString(),
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Kirim Drill' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    elapsed = 3000;
    await waitFor(() => expect(screen.getByRole('timer').textContent).toBe('0:00'));
    expect(onSubmit).toHaveBeenCalledOnce();
    finish({});
    await waitFor(() => expect(onSubmitted).toHaveBeenCalledOnce());
  });
  it('keeps the Drill exit warning after save acknowledgement and removes it after submit', async () => {
    let acknowledge!: (value: {
      questionInstanceId: string;
      selectedOptionId: string | null;
    }) => void;
    const { onSubmitted } = mount(
      () =>
        new Promise((resolve) => {
          acknowledge = resolve;
        }),
    );
    fireEvent.click(screen.getByRole('radio', { name: /^A\./ }));
    const unsaved = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(unsaved);
    expect(unsaved.defaultPrevented).toBe(true);
    await waitFor(() => expect(acknowledge).toBeTypeOf('function'));
    acknowledge({ questionInstanceId: 'question-1', selectedOptionId: 'A' });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Kirim Drill' }).hasAttribute('disabled')).toBe(
        false,
      ),
    );
    const saved = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(saved);
    expect(saved.defaultPrevented).toBe(true);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: 'Kirim Drill' }));
    await waitFor(() => expect(onSubmitted).toHaveBeenCalledOnce());
    const submitted = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(submitted);
    expect(submitted.defaultPrevented).toBe(false);
  });
  it('auto-submits an already expired server deadline once without confirmation and locks answers', async () => {
    const confirm = vi.spyOn(window, 'confirm');
    const save = vi.fn();
    const { onSubmit, onSubmitted } = mount(
      save,
      [question],
      new Date(Date.now() - 1000).toISOString(),
    );
    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    await waitFor(() => expect(onSubmitted).toHaveBeenCalledOnce());
    expect(confirm).not.toHaveBeenCalled();
    expect(screen.getByRole('timer').textContent).toBe('0:00');
    expect(
      screen.getByRole('radio', { name: /^A\./ }).closest('fieldset')?.hasAttribute('disabled'),
    ).toBe(true);
    expect(save).not.toHaveBeenCalled();
  });
  it('menyimpan jawaban sebelum mengizinkan submit', async () => {
    const onSave = vi
      .fn()
      .mockResolvedValue({ questionInstanceId: 'question-1', selectedOptionId: 'A' });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { onSubmit } = mount(onSave);

    fireEvent.click(screen.getByRole('radio', { name: /^A\./ }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith('question-1', 'A'));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Kirim Drill' }).hasAttribute('disabled')).toBe(
        false,
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Kirim Drill' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    expect(confirm).toHaveBeenCalledWith('0 kosong');
  });

  it('menahan submit setelah simpan gagal dan membuka kembali setelah retry', async () => {
    const onSave = vi
      .fn()
      .mockRejectedValueOnce(new Error('Jaringan putus'))
      .mockResolvedValueOnce({ questionInstanceId: 'question-1', selectedOptionId: 'A' });
    const { onSubmit } = mount(onSave);

    fireEvent.click(screen.getByRole('radio', { name: /^A\./ }));
    await screen.findByText('Jaringan putus');
    expect(screen.getByRole('button', { name: 'Kirim Drill' }).hasAttribute('disabled')).toBe(true);
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Coba simpan lagi' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Kirim Drill' }).hasAttribute('disabled')).toBe(
        false,
      ),
    );
    expect(onSave).toHaveBeenCalledTimes(2);
  });

  it('menahan jawaban soal lain sampai simpan yang gagal diperbaiki', async () => {
    const onSave = vi
      .fn()
      .mockRejectedValueOnce(new Error('Jaringan putus'))
      .mockResolvedValueOnce({ questionInstanceId: 'question-1', selectedOptionId: 'A' })
      .mockResolvedValueOnce({ questionInstanceId: 'question-2', selectedOptionId: 'A' });
    const questions = [question, { ...question, questionInstanceId: 'question-2' }];
    const { onSubmit } = mount(onSave, questions);

    fireEvent.click(screen.getByRole('radio', { name: /^A\./ }));
    await screen.findByText('Jaringan putus');
    fireEvent.click(screen.getByRole('button', { name: 'Berikutnya' }));
    expect(
      screen.getByRole('radio', { name: /^A\./ }).closest('fieldset')?.hasAttribute('disabled'),
    ).toBe(true);
    expect(screen.getByRole('button', { name: 'Kirim Drill' }).hasAttribute('disabled')).toBe(true);
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Coba simpan lagi' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(
        screen.getByRole('radio', { name: /^A\./ }).closest('fieldset')?.hasAttribute('disabled'),
      ).toBe(false),
    );
    fireEvent.click(screen.getByRole('radio', { name: /^A\./ }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(3));
  });
});

describe('screenshot Drill controls', () => {
  beforeEach(() => {
    Object.defineProperties(HTMLDialogElement.prototype, {
      showModal: {
        configurable: true,
        value: function (this: HTMLDialogElement) {
          this.setAttribute('open', '');
        },
      },
      close: {
        configurable: true,
        value: function (this: HTMLDialogElement) {
          this.removeAttribute('open');
        },
      },
    });
  });
  afterEach(() => {
    cleanup();
    Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
    Reflect.deleteProperty(HTMLDialogElement.prototype, 'close');
  });
  it('keeps ragu local and finalizes only after explicit confirmation, once while pending', async () => {
    const onSave = vi.fn();
    let finish!: (value: object) => void;
    const { onSubmit, onSubmitted } = mount(
      onSave,
      [question],
      undefined,
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
      true,
    );
    fireEvent.click(screen.getByLabelText('Tandai Ragu-ragu'));
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Kirim Drill' }));
    const dialog = await screen.findByRole('dialog', { name: 'Kumpulkan Latihan Sekarang?' });
    expect(within(dialog).getAllByText('No. 1')).toHaveLength(2);
    expect(onSubmit).not.toHaveBeenCalled();
    const confirm = within(dialog).getByRole('button', { name: 'Ya, Kumpulkan Jawaban' });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    finish({});
    await waitFor(() => expect(onSubmitted).toHaveBeenCalledOnce());
    expect(
      screen.getByRole('radio', { name: /^A\./ }).closest('fieldset')?.hasAttribute('disabled'),
    ).toBe(true);
  });
  it('automatically finalizes at zero while a manual confirmation is open, without confirming', async () => {
    let elapsed = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => elapsed);
    const confirm = vi.spyOn(window, 'confirm');
    const { onSubmit } = mount(
      vi.fn(),
      [question],
      new Date(Date.now() + 2000).toISOString(),
      undefined,
      true,
      'tryout',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Kirim Drill' }));
    await screen.findByRole('dialog', { name: 'Kumpulkan Tryout Sekarang?' });
    expect(onSubmit).not.toHaveBeenCalled();
    elapsed = 3000;
    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(confirm).not.toHaveBeenCalled();
    expect(screen.getByRole('timer').textContent).toBe('00:00');
  });
  it('keeps expired answers locked and allows finalization recovery without reopening the modal', async () => {
    let elapsed = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => elapsed);
    const complete = vi
      .fn()
      .mockRejectedValueOnce(new Error('Finalisasi terputus'))
      .mockResolvedValue({});
    const { onSubmit, onSubmitted } = mount(
      vi.fn(),
      [question],
      new Date(Date.now() + 2000).toISOString(),
      complete,
      true,
      'tryout',
    );
    elapsed = 3000;
    await screen.findByRole('alert');
    expect(onSubmit).toHaveBeenCalledOnce();
    expect(onSubmitted).not.toHaveBeenCalled();
    expect(
      screen.getByRole('radio', { name: /^A\./ }).closest('fieldset')?.hasAttribute('disabled'),
    ).toBe(true);
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Periksa pengiriman akhir' }));
    await waitFor(() => expect(onSubmitted).toHaveBeenCalledOnce());
    expect(onSubmit).toHaveBeenCalledTimes(2);
  });
  it('blocks the modal after a mismatched ACK until an acknowledged retry', async () => {
    const save = vi
      .fn()
      .mockResolvedValueOnce({ questionInstanceId: 'wrong', selectedOptionId: 'A' })
      .mockResolvedValueOnce({
        questionInstanceId: question.questionInstanceId,
        selectedOptionId: 'A',
      });
    mount(save, [question], undefined, undefined, true);
    fireEvent.click(screen.getByRole('radio', { name: /^A\./ }));
    await screen.findByRole('alert');
    expect(screen.getByRole('button', { name: 'Kirim Drill' }).hasAttribute('disabled')).toBe(true);
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Coba simpan lagi' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Kirim Drill' }).hasAttribute('disabled')).toBe(
        false,
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Kirim Drill' }));
    await screen.findByRole('dialog');
    expect(save).toHaveBeenCalledTimes(2);
  });
  it('keeps submit failure visible inside the modal and retries without false success', async () => {
    const complete = vi
      .fn()
      .mockRejectedValueOnce(new Error('Submit terputus'))
      .mockResolvedValue({});
    const { onSubmitted } = mount(vi.fn(), [question], undefined, complete, true);
    fireEvent.click(screen.getByRole('button', { name: 'Kirim Drill' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Ya, Kumpulkan Jawaban' }));
    await screen.findByRole('alert');
    expect(onSubmitted).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Ya, Kumpulkan Jawaban' }));
    await waitFor(() => expect(onSubmitted).toHaveBeenCalledOnce());
    expect(complete).toHaveBeenCalledTimes(2);
  });
});
