import Link from 'next/link';
import { Icon } from '@tka/ui';

export function StudentSectionHeader({
  title,
  subtitle,
  back,
}: {
  title: string;
  subtitle?: string;
  back?: { href: string; label: string } | { onClick: () => void; label: string };
}) {
  return (
    <div className={`materials-header${back ? ' materials-header--with-back' : ''}`}>
      {back &&
        ('href' in back ? (
          <Link href={back.href} className="materials-header__back" aria-label={back.label}>
            <Icon name="back" />
          </Link>
        ) : (
          <button
            type="button"
            className="materials-header__back"
            aria-label={back.label}
            onClick={(event) => {
              event.currentTarget.focus({ preventScroll: true });
              back.onClick();
            }}
          >
            <Icon name="back" />
          </button>
        ))}
      <div className="materials-header__copy">
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
    </div>
  );
}
