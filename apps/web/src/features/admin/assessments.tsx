'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Badge, Button, Card, Icon } from '@tka/ui';
import { useAuth } from '@/features/onboarding/auth';
import { apiRequest } from '@/lib/api';
import { AdminFrame, AdminMessage } from './admin-presentation';
import { withAdminWorkspace, useAdminAccessError } from './admin-workspace';
import { ContentPackageWorkspace } from './content-package-workspace';
import { listContentPackages, restoreContentPackage } from './content-package-api';
import { useAdminUrl, adminOffset } from './admin-url';
import { AdminPagination } from './admin-pagination';
import { ADMIN_PAGE_SIZE } from './pagination';
import {
  assessmentLabels,
  assessmentListQuery,
  assessmentPath,
  type AssessmentUsage,
} from './assessment-routes';
import { getTryoutVariantOptions } from './tryout-variant-api';
import type { AdminCurriculumDto, ContentPackagesDto } from './generated-types';

type Props = {
  usage: AssessmentUsage;
  mode?: 'list' | 'create' | 'detail';
  packageId?: string;
  archived?: boolean;
};
const formatAdminDate = (value: unknown) =>
  new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(typeof value === 'string' ? value : ''));

export const AdminAssessmentsScreen = withAdminWorkspace(Assessments, 'content');
function Assessments({ usage, mode = 'list', packageId, archived = false }: Props) {
  const { state } = useAuth();
  const url = useAdminUrl();
  if (state.status !== 'ready') return null;
  const fromArchive = usage === 'TRYOUT' && url.params.get('status') === 'ARCHIVED';
  const back =
    fromArchive || archived
      ? assessmentPath(usage, 'archived')
      : assessmentPath(usage) + assessmentListQuery(url.params);
  return (
    <AdminFrame
      title={`${mode === 'create' ? 'Tambah paket ' : archived ? 'Arsip bank paket ' : usage === 'TRYOUT' ? 'Bank paket ' : ''}${assessmentLabels[usage]}`}
      description=""
      icon="target"
      management
      minimalHeader
      fullWidth={usage !== 'DRILL'}
    >
      {mode === 'list' ? (
        <AssessmentTable
          key={`${state.profile.id}:${usage}`}
          token={state.session.access_token}
          usage={usage}
          archived={archived}
        />
      ) : (
        <>
          {!(usage === 'TRYOUT' && mode === 'detail') && (
            <Link className="assessment-back-link" href={back}>
              {mode === 'create' ? 'Batal' : '← Kembali ke daftar'}
            </Link>
          )}
          <ContentPackageWorkspace
            key={`${state.profile.id}:${usage}:${packageId ?? 'new'}`}
            token={state.session.access_token}
            disabled={false}
            onSelect={() => undefined}
            refreshKey={0}
            initialUsage={usage}
            mode={mode}
            {...(usage === 'TRYOUT' && mode === 'detail' ? { backHref: back } : {})}
            {...(packageId ? { packageId } : {})}
          />
        </>
      )}
    </AdminFrame>
  );
}

