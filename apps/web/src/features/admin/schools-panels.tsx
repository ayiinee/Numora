'use client';

import Link from 'next/link';
import { Button, Icon } from '@tka/ui';
import type { AdminSchool, TeacherTokenSummary } from '@/lib/api';

export const tokenStatusLabels = {
  AVAILABLE: 'Belum dipakai',
  USED: 'Terpakai',
  REVOKED: 'Dicabut',
  EXPIRED: 'Kedaluwarsa',
} satisfies Record<TeacherTokenSummary['status'], string>;
export const schoolTime = (value: string) =>
  new Date(value).toLocaleString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Jakarta',
  });

export function SchoolStatus({ status }: { status: AdminSchool['status'] }) {
  return (
    <span className={`schools-status schools-status-${status.toLowerCase()}`}>
      <i aria-hidden="true" />
      {status === 'ACTIVE' ? 'Aktif' : 'Nonaktif'}
    </span>
  );
}
export function SchoolDirectory({
  schools,
  busy,
  onSelect,
}: {
  schools: AdminSchool[];
  busy: boolean;
  onSelect: (school: AdminSchool) => void;
}) {
  return (
    <table className="schools-table schools-directory-table" role="table">
      <caption className="sr-only">Daftar sekolah, alamat dan status</caption>
      <thead>
        <tr>
          <th scope="col">Sekolah</th>
          <th scope="col">Alamat</th>
          <th scope="col">Status</th>
          <th scope="col">Tindakan</th>
        </tr>
      </thead>
      <tbody>
        {schools.slice(0, 5).map((school) => (
          <tr key={school.id}>
            <td>
              <div className="schools-identity">
                <span className="schools-avatar">
                  <Icon name="school" />
                </span>
                <div>
                  <strong>{school.name}</strong>
                  <span>{school.code}</span>
                </div>
              </div>
            </td>
            <td>
              <span className="schools-cell-label">Alamat</span>
              <span className="schools-muted">{school.address || 'Belum dicatat'}</span>
            </td>
            <td>
              <span className="schools-cell-label">Status</span>
              <SchoolStatus status={school.status} />
            </td>
            <td className="schools-actions">
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => onSelect(school)}
                aria-label={`Kelola ${school.name}`}
              >
                Kelola
                <Icon name="chevron" width="16" height="16" />
              </Button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
export function SchoolFields({
  mode,
  code,
  name,
  address,
  onCode,
  onName,
  onAddress,
  busy,
}: {
  mode: 'create' | 'edit';
  code: string;
  name: string;
  address: string;
  onCode: (value: string) => void;
  onName: (value: string) => void;
  onAddress: (value: string) => void;
  busy: boolean;
}) {
  return (
    <fieldset disabled={busy} className="schools-form-fields">
      {mode === 'create' && (
        <div className="schools-field">
          <label htmlFor="school-code">Kode sekolah</label>
          <input
            id="school-code"
            value={code}
            onChange={(event) => onCode(event.target.value)}
            minLength={2}
            maxLength={32}
            pattern="[a-zA-Z0-9]+(-[a-zA-Z0-9]+)*"
            required
            aria-describedby="school-code-help"
            autoComplete="off"
          />
          <p id="school-code-help">
            Gunakan huruf, angka, atau tanda hubung. Kode tersimpan dalam huruf kapital.
          </p>
        </div>
      )}
      <div className="schools-field">
        <label htmlFor="school-name">{mode === 'create' ? 'Nama sekolah' : 'Ubah nama'}</label>
        <input
          id="school-name"
          value={name}
          onChange={(event) => onName(event.target.value)}
          maxLength={120}
          required
        />
      </div>
      <div className="schools-field">
        <label htmlFor="school-address">
          {mode === 'create' ? 'Alamat sekolah' : 'Ubah alamat'} <span>(opsional)</span>
        </label>
        <textarea
          id="school-address"
          value={address}
          onChange={(event) => onAddress(event.target.value)}
          maxLength={500}
          rows={3}
        />
      </div>
    </fieldset>
  );
}
export function SchoolTokens({
  tokens,
  active,
  busy,
  onAction,
  onDetail,
}: {
  tokens: TeacherTokenSummary[];
  active: boolean;
  busy: boolean;
  onAction: (kind: 'reissue' | 'revoke', token: TeacherTokenSummary) => void;
  onDetail: (token: TeacherTokenSummary) => void;
}) {
  return (
    <table className="schools-table schools-token-table" role="table">
      <caption className="sr-only">Riwayat token verifikasi Guru</caption>
      <thead>
        <tr>
          <th scope="col">Diterbitkan</th>
          <th scope="col">Status token</th>
          <th scope="col">Berlaku hingga</th>
          <th scope="col">Pemakai</th>
          <th scope="col">Tindakan</th>
        </tr>
      </thead>
      <tbody>
        {tokens.slice(0, 5).map((item) => (
          <tr key={item.id}>
            <td>
              <span className="schools-cell-label">Diterbitkan</span>
              <time dateTime={item.createdAt}>{schoolTime(item.createdAt)}</time>
              <Button
                variant="ghost"
                size="sm"
                className="schools-token-reference"
                onClick={() => onDetail(item)}
                disabled={busy}
                aria-label={`Detail token ${item.id}`}
              >
                Detail token <Icon name="chevron" width="14" height="14" />
              </Button>
            </td>
            <td>
              <span className="schools-cell-label">Status token</span>
              <span className={`schools-status schools-status-${item.status.toLowerCase()}`}>
                <i aria-hidden="true" />
                {tokenStatusLabels[item.status]}
              </span>
            </td>
            <td>
              <span className="schools-cell-label">Berlaku hingga (WIB)</span>
              <time dateTime={item.expiresAt}>{schoolTime(item.expiresAt)}</time>
            </td>
            <td>
              <span className="schools-cell-label">Pemakai</span>
              {item.usedByUserId ? (
                <Link
                  className="schools-text-link"
                  href={`/admin/operations?userId=${item.usedByUserId}`}
                >
                  {item.usedByName ?? 'Lihat Guru'}
                </Link>
              ) : (
                <span className="schools-muted">
                  {item.status === 'USED' ? 'Guru tidak tersedia' : 'Belum dipakai'}
                </span>
              )}
            </td>
            <td className="schools-actions">
              {!item.usedAt && !item.revokedAt && !['USED', 'REVOKED'].includes(item.status) ? (
                <div className="schools-row-actions">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={busy || !active}
                    onClick={() => onAction('reissue', item)}
                  >
                    Terbit ulang
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="schools-revoke"
                    disabled={busy}
                    onClick={() => onAction('revoke', item)}
                  >
                    Cabut
                  </Button>
                </div>
              ) : (
                <span className="schools-muted">Tidak ada tindakan</span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
export function TokenDetail({ token }: { token: TeacherTokenSummary }) {
  return (
    <dl className="schools-token-metadata">
      <div>
        <dt>ID riwayat</dt>
        <dd>
          <code>{token.id}</code>
        </dd>
      </div>
      <div>
        <dt>Status</dt>
        <dd>{tokenStatusLabels[token.status]}</dd>
      </div>
      <div>
        <dt>Diterbitkan</dt>
        <dd>{schoolTime(token.createdAt)} WIB</dd>
      </div>
      <div>
        <dt>Berlaku hingga</dt>
        <dd>{schoolTime(token.expiresAt)} WIB</dd>
      </div>
      {token.usedAt && (
        <div>
          <dt>Digunakan</dt>
          <dd>
            {schoolTime(token.usedAt)} WIB oleh{' '}
            {token.usedByName ?? token.usedByUserId ?? 'Guru tidak tersedia'}
          </dd>
        </div>
      )}
      {token.revokedAt && (
        <div>
          <dt>Dicabut</dt>
          <dd>{schoolTime(token.revokedAt)} WIB</dd>
        </div>
      )}
    </dl>
  );
}
