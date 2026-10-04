'use client';

import { forwardRef, type HTMLAttributes } from 'react';

/* ============================================
 * CARD COMPONENT
 * Flexible card system with variants
 * ============================================ */

export type CardVariant = 'default' | 'elevated' | 'outlined' | 'highlight' | 'reward';
export type CardPadding = 'none' | 'sm' | 'md' | 'lg';

/* Variant-specific styles */
const variantStyles: Record<CardVariant, React.CSSProperties> = {
  default: {
    background: 'var(--color-surface-raised)',
    border: '1px solid var(--color-border-light)',
    boxShadow: 'var(--shadow-sm)',
  },
  elevated: {
    background: 'var(--color-surface-raised)',
    border: '1px solid var(--color-border-light)',
    boxShadow: 'var(--shadow-sm)',
  },
  outlined: {
    background: 'transparent',
    border: '2px solid var(--color-border)',
    boxShadow: 'none',
  },
  highlight: {
    background: 'var(--color-primary-light)',
    border: '1px solid var(--numora-purple-200)',
    boxShadow: 'var(--shadow-sm)',
  },
  reward: {
    background: 'var(--color-reward-light)',
    border: '1px solid var(--numora-gold-300)',
    boxShadow: 'var(--shadow-sm)',
  },
};

/* Padding values */
const paddingValues: Record<CardPadding, string> = {
  none: '0',
  sm: 'var(--space-3)',
  md: 'var(--space-4)',
  lg: 'var(--space-6)',
};

/* ============================================
 * CARD COMPONENT
 * ============================================ */

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Card visual style */
  variant?: CardVariant;
  /** Padding inside the card */
  padding?: CardPadding;
  /** Interactive card (clickable) */
  interactive?: boolean;
  /** Full width */
  fullWidth?: boolean;
}

/**
 * NUMORA Card Component
 *
 * Features:
 * - Multiple variants (default, elevated, outlined, highlight, reward)
 * - Adjustable padding
 * - Interactive state for clickable cards
 *
 * @example
 * ```tsx
 * <Card variant="default" padding="md">
 *   Card content here
 * </Card>
 *
 * <Card variant="highlight" interactive onClick={handleClick}>
 *   Clickable card
 * </Card>
 * ```
 */
export const Card = forwardRef<HTMLDivElement, CardProps>(
  (
    {
      children,
      variant = 'default',
      padding = 'md',
      interactive = false,
      fullWidth = false,
      className = '',
      style,
      onKeyDown,
      ...props
    },
    ref,
  ) => {
    const variantStyle = variantStyles[variant];

    return (
      <div
        ref={ref}
        className={`numora-card numora-card--${variant} ${interactive ? 'numora-card--interactive' : ''} ${fullWidth ? 'numora-card--full' : ''} ${className}`}
        style={{
          borderRadius: 'var(--card-radius, var(--radius-lg))',
          overflow: 'hidden',
          width: fullWidth ? '100%' : 'auto',
          ...variantStyle,
          background: `var(--card-background, ${variantStyle.background})`,
          border: `var(--card-border, ${variantStyle.border})`,
          boxShadow: `var(--card-shadow, ${variantStyle.boxShadow})`,
          padding: `var(--card-padding, ${paddingValues[padding]})`,
          ...style,
        }}
        {...(interactive ? { role: 'button', tabIndex: 0 } : {})}
        {...props}
        onKeyDown={(event) => {
          onKeyDown?.(event);
          if (
            interactive &&
            !event.defaultPrevented &&
            event.target === event.currentTarget &&
            (event.key === 'Enter' || event.key === ' ')
          ) {
            event.preventDefault();
            event.currentTarget.click();
          }
        }}
      >
        {children}
      </div>
    );
  },
);

Card.displayName = 'Card';

/* ============================================
 * CARD HEADER
 * ============================================ */

export type CardHeaderProps = HTMLAttributes<HTMLDivElement>;

export function CardHeader({ children, className = '', style, ...props }: CardHeaderProps) {
  return (
    <div
      className={`numora-card__header ${className}`}
      style={{
        padding: 'var(--space-4)',
        fontWeight: 700,
        borderBottom: '1px solid var(--color-border-light)',
        ...style,
      }}
      {...props}
    >
      {children}
    </div>
  );
}

CardHeader.displayName = 'CardHeader';

/* ============================================
 * CARD CONTENT
 * ============================================ */

export interface CardContentProps extends HTMLAttributes<HTMLDivElement> {
  /** Padding size */
  padding?: CardPadding;
}

export function CardContent({
  children,
  padding = 'md',
  className = '',
  style,
  ...props
}: CardContentProps) {
  return (
    <div
      className={`numora-card__content ${className}`}
      style={{
        padding: paddingValues[padding],
        ...style,
      }}
      {...props}
    >
      {children}
    </div>
  );
}

CardContent.displayName = 'CardContent';

/* ============================================
 * CARD FOOTER
 * ============================================ */

export interface CardFooterProps extends HTMLAttributes<HTMLDivElement> {
  /** Padding size */
  padding?: CardPadding;
}

export function CardFooter({
  children,
  padding = 'md',
  className = '',
  style,
  ...props
}: CardFooterProps) {
  return (
    <div
      className={`numora-card__footer ${className}`}
      style={{
        padding: paddingValues[padding],
        borderTop: '1px solid var(--color-border-light)',
        ...style,
      }}
      {...props}
    >
      {children}
    </div>
  );
}

CardFooter.displayName = 'CardFooter';

/* ============================================
 * HELPER FUNCTIONS
 * ============================================ */

/**
 * Get style object for card variant
 */
export function getCardStyles(variant: CardVariant): React.CSSProperties {
  return { ...variantStyles[variant] };
}

/**
 * Get padding value string
 */
export function getCardPadding(padding: CardPadding): string {
  return paddingValues[padding];
}
