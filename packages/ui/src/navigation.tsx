'use client';

import { type ReactNode, type AnchorHTMLAttributes } from 'react';

/* ============================================
 * BOTTOM NAVIGATION COMPONENT
 * Mobile primary navigation
 * ============================================ */

export interface NavItem {
  /** Navigation label */
  label: string;
  /** Navigation href */
  href: string;
  /** Icon (emoji or SVG) */
  icon: string | ReactNode;
  /** Active icon variant */
  activeIcon?: string | ReactNode;
  /** Badge/count indicator */
  badge?: number | string;
  /** Allows the application to map nested routes to their primary destination. */
  active?: boolean;
}

export interface BottomNavProps {
  /** Navigation items */
  items: NavItem[];
  /** Current pathname (for determining active state) */
  pathname?: string;
  className?: string;
  /** Routing adapter; the default is a semantic anchor. */
  renderLink?: (
    props: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string },
    item: NavItem,
  ) => ReactNode;
}

/**
 * NUMORA Bottom Navigation Component
 *
 * Primary mobile navigation bar
 * Note: This component is designed for use with a routing system.
 * See StudentShell for the integrated version with Next.js Link.
 */
export function BottomNav({ items, pathname, className = '', renderLink }: BottomNavProps) {
  const matchedHref = items
    .filter((item) => pathname === item.href || pathname?.startsWith(`${item.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
  return (
    <nav aria-label="Navigasi utama" className={`numora-bottom-nav ${className}`}>
      {items.map((item) => {
        const active = item.active ?? item.href === matchedHref;
        const props: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string } = {
          href: item.href,
          'aria-current': active ? 'page' : undefined,
          children: (
            <>
              <span className="numora-bottom-nav__icon" aria-hidden="true">
                {active ? (item.activeIcon ?? item.icon) : item.icon}
              </span>
              <span>{item.label}</span>
              {item.badge !== undefined && (
                <span className="numora-bottom-nav__badge">{item.badge}</span>
              )}
            </>
          ),
        };
        return (
          <div className="numora-bottom-nav__item" key={item.href}>
            {renderLink ? renderLink(props, item) : <a {...props} />}
          </div>
        );
      })}
    </nav>
  );
}

BottomNav.displayName = 'BottomNav';

/* ============================================
 * TOP BAR COMPONENT
 * Page top bar with branding and actions
 * ============================================ */

export interface TopBarProps {
  /** Logo/brand component */
  logo?: ReactNode;
  /** Title (mobile) */
  title?: string;
  /** Right side content */
  right?: ReactNode;
  /** Show border bottom */
  border?: boolean;
  variant?: 'default' | 'identity' | 'context' | 'assessment';
  className?: string;
}

/**
 * NUMORA Top Bar Component
 *
 * Header bar for authenticated pages
 */
export function TopBar({
  logo,
  title,
  right,
  border = true,
  variant = 'default',
  className = '',
}: TopBarProps) {
  return (
    <header
      className={`numora-top-bar numora-top-bar--${variant} ${className}`}
      style={{ borderBottom: border ? undefined : 'none' }}
    >
      <div className="numora-top-bar__leading">
        {logo && <div style={{ display: 'flex', alignItems: 'center' }}>{logo}</div>}
        {title && !logo && (
          <span style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--font-bold)' }}>
            {title}
          </span>
        )}
      </div>
      {right && <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>{right}</div>}
    </header>
  );
}

TopBar.displayName = 'TopBar';

/* ============================================
 * AVATAR COMPONENT
 * User avatar with fallback
 * ============================================ */

export interface AvatarProps {
  /** Avatar image URL */
  src?: string;
  /** User name for fallback initials */
  name?: string;
  /** Avatar size */
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Custom style */
  style?: React.CSSProperties;
}

const avatarSizes = {
  sm: 32,
  md: 44,
  lg: 64,
  xl: 96,
};

/**
 * NUMORA Avatar Component
 *
 * User avatar with image or initials fallback
 */
export function Avatar({ src, name, size = 'md', style }: AvatarProps) {
  const dimension = avatarSizes[size];
  const initials = name
    ? name
        .split(' ')
        .map((n) => n[0])
        .slice(0, 2)
        .join('')
        .toUpperCase()
    : '?';

  return (
    <div
      className="numora-avatar"
      style={{
        width: dimension,
        height: dimension,
        borderRadius: '50%',
        background: 'var(--color-secondary)',
        color: 'var(--color-text-inverse)',
        display: 'grid',
        placeItems: 'center',
        fontWeight: 700,
        fontSize: dimension * 0.4,
        overflow: 'hidden',
        flexShrink: 0,
        ...style,
      }}
    >
      {src ? (
        <img
          src={src}
          alt={name || 'Avatar'}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
          }}
        />
      ) : (
        <span>{initials}</span>
      )}
    </div>
  );
}

Avatar.displayName = 'Avatar';

/* ============================================
 * GREETING HEADER COMPONENT
 * Personalized greeting with status
 * ============================================ */

export interface GreetingHeaderProps {
  /** User name */
  name: string;
  /** User type/affiliation */
  status?: 'MANDIRI' | 'SEKOLAH' | 'TEACHER';
  /** Class name (for school users) */
  className?: string;
  /** Class name if school user */
  classInfo?: string;
}

/**
 * NUMORA Greeting Header Component
 */
export function GreetingHeader({ name, status, className, classInfo }: GreetingHeaderProps) {
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Selamat Pagi';
    if (hour < 15) return 'Selamat Siang';
    if (hour < 18) return 'Selamat Sore';
    return 'Selamat Malam';
  };

  const getStatusBadge = () => {
    const badgeStyles = {
      MANDIRI: { bg: 'var(--color-info-light)', color: 'var(--color-info)', label: 'User Mandiri' },
      SEKOLAH: {
        bg: 'var(--color-success-light)',
        color: 'var(--color-success-text)',
        label: 'User Sekolah',
      },
      TEACHER: { bg: 'var(--color-primary-light)', color: 'var(--color-primary)', label: 'Guru' },
    };
    const style = badgeStyles[status || 'MANDIRI'];

    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          padding: '4px 10px',
          fontSize: 'var(--text-xs)',
          fontWeight: 600,
          color: style.color,
          background: style.bg,
          borderRadius: 'var(--radius-full)',
        }}
      >
        {style.label}
        {classInfo && <span>- {classInfo}</span>}
      </span>
    );
  };

  return (
    <div
      className={`numora-greeting-header ${className || ''}`}
      style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}
    >
      <h2
        style={{
          fontSize: 'var(--text-2xl)',
          fontWeight: 800,
          color: 'var(--color-text)',
          margin: 0,
          lineHeight: 1.2,
        }}
      >
        {getGreeting()}, {name}! 👋
      </h2>
      {status && getStatusBadge()}
    </div>
  );
}

GreetingHeader.displayName = 'GreetingHeader';

/* ============================================
 * FEATURE GRID COMPONENT
 * Grid of feature shortcuts
 * ============================================ */

export interface FeatureItem {
  /** Feature label */
  label: string;
  /** Feature icon (emoji or SVG) */
  icon: string | ReactNode;
  /** Feature href */
  href?: string;
  /** Click handler (alternative to href) */
  onClick?: () => void;
  /** Feature description */
  description?: string;
  /** Disabled state */
  disabled?: boolean;
  /** Badge (e.g., "Baru", "3") */
  badge?: string | number;
  /** Variant color */
  variant?: 'default' | 'primary' | 'gold' | 'peach';
}

export interface FeatureGridProps {
  /** Feature items */
  items: FeatureItem[];
  /** Grid columns */
  columns?: 2 | 3 | 4;
  /** Compact mode */
  compact?: boolean;
}

/**
 * NUMORA Feature Grid Component
 *
 * Grid of feature shortcut tiles
 * Note: This is a presentational component. Use with Link from next/link for routing.
 */
export function FeatureGrid({ items, columns = 2, compact = false }: FeatureGridProps) {
  const itemStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: compact ? '4px' : '8px',
    padding: compact ? '12px' : '16px',
    background: 'var(--color-surface-raised)',
    borderRadius: 'var(--radius-lg)',
    border: '1px solid var(--color-border)',
    cursor: 'pointer',
    textDecoration: 'none',
    transition: 'all 120ms ease',
    minHeight: compact ? 80 : 100,
    position: 'relative',
  };

  const iconStyle: React.CSSProperties = {
    fontSize: compact ? 24 : 32,
    lineHeight: 1,
  };

  const labelStyle: React.CSSProperties = {
    fontSize: compact ? 'var(--text-xs)' : 'var(--text-sm)',
    fontWeight: 600,
    color: 'var(--color-text)',
    textAlign: 'center',
  };

  return (
    <div
      className="numora-feature-grid"
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${columns}, 1fr)`,
        gap: '12px',
      }}
    >
      {items.map((item, index) => {
        const content = (
          <>
            <span style={iconStyle} aria-hidden="true">
              {item.icon}
            </span>
            <span style={labelStyle}>{item.label}</span>
            {item.badge && (
              <span
                style={{
                  position: 'absolute',
                  top: 8,
                  right: 8,
                  minWidth: 20,
                  height: 20,
                  padding: '0 6px',
                  fontSize: 'var(--text-xs)',
                  fontWeight: 700,
                  color: 'var(--color-text-inverse)',
                  background: 'var(--color-danger)',
                  borderRadius: 'var(--radius-full)',
                  display: 'grid',
                  placeItems: 'center',
                }}
              >
                {item.badge}
              </span>
            )}
          </>
        );

        if (item.disabled) {
          return (
            <div
              key={index}
              style={{ ...itemStyle, opacity: 0.5, cursor: 'not-allowed' }}
              aria-disabled="true"
            >
              {content}
            </div>
          );
        }

        // When used with routing, you'll need to wrap with Link from next/link
        // This component is presentation-only
        return (
          <div
            key={index}
            role={item.href || item.onClick ? 'button' : undefined}
            tabIndex={item.href || item.onClick ? 0 : undefined}
            onClick={item.onClick}
            onKeyDown={(e) => e.key === 'Enter' && item.onClick?.()}
            style={itemStyle}
          >
            {content}
          </div>
        );
      })}
    </div>
  );
}

FeatureGrid.displayName = 'FeatureGrid';
