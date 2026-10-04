'use client';

import { type HTMLAttributes } from 'react';

/* ============================================
 * PROGRESS BAR COMPONENT
 * Linear progress indicator with label
 * ============================================ */

export type ProgressSize = 'sm' | 'md' | 'lg';
export type ProgressVariant = 'default' | 'success' | 'warning' | 'danger' | 'gold';

export interface ProgressBarProps extends HTMLAttributes<HTMLDivElement> {
  /** Current value (0-100 or specified max) */
  value: number;
  /** Maximum value */
  max?: number;
  /** Progress bar height/size */
  size?: ProgressSize;
  /** Color variant */
  variant?: ProgressVariant;
  /** Show percentage label */
  showLabel?: boolean;
  /** Label text (defaults to percentage) */
  label?: string;
  /** Animated fill */
  animated?: boolean;
}

/* Size-specific heights */
const sizeHeights: Record<ProgressSize, number> = {
  sm: 6,
  md: 10,
  lg: 16,
};

/* Variant colors */
const variantColors: Record<ProgressVariant, string> = {
  default: 'var(--color-primary)',
  success: 'var(--color-success)',
  warning: 'var(--color-warning)',
  danger: 'var(--color-danger)',
  gold: 'var(--numora-gold)',
};

/**
 * NUMORA Progress Bar Component
 *
 * Linear progress indicator with multiple sizes and variants
 *
 * @example
 * ```tsx
 * <ProgressBar value={65} showLabel />
 * <ProgressBar value={3} max={5} label="3/5 Level" variant="success" />
 * ```
 */
export function ProgressBar({
  value,
  max = 100,
  size = 'md',
  variant = 'default',
  showLabel = false,
  label,
  animated = true,
  className = '',
  style,
  ...props
}: ProgressBarProps) {
  const percentage =
    max > 0 && Number.isFinite(value) ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  const color = variantColors[variant];

  return (
    <div
      className={`numora-progress ${className}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-1)',
        ...style,
      }}
      {...props}
    >
      {showLabel && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: 'var(--text-sm)',
            fontWeight: 'var(--font-semibold)',
            color: 'var(--color-text)',
          }}
        >
          <span>{label || `${Math.round(percentage)}%`}</span>
        </div>
      )}
      <div
        role="progressbar"
        aria-label={label || 'Progres'}
        aria-valuenow={percentage}
        aria-valuemin={0}
        aria-valuemax={100}
        style={{
          width: '100%',
          height: sizeHeights[size],
          background: 'var(--color-primary-light)',
          borderRadius: 'var(--radius-full)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${percentage}%`,
            height: '100%',
            background: color,
            borderRadius: 'var(--radius-full)',
            transition: animated ? 'width var(--transition-slow)' : 'none',
          }}
        />
      </div>
    </div>
  );
}

ProgressBar.displayName = 'ProgressBar';

/* ============================================
 * PROGRESS RING COMPONENT
 * Circular progress indicator
 * ============================================ */

export interface ProgressRingProps extends HTMLAttributes<HTMLDivElement> {
  /** Current value (0-100 or specified max) */
  value: number;
  /** Maximum value */
  max?: number;
  /** Ring diameter */
  size?: number;
  /** Ring stroke width */
  strokeWidth?: number;
  /** Show center label */
  showLabel?: boolean;
  /** Center label (defaults to percentage) */
  label?: string;
  /** Color variant */
  variant?: ProgressVariant;
  /** Animated fill */
  animated?: boolean;
}

/**
 * NUMORA Progress Ring Component
 *
 * Circular progress indicator with SVG
 *
 * @example
 * ```tsx
 * <ProgressRing value={75} size={80} showLabel />
 * <ProgressRing value={4} max={20} size={100} label="4/20" variant="gold" />
 * ```
 */
