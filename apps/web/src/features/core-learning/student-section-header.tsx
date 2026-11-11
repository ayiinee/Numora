import Link from 'next/link';
import { Icon } from '@tka/ui';

export function StudentSectionHeader({
  title,
  subtitle,
  back,
}: {
  title: string;
  subtitle?: string;
  back?: { href: string; label: string };
}) {
  return (
    <div className={`materials-header${back ? ' materials-header--with-back' : ''}`}>
      {back && (
        <Link href={back.href} className="materials-header__back" aria-label={back.label}>
          <Icon name="back" />
        </Link>
      )}
      <div className="materials-header__copy">
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
    </div>
  );
}
