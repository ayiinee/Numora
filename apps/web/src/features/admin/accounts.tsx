'use client';
import { ADMIN_PAGE_SIZE } from './pagination';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Button, Card } from '@tka/ui';
import { useAuth } from '@/features/onboarding/auth';
import { apiRequest } from '@/lib/api';
import type {
  AdminAccountsDto,
  AdminInvitationsDto,
  InviteAdminDto,
  UpdateAdminAccountDto,
} from './generated-types';
import { AdminFrame, AdminLoading, AdminMessage } from './admin-presentation';
import { adminRoleLabel } from './navigation';
const roles = ['SUPER_ADMIN', 'OPERATIONS', 'CONTENT_DATA_MODERATION'] as const;

export function AdminAccountsScreen() {
  const { state } = useAuth();
  const token =
    state.status === 'ready' &&
    state.profile.role === 'ADMIN' &&
    state.profile.capabilities?.includes('ADMIN_ACCOUNTS_MANAGE')
      ? state.session.access_token
      : null;
  return (
    <AdminFrame
      title="Akun Admin"
      description="Undangan internal, assignment, dan status akses Admin."
      icon="users"
    >
      {state.status === 'loading' ? (
        <AdminLoading message="Memeriksa akses…" />
      ) : !token ? (
        <AdminMessage
          error
          message="Hanya Super Admin aktif yang dapat mengelola akun Admin."
          login
        />
      ) : (
        <AccountsPanel
          key={state.status === 'ready' ? state.profile.id + state.profile.adminRole : ''}
          token={token}
        />
      )}
    </AdminFrame>
  );
}
function AccountsPanel({ token }: { token: string }) {
  const [accounts, setAccounts] = useState<AdminAccountsDto | null>(null),
    [invitations, setInvitations] = useState<AdminInvitationsDto | null>(null);
  const [accountError, setAccountError] = useState(''),
    [inviteError, setInviteError] = useState(''),
    [notice, setNotice] = useState('');
  const [search, setSearch] = useState(''),
    [filter, setFilter] = useState(''),
    [offset, setOffset] = useState(0),
    [inviteOffset, setInviteOffset] = useState(0),
    [revision, setRevision] = useState(0),
    [busy, setBusy] = useState(false);
  const [email, setEmail] = useState(''),
    [displayName, setDisplayName] = useState(''),
    [role, setRole] = useState<InviteAdminDto['adminRole']>('OPERATIONS');
  const operation = useRef<{ payload: string; key: string } | null>(null),
    mutation = useRef(false);
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
        if (active) setAccountError(error.message);
      });
    return () => {
      active = false;
    };
  }, [token, filter, offset, revision]);
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
        if (active) setInviteError(error.message);
      });
    return () => {
      active = false;
    };
  }, [token, filter, inviteOffset, revision]);
  async function run(action: () => Promise<unknown>, success: string) {
    if (mutation.current) return;
    mutation.current = true;
    setBusy(true);
    setNotice('');
    try {
      await action();
      setNotice(success);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Perubahan belum tersimpan.');
    } finally {
      mutation.current = false;
      setBusy(false);
      setRevision((value) => value + 1);
    }
  }
  async function invite(event: FormEvent) {
    event.preventDefault();
    const payload = JSON.stringify({
      email: email.trim().toLowerCase(),
      displayName: displayName.trim(),
      adminRole: role,
    } satisfies InviteAdminDto);
    if (operation.current?.payload !== payload)
      operation.current = { payload, key: crypto.randomUUID() };
    await run(async () => {
      await apiRequest('admin/invitations', token, {
        method: 'POST',
        body: payload,
        headers: { 'Idempotency-Key': operation.current!.key },
      });
      setEmail('');
      setDisplayName('');
      operation.current = null;
    }, 'Operasi invite tersimpan. Periksa status provisioning di bawah.');
  }
  const update = (id: string, input: UpdateAdminAccountDto) =>
    run(
      () =>
        apiRequest(`admin/accounts/${id}`, token, { method: 'PATCH', body: JSON.stringify(input) }),
      'Akses akun diperbarui.',
    );
  return (
    <div className="page-stack">
      <Card>
        <h2>Invite Admin</h2>
        <p>
          Penerima menetapkan password sendiri melalui email. Assignment ditetapkan oleh Super
          Admin.
        </p>
        <form onSubmit={(event) => void invite(event)} className="admin-content-form">
          <fieldset disabled={busy} className="admin-editor-fields">
            <label htmlFor="invite-email">Email internal</label>
            <input
              id="invite-email"
              className="text-input"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <label htmlFor="invite-name">Nama</label>
            <input
              id="invite-name"
              className="text-input"
              required
              maxLength={120}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
            <label htmlFor="invite-role">Sub-role</label>
            <select
              id="invite-role"
              className="text-input"
              value={role}
              onChange={(e) => setRole(e.target.value as InviteAdminDto['adminRole'])}
            >
              {roles.map((value) => (
                <option key={value} value={value}>
                  {adminRoleLabel(value)}
                </option>
              ))}
            </select>
            <Button type="submit" loading={busy}>
              Kirim invite
            </Button>
          </fieldset>
        </form>
      </Card>
      {notice && <AdminMessage message={notice} />}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setFilter(search);
          setOffset(0);
          setInviteOffset(0);
        }}
      >
        <label htmlFor="account-search">Cari nama atau email</label>
        <input
          id="account-search"
          className="text-input"
          value={search}
          maxLength={120}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Button type="submit" variant="secondary">
          Cari
        </Button>
      </form>
      <Card>
        <h2>Akun Admin</h2>
        {accountError ? (
          <AdminMessage
            error
            message={accountError}
            retry={() => setRevision((value) => value + 1)}
          />
        ) : !accounts ? (
          <AdminLoading message="Memuat akun…" />
        ) : (
          <>
            <div className="page-stack">
              {accounts.items.map((account) => (
                <Card key={account.id}>
                  <h3>{account.displayName}</h3>
                  <p>
                    {account.email} · {account.status}
                  </p>
                  <label htmlFor={`role-${account.id}`}>Assignment</label>
                  <select
                    id={`role-${account.id}`}
                    className="text-input"
                    disabled={busy}
                    value={account.adminRole ?? ''}
                    onChange={(e) =>
                      void update(account.id, {
                        adminRole: e.target.value as InviteAdminDto['adminRole'],
                      })
                    }
                  >
                    <option value="" disabled>
                      Belum diassign
                    </option>
                    {roles.map((value) => (
                      <option key={value} value={value}>
                        {adminRoleLabel(value)}
                      </option>
                    ))}
                  </select>
                  <Button
                    disabled={busy}
                    variant="secondary"
                    onClick={() =>
                      void update(account.id, {
                        status: account.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE',
                      })
                    }
                  >
                    {account.status === 'ACTIVE' ? 'Nonaktifkan' : 'Aktifkan'}
                  </Button>
                  <Button
                    disabled={busy}
                    variant="secondary"
                    onClick={() =>
                      void run(async () => {
                        const key = recoveryKeys.current.get(account.id) ?? crypto.randomUUID();
                        recoveryKeys.current.set(account.id, key);
                        await apiRequest(`admin/accounts/${account.id}/recovery`, token, {
                          method: 'POST',
                          headers: { 'Idempotency-Key': key },
                        });
                        recoveryKeys.current.delete(account.id);
                      }, 'Permintaan recovery dikirim. Penerima menetapkan password sendiri.')
                    }
                  >
                    Kirim recovery password
                  </Button>
                </Card>
              ))}
            </div>
            {!accounts.items.length && <p>Belum ada akun sesuai filter.</p>}
            <Button
              disabled={!offset || busy}
              onClick={() => setOffset(Math.max(0, offset - ADMIN_PAGE_SIZE))}
            >
              Sebelumnya
            </Button>
            <Button
              disabled={accounts.nextOffset === null || busy}
              onClick={() => setOffset(accounts.nextOffset!)}
            >
              Berikutnya
            </Button>
          </>
        )}
      </Card>
      <Card>
        <h2>Provisioning invite</h2>
        {inviteError ? (
          <AdminMessage
            error
            message={inviteError}
            retry={() => setRevision((value) => value + 1)}
          />
        ) : !invitations ? (
          <AdminLoading message="Memuat invite…" />
        ) : (
          <>
            <div className="page-stack">
              {invitations.items.map((invitation) => (
                <Card key={invitation.id}>
                  <h3>{invitation.displayName}</h3>
                  <p>
                    {invitation.email} · {adminRoleLabel(invitation.targetRole)}
                  </p>
                  <p>
                    Status: {invitation.status} · Diperbarui:{' '}
                    {new Date(invitation.updatedAt).toLocaleString('id-ID')}
                  </p>
                  {invitation.failureCode && <p role="status">{invitation.failureCode}</p>}
                  {['RESERVED', 'FAILED', 'SENDING'].includes(invitation.status) && (
                    <Button
                      disabled={busy}
                      onClick={() =>
                        void run(
                          () =>
                            apiRequest(`admin/invitations/${invitation.id}/retry`, token, {
                              method: 'POST',
                            }),
                          'Status provisioning diperiksa kembali.',
                        )
                      }
                    >
                      Retry operasi yang sama
                    </Button>
                  )}
                  {!['ACCEPTED', 'CANCELLED'].includes(invitation.status) && (
                    <Button
                      disabled={busy}
                      variant="secondary"
                      onClick={() =>
                        void run(
                          () =>
                            apiRequest(`admin/invitations/${invitation.id}/cancel`, token, {
                              method: 'POST',
                            }),
                          'Invite dibatalkan.',
                        )
                      }
                    >
                      Batalkan invite
                    </Button>
                  )}
                </Card>
              ))}
            </div>
            {!invitations.items.length && <p>Belum ada invite sesuai filter.</p>}
            <Button
              disabled={!inviteOffset || busy}
              onClick={() => setInviteOffset(Math.max(0, inviteOffset - 20))}
            >
              Sebelumnya
            </Button>
            <Button
              disabled={invitations.nextOffset === null || busy}
              onClick={() => setInviteOffset(invitations.nextOffset!)}
            >
              Berikutnya
            </Button>
          </>
        )}
      </Card>
    </div>
  );
}
