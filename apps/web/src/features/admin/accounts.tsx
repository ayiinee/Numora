'use client';
import { useEffect, useRef, useState } from 'react';
import { Button, Dialog, Icon, Tabs } from '@tka/ui';
import { AppShell } from '@/components/shell';
import { useAuth } from '@/features/onboarding/auth';
import { apiRequest } from '@/lib/api';
import { AdminLoading, AdminMessage } from './admin-presentation';
import { useAdminAccessError, withAdminWorkspace } from './admin-workspace';
import { ADMIN_PAGE_SIZE } from './pagination';
import { AdminPagination } from './admin-pagination';
import {
  AccountsTable,
  InvitationsTable,
  InviteForm,
  AccountEditForm,
  AccountIdentity,
} from './accounts-panels';
import type {
  AdminAccountDto,
  AdminAccountsDto,
  AdminInvitationDto,
  AdminInvitationsDto,
  InviteAdminDto,
  UpdateAdminAccountDto,
} from './generated-types';

type Notice = { message: string; error?: boolean } | null;
type Modal =
  | { kind: 'invite' }
  | { kind: 'edit'; account: AdminAccountDto }
  | { kind: 'recovery'; account: AdminAccountDto }
  | { kind: 'cancel'; invitation: AdminInvitationDto }
  | null;
const message = (error: unknown) =>
  error instanceof Error ? error.message : 'Permintaan belum berhasil. Coba lagi.';
