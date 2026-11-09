'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Button, Card, Icon } from '@tka/ui';
import { useAuth } from '@/features/onboarding/auth';
import { apiRequest } from '@/lib/api';
import { AdminFrame, AdminMessage } from './admin-presentation';
import { withAdminWorkspace, useAdminAccessError } from './admin-workspace';
import { ContentPackageWorkspace } from './content-package-workspace';
import { listContentPackages } from './content-package-api';
import { useAdminUrl, adminOffset } from './admin-url';
import { AdminPagination } from './admin-pagination';
import { ADMIN_PAGE_SIZE } from './pagination';
import {
  assessmentLabels,
  assessmentListQuery,
  assessmentPath,
  type AssessmentUsage,
} from './assessment-routes';
import { packageAvailabilityLabel } from './package-availability';
import { snapshotTime } from './analytics-model';
import type { AdminCurriculumDto, ContentPackagesDto } from './generated-types';

type Props = { usage: AssessmentUsage; mode?: 'list' | 'create' | 'detail'; packageId?: string };
export const AdminAssessmentsScreen = withAdminWorkspace(Assessments, 'content');
function Assessments({ usage, mode = 'list', packageId }: Props) {
  const { state } = useAuth();
  const url = useAdminUrl();
  if (state.status !== 'ready') return null;
  const back = assessmentPath(usage) + assessmentListQuery(url.params);
  return (
    <AdminFrame
      title={`${mode === 'create' ? 'Tambah paket ' : ''}${assessmentLabels[usage]}`}
      description=""
      icon="target"
      management
      minimalHeader
      fullWidth={usage === 'PRETEST'}
    >
      {mode === 'list' ? (
        <AssessmentTable
          key={`${state.profile.id}:${usage}`}
          token={state.session.access_token}
          usage={usage}
        />
      ) : (
        <>
          <Link className="assessment-back-link" href={back}>
            {mode === 'create' ? 'Batal' : '← Kembali ke daftar'}
          </Link>
          <ContentPackageWorkspace
            key={`${state.profile.id}:${usage}:${packageId ?? 'new'}`}
            token={state.session.access_token}
            disabled={false}
            onSelect={() => undefined}
            refreshKey={0}
            initialUsage={usage}
            mode={mode}
            {...(packageId ? { packageId } : {})}
          />
        </>
      )}
    </AdminFrame>
  );
}

function AssessmentTable({ token, usage }: { token: string; usage: AssessmentUsage }) {
  const url = useAdminUrl();
  const reportAccessError = useAdminAccessError();
  const [data, setData] = useState<ContentPackagesDto | null>(null);
  const [curriculum, setCurriculum] = useState<AdminCurriculumDto['items']>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const search = url.params.get('search') ?? '';
  const status = url.params.get('status') ?? '';
  const chapter = url.params.get('chapter') ?? '';
  const source = url.params.get('source') ?? '';
  const offset = adminOffset(url.params.get('offset'));
  useEffect(() => {
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
    for (const [key, value] of Object.entries({ search, status, chapterId: chapter, source }))
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
  }, [token, usage, search, status, chapter, source, offset, revision, reportAccessError]);
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
        usage === 'PRETEST'
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
        <Button
          variant="secondary"
          disabled={loading}
          onClick={() => setRevision((value) => value + 1)}
        >
          Muat ulang
        </Button>
        <Link className="button-link" href={assessmentPath(usage, 'new') + context}>
          Tambah paket
        </Link>
      </div>
      {usage !== 'PRETEST' && (
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
                <option value="">Semua status</option>
                {Object.entries(statuses).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
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
            </label>
            <label>
              Sumber
              <input name="source" defaultValue={source} maxLength={240} />
            </label>
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
                    {[
                      'No.',
                      'Nama paket',
                      'Bab/Cakupan',
                      'Versi',
                      'Status paket',
                      'Ketersediaan siswa',
                      ...(usage === 'TRYOUT' ? ['Rilis'] : []),
                      'Aksi',
                    ].map((title) => (
                      <th key={title} scope="col">
                        {title}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((pack, index) => {
                    const href = assessmentPath(usage, pack.id) + context;
                    return (
                      <tr key={pack.id}>
                        <td className="assessment-row-number">{offset + index + 1}</td>
                        <td>
                          <Link href={href}>{pack.name}</Link>
                          <small>{pack.familyCode}</small>
                        </td>
                        <td>
                          {[
                            pack.chapterName,
                            pack.subchapterName,
                            pack.levelNumber ? `Level ${pack.levelNumber}` : null,
                          ]
                            .filter(Boolean)
                            .join(' · ') ||
                            (usage === 'TRYOUT' ? 'Lintas bab' : 'Belum ditentukan')}
                        </td>
                        <td>{pack.packageVersion}</td>
                        <td>{statuses[pack.status] ?? pack.status}</td>
                        <td>
                          {pack.availability
                            ? packageAvailabilityLabel(pack.availability.state)
                            : 'Belum diperiksa'}
                        </td>
                        {usage === 'TRYOUT' && (
                          <td>{pack.releaseAt ? snapshotTime(pack.releaseAt) : 'Belum dirilis'}</td>
                        )}
                        <td>
                          <Link
                            className="numora-button numora-button--secondary assessment-manage-button"
                            href={href}
                            aria-label={`Kelola ${pack.name}`}
                          >
                            Kelola
                          </Link>
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