export function ProgressRing({
  value,
  max = 100,
  size = 80,
  strokeWidth = 8,
  showLabel = true,
  label,
  variant = 'default',
  animated = true,
  className = '',
  style,
  ...props
}: ProgressRingProps) {
  const percentage =
    max > 0 && Number.isFinite(value) ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (percentage / 100) * circumference;
  const color = variantColors[variant];

  return (
    <div
      className={`numora-progress-ring ${className}`}
      role="progressbar"
      aria-label={label || 'Progres'}
      aria-valuenow={percentage}
      aria-valuemin={0}
      aria-valuemax={100}
      style={{
        position: 'relative',
        width: size,
        height: size,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        ...style,
      }}
      {...props}
    >
      <svg
        aria-hidden="true"
        width={size}
        height={size}
        style={{
          transform: 'rotate(-90deg)',
        }}
      >
        {/* Background ring */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--color-primary-light)"
          strokeWidth={strokeWidth}
        />
        {/* Progress ring */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{
            transition: animated ? 'stroke-dashoffset var(--transition-slow)' : 'none',
          }}
        />
      </svg>
      {showLabel && (
        <div
          style={{
            position: 'absolute',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <span
            style={{
              fontSize:
                size < 60 ? 'var(--text-xs)' : size < 100 ? 'var(--text-sm)' : 'var(--text-lg)',
              fontWeight: 'var(--font-extrabold)',
              color: 'var(--color-text)',
              lineHeight: 1,
            }}
          >
            {label || `${Math.round(percentage)}%`}
          </span>
        </div>
      )}
    </div>
  );
}

ProgressRing.displayName = 'ProgressRing';

/* ============================================
 * STAT CARD COMPONENT
 * Metric display with icon and label
 * ============================================ */

export interface StatCardProps extends HTMLAttributes<HTMLDivElement> {
  /** Icon or emoji */
  icon?: string | React.ReactNode;
  /** Metric value */
  value: string | number;
  /** Metric label */
  label: string;
  /** Trend indicator */
  trend?: 'up' | 'down' | 'neutral';
  /** Trend value */
  trendValue?: string;
  /** Variant for coloring */
  variant?: 'default' | 'primary' | 'gold' | 'success';
}

/**
 * NUMORA Stat Card Component
 *
 * Compact metric display card
 *
 * @example
 * ```tsx
 * <StatCard icon="📚" value={150} label="XP Total" />
 * <StatCard icon="⭐" value={12} label="Level Selesai" variant="gold" />
 * <StatCard icon="🔥" value={7} label="Streak" trend="up" trendValue="+2" />
 * ```
 */
export function StatCard({
  icon,
  value,
  label,
  trend,
  trendValue,
  variant = 'default',
  className = '',
  style,
  ...props
}: StatCardProps) {
  const variantStyles = {
    default: { bg: 'var(--color-surface-raised)', accent: 'var(--color-primary)' },
    primary: { bg: 'var(--color-primary-light)', accent: 'var(--color-primary)' },
    gold: { bg: 'var(--color-reward-light)', accent: 'var(--numora-gold)' },
    success: { bg: 'var(--color-success-light)', accent: 'var(--color-success)' },
  };

  const colors = variantStyles[variant];

  return (
    <div
      className={`numora-stat-card ${className}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-3)',
        padding: 'var(--space-4)',
        background: colors.bg,
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--color-border)',
        ...style,
      }}
      {...props}
    >
      {icon && (
        <div
          style={{
            width: 48,
            height: 48,
            display: 'grid',
            placeItems: 'center',
            background: 'var(--color-surface-raised)',
            borderRadius: 'var(--radius-md)',
            fontSize: '24px',
            flexShrink: 0,
          }}
        >
          {typeof icon === 'string' ? icon : icon}
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: 'var(--space-2)',
          }}
        >
          <span
            style={{
              fontSize: 'var(--text-2xl)',
              fontWeight: 'var(--font-extrabold)',
              color: 'var(--color-text)',
              lineHeight: 1,
            }}
          >
            {value}
          </span>
          {trend && trendValue && (
            <span
              style={{
                fontSize: 'var(--text-xs)',
                fontWeight: 'var(--font-semibold)',
                color:
                  trend === 'up'
                    ? 'var(--color-success-text)'
                    : trend === 'down'
                      ? 'var(--color-danger)'
                      : 'var(--color-text-muted)',
              }}
            >
              {trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→'} {trendValue}
            </span>
          )}
        </div>
        <p
          style={{
            fontSize: 'var(--text-sm)',
            color: 'var(--color-text-muted)',
            margin: 'var(--space-1) 0 0 0',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {label}
        </p>
      </div>
    </div>
  );
}

StatCard.displayName = 'StatCard';

/* ============================================
 * STARS DISPLAY COMPONENT
 * Achievement stars visualization
 * ============================================ */

export interface StarsDisplayProps extends HTMLAttributes<HTMLDivElement> {
  /** Number of earned stars (0-3) */
  stars: number;
  /** Maximum stars (default 3) */
  maxStars?: number;
  /** Star size */
  size?: 'sm' | 'md' | 'lg';
  /** Show label */
  showLabel?: boolean;
}

/**
 * NUMORA Stars Display Component
 *
 * Visual star rating display
 *
 * @example
 * ```tsx
 * <StarsDisplay stars={3} />
 * <StarsDisplay stars={2} maxStars={3} size="lg" showLabel />
 * ```
 */
export function StarsDisplay({
  stars,
  maxStars = 3,
  size = 'md',
  showLabel = false,
  className = '',
  style,
  ...props
}: StarsDisplayProps) {
  const sizes = {
    sm: 16,
    md: 24,
    lg: 32,
  };
  const fontSize = sizes[size];

  return (
    <div
      className={`numora-stars-display ${className}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--space-1)',
        ...style,
      }}
      {...props}
    >
      <span
        style={{
          display: 'flex',
          gap: '2px',
          fontSize,
          lineHeight: 1,
        }}
      >
        {Array.from({ length: maxStars }, (_, i) => (
          <span
            key={i}
            style={{
              color: i < stars ? 'var(--numora-gold)' : 'var(--color-border)',
            }}
          >
            ★
          </span>
        ))}
      </span>
      {showLabel && (
        <span
          style={{
            fontSize: 'var(--text-sm)',
            fontWeight: 'var(--font-semibold)',
            color: 'var(--color-text-muted)',
            marginLeft: 'var(--space-1)',
          }}
        >
          {stars}/{maxStars}
        </span>
      )}
    </div>
  );
}

StarsDisplay.displayName = 'StarsDisplay';