export const AdminAccountsScreen = withAdminWorkspace(AccountsScreen, 'accounts');
function AccountsScreen() {
  const { state } = useAuth();
  if (state.status !== 'ready') return null;
  return (
    <AppShell
      area="admin"
      className="admin-redesign-shell admin-management-shell admin-accounts-shell"
    >
      <div className="admin-accounts-frame">
        <AccountsPanel token={state.session.access_token} />
      </div>
    </AppShell>
  );
}
function AccountsPanel({ token }: { token: string }) {
  const reportAccessError = useAdminAccessError();
  const [accounts, setAccounts] = useState<AdminAccountsDto | null>(null);
  const [invitations, setInvitations] = useState<AdminInvitationsDto | null>(null);
  const [accountError, setAccountError] = useState('');
  const [inviteError, setInviteError] = useState('');
  const [notice, setNotice] = useState<Notice>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('');
  const [offset, setOffset] = useState(0);
  const [inviteOffset, setInviteOffset] = useState(0);
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState('accounts');
  const [modal, setModal] = useState<Modal>(null);
  const operation = useRef<{ payload: string; key: string } | null>(null);
  const mutation = useRef(false);
  const recoveryKeys = useRef(new Map<string, string>());
  useEffect(() => {
    let active = true;
    setAccounts(null);
    setAccountError('');
    void apiRequest<AdminAccountsDto>(
      `admin/accounts?limit=${ADMIN_PAGE_SIZE}&offset=${offset}&search=${encodeURIComponent(filter)}`,
      token,
    )
      .then((data) => {
        if (active) setAccounts(data);
      })
      .catch((error) => {
        if (active) {
          reportAccessError(error);
          setAccountError(message(error));
        }
      });
    return () => {
      active = false;
    };
  }, [token, filter, offset, revision, reportAccessError]);
  useEffect(() => {
    let active = true;
    setInvitations(null);
    setInviteError('');
    void apiRequest<AdminInvitationsDto>(
      `admin/invitations?limit=${ADMIN_PAGE_SIZE}&offset=${inviteOffset}&search=${encodeURIComponent(filter)}`,
      token,
    )
      .then((data) => {
        if (active) setInvitations(data);
      })
      .catch((error) => {
        if (active) {
          reportAccessError(error);
          setInviteError(message(error));
        }
      });
    return () => {
      active = false;
    };
  }, [token, filter, inviteOffset, revision, reportAccessError]);
  async function run(action: () => Promise<unknown>, success: string) {
    if (mutation.current) return false;
    mutation.current = true;
    setBusy(true);
    setNotice(null);
    try {
      await action();
      setNotice({ message: success });
      setRevision((value) => value + 1);
      return true;
    } catch (error) {
      reportAccessError(error);
      setNotice({ message: message(error), error: true });
      return false;
    } finally {
      mutation.current = false;
      setBusy(false);
    }
  }
  function open(next: Exclude<Modal, null>) {
    setNotice(null);
    setModal(next);
  }
  function close() {
    if (!mutation.current) {
      setModal(null);
      setNotice(null);
    }
  }
  async function invite(input: InviteAdminDto) {
    const payload = JSON.stringify({
      ...input,
      email: input.email.trim().toLowerCase(),
      displayName: input.displayName.trim(),
    });
    if (operation.current?.payload !== payload)
      operation.current = { payload, key: crypto.randomUUID() };
    if (
      await run(
        () =>
          apiRequest('admin/invitations', token, {
            method: 'POST',
            body: payload,
            headers: { 'Idempotency-Key': operation.current!.key },
          }),
        'Undangan dicatat. Pantau perkembangannya di tab Undangan.',
      )
    ) {
      operation.current = null;
      setModal(null);
      setTab('invitations');
      setSearch('');
      setFilter('');
      setOffset(0);
      setInviteOffset(0);
    }
  }
  async function update(account: AdminAccountDto, input: UpdateAdminAccountDto) {
    if (
      await run(
        () =>
          apiRequest(`admin/accounts/${account.id}`, token, {
            method: 'PATCH',
            body: JSON.stringify(input),
          }),
        'Perubahan akses akun tersimpan.',
      )
    )
      setModal(null);
  }
  async function recover(account: AdminAccountDto) {
    const key = recoveryKeys.current.get(account.id) ?? crypto.randomUUID();
    recoveryKeys.current.set(account.id, key);
    if (
      await run(
        () =>
          apiRequest(`admin/accounts/${account.id}/recovery`, token, {
            method: 'POST',
            headers: { 'Idempotency-Key': key },
          }),
        'Permintaan pemulihan password diproses.',
      )
    ) {
      recoveryKeys.current.delete(account.id);
      setModal(null);
    }
  }
  async function cancel(invitation: AdminInvitationDto) {
    if (
      await run(
        () => apiRequest(`admin/invitations/${invitation.id}/cancel`, token, { method: 'POST' }),
        'Undangan dibatalkan.',
      )
    )
      setModal(null);
  }
  const isAccounts = tab === 'accounts';
  const data = isAccounts ? accounts : invitations;
  const currentOffset = isAccounts ? offset : inviteOffset;
  const listError = isAccounts ? accountError : inviteError;
  const alert = notice && (
    <div
      className={`accounts-feedback${notice.error ? ' accounts-feedback-error' : ''}`}
      role={notice.error ? 'alert' : 'status'}
    >
      <Icon name={notice.error ? 'info' : 'check-circle'} />
      <p>{notice.message}</p>
    </div>
  );
  function resetSearch() {
    setSearch('');
    setFilter('');
    setOffset(0);
    setInviteOffset(0);
  }
  const list = (
    <div className="accounts-directory" aria-busy={!data && !listError}>
      <div className="accounts-toolbar">
        <div>
          <h2>{isAccounts ? 'Daftar akun' : 'Daftar undangan'}</h2>
          <p>
            {isAccounts
              ? 'Tinjau peran dan kelola akses setiap Admin.'
              : 'Pantau proses undangan dan tindak lanjut yang diperlukan.'}
          </p>
        </div>
        <form
          className="accounts-search"
          onSubmit={(event) => {
            event.preventDefault();
            setFilter(search.trim());
            setOffset(0);
            setInviteOffset(0);
          }}
        >
          <label className="sr-only" htmlFor="account-search">
            Cari nama atau email
          </label>
          <div>
            <Icon name="search" />
            <input
              id="account-search"
              type="search"
              placeholder="Nama / email"
              value={search}
              maxLength={120}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <Button type="submit" variant="secondary" disabled={busy}>
            Cari
          </Button>
          {filter && (
            <Button type="button" variant="ghost" disabled={busy} onClick={resetSearch}>
              Reset
            </Button>
          )}
        </form>
      </div>
      {listError ? (
        <AdminMessage error message={listError} retry={() => setRevision((value) => value + 1)} />
      ) : !data ? (
        <AdminLoading message={isAccounts ? 'Memuat akun…' : 'Memuat undangan…'} />
      ) : !data.items.length ? (
        <div className="accounts-empty">
          <span className="accounts-empty-icon">
            <Icon name={isAccounts ? 'users' : 'mail'} />
          </span>
          <h3>
            {filter
              ? 'Tidak ada hasil yang cocok'
              : isAccounts
                ? 'Belum ada akun Admin'
                : 'Belum ada undangan'}
          </h3>
          <p>
            {filter
              ? 'Coba nama atau alamat email lain.'
              : isAccounts
                ? 'Undang anggota tim untuk mulai mengatur akses.'
                : 'Undangan yang dibuat akan tampil di sini.'}
          </p>
          <Button
            variant="secondary"
            onClick={() => (filter ? resetSearch() : open({ kind: 'invite' }))}
          >
            {filter ? 'Reset pencarian' : 'Undang Admin'}
          </Button>
        </div>
      ) : isAccounts ? (
        <AccountsTable
          items={accounts!.items}
          busy={busy}
          onEdit={(account) => open({ kind: 'edit', account })}
          onRecover={(account) => open({ kind: 'recovery', account })}
        />
      ) : (
        <InvitationsTable
          items={invitations!.items}
          busy={busy}
          onRetry={(invitation) =>
            void run(
              () =>
                apiRequest(`admin/invitations/${invitation.id}/retry`, token, { method: 'POST' }),
              'Status undangan diperiksa kembali.',
            )
          }
          onCancel={(invitation) => open({ kind: 'cancel', invitation })}
        />
      )}
      {data && !listError && (
        <footer className="accounts-directory-footer">
          <p>
            {data.items.length
              ? `Menampilkan ${currentOffset + 1}–${currentOffset + data.items.length}`
              : '0 ditampilkan'}
            <span>Maksimal {ADMIN_PAGE_SIZE} per halaman</span>
          </p>
          <AdminPagination
            label={isAccounts ? 'Halaman akun Admin' : 'Halaman undangan'}
            offset={currentOffset}
            hasNext={data.nextOffset !== null}
            disabled={busy}
            onChange={(next) => {
              const value = next < currentOffset ? next : data.nextOffset!;
              if (isAccounts) setOffset(value);
              else setInviteOffset(value);
            }}
          />
        </footer>
      )}
    </div>
  );
  return (
    <>
      <header className="accounts-page-heading">
        <div>
          <h1>Akun Admin</h1>
          <p>Kelola akun dan akses tim Numora dalam satu tempat.</p>
        </div>
        <Button
          leftIcon={<Icon name="users" />}
          disabled={busy}
          onClick={() => open({ kind: 'invite' })}
        >
          Undang Admin
        </Button>
      </header>
      {!modal && alert}
      <Tabs
        label="Pengelolaan akun Admin"
        value={tab}
        onChange={setTab}
        items={[
          { value: 'accounts', label: 'Akun Admin', content: isAccounts ? list : null },
          {
            value: 'invitations',
            label: (
              <>
                Undangan
                {inviteError && (
                  <span className="accounts-tab-attention" aria-label="Perlu diperiksa" />
                )}
              </>
            ),
            content: !isAccounts ? list : null,
          },
        ]}
      />
      <p className="accounts-access-note">
        <Icon name="lock" />
        Pengelolaan akun hanya tersedia untuk Super Admin. Perubahan akses dicatat oleh sistem.
      </p>
      {modal && (
        <Dialog
          open
          title={
            modal.kind === 'invite'
              ? 'Undang Admin'
              : modal.kind === 'edit'
                ? 'Kelola akun'
                : modal.kind === 'recovery'
                  ? 'Pulihkan password'
                  : 'Batalkan undangan'
          }
          description={
            modal.kind === 'invite'
              ? 'Kirim undangan untuk anggota tim internal Numora.'
              : 'Tinjau akun dan tindakan sebelum melanjutkan.'
          }
          onClose={close}
          pending={busy}
          className="admin-management-dialog admin-accounts-dialog"
        >
          {alert}
          {modal.kind === 'invite' ? (
            <InviteForm busy={busy} onSubmit={invite} onCancel={close} />
          ) : modal.kind === 'edit' ? (
            <AccountEditForm
              key={modal.account.id}
              account={modal.account}
              busy={busy}
              onSave={(input) => update(modal.account, input)}
              onCancel={close}
            />
          ) : (
            <>
              <AccountIdentity
                name={
                  modal.kind === 'recovery'
                    ? modal.account.displayName
                    : modal.invitation.displayName
                }
                email={modal.kind === 'recovery' ? modal.account.email : modal.invitation.email}
              />
              <p className="accounts-confirm-copy">
                {modal.kind === 'recovery'
                  ? 'Proses ini meminta email pemulihan. Penerima menetapkan password sendiri; peran dan status akun tidak berubah.'
                  : 'Penerima tidak dapat menggunakan undangan ini lagi. Akun yang sudah menerima undangan dikelola melalui daftar akun.'}
              </p>
              <div className="accounts-dialog-actions">
                <Button variant="secondary" disabled={busy} onClick={close}>
                  Kembali
                </Button>
                <Button
                  variant={modal.kind === 'cancel' ? 'danger' : 'primary'}
                  loading={busy}
                  onClick={() =>
                    void (modal.kind === 'recovery'
                      ? recover(modal.account)
                      : cancel(modal.invitation))
                  }
                >
                  {modal.kind === 'recovery' ? 'Kirim pemulihan' : 'Batalkan undangan'}
                </Button>
              </div>
            </>
          )}
        </Dialog>
      )}
    </>
  );
}
