'use client';
import { Button, Icon } from '@tka/ui';
import type { ReactNode } from 'react';
import type { AdminUserDto, AdminUserDetailDto, AdminClassDto } from './generated-types';
import { AdminPagination } from './admin-pagination';

export const peopleRoles = { STUDENT: 'Siswa', TEACHER: 'Guru', ADMIN: 'Admin' };
export function peopleDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Tidak tersedia'
    : date.toLocaleString('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Asia/Jakarta',
      });
}
export function PeopleStatus({ active, children }: { active: boolean; children: ReactNode }) {
  return (
    <span className={`people-status${active ? ' people-status-active' : ''}`}>
      <i aria-hidden="true" />
      {children}
    </span>
  );
}
export function UserTable({
  items,
  onSelect,
}: {
  items: AdminUserDto[];
  onSelect: (id: string) => void;
}) {
  return (
    <table className="people-table people-users-table" role="table">
      <caption className="sr-only">Akun pengguna beserta peran dan status</caption>
      <thead>
        <tr>
          <th scope="col">Pengguna</th>
          <th scope="col">Peran</th>
          <th scope="col">Status akun</th>
          <th scope="col">Terdaftar (WIB)</th>
          <th scope="col">Tindakan</th>
        </tr>
      </thead>
      <tbody>
        {items.map((user) => (
          <tr key={user.id}>
            <td className="people-person">
              <div className="people-identity">
                <span aria-hidden="true">
                  {user.displayName
                    .split(/\s+/)
                    .slice(0, 2)
                    .map((word) => word[0])
                    .join('')
                    .toUpperCase()}
                </span>
                <strong>{user.displayName}</strong>
              </div>
            </td>
            <td>
              <span className="people-cell-label">Peran</span>
              {peopleRoles[user.role]}
            </td>
            <td>
              <span className="people-cell-label">Status akun</span>
              <PeopleStatus active={user.status === 'ACTIVE'}>
                {user.status === 'ACTIVE' ? 'Aktif' : 'Dinonaktifkan'}
              </PeopleStatus>
            </td>
            <td className="people-muted">
              <span className="people-cell-label">Terdaftar (WIB)</span>
              <time dateTime={user.createdAt}>{peopleDate(user.createdAt)}</time>
            </td>
            <td className="people-row-action">
              <Button variant="secondary" onClick={() => onSelect(user.id)}>
                Lihat detail
                <Icon name="chevron" width="14" height="14" />
              </Button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
export function ClassTable({
  items,
  onSelect,
}: {
  items: AdminClassDto[];
  onSelect: (id: string) => void;
}) {
  return (
    <table className="people-table people-classes-table" role="table">
      <caption className="sr-only">Kelas, sekolah, Guru dan siswa aktif</caption>
      <thead>
        <tr>
          <th scope="col">Kelas & sekolah</th>
          <th scope="col">Guru</th>
          <th scope="col">Siswa aktif</th>
          <th scope="col">Status kelas</th>
          <th scope="col">Tindakan</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => (
          <tr key={item.id}>
            <td className="people-person">
              <strong className="people-record-name">{item.name}</strong>
              <span className="people-record-secondary">{item.schoolName}</span>
            </td>
            <td>
              <span className="people-cell-label">Guru</span>
              <span>{item.teacherName ?? 'Belum ada Guru'}</span>
              <small
                className={`people-teacher-state${!item.teacherActive ? ' people-teacher-missing' : ''}`}
              >
                {item.teacherActive ? 'Guru aktif' : 'Tanpa Guru aktif'}
              </small>
            </td>
            <td>
              <span className="people-cell-label">Siswa aktif</span>
              {item.studentCount}
            </td>
            <td>
              <span className="people-cell-label">Status kelas</span>
              <PeopleStatus active={!item.archivedAt}>
                {item.archivedAt ? 'Diarsipkan' : 'Aktif'}
              </PeopleStatus>
            </td>
            <td className="people-row-action">
              <Button variant="secondary" onClick={() => onSelect(item.id)}>
                Lihat detail
                <Icon name="chevron" width="14" height="14" />
              </Button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
export function UserSummary({ user }: { user: AdminUserDetailDto }) {
  return (
    <section className="people-summary people-surface">
      <div className="people-detail-heading">
        <div>
          <h2>{user.displayName}</h2>
          <p>{user.email}</p>
        </div>
        <PeopleStatus active={user.status === 'ACTIVE'}>
          {user.status === 'ACTIVE' ? 'Aktif' : 'Dinonaktifkan'}
        </PeopleStatus>
      </div>
      <dl className="people-metadata">
        <Field label="Peran">{peopleRoles[user.role]}</Field>
        <Field label="Akun dibuat (WIB)">{peopleDate(user.createdAt)}</Field>
        {user.affiliation && (
          <Field label="Afiliasi siswa">
            {user.affiliation === 'SCHOOL' ? 'Sekolah' : 'Mandiri'}
          </Field>
        )}
        {user.teacherVerified !== null && (
          <Field label="Verifikasi Guru">
            {user.teacherVerified
              ? 'Aktif dan terverifikasi'
              : 'Tidak aktif atau belum terverifikasi'}
          </Field>
        )}
      </dl>
      <details className="people-identifiers">
        <summary>Identitas data</summary>
        <dl>
          <Field label="ID pengguna">
            <code>{user.id}</code>
          </Field>
        </dl>
      </details>
    </section>
  );
}
export function ClassSummary({ item }: { item: AdminClassDto }) {
  return (
    <section className="people-summary people-surface">
      <div className="people-detail-heading">
        <div>
          <h2>{item.name}</h2>
          <p>{item.schoolName}</p>
        </div>
        <PeopleStatus active={!item.archivedAt}>
          {item.archivedAt ? 'Diarsipkan' : 'Aktif'}
        </PeopleStatus>
      </div>
      <dl className="people-metadata">
        <Field label="Guru tercatat">{item.teacherName ?? 'Tidak ada Guru tercatat'}</Field>
        <Field label="Ketersediaan Guru">
          {item.teacherActive ? 'Aktif dan terverifikasi' : 'Tanpa Guru aktif'}
        </Field>
        <Field label="Siswa aktif">{item.studentCount}</Field>
        <Field label="Kelas dibuat (WIB)">{peopleDate(item.createdAt)}</Field>
        {item.archivedAt && <Field label="Diarsipkan (WIB)">{peopleDate(item.archivedAt)}</Field>}
      </dl>
      <details className="people-identifiers">
        <summary>Identitas data</summary>
        <dl>
          <Field label="ID kelas">
            <code>{item.id}</code>
          </Field>
          <Field label="ID sekolah">
            <code>{item.schoolId}</code>
          </Field>
          <Field label="ID Guru">
            <code>{item.teacherId ?? 'Belum ada Guru'}</code>
          </Field>
        </dl>
      </details>
    </section>
  );
}
export function PeopleFooter({
  offset,
  count,
  nextOffset,
  totalItems,
  onChange,
  label,
}: {
  offset: number;
  count: number;
  nextOffset: number | null;
  totalItems?: number | undefined;
  onChange: (offset: number) => void;
  label: string;
}) {
  return (
    <footer className="people-directory-footer">
      <p>
        {count ? `Menampilkan ${offset + 1}–${offset + count}` : '0 ditampilkan'}
        <span>Maksimal 5 per halaman</span>
      </p>
      <AdminPagination
        label={label}
        offset={offset}
        hasNext={nextOffset !== null}
        totalItems={totalItems}
        onChange={(next) => onChange(next < offset ? next : nextOffset!)}
      />
    </footer>
  );
}
export function PeopleEmpty({
  title,
  description,
  reset,
}: {
  title: string;
  description: string;
  reset?: () => void;
}) {
  return (
    <div className="people-empty">
      <span>
        <Icon name="search" />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      {reset && (
        <Button variant="secondary" onClick={reset}>
          Reset filter
        </Button>
      )}
    </div>
  );
}
