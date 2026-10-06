'use client';

import { type HTMLAttributes, type ReactNode } from 'react';

/* ============================================
 * LIST ROW COMPONENT
 * Icon + text + action row pattern
 * ============================================ */

export interface ListRowProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  /** Leading icon or avatar */
  leading?: ReactNode;
  /** Primary text */
  title: string;
  /** Secondary text */
  description?: string;
  /** Trailing content (badge, action, etc.) */
  trailing?: ReactNode;
  /** Clickable row */
  interactive?: boolean;
  /** Divider below row */
  dividers?: boolean;
  /** Allow long account and list text to reflow instead of truncating. */
  wrapText?: boolean;
}

/**
 * NUMORA List Row Component
 *
 * Standard row pattern for lists, menus, settings
 *
 * @example
 * ```tsx
 * <ListRow
 *   leading={<UserIcon />}
 *   title="Profil"
 *   description="Kelola informasi akun"
 *   trailing={<ChevronRight />}
 * />
 *
 * <ListRow
 *   leading={<BookIcon />}
 *   title="Bab 1: Aljabar"
 *   trailing={<Badge variant="gold">3/5</Badge>}
 * />
 * ```
 */
export function ListRow({
  leading,
  title,
  description,
  trailing,
  interactive = false,
  dividers = true,
  wrapText = false,
  className = '',
  style,
  ...props
}: ListRowProps) {
  return (
    <div
      className={`numora-list-row ${interactive ? 'numora-list-row--interactive' : ''} ${className}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-3)',
        padding: 'var(--space-3) var(--space-4)',
        background: interactive ? 'var(--color-surface-raised)' : 'transparent',
        borderRadius: interactive ? 'var(--radius-md)' : 0,
        cursor: interactive ? 'pointer' : 'default',
        transition: 'background var(--transition-fast)',
        borderBottom: dividers && !interactive ? '1px solid var(--color-border-light)' : 'none',
        ...style,
      }}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      {...props}
    >
      {leading && (
        <div
          className="numora-list-row__leading"
          style={{
            width: 44,
            height: 44,
            display: 'grid',
            placeItems: 'center',
            background: 'var(--color-surface)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--color-primary)',
            flexShrink: 0,
            fontSize: 20,
          }}
        >
          {leading}
        </div>
      )}

      <div
        className="numora-list-row__content"
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: '2px',
        }}
      >
        <span
          style={{
            fontSize: 'var(--text-base)',
            fontWeight: 'var(--font-semibold)',
            color: 'var(--color-text)',
            whiteSpace: wrapText ? 'normal' : 'nowrap',
            overflowWrap: wrapText ? 'anywhere' : undefined,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {title}
        </span>
        {description && (
          <span
            style={{
              fontSize: 'var(--text-sm)',
              color: 'var(--color-text-muted)',
              whiteSpace: wrapText ? 'normal' : 'nowrap',
              overflowWrap: wrapText ? 'anywhere' : undefined,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {description}
          </span>
        )}
      </div>

      {trailing && (
        <div
          className="numora-list-row__trailing"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            flexShrink: 0,
            color: 'var(--color-text-muted)',
          }}
        >
          {trailing}
        </div>
      )}

      {interactive && <ChevronIcon />}
    </div>
  );
}

ListRow.displayName = 'ListRow';

function ChevronIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

/* ============================================
 * SECTION HEADER COMPONENT
 * Section title with optional action
 * ============================================ */

export interface SectionHeaderProps extends HTMLAttributes<HTMLDivElement> {
  /** Section title */
  title: string;
  /** Optional action (link or button) */
  action?: ReactNode;
  /** Subtitle/description */
  subtitle?: string;
}

/**
 * NUMORA Section Header Component
 *
 * Section title with optional action
 *
 * @example
 * ```tsx
 * <SectionHeader title="Lanjutkan Belajar" />
 * <SectionHeader
 *   title="TryOut"
 *   action={<Link href="/student/tryout">Lihat semua</Link>}
 * />
 * ```
 */
export function SectionHeader({
  title,
  action,
  subtitle,
  className = '',
  style,
  ...props
}: SectionHeaderProps) {
  return (
    <div
      className={`numora-section-header ${className}`}
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: 'var(--space-4)',
        marginBottom: 'var(--space-4)',
        ...style,
      }}
      {...props}
    >
      <div>
        <h2
          style={{
            fontSize: 'var(--text-lg)',
            fontWeight: 'var(--font-bold)',
            color: 'var(--color-text)',
            margin: 0,
          }}
        >
          {title}
        </h2>
        {subtitle && (
          <p
            style={{
              fontSize: 'var(--text-sm)',
              color: 'var(--color-text-muted)',
              margin: 'var(--space-1) 0 0 0',
            }}
          >
            {subtitle}
          </p>
        )}
      </div>
      {action && <div style={{ flexShrink: 0 }}>{action}</div>}
    </div>
  );
}

SectionHeader.displayName = 'SectionHeader';

/* ============================================
 * PAGE HEADER COMPONENT
 * Full page header with back navigation
 * ============================================ */

export interface PageHeaderProps extends HTMLAttributes<HTMLDivElement> {
  /** Back link href */
  backHref?: string;
  /** Back action handler (alternative to href) */
  onBack?: () => void;
  /** Page title */
  title: string;
  /** Optional subtitle */
  subtitle?: string;
  /** Optional actions on the right */
  actions?: ReactNode;
  /** Breadcrumb items */
  breadcrumbs?: Array<{ label: string; href?: string }>;
}

/**
 * NUMORA Page Header Component
 *
 * Standard page header with back navigation
 *
 * @example
 * ```tsx
 * <PageHeader title="Profil Saya" />
 *
 * <PageHeader
 *   title="Bab 1"
 *   backHref="/student/learn"
 *   subtitle="Aljabar Dasar"
 *   actions={<IconButton icon={<SettingsIcon />} aria-label="Pengaturan" />}
 * />
 * ```
 */
export function PageHeader({
  backHref,
  onBack,
  title,
  subtitle,
  actions,
  breadcrumbs,
  className = '',
  style,
  ...props
}: PageHeaderProps) {
  const backButton = (
    <a
      href={backHref || '#'}
      onClick={
        onBack
          ? (e) => {
              e.preventDefault();
              onBack();
            }
          : undefined
      }
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--space-1)',
        color: 'var(--color-primary)',
        fontWeight: 'var(--font-semibold)',
        textDecoration: 'none',
        padding: 'var(--space-2) 0',
        marginBottom: 'var(--space-2)',
      }}
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <polyline points="15 18 9 12 15 6" />
      </svg>
      Kembali
    </a>
  );

  return (
    <header
      className={`numora-page-header ${className}`}
      style={{
        marginBottom: 'var(--space-6)',
        ...style,
      }}
      {...props}
    >
      {(backHref || onBack) && backButton}

      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav
          aria-label="Breadcrumb"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            fontSize: 'var(--text-sm)',
            color: 'var(--color-text-muted)',
            marginBottom: 'var(--space-2)',
          }}
        >
          {breadcrumbs.map((crumb, index) => (
            <span
              key={index}
              style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}
            >
              {index > 0 && <span aria-hidden="true">/</span>}
              {crumb.href ? (
                <a
                  href={crumb.href}
                  style={{ color: 'var(--color-text-muted)', textDecoration: 'none' }}
                >
                  {crumb.label}
                </a>
              ) : (
                <span style={{ color: 'var(--color-text)' }}>{crumb.label}</span>
              )}
            </span>
          ))}
        </nav>
      )}

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 'var(--space-4)',
        }}
      >
        <div>
          <h1
            style={{
              fontSize: 'var(--text-3xl)',
              fontWeight: 'var(--font-extrabold)',
              color: 'var(--color-text)',
              margin: 0,
              lineHeight: 'var(--leading-tight)',
            }}
          >
            {title}
          </h1>
          {subtitle && (
            <p
              style={{
                fontSize: 'var(--text-base)',
                color: 'var(--color-text-muted)',
                margin: 'var(--space-2) 0 0 0',
              }}
            >
              {subtitle}
            </p>
          )}
        </div>
        {actions && (
          <div
            style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexShrink: 0 }}
          >
            {actions}
          </div>
        )}
      </div>
    </header>
  );
}

PageHeader.displayName = 'PageHeader';

/* ============================================
 * EMPTY STATE COMPONENT
 * Display when no data is available
 * ============================================ */

export interface EmptyStateProps extends HTMLAttributes<HTMLDivElement> {
  /** Smaller inline layout for empty cards and supporting sections */
  compact?: boolean;
  /** Icon or illustration */
  icon?: string | ReactNode;
  /** Title */
  title: string;
  /** Description */
  description?: string;
  /** Action button */
  action?: ReactNode;
}

/**
 * NUMORA Empty State Component
 *
 * Display when list or data is empty
 *
 * @example
 * ```tsx
 * <EmptyState
 *   icon="📚"
 *   title="Belum ada aktivitas"
 *   description="Mulai belajar untuk melihat aktivitas di sini"
 *   action={<Button variant="primary">Mulai Belajar</Button>}
 * />
 * ```
 */
export function EmptyState({
  compact = false,
  icon = '📭',
  title,
  description,
  action,
  className = '',
  style,
  ...props
}: EmptyStateProps) {
  return (
    <div
      className={`numora-empty-state ${compact ? 'numora-empty-state--compact' : ''} ${className}`}
      style={{
        display: compact ? 'grid' : 'flex',
        gridTemplateColumns: compact ? '24px minmax(0, 1fr)' : undefined,
        gap: compact ? 'var(--space-1) var(--space-3)' : undefined,
        flexDirection: 'column',
        alignItems: compact ? 'start' : 'center',
        justifyContent: 'center',
        padding: compact ? 'var(--space-2)' : 'var(--space-12) var(--space-4)',
        textAlign: compact ? 'left' : 'center',
        ...style,
      }}
      {...props}
    >
      <div
        style={{
          fontSize: compact ? 24 : 64,
          gridRow: compact ? '1 / span 3' : undefined,
          marginBottom: compact ? 0 : 'var(--space-4)',
          lineHeight: 1,
        }}
      >
        {typeof icon === 'string' ? icon : icon}
      </div>
      <h3
        style={{
          gridColumn: compact ? 2 : undefined,
          fontSize: compact ? 'var(--text-base)' : 'var(--text-xl)',
          fontWeight: 'var(--font-bold)',
          color: 'var(--color-text)',
          margin: compact ? 0 : '0 0 var(--space-2) 0',
          overflowWrap: 'anywhere',
        }}
      >
        {title}
      </h3>
      {description && (
        <p
          style={{
            gridColumn: compact ? 2 : undefined,
            fontSize: compact ? 'var(--text-sm)' : 'var(--text-base)',
            color: 'var(--color-text-muted)',
            margin: compact ? 0 : '0 0 var(--space-6) 0',
            maxWidth: compact ? undefined : 300,
            overflowWrap: 'anywhere',
          }}
        >
          {description}
        </p>
      )}
      {action && <div style={compact ? { gridColumn: 2, minWidth: 0 } : undefined}>{action}</div>}
    </div>
  );
}

EmptyState.displayName = 'EmptyState';

/* ============================================
 * DIVIDER COMPONENT
 * Horizontal divider
 * ============================================ */

export interface DividerProps extends HTMLAttributes<HTMLHRElement> {
  /** Spacing variant */
  spacing?: 'none' | 'sm' | 'md' | 'lg';
}

/**
 * NUMORA Divider Component
 *
 * Horizontal divider with optional spacing
 *
 * @example
 * ```tsx
 * <Divider />
 * <Divider spacing="lg" />
 * ```
 */
export function Divider({ spacing = 'md', className = '', style, ...props }: DividerProps) {
  const spacingValues = {
    none: '0',
    sm: 'var(--space-4)',
    md: 'var(--space-6)',
    lg: 'var(--space-8)',
  };

  return (
    <hr
      className={`numora-divider ${className}`}
      style={{
        border: 'none',
        borderTop: '1px solid var(--color-border)',
        margin: `${spacingValues[spacing]} 0`,
        ...style,
      }}
      {...props}
    />
  );
}

Divider.displayName = 'Divider';
