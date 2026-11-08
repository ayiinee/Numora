import { useId, type ReactNode } from 'react';
import type { PvpSnapshotDto } from './generated-types';
import './student-illustrated-hero.css';

/** Shared presentation for student banners and carousel slides. */
export function StudentIllustratedHero({
  variant,
  difficulty = 'easy',
  titleId,
  heading: Heading = 'h2',
  badges,
  title,
  description,
  className,
  children,
}: {
  variant: 'pvp' | 'leaderboard' | 'drill' | 'tryout';
  difficulty?: PvpSnapshotDto['difficulty'];
  titleId?: string;
  heading?: 'h1' | 'h2';
  badges: ReactNode;
  title?: ReactNode;
  description?: ReactNode;
  className?: string;
  children?: ReactNode;
}) {
  const generatedId = useId();
  const headingId = titleId ?? generatedId;
  const variantClass = variant === 'leaderboard' ? ` student-illustrated-hero--${difficulty}` : '';
  return (
    <section
      className={`student-illustrated-hero student-illustrated-hero--${variant}${variantClass}${className ? ` ${className}` : ''}`}
      aria-labelledby={title == null ? undefined : headingId}
    >
      <div className="student-illustrated-hero__badges">{badges}</div>
      <div className="student-illustrated-hero__copy">
        {title != null && <Heading id={headingId}>{title}</Heading>}
        {description != null && <p>{description}</p>}
        {children}
      </div>
    </section>
  );
}
