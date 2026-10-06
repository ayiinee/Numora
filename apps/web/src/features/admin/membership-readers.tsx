'use client';
import { useEffect, useState } from 'react';
import { Button, Card } from '@tka/ui';
import { AdminLoading, AdminMessage } from './admin-presentation';
import { getAdminMemberships, getAdminRoster } from './operations-api';
import type { AdminMembershipsDto, AdminRosterDto } from './generated-types';
function Pager({
  offset,
  nextOffset,
  setOffset,
}: {
  offset: number;
  nextOffset: number | null;
  setOffset: (offset: number) => void;
}) {
  return (
    <div className="admin-content-actions">
      <Button
        variant="secondary"
        disabled={!offset}
        onClick={() => setOffset(Math.max(0, offset - 20))}
      >
        Sebelumnya
      </Button>
      <Button
        variant="secondary"
        disabled={nextOffset === null}
        onClick={() => setOffset(nextOffset!)}
      >
        Berikutnya
      </Button>
    </div>
  );
}
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
    <section>
      <h4>Membership dan verifikasi sekolah</h4>
      {error ? (
        <AdminMessage error message={error} retry={() => setRevision((value) => value + 1)} />
      ) : !data ? (
        <AdminLoading message="Memuat membership…" />
      ) : (
        <>
          {!data.items.length && <p>Belum ada membership atau verifikasi sekolah.</p>}
          <ul className="monitoring-list">
            {data.items.map((item) => (
              <li key={item.id}>
                <strong>
                  {item.schoolName}
                  {item.className ? ` · ${item.className}` : ''}
                </strong>
                <p>
                  {item.active ? 'Aktif' : 'Tidak aktif'} · Mulai{' '}
                  {new Date(item.startedAt).toLocaleString('id-ID')}
                  {item.endedAt
                    ? ` · Berakhir ${new Date(item.endedAt).toLocaleString('id-ID')}`
                    : ''}
                </p>
              </li>
            ))}
          </ul>
          <Pager offset={offset} nextOffset={data.nextOffset} setOffset={setOffset} />
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
    <Card>
      <h4>Roster kelas</h4>
      <label htmlFor="roster-state">Status membership</label>
      <select
        id="roster-state"
        className="text-input"
        value={state}
        onChange={(e) => {
          setState(e.target.value);
          setOffset(0);
        }}
      >
        <option value="active">Anggota aktif</option>
        <option value="former">Mantan anggota</option>
        <option value="">Semua membership</option>
      </select>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setFilter(search);
          setOffset(0);
        }}
      >
        <label htmlFor="roster-search">Cari anggota</label>
        <input
          id="roster-search"
          className="text-input"
          maxLength={100}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Button type="submit" variant="secondary">
          Cari anggota
        </Button>
      </form>
      {error ? (
        <AdminMessage error message={error} retry={() => setRevision((value) => value + 1)} />
      ) : !data ? (
        <AdminLoading message="Memuat roster…" />
      ) : (
        <>
          {!data.items.length && <p>Belum ada anggota sesuai filter.</p>}
          <ul className="monitoring-list">
            {data.items.map((item) => (
              <li key={item.membershipId}>
                <strong>{item.displayName}</strong>
                <p>
                  Akun {item.status} · Bergabung {new Date(item.joinedAt).toLocaleString('id-ID')}
                  {item.leftAt ? ` · Keluar ${new Date(item.leftAt).toLocaleString('id-ID')}` : ''}
                </p>
              </li>
            ))}
          </ul>
          <Pager offset={offset} nextOffset={data.nextOffset} setOffset={setOffset} />
        </>
      )}
    </Card>
  );
}
