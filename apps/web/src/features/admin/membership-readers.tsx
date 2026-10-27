'use client';
import { useEffect, useState } from 'react';
import { Button } from '@tka/ui';
import { PeopleFooter, PeopleStatus, peopleDate } from './operations-panels';
import { AdminLoading, AdminMessage } from './admin-presentation';
import { getAdminMemberships, getAdminRoster } from './operations-api';
import type { AdminMembershipsDto, AdminRosterDto } from './generated-types';
export function OperationsMemberships({
  token,
  userId,
  onAccessError,
}: {
  token: string;
  userId: string;
  onAccessError: (error: unknown) => void;
}) {
  const [data, setData] = useState<AdminMembershipsDto | null>(null),
    [error, setError] = useState(''),
    [offset, setOffset] = useState(0),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setData(null);
    setError('');
    void getAdminMemberships(token, userId, offset)
      .then((value) => {
        if (active) setData(value);
      })
      .catch((error) => {
        if (active) {
          setError(error instanceof Error ? error.message : 'Membership belum dapat dimuat.');
          onAccessError(error);
        }
      });
    return () => {
      active = false;
    };
  }, [token, userId, offset, revision, onAccessError]);
  return (
    <section
      className="people-history people-surface"
      aria-label="Keanggotaan dan verifikasi sekolah"
    >
      <div className="people-section-heading">
        <h3>Keanggotaan & verifikasi sekolah</h3>
        <p>Riwayat sekolah dan kelas yang terhubung dengan akun ini.</p>
      </div>
      {error ? (
        <AdminMessage error message={error} retry={() => setRevision((v) => v + 1)} />
      ) : !data ? (
        <AdminLoading message="Memuat keanggotaan..." />
      ) : (
        <>
          {!data.items.length ? (
            <p className="people-empty-inline">Belum ada membership atau verifikasi sekolah.</p>
          ) : (
            <table className="people-table people-membership-table" role="table">
              <caption className="sr-only">Riwayat keanggotaan dan verifikasi sekolah</caption>
              <thead>
                <tr>
                  <th scope="col">Sekolah & kelas</th>
                  <th scope="col">Status keanggotaan</th>
                  <th scope="col">Mulai (WIB)</th>
                  <th scope="col">Berakhir (WIB)</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item) => (
                  <tr key={item.id}>
                    <td className="people-person">
                      <strong className="people-record-name">{item.schoolName}</strong>
                      <span className="people-record-secondary">
                        {item.className ?? 'Verifikasi sekolah'}
                      </span>
                    </td>
                    <td>
                      <span className="people-cell-label">Status keanggotaan</span>
                      <PeopleStatus active={item.active}>
                        {item.active ? 'Aktif' : 'Tidak aktif'}
                      </PeopleStatus>
                    </td>
                    <td>
                      <span className="people-cell-label">Mulai (WIB)</span>
                      {peopleDate(item.startedAt)}
                    </td>
                    <td>
                      <span className="people-cell-label">Berakhir (WIB)</span>
                      {item.endedAt ? peopleDate(item.endedAt) : 'Belum berakhir'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <PeopleFooter
            offset={offset}
            count={data.items.length}
            nextOffset={data.nextOffset}
            onChange={setOffset}
            label="Halaman keanggotaan"
          />
        </>
      )}
    </section>
  );
}

export function OperationsRoster({
  token,
  classId,
  onAccessError,
}: {
  token: string;
  classId: string;
  onAccessError: (error: unknown) => void;
}) {
  const [data, setData] = useState<AdminRosterDto | null>(null),
    [error, setError] = useState(''),
    [offset, setOffset] = useState(0),
    [state, setState] = useState('active'),
    [search, setSearch] = useState(''),
    [filter, setFilter] = useState(''),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setData(null);
    setError('');
    void getAdminRoster(token, classId, { offset, state, search: filter })
      .then((value) => {
        if (active) setData(value);
      })
      .catch((error) => {
        if (active) {
          setError(error instanceof Error ? error.message : 'Roster belum dapat dimuat.');
          onAccessError(error);
        }
      });
    return () => {
      active = false;
    };
  }, [token, classId, offset, state, filter, revision, onAccessError]);
  return (
    <section className="people-history people-surface" aria-label="Anggota kelas">
      <div className="people-section-heading">
        <h3>Anggota kelas</h3>
        <p>Telusuri anggota aktif dan riwayat keanggotaan kelas.</p>
      </div>
      <div className="people-roster-toolbar">
        <label className="people-field" htmlFor="roster-state">
          <span>Status keanggotaan</span>
          <select
            id="roster-state"
            value={state}
            onChange={(event) => {
              setState(event.target.value);
              setOffset(0);
            }}
          >
            <option value="active">Anggota aktif</option>
            <option value="former">Mantan anggota</option>
            <option value="">Semua keanggotaan</option>
          </select>
        </label>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setFilter(search.trim());
            setOffset(0);
          }}
          className="people-roster-search"
        >
          <label className="people-field" htmlFor="roster-search">
            <span>Cari anggota</span>
            <input
              id="roster-search"
              type="search"
              maxLength={100}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <Button type="submit" variant="secondary">
            Cari anggota
          </Button>
        </form>
      </div>
      {error ? (
        <AdminMessage error message={error} retry={() => setRevision((v) => v + 1)} />
      ) : !data ? (
        <AdminLoading message="Memuat anggota kelas..." />
      ) : (
        <>
          {!data.items.length ? (
            <p className="people-empty-inline">Belum ada anggota sesuai filter.</p>
          ) : (
            <table className="people-table people-roster-table" role="table">
              <caption className="sr-only">Anggota dan riwayat keanggotaan kelas</caption>
              <thead>
                <tr>
                  <th scope="col">Nama anggota</th>
                  <th scope="col">Status akun</th>
                  <th scope="col">Bergabung (WIB)</th>
                  <th scope="col">Keluar (WIB)</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item) => (
                  <tr key={item.membershipId}>
                    <td className="people-person">
                      <strong className="people-record-name">{item.displayName}</strong>
                    </td>
                    <td>
                      <span className="people-cell-label">Status akun</span>
                      <PeopleStatus active={item.status === 'ACTIVE'}>
                        {item.status === 'ACTIVE' ? 'Aktif' : 'Dinonaktifkan'}
                      </PeopleStatus>
                    </td>
                    <td>
                      <span className="people-cell-label">Bergabung (WIB)</span>
                      {peopleDate(item.joinedAt)}
                    </td>
                    <td>
                      <span className="people-cell-label">Keluar (WIB)</span>
                      {item.leftAt ? peopleDate(item.leftAt) : 'Masih menjadi anggota'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <PeopleFooter
            offset={offset}
            count={data.items.length}
            nextOffset={data.nextOffset}
            onChange={setOffset}
            label="Halaman anggota kelas"
          />
        </>
      )}
    </section>
  );
}
