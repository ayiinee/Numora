import { useState } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BottomNav, Button, Card, Dialog, Input, Tabs } from '@tka/ui';

afterEach(cleanup);

describe('shared redesign foundation', () => {
  it('uses working anchors and marks only the most specific route active', () => {
    render(
      <BottomNav
        pathname="/student/learn/chapter"
        items={[
          { label: 'Belajar', href: '/student', icon: 'H' },
          { label: 'Materi', href: '/student/learn', icon: 'M' },
          { label: 'PvP', href: '/student/pvp', icon: 'P' },
        ]}
      />,
    );
    expect(screen.getByRole('link', { name: 'Materi' }).getAttribute('href')).toBe(
      '/student/learn',
    );
    expect(screen.getByRole('link', { name: 'Materi' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('link', { name: 'Belajar' }).hasAttribute('aria-current')).toBe(false);
  });

  it('keeps loading actions disabled and input errors associated with their labels', () => {
    const submit = vi.fn();
    render(
      <>
        <Button loading onClick={submit}>
          Simpan
        </Button>
        <Input label="Kode kelas" error="Kode tidak valid" />
      </>,
    );
    fireEvent.click(screen.getByRole('button', { name: /Simpan/ }));
    expect(submit).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /Simpan/ }).getAttribute('aria-busy')).toBe('true');
    const input = screen.getByLabelText('Kode kelas');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(document.getElementById(input.getAttribute('aria-describedby')!)?.textContent).toBe(
      'Kode tidak valid',
    );
  });

  it('activates interactive cards with the keyboard without intercepting nested controls', () => {
    const activate = vi.fn();
    render(
      <Card interactive onClick={activate}>
        Level
      </Card>,
    );
    fireEvent.keyDown(screen.getByRole('button', { name: 'Level' }), { key: 'Enter' });
    fireEvent.keyDown(screen.getByRole('button', { name: 'Level' }), { key: ' ' });
    expect(activate).toHaveBeenCalledTimes(2);
  });

  it('moves tab focus, skips disabled tabs, wraps, and exposes the linked active panel', () => {
    function Example() {
      const [value, setValue] = useState('create');
      return (
        <Tabs
          label="Mode duel"
          value={value}
          onChange={setValue}
          items={[
            { value: 'create', label: 'Buat', content: 'Pilihan tingkat' },
            { value: 'closed', label: 'Tertutup', content: 'Tidak tersedia', disabled: true },
            { value: 'join', label: 'Gabung', content: 'Kode room' },
          ]}
        />
      );
    }
    render(<Example />);
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Buat' }), { key: 'ArrowRight' });
    const join = screen.getByRole('tab', { name: 'Gabung' });
    expect(document.activeElement).toBe(join);
    expect(join.getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tabpanel').textContent).toBe('Kode room');
    expect(join.getAttribute('aria-controls')).toBe(screen.getByRole('tabpanel').id);
    fireEvent.keyDown(join, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Buat' }));
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Buat' }), { key: 'End' });
    expect(document.activeElement).toBe(join);
  });

  it('controls modal dismissal during pending work and restores focus on close', () => {
    // jsdom does not implement native modal methods; browser coverage verifies focus containment.
    const originalShow = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'showModal');
    const originalClose = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'close');
    const show = vi.fn(function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    });
    const close = vi.fn(function (this: HTMLDialogElement) {
      this.removeAttribute('open');
    });
    Object.defineProperties(HTMLDialogElement.prototype, {
      showModal: { configurable: true, value: show },
      close: { configurable: true, value: close },
    });
    const onClose = vi.fn();
    const trigger = document.createElement('button');
    document.body.append(trigger);
    trigger.focus();
    const view = render(
      <Dialog open title="Kumpulkan latihan?" pending onClose={onClose}>
        <p>Ringkasan</p>
      </Dialog>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Kumpulkan latihan?' });
    fireEvent(dialog, new Event('cancel', { cancelable: true }));
    expect(onClose).not.toHaveBeenCalled();
    view.rerender(
      <Dialog open title="Kumpulkan latihan?" onClose={onClose}>
        <p>Ringkasan</p>
      </Dialog>,
    );
    fireEvent.click(within(dialog).getByRole('button', { name: 'Tutup dialog' }));
    expect(onClose).toHaveBeenCalledOnce();
    view.rerender(
      <Dialog open={false} title="Kumpulkan latihan?" onClose={onClose}>
        Ringkasan
      </Dialog>,
    );
    expect(close).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
    if (originalShow) Object.defineProperty(HTMLDialogElement.prototype, 'showModal', originalShow);
    else Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
    if (originalClose) Object.defineProperty(HTMLDialogElement.prototype, 'close', originalClose);
    else Reflect.deleteProperty(HTMLDialogElement.prototype, 'close');
  });
});