function AssessmentTable({
  token,
  usage,
  archived = false,
}: {
  token: string;
  usage: AssessmentUsage;
  archived?: boolean;
}) {
  const url = useAdminUrl();
  const reportAccessError = useAdminAccessError();
  const [data, setData] = useState<ContentPackagesDto | null>(null);
  const [curriculum, setCurriculum] = useState<AdminCurriculumDto['items']>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [variantAvailability, setVariantAvailability] = useState<Record<string, boolean>>({});
  const search = url.params.get('search') ?? '';
  const rawStatus = url.params.get('status') ?? '';
  const status =
    usage === 'TRYOUT' && !archived && !['', 'DRAFT', 'PUBLISHED'].includes(rawStatus)
      ? ''
      : rawStatus;
  const chapter = url.params.get('chapter') ?? '';
  const source = url.params.get('source') ?? '';
  const offset = adminOffset(url.params.get('offset'));
  const effectiveStatus = archived
    ? 'ARCHIVED'
    : usage === 'TRYOUT'
      ? ['DRAFT', 'PUBLISHED'].includes(status)
        ? status
        : 'ACTIVE'
      : status;
  useEffect(() => {
    if (usage === 'TRYOUT') return;
    let active = true;
    apiRequest<AdminCurriculumDto>('admin/content/curriculum', token)
      .then((value) => {
        if (active) setCurriculum(value.items);
      })
      .catch((cause) => {
        if (active) {
          reportAccessError(cause);
          setError(cause instanceof Error ? cause.message : 'Filter bab gagal dimuat.');
        }
      });
    return () => {
      active = false;
    };
  }, [token, revision, reportAccessError]);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setData(null);
    setError('');
    const query = new URLSearchParams({
      usageType: usage,
      limit: String(ADMIN_PAGE_SIZE),
      offset: String(offset),
    });
    for (const [key, value] of Object.entries({
      search,
      status: effectiveStatus,
      chapterId: chapter,
      source,
    }))
      if (value) query.set(key, value);
    listContentPackages(token, query.toString())
      .then((value) => {
        if (active) setData(value);
      })
      .catch((cause) => {
        if (active) {
          reportAccessError(cause);
          setError(cause instanceof Error ? cause.message : 'Daftar paket gagal dimuat.');
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [token, usage, search, effectiveStatus, chapter, source, offset, revision, reportAccessError]);
  useEffect(() => {
    if (usage !== 'TRYOUT' || archived || !data) return;
    let active = true;
    const candidates = data.items.filter(
      (pack) => pack.status === 'PUBLISHED' && pack.source?.sourceNamespace !== 'TRYOUT_VARIANT_GENERATOR',
    );
    setVariantAvailability({});
    void Promise.all(
      candidates.map(async (pack) => {
        try {
          const value = await getTryoutVariantOptions(token, pack.id);
          return [pack.id, value.generatorAvailable] as const;
        } catch {
          return [pack.id, false] as const;
        }
      }),
    ).then((values) => {
      if (active) setVariantAvailability(Object.fromEntries(values));
    });
    return () => {
      active = false;
    };
  }, [data, token, usage, archived]);
  const context = assessmentListQuery(url.params);
  const statuses: Record<string, string> = {
    DRAFT: 'Draf',
    PUBLISHED: 'Diterbitkan',
    CLOSED: 'Ditutup',
    ARCHIVED: 'Arsip',
  };
  return (
    <Card
      className={
        usage !== 'DRILL'
          ? 'assessment-directory assessment-directory-compact'
          : 'assessment-directory'
      }
    >
      <div className="assessment-directory-toolbar">
        <form
          key={search}
          className="assessment-directory-search"
          onSubmit={(event) => {
            event.preventDefault();
            url.update({
              search: String(new FormData(event.currentTarget).get('search') ?? '').trim(),
              offset: null,
            });
          }}
        >
          <label className="sr-only" htmlFor="assessment-search">
            Cari nama atau kode paket
          </label>
          <div className="assessment-search-field">
            <Icon name="search" />
            <input
              type="search"
              id="assessment-search"
              name="search"
              placeholder="Cari nama atau kode paket"
              defaultValue={search}
              maxLength={160}
            />
          </div>
          <Button type="submit" variant="secondary">
            Cari
          </Button>
        </form>
        {usage === 'TRYOUT' && (
          <div className="assessment-inline-status-filter">
            <select
              id="tryout-status-filter"
              name="status"
              defaultValue={status}
              onChange={(event) => url.update({ status: event.target.value || null, offset: null })}
            >
              <option value="">Semua aktif</option>
              <option value="DRAFT">Draf</option>
              <option value="PUBLISHED">Diterbitkan</option>
            </select>
          </div>
        )}
        <Button
          variant="secondary"
          disabled={loading}
          onClick={() => setRevision((value) => value + 1)}
        >
          Muat ulang
        </Button>
        {!archived && (
          <Link className="button-link" href={assessmentPath(usage, 'new') + context}>
            Tambah paket
          </Link>
        )}
        {usage === 'TRYOUT' && !archived && (
          <Link className="button-link" href={assessmentPath(usage, 'archived')}>
            Bank arsip
          </Link>
        )}
        {usage === 'TRYOUT' && archived && (
          <Link className="button-link" href={assessmentPath(usage)}>
            Bank aktif
          </Link>
        )}
      </div>
      {usage === 'DRILL' && (
        <details
          className="assessment-directory-filters"
          open={Boolean(status || chapter || source)}
        >
          <summary>Filter</summary>
          <form
            key={`${status}:${chapter}:${source}`}
            className="admin-search-toolbar"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              url.update({
                status: String(form.get('status') ?? ''),
                chapter: String(form.get('chapter') ?? ''),
                source: String(form.get('source') ?? '').trim(),
                offset: null,
              });
            }}
          >
            <label>
              Status paket
              <select name="status" defaultValue={status}>
                <option value="">Semua aktif</option>
                <option value="DRAFT">Draf</option>
                <option value="PUBLISHED">Diterbitkan</option>
              </select>
            </label>
            {usage === 'DRILL' && <label>
              Bab
              <select name="chapter" defaultValue={chapter}>
                <option value="">Semua bab</option>
                {curriculum
                  .filter((item) => item.kind === 'CHAPTER')
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
              </select>
            </label>}
            {usage === 'DRILL' && <label>
              Sumber
              <input name="source" defaultValue={source} maxLength={240} />
            </label>}
            <Button type="submit" variant="secondary">
              Terapkan filter
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() =>
                url.update({
                  search: null,
                  status: null,
                  chapter: null,
                  source: null,
                  offset: null,
                })
              }
            >
              Reset
            </Button>
          </form>
        </details>
      )}
      {error && (
        <AdminMessage error message={error} retry={() => setRevision((value) => value + 1)} />
      )}
      {loading ? (
        <p role="status">Memuat paket…</p>
      ) : (
        data && (
          <>
            <div
              className="assessment-table-scroll"
              role="region"
              aria-label={`Tabel paket ${assessmentLabels[usage]}`}
              tabIndex={0}
            >
              <table className="assessment-directory-table">
                <caption className="sr-only">Daftar paket {assessmentLabels[usage]}</caption>
                <thead>
                  <tr>
                    {(usage === 'TRYOUT'
                      ? ['No.', 'Paket', 'Komposisi', 'Status', 'Terakhir diubah', 'Aksi']
                      : ['No.', 'Paket', 'Bab/Cakupan', 'Komposisi', 'Revisi', 'Status', 'Jadwal rilis', 'Aksi']
                    ).map((title) => (
                      <th key={title} scope="col">
                        {title}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((pack, index) => {
                    const href =
                      assessmentPath(usage, pack.id) + (archived ? '?status=ARCHIVED' : context);
                    return (
                      <tr key={pack.id}>
                        <td className="assessment-row-number">{offset + index + 1}</td>
                        <td className="assessment-package-name">
                          <Link href={href}>{pack.name}</Link>
                          <small>{pack.familyCode}</small>
                        </td>
                        {usage !== 'TRYOUT' && <td>
                          {[
                            pack.chapterName,
                            pack.subchapterName,
                            pack.levelNumber ? `Level ${pack.levelNumber}` : null,
                          ]
                            .filter(Boolean)
                            .join(' · ') ||
                            'Belum ditentukan'}
                        </td>}
                        <td>
                          <strong>{pack.itemCount}/{pack.expectedItemCount}</strong>
                          <small>soal</small>
                        </td>
                        {usage !== 'TRYOUT' && <td>Revisi {pack.contentRevision}</td>}
                        <td>
                          <Badge variant={pack.status === 'PUBLISHED' ? 'success' : 'default'}>
                            {statuses[pack.status] ?? pack.status}
                          </Badge>
                        </td>
                        <td>
                          {usage === 'TRYOUT' ? (
                            <small>{pack.lastModifiedAt ? formatAdminDate(pack.lastModifiedAt) : 'Belum tersedia'}</small>
                          ) : pack.releaseAt || pack.closeAt ? (
                            <small>
                              {pack.releaseAt ? formatAdminDate(pack.releaseAt) : 'Belum mulai'}
                              {' — '}
                              {pack.closeAt ? formatAdminDate(pack.closeAt) : 'Tanpa batas'}
                            </small>
                          ) : <small>Belum dijadwalkan</small>}
                        </td>

                        <td>
                          <div className="assessment-row-actions">
                            <Link
                              className="numora-button numora-button--secondary assessment-manage-button"
                              href={href}
                              aria-label={`Lihat detail ${pack.name}`}
                            >
                              Detail
                            </Link>
                            {usage === 'TRYOUT' && !archived && pack.status === 'PUBLISHED' &&
                              pack.source?.sourceNamespace !== 'TRYOUT_VARIANT_GENERATOR' &&
                              (variantAvailability[pack.id] ? (
                                <Link
                                  className="numora-button numora-button--secondary assessment-manage-button"
                                  href={`/admin/assessments/tryout/${encodeURIComponent(pack.id)}/variant/new`}
                                >
                                  Generate varian paket
                                </Link>
                              ) : Object.hasOwn(variantAvailability, pack.id) ? (
                                <Button variant="secondary" disabled title="Mapping generator belum lengkap untuk 25 focal soal.">
                                  Generate varian paket
                                </Button>
                              ) : (
                                <Button variant="secondary" disabled>
                                  Memeriksa generator…
                                </Button>
                              ))}
                            {archived && (
                              <Button
                                variant="secondary"
                                disabled={loading || restoringId !== null}
                                onClick={() => {
                                  if (
                                    !window.confirm(`Pulihkan paket “${pack.name}” sebagai DRAFT?`)
                                  )
                                    return;
                                  setRestoringId(pack.id);
                                  restoreContentPackage(token, pack.id, {
                                    expectedRevision: pack.contentRevision,
                                  })
                                    .then(() => setRevision((value) => value + 1))
                                    .catch((cause) => {
                                      reportAccessError(cause);
                                      setError(
                                        cause instanceof Error
                                          ? cause.message
                                          : 'Paket gagal dipulihkan.',
                                      );
                                    })
                                    .finally(() => setRestoringId(null));
                                }}
                              >
                                {restoringId === pack.id ? 'Memulihkan…' : 'Pulihkan'}
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {!data.items.length && (
              <p role="status">
                Belum ada paket yang cocok. Ubah pencarian/filter atau tambah paket.
              </p>
            )}
            <AdminPagination
              offset={offset}
              totalItems={data.total}
              hasNext={offset + ADMIN_PAGE_SIZE < data.total}
              disabled={loading}
              onChange={(next) => url.update({ offset: next || null })}
              label="Halaman paket"
            />
          </>
        )
      )}
    </Card>
  );
}

