import type { AdminNavigationGroup } from './navigation';
import { activeAdminHref, adminNavigationLinks } from './navigation';
import { assessmentListQuery } from './assessment-routes';
export type AdminCrumb = { label: string; href?: string };
export function adminBreadcrumbs(
  pathname: string,
  search: string,
  groups: AdminNavigationGroup[],
  title?: string,
): AdminCrumb[] {
  const params = new URLSearchParams(search);
  const active = activeAdminHref(pathname, groups, search);
  const link = adminNavigationLinks(groups).find((item) => item.href === active);
  const crumbs: AdminCrumb[] = [{ label: 'Ruang admin', href: '/admin' }];
  if (pathname === '/admin') return [{ label: 'Ruang admin' }];
  if (pathname.startsWith('/admin/content/versions/'))
    return [
      ...crumbs,
      { label: 'Soal', href: '/admin/content?view=questions' },
      { label: 'Tinjau soal' },
    ];
  if (pathname.startsWith('/admin/content/preview-sessions/'))
    return [
      ...crumbs,
      { label: 'Tambah konten', href: '/admin/content/imports' },
      { label: 'Preview impor' },
    ];
  if (link) {
    const base = link.href.split('?')[0]!;
    const nested = pathname !== base && pathname.startsWith(base + '/');
    const href = base.startsWith('/admin/assessments/')
      ? base + assessmentListQuery(params)
      : link.href;
    crumbs.push(nested ? { label: link.label, href } : { label: link.label });
    if (nested) {
      const tail = pathname.slice(base.length + 1);
      const label =
        tail === 'new'
          ? 'Tambah paket'
          : base.startsWith('/admin/assessments/')
            ? 'Detail paket'
            : title && title !== link.label
              ? title
              : 'Detail';
      crumbs.push({ label });
    }
  } else {
    if (pathname.startsWith('/admin/content/versions/'))
      crumbs.push(
        { label: 'Soal', href: '/admin/content?view=questions' },
        { label: 'Tinjau soal' },
      );
    else if (pathname.startsWith('/admin/content/preview-sessions/'))
      crumbs.push(
        { label: 'Tambah konten', href: '/admin/content/imports' },
        { label: 'Preview impor' },
      );
    else crumbs.push({ label: title || 'Halaman admin' });
  }
  return crumbs;
}
