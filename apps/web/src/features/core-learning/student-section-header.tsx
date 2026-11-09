import Link from 'next/link';
import { Icon } from '@tka/ui';

export function StudentSectionHeader({
  title,
  back,
}: {
  title: string;
  back?: { href: string; label: string };
}) {
  return (
    <div className={`materials-header${back ? ' materials-header--with-back' : ''}`}>
      {back && (
        <Link href={back.href} className="materials-header__back" aria-label={back.label}>
          <Icon name="back" />
        </Link>
      )}
      <h1>{title}</h1>
    </div>
  );
}
