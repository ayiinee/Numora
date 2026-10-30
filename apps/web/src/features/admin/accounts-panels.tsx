'use client';

import { useState } from 'react';
import { Button, Icon } from '@tka/ui';
import { adminRoleLabel } from './navigation';
import type {
  AdminAccountDto,
  AdminInvitationDto,
  InviteAdminDto,
  UpdateAdminAccountDto,
} from './generated-types';

const roles = ['SUPER_ADMIN', 'OPERATIONS', 'CONTENT_DATA_MODERATION'] as const;
const roleHelp = {
  SUPER_ADMIN: 'Mengelola akun Admin serta seluruh modul administrasi.',
  OPERATIONS: 'Mengelola sekolah, verifikasi Guru, dan data operasional.',
  CONTENT_DATA_MODERATION: 'Mengelola konten, moderasi, dan proses Data/IRT.',
};
const invitationLabels: Record<AdminInvitationDto['status'], string> = {
  RESERVED: 'Menunggu proses',
  SENDING: 'Sedang diproses',
  INVITED: 'Menunggu penerimaan',
  FAILED: 'Perlu ditangani',
  ACCEPTED: 'Diterima',
  CANCELLED: 'Dibatalkan',
};
function date(value: string) {
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime())
    ? parsed.toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'Asia/Jakarta',
      })
    : 'Belum tersedia';
}
export function AccountIdentity({ name, email }: { name: string; email: string }) {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase();
  return (
    <div className="accounts-identity">
      <span className="accounts-avatar" aria-hidden="true">
        {initials || 'A'}
      </span>
      <div>
        <strong>{name}</strong>
        <span>{email}</span>
      </div>
    </div>
  );
}
function Status({ value, children }: { value: string; children: React.ReactNode }) {
  return (
    <span className={`accounts-status accounts-status-${value.toLowerCase()}`}>
      <i aria-hidden="true" />
      {children}
    </span>
  );
}
function Role({ value }: { value: AdminAccountDto['adminRole'] }) {
  return <span className="accounts-role">{adminRoleLabel(value)}</span>;
}
export function AccountsTable({
  items,
  busy,
  onEdit,
  onRecover,
}: {
  items: AdminAccountDto[];
  busy: boolean;
  onEdit: (account: AdminAccountDto) => void;
  onRecover: (account: AdminAccountDto) => void;
}) {
  return (
    <table className="accounts-table" role="table">
      <caption className="sr-only">Daftar akun Admin beserta peran dan status akses</caption>
      <thead>
        <tr>
          <th scope="col">Nama & email</th>
          <th scope="col">Peran akses</th>
          <th scope="col">Status</th>
          <th scope="col">Ditambahkan</th>
          <th scope="col">Tindakan</th>
        </tr>
      </thead>
      <tbody>
        {items.map((account) => (
          <tr key={account.id}>
            <td className="accounts-person-cell">
              <AccountIdentity name={account.displayName} email={account.email} />
            </td>
            <td>
              <span className="accounts-cell-label">Peran akses</span>
              <Role value={account.adminRole} />
            </td>
            <td>
              <span className="accounts-cell-label">Status</span>
              <Status value={account.status}>
                {account.status === 'ACTIVE' ? 'Aktif' : 'Nonaktif'}
              </Status>
            </td>
            <td className="accounts-date">
              <span className="accounts-cell-label">Ditambahkan</span>
              <time dateTime={account.createdAt}>{date(account.createdAt)}</time>
            </td>
            <td className="accounts-actions-cell">
              <div className="accounts-row-actions">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={busy}
                  onClick={() => onEdit(account)}
                  aria-label={`Kelola akun ${account.displayName}`}
                >
                  Kelola
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() => onRecover(account)}
                  aria-label={`Pulihkan password ${account.displayName}`}
                  title="Kirim pemulihan password"
                >
                  <Icon name="lock" />
                  <span>Pulihkan</span>
                </Button>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
export function InvitationsTable({
  items,
  busy,
  onRetry,
  onCancel,
}: {
  items: AdminInvitationDto[];
  busy: boolean;
  onRetry: (item: AdminInvitationDto) => void;
  onCancel: (item: AdminInvitationDto) => void;
}) {
  return (
    <table className="accounts-table accounts-invitations-table" role="table">
      <caption className="sr-only">Daftar undangan Admin dan perkembangan prosesnya</caption>
      <thead>
        <tr>
          <th scope="col">Nama & email</th>
          <th scope="col">Peran akses</th>
          <th scope="col">Status undangan</th>
          <th scope="col">Diperbarui</th>
          <th scope="col">Tindakan</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => (
          <tr key={item.id}>
            <td className="accounts-person-cell">
              <AccountIdentity name={item.displayName} email={item.email} />
            </td>
            <td>
              <span className="accounts-cell-label">Peran akses</span>
              <Role value={item.targetRole} />
            </td>
            <td>
              <span className="accounts-cell-label">Status undangan</span>
              <Status value={item.status}>{invitationLabels[item.status]}</Status>
              {item.failureCode && (
                <small className="accounts-failure">Proses belum selesai. Coba proses ulang.</small>
              )}
            </td>
            <td className="accounts-date">
              <span className="accounts-cell-label">Diperbarui</span>
              <time dateTime={item.updatedAt}>{date(item.updatedAt)}</time>
            </td>
            <td className="accounts-actions-cell">
              <div className="accounts-row-actions">
                {['RESERVED', 'FAILED', 'SENDING'].includes(item.status) && (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={busy}
                    onClick={() => onRetry(item)}
                    aria-label={`Proses ulang undangan ${item.displayName}`}
                  >
                    Proses ulang
                  </Button>
                )}
                {!['ACCEPTED', 'CANCELLED'].includes(item.status) ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => onCancel(item)}
                    aria-label={`Batalkan undangan ${item.displayName}`}
                  >
                    Batalkan
                  </Button>
                ) : (
                  <span className="accounts-muted">Selesai</span>
                )}
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
function RoleSelect({
  id,
  value,
  onChange,
  disabled,
}: {
  id: string;
  value: InviteAdminDto['adminRole'] | '';
  onChange: (value: InviteAdminDto['adminRole']) => void;
  disabled: boolean;
}) {
  return (
    <div className="accounts-field">
      <label htmlFor={id}>Peran akses</label>
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value as InviteAdminDto['adminRole'])}
        aria-describedby={`${id}-help`}
      >
        {!value && (
          <option value="" disabled>
            Belum ditetapkan
          </option>
        )}
        {roles.map((role) => (
          <option key={role} value={role}>
            {adminRoleLabel(role)}
          </option>
        ))}
      </select>
      <p id={`${id}-help`}>
        {value ? roleHelp[value] : 'Pilih peran sesuai tanggung jawab anggota tim.'}
      </p>
    </div>
  );
}
export function InviteForm({
  busy,
  onSubmit,
  onCancel,
}: {
  busy: boolean;
  onSubmit: (input: InviteAdminDto) => Promise<void>;
  onCancel: () => void;
}) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<InviteAdminDto['adminRole']>('OPERATIONS');
  return (
    <form
      className="accounts-form"
      onSubmit={(event) => {
        event.preventDefault();
        void onSubmit({ email, displayName: name, adminRole: role });
      }}
    >
      <fieldset disabled={busy}>
        <div className="accounts-field">
          <label htmlFor="invite-name">Nama lengkap</label>
          <input
            id="invite-name"
            autoComplete="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={120}
            required
          />
        </div>
        <div className="accounts-field">
          <label htmlFor="invite-email">Email Admin</label>
          <input
            id="invite-email"
            type="email"
            autoComplete="email"
            inputMode="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            maxLength={254}
            placeholder="nama@organisasi.sch.id"
            required
          />
        </div>
        <RoleSelect id="invite-role" value={role} onChange={setRole} disabled={busy} />
      </fieldset>
      <div className="accounts-form-note">
        <Icon name="mail" />
        <p>
          Penerima menetapkan password sendiri melalui email. Kamu tidak perlu membuat atau
          membagikan password.
        </p>
      </div>
      <div className="accounts-dialog-actions">
        <Button type="button" variant="secondary" disabled={busy} onClick={onCancel}>
          Batal
        </Button>
        <Button type="submit" loading={busy}>
          Kirim undangan
        </Button>
      </div>
    </form>
  );
}
export function AccountEditForm({
  account,
  busy,
  onSave,
  onCancel,
}: {
  account: AdminAccountDto;
  busy: boolean;
  onSave: (input: UpdateAdminAccountDto) => Promise<void>;
  onCancel: () => void;
}) {
  const [role, setRole] = useState<InviteAdminDto['adminRole'] | ''>(account.adminRole ?? '');
  const [status, setStatus] = useState(account.status);
  const changed = role !== (account.adminRole ?? '') || status !== account.status;
  return (
    <form
      className="accounts-form"
      onSubmit={(event) => {
        event.preventDefault();
        const input: UpdateAdminAccountDto = {};
        if (role && role !== account.adminRole) input.adminRole = role;
        if (status !== account.status) input.status = status;
        if (changed) void onSave(input);
      }}
    >
      <AccountIdentity name={account.displayName} email={account.email} />
      <fieldset disabled={busy}>
        <RoleSelect id="account-role" value={role} onChange={setRole} disabled={busy} />
        <div className="accounts-field">
          <label htmlFor="account-status">Status akun</label>
          <select
            id="account-status"
            value={status}
            onChange={(event) => setStatus(event.target.value as AdminAccountDto['status'])}
            aria-describedby="account-status-help"
          >
            <option value="ACTIVE">Aktif</option>
            <option value="DISABLED">Nonaktif</option>
          </select>
          <p id="account-status-help">
            Akun nonaktif tidak dapat menggunakan fitur Admin. Riwayat akun tetap disimpan.
          </p>
        </div>
      </fieldset>
      {changed && (
        <div className="accounts-form-note">
          <Icon name="info" />
          <p>Perubahan akses berlaku setelah disimpan. Pastikan peran dan status sudah sesuai.</p>
        </div>
      )}
      <div className="accounts-dialog-actions">
        <Button type="button" variant="secondary" disabled={busy} onClick={onCancel}>
          Batal
        </Button>
        <Button type="submit" disabled={!changed || busy} loading={busy}>
          Simpan perubahan
        </Button>
      </div>
    </form>
  );
}
