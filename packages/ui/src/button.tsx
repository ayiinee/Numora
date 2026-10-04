'use client';

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

/* ============================================
 * BUTTON COMPONENT
 * Full-featured button with variants, sizes, and states
 * ============================================ */

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-outline';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual style variant */
  variant?: ButtonVariant;
  /** Size of the button */
  size?: ButtonSize;
  /** Show loading spinner */
  loading?: boolean;
  /** Icon to display before text */
  leftIcon?: ReactNode;
  /** Icon to display after text */
  rightIcon?: ReactNode;
  /** Make button full width */
  fullWidth?: boolean;
  /** Accessible label for icon-only buttons */
  'aria-label'?: string;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary: `
    background: var(--color-primary);
    color: var(--color-text-inverse);
    border: 2px solid transparent;
  `,
  secondary: `
    background: var(--color-primary-light);
    color: var(--color-primary-strong);
    border: 1px solid transparent;
  `,
  ghost: `
    background: transparent;
    color: var(--color-primary);
    border: 2px solid transparent;
  `,
  danger: `
    background: var(--color-danger);
    color: var(--color-text-inverse);
    border: 2px solid transparent;
  `,
  'danger-outline': `
    background: var(--color-surface-raised);
    color: var(--color-danger);
    border: 1px solid var(--color-danger);
  `,
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: `
    min-height: var(--touch-target-min);
    padding: 0 var(--space-3);
    font-size: var(--text-sm);
    gap: var(--space-1);
  `,
  md: `
    height: var(--touch-target-min);
    padding: 0 var(--space-5);
    font-size: var(--text-base);
    gap: var(--space-2);
  `,
  lg: `
    min-height: var(--control-height-lg);
    padding: 0 var(--space-6);
    font-size: var(--text-lg);
    gap: var(--space-2);
  `,
};

/**
 * NUMORA Button Component
 *
 * Features:
 * - Multiple variants (primary, secondary, ghost, danger)
 * - Multiple sizes (sm, md, lg)
 * - Loading state with spinner
 * - Icon support (left/right)
 * - Full width option
 * - Focus-visible styling
 * - Disabled state
 *
 * @example
 * ```tsx
 * <Button variant="primary" size="md" onClick={handleClick}>
 *   Mulai Latihan
 * </Button>
 *
 * <Button variant="secondary" leftIcon={<SaveIcon />}>
 *   Simpan
 * </Button>
 *
 * <Button variant="ghost" size="sm" loading={isLoading}>
 *   Processing...
 * </Button>
 * ```
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      variant = 'primary',
      size = 'md',
      loading = false,
      disabled,
      leftIcon,
      rightIcon,
      fullWidth = false,
      className = '',
      style,
      ...props
    },
    ref,
  ) => {
    const isDisabled = disabled || loading;

    const buttonStyle: React.CSSProperties = {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'var(--font-sans)',
      fontWeight: 'var(--font-bold)',
      borderRadius: 'var(--radius-md)',
      cursor: isDisabled ? 'not-allowed' : 'pointer',
      transition: 'all var(--transition-fast)',
      opacity: isDisabled ? 0.62 : 1,
      width: fullWidth ? '100%' : 'auto',
      ...style,
    };

    return (
      <button
        ref={ref}
        disabled={isDisabled}
        aria-disabled={isDisabled}
        aria-busy={loading}
        className={`numora-button numora-button--${variant} numora-button--${size} ${fullWidth ? 'numora-button--full' : ''} ${className}`}
        style={buttonStyle}
        data-variant={variant}
        data-size={size}
        {...props}
      >
        {loading && (
          <span className="numora-button__spinner" aria-hidden="true">
            <SpinnerIcon />
          </span>
        )}
        {!loading && leftIcon && (
          <span className="numora-button__icon numora-button__icon--left" aria-hidden="true">
            {leftIcon}
          </span>
        )}
        <span className="numora-button__text">{children}</span>
        {!loading && rightIcon && (
          <span className="numora-button__icon numora-button__icon--right" aria-hidden="true">
            {rightIcon}
          </span>
        )}
        {loading && <span className="sr-only">Memuat...</span>}
      </button>
    );
  },
);

Button.displayName = 'Button';

/* ============================================
 * SPINNER ICON
 * ============================================ */
function SpinnerIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="numora-spinner"
      aria-hidden="true"
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

/* ============================================
 * ICON BUTTON COMPONENT
 * Square button for icon-only actions
 * ============================================ */

export type IconButtonVariant = 'primary' | 'secondary' | 'ghost';
export type IconButtonSize = 'sm' | 'md' | 'lg';

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'size'> {
  /** Visual style variant */
  variant?: IconButtonVariant;
  /** Size of the button */
  size?: IconButtonSize;
  /** Icon to display */
  icon: ReactNode;
  /** Show loading spinner */
  loading?: boolean;
  /** Accessible label - required for icon buttons */
  'aria-label': string;
}

const iconVariantStyles: Record<IconButtonVariant, string> = {
  primary: `
    background: var(--color-primary);
    color: var(--color-text-inverse);
  `,
  secondary: `
    background: var(--color-primary-light);
    color: var(--color-primary);
  `,
  ghost: `
    background: transparent;
    color: var(--color-text-muted);
  `,
};

const iconSizeStyles: Record<IconButtonSize, string> = {
  sm: 'width: var(--touch-target-min); height: var(--touch-target-min);',
  md: 'width: var(--touch-target-min); height: var(--touch-target-min);',
  lg: 'width: 48px; height: 48px;',
};

/**
 * NUMORA Icon Button Component
 *
 * Square button for icon-only actions like toolbar buttons
 *
 * @example
 * ```tsx
 * <IconButton
 *   icon={<CloseIcon />}
 *   aria-label="Tutup"
 *   onClick={handleClose}
 * />
 * ```
 */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  (
    {
      children: _children,
      variant = 'ghost',
      size = 'md',
      icon,
      disabled,
      loading,
      type = 'button',
      className = '',
      style,
      ...props
    },
    ref,
  ) => {
    const isDisabled = disabled || loading;

    return (
      <button
        ref={ref}
        type={type}
        disabled={isDisabled}
        aria-busy={loading || undefined}
        aria-disabled={isDisabled}
        className={`numora-icon-button numora-icon-button--${variant} numora-icon-button--${size} ${className}`}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 'var(--radius-md)',
          border: 'none',
          cursor: isDisabled ? 'not-allowed' : 'pointer',
          opacity: isDisabled ? 0.62 : 1,
          transition: 'all var(--transition-fast)',
          flexShrink: 0,
          ...style,
        }}
        {...props}
      >
        {loading ? <SpinnerIcon /> : icon}
      </button>
    );
  },
);

IconButton.displayName = 'IconButton';

/* ============================================
 * EXPORT STYLES FOR USE IN OTHER COMPONENTS
 * ============================================ */

export const buttonStyles = {
  base: `
    font-family: var(--font-sans);
    font-weight: var(--font-bold);
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: all var(--transition-fast);

    border: none;
    text-decoration: none;
    white-space: nowrap;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
  `,
  variant: variantStyles,
  size: sizeStyles,
  iconVariant: iconVariantStyles,
  iconSize: iconSizeStyles,
};

export { variantStyles, sizeStyles, iconVariantStyles, iconSizeStyles };
