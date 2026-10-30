'use client';
import { useEffect, useState } from 'react';
import { Button, Dialog, Icon } from '@tka/ui';
import { getAdminSchool, listAdminSchools } from '@/lib/api';
import { getAdminUser, listAdminUsers } from './operations-api';
import { AdminLoading, AdminMessage } from './admin-presentation';
import { PeopleFooter, PeopleEmpty } from './operations-panels';

export function OperationsPicker({
  kind,
  value,
  onChange,
  token,
  onAccessError,
  schoolId = '',
}: {
  kind: 'school' | 'teacher';
  value: string;
  onChange: (id: string) => void;
  token: string;
  onAccessError: (cause: unknown) => void;
  schoolId?: string;
}) {
  const [open, setOpen] = useState(false),
    [search, setSearch] = useState(''),
    [filter, setFilter] = useState(''),
    [offset, setOffset] = useState(0),
    [revision, setRevision] = useState(0);
  const [selected, setSelected] = useState({ id: '', name: '' });
  const [labelError, setLabelError] = useState(false);
  const [labelRetry, setLabelRetry] = useState(0);
  const [data, setData] = useState<{
      items: { id: string; name: string }[];
      nextOffset: number | null;
    } | null>(null),
    [error, setError] = useState('');
  const noun = kind === 'school' ? 'sekolah' : 'Guru';
  useEffect(() => {
    if (!value || selected.id === value) {
      setLabelError(false);
      return;
    }
    let active = true;
    setLabelError(false);
    const pending =
      kind === 'school'
        ? getAdminSchool(token, value).then((item) => item.name)
        : getAdminUser(token, value).then((item) => item.displayName);
    void pending.then(
      (name) => {
        if (active) setSelected({ id: value, name });
      },
      (cause) => {
        if (active) {
          setLabelError(true);
          onAccessError(cause);
        }
      },
    );
    return () => {
      active = false;
    };
  }, [kind, value, token, onAccessError, selected.id, labelRetry]);
  useEffect(() => {
    if (!open) return;
    let active = true;
    setData(null);
    setError('');
    const pending =
      kind === 'school'
        ? listAdminSchools(token, { offset, search: filter }).then((page) => ({
            items: page.items.map((item) => ({ id: item.id, name: item.name })),
            nextOffset: page.nextOffset,
          }))
        : listAdminUsers(token, { offset, search: filter, role: 'TEACHER', schoolId }).then(
            (page) => ({
              items: page.items.map((item) => ({ id: item.id, name: item.displayName })),
              nextOffset: page.nextOffset,
            }),
          );
    void pending.then(
      (page) => {
        if (active) setData(page);
      },
      (cause) => {
        if (active) {
          setError(cause instanceof Error ? cause.message : 'Pilihan belum dapat dimuat.');
          onAccessError(cause);
        }
      },
    );
    return () => {
      active = false;
    };
  }, [open, kind, offset, filter, revision, token, onAccessError, schoolId]);
  return (
    <div className="people-field">
      <span>{kind === 'school' ? 'Sekolah' : 'Guru'}</span>
      <Button
        variant="secondary"
        className="people-picker-trigger"
        aria-label={`Pilih ${noun}`}
        aria-haspopup="dialog"
        onClick={() => {
          setData(null);
          setError('');
          setOpen(true);
          setSearch('');
          setFilter('');
          setOffset(0);
        }}
        type="button"
      >
        <span>
          {value
            ? selected.id === value && selected.name
              ? selected.name
              : `${kind === 'school' ? 'Sekolah' : 'Guru'} dipilih`
            : `Semua ${noun}`}
        </span>
        <Icon name="search" width="16" height="16" />
      </Button>
      {labelError && (
        <div className="people-picker-label-error">
          <span>Nama pilihan belum dapat dimuat.</span>
          <Button
            type="button"
            variant="ghost"
            aria-label={`Muat ulang nama ${noun}`}
            onClick={() => setLabelRetry((v) => v + 1)}
          >
            Coba lagi
          </Button>
        </div>
      )}
      {open && (
        <Dialog
          open
          onClose={() => setOpen(false)}
          title={`Pilih ${noun}`}
          className="admin-management-dialog people-dialog"
        >
          <p className="people-picker-help">
            Cari berdasarkan nama, lalu pilih untuk mengisi filter.
          </p>
          <form
            className="people-picker-search"
            onSubmit={(event) => {
              event.preventDefault();
              setFilter(search.trim());
              setOffset(0);
            }}
          >
            <label className="sr-only" htmlFor={`pick-${kind}`}>
              Cari {noun}
            </label>
            <input
              id={`pick-${kind}`}
              type="search"
              value={search}
              maxLength={100}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={`Nama ${noun}`}
            />
            <Button type="submit" variant="secondary">
              Cari
            </Button>
          </form>
          <Button
            variant="ghost"
            onClick={() => {
              onChange('');
              setOpen(false);
            }}
          >
            Semua {noun}
          </Button>
          {error ? (
            <AdminMessage error message={error} retry={() => setRevision((v) => v + 1)} />
          ) : !data ? (
            <AdminLoading message={`Memuat pilihan ${noun}...`} />
          ) : !data.items.length ? (
            <PeopleEmpty
              title="Tidak ada hasil"
              description="Coba nama lain atau hapus pencarian."
            />
          ) : (
            <ul className="people-picker-list">
              {data.items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelected(item);
                      onChange(item.id);
                      setOpen(false);
                    }}
                  >
                    <span>{item.name}</span>
                    <Icon name="chevron" width="16" height="16" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {data && (
            <PeopleFooter
              offset={offset}
              count={data.items.length}
              nextOffset={data.nextOffset}
              onChange={setOffset}
              label={`Halaman pilihan ${noun}`}
            />
          )}
        </Dialog>
      )}
    </div>
  );
}
