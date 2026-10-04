'use client';

import { forwardRef, type InputHTMLAttributes, type ReactNode, useId } from 'react';

/* ============================================
 * INPUT COMPONENT
 * Form input with label and validation states
 * ============================================ */

export type InputSize = 'sm' | 'md' | 'lg';

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  /** Label text */
  label?: string;
  /** Helper text below input */
  helper?: string;
  /** Error message */
  error?: string;
  /** Input size */
  size?: InputSize;
  /** Left icon */
  leftIcon?: ReactNode;
  /** Right icon */
  rightIcon?: ReactNode;
  /** Full width */
  fullWidth?: boolean;
}

const sizeStyles: Record<InputSize, { height: string; padding: string; fontSize: string }> = {
  sm: { height: 'var(--touch-target-min)', padding: '0 12px', fontSize: 'var(--text-sm)' },
  md: { height: 'var(--touch-target-min)', padding: '0 14px', fontSize: 'var(--text-base)' },
  lg: { height: 'var(--control-height-lg)', padding: '0 16px', fontSize: 'var(--text-lg)' },
};

/**
 * NUMORA Input Component
 *
 * Features:
 * - Label with association
 * - Helper and error text
 * - Icon support (left/right)
 * - Multiple sizes
 * - Focus-visible styling
 *
 * @example
 * ```tsx
 * <Input
 *   label="Nama Lengkap"
 *   placeholder="Masukkan nama Anda"
 *   helper="Nama sesuai KTP"
 * />
 *
 * <Input
 *   label="Kode Class"
 *   error="Kode tidak valid"
 *   rightIcon={<SearchIcon />}
 * />
 * ```
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      helper,
      error,
      size = 'md',
      leftIcon,
      rightIcon,
      fullWidth = true,
      disabled,
      className = '',
      style,
      id: providedId,
      ...props
    },
    ref,
  ) => {
    const generatedId = useId();
    const id = providedId || generatedId;
    const helperId = `${id}-helper`;
    const errorId = `${id}-error`;

    const sizes = sizeStyles[size];
    const hasError = Boolean(error);

    return (
      <div
        className={`numora-input-wrapper ${fullWidth ? 'numora-input-wrapper--full' : ''} ${className}`}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-2)',
          width: fullWidth ? '100%' : 'auto',
          ...style,
        }}
      >
        {label && (
          <label
            htmlFor={id}
            style={{
              fontSize: 'var(--text-sm)',
              fontWeight: 'var(--font-semibold)',
              color: 'var(--color-text)',
            }}
          >
            {label}
            {props.required && (
              <span aria-hidden="true" style={{ color: 'var(--color-danger)', marginLeft: '2px' }}>
                *
              </span>
            )}
          </label>
        )}

        <div
          style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          {leftIcon && (
            <span
              style={{
                position: 'absolute',
                left: '12px',
                color: 'var(--color-text-muted)',
                pointerEvents: 'none',
                display: 'flex',
                alignItems: 'center',
              }}
              aria-hidden="true"
            >
              {leftIcon}
            </span>
          )}

          <input
            ref={ref}
            id={id}
            disabled={disabled}
            aria-describedby={error ? errorId : helper ? helperId : undefined}
            aria-invalid={hasError}
            className="numora-input"
            style={{
              width: '100%',
              height: sizes.height,
              padding: leftIcon
                ? `0 14px 0 ${sizes.height}`
                : rightIcon
                  ? `0 ${sizes.height} 0 14px`
                  : sizes.padding,
              fontSize: sizes.fontSize,
              fontFamily: 'var(--font-sans)',
              color: 'var(--color-text)',
              background: 'var(--color-secondary-light)',
              border: `2px solid ${hasError ? 'var(--color-danger)' : 'var(--color-border)'}`,
              borderRadius: 'var(--radius-md)',
              transition: 'border-color var(--transition-fast), box-shadow var(--transition-fast)',
              opacity: disabled ? 0.62 : 1,
            }}
            {...props}
          />

          {rightIcon && (
            <span
              style={{
                position: 'absolute',
                right: '12px',
                color: 'var(--color-text-muted)',
                pointerEvents: 'none',
                display: 'flex',
                alignItems: 'center',
              }}
              aria-hidden="true"
            >
              {rightIcon}
            </span>
          )}
        </div>

        {(helper || error) && (
          <p
            id={error ? errorId : helperId}
            style={{
              fontSize: 'var(--text-xs)',
              color: hasError ? 'var(--color-danger)' : 'var(--color-text-muted)',
              margin: 0,
            }}
            role={error ? 'alert' : undefined}
          >
            {error || helper}
          </p>
        )}
      </div>
    );
  },
);

Input.displayName = 'Input';

/* ============================================
 * TEXTAREA COMPONENT
 * Multi-line text input
 * ============================================ */

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** Label text */
  label?: string;
  /** Helper text below input */
  helper?: string;
  /** Error message */
  error?: string;
  /** Full width */
  fullWidth?: boolean;
}

const textareaStyle: React.CSSProperties = {
  width: '100%',
  minHeight: '120px',
  padding: '12px 14px',
  fontSize: 'var(--text-base)',
  fontFamily: 'var(--font-sans)',
  color: 'var(--color-text)',
  background: 'var(--color-surface-raised)',
  border: '2px solid var(--color-border)',
  borderRadius: 'var(--radius-md)',
  resize: 'vertical',
  transition: 'border-color var(--transition-fast), box-shadow var(--transition-fast)',
  lineHeight: 'var(--leading-relaxed)',
};

/**
 * NUMORA Textarea Component
 *
 * @example
 * ```tsx
 * <Textarea
 *   label="Komentar"
 *   placeholder="Tulis komentar Anda..."
 *   error="Wajib diisi"
 * />
 * ```
 */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  (
    {
      label,
      helper,
      error,
      disabled,
      fullWidth = true,
      className = '',
      style,
      id: providedId,
      ...props
    },
    ref,
  ) => {
    const generatedId = useId();
    const id = providedId || generatedId;
    const helperId = `${id}-helper`;
    const errorId = `${id}-error`;
    const hasError = Boolean(error);

    return (
      <div
        className={`numora-textarea-wrapper ${fullWidth ? 'numora-textarea-wrapper--full' : ''} ${className}`}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-2)',
          width: fullWidth ? '100%' : 'auto',
          ...style,
        }}
      >
        {label && (
          <label
            htmlFor={id}
            style={{
              fontSize: 'var(--text-sm)',
              fontWeight: 'var(--font-semibold)',
              color: 'var(--color-text)',
            }}
          >
            {label}
            {props.required && (
              <span aria-hidden="true" style={{ color: 'var(--color-danger)', marginLeft: '2px' }}>
                *
              </span>
            )}
          </label>
        )}

        <textarea
          ref={ref}
          id={id}
          disabled={disabled}
          aria-describedby={error ? errorId : helper ? helperId : undefined}
          aria-invalid={hasError}
          className="numora-textarea"
          style={{
            ...textareaStyle,
            opacity: disabled ? 0.62 : 1,
            borderColor: hasError ? 'var(--color-danger)' : 'var(--color-border)',
          }}
          {...props}
        />

        {(helper || error) && (
          <p
            id={error ? errorId : helperId}
            style={{
              fontSize: 'var(--text-xs)',
              color: hasError ? 'var(--color-danger)' : 'var(--color-text-muted)',
              margin: 0,
            }}
            role={error ? 'alert' : undefined}
          >
            {error || helper}
          </p>
        )}
      </div>
    );
  },
);

Textarea.displayName = 'Textarea';

/* ============================================
 * SELECT COMPONENT
 * Dropdown select input
 * ============================================ */

export interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  /** Label text */
  label?: string;
  /** Helper text below input */
  helper?: string;
  /** Error message */
  error?: string;
  /** Select size */
  size?: InputSize;
  /** Options to render */
  options: Array<{ value: string; label: string; disabled?: boolean }>;
  /** Placeholder option */
  placeholder?: string;
  /** Full width */
  fullWidth?: boolean;
}

/**
 * NUMORA Select Component
 *
 * @example
 * ```tsx
 * <Select
 *   label="Pilih Bahasa"
 *   options={[
 *     { value: 'id', label: 'Bahasa Indonesia' },
 *     { value: 'en', label: 'English' },
 *   ]}
 *   placeholder="Pilih bahasa..."
 * />
 * ```
 */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  (
    {
      label,
      helper,
      error,
      size = 'md',
      options,
      placeholder,
      disabled,
      fullWidth = true,
      className = '',
      style,
      id: providedId,
      ...props
    },
    ref,
  ) => {
    const generatedId = useId();
    const id = providedId || generatedId;
    const helperId = `${id}-helper`;
    const errorId = `${id}-error`;
    const hasError = Boolean(error);
    const sizes = sizeStyles[size];

    return (
      <div
        className={`numora-select-wrapper ${fullWidth ? 'numora-select-wrapper--full' : ''} ${className}`}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-2)',
          width: fullWidth ? '100%' : 'auto',
          ...style,
        }}
      >
        {label && (
          <label
            htmlFor={id}
            style={{
              fontSize: 'var(--text-sm)',
              fontWeight: 'var(--font-semibold)',
              color: 'var(--color-text)',
            }}
          >
            {label}
            {props.required && (
              <span aria-hidden="true" style={{ color: 'var(--color-danger)', marginLeft: '2px' }}>
                *
              </span>
            )}
          </label>
        )}

        <select
          ref={ref}
          id={id}
          disabled={disabled}
          aria-describedby={error ? errorId : helper ? helperId : undefined}
          aria-invalid={hasError}
          className="numora-select"
          style={{
            width: '100%',
            height: sizes.height,
            padding: `0 ${sizes.height} 0 14px`,
            fontSize: sizes.fontSize,
            fontFamily: 'var(--font-sans)',
            color: 'var(--color-text)',
            background: 'var(--color-surface-raised)',
            border: `2px solid ${hasError ? 'var(--color-danger)' : 'var(--color-border)'}`,
            borderRadius: 'var(--radius-md)',
            cursor: disabled ? 'not-allowed' : 'pointer',
            appearance: 'none',
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%23675B72' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'right 12px center',
            backgroundSize: '18px',
            opacity: disabled ? 0.62 : 1,
            transition: 'border-color var(--transition-fast)',
          }}
          {...props}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((option) => (
            <option key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
            </option>
          ))}
        </select>

        {(helper || error) && (
          <p
            id={error ? errorId : helperId}
            style={{
              fontSize: 'var(--text-xs)',
              color: hasError ? 'var(--color-danger)' : 'var(--color-text-muted)',
              margin: 0,
            }}
            role={error ? 'alert' : undefined}
          >
            {error || helper}
          </p>
        )}
      </div>
    );
  },
);

Select.displayName = 'Select';

/* ============================================
 * CHECKBOX COMPONENT
 * Checkbox input with label
 * ============================================ */

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  /** Label text */
  label: string;
  /** Helper text */
  helper?: string;
  /** Full width */
  fullWidth?: boolean;
}

/**
 * NUMORA Checkbox Component
 *
 * @example
 * ```tsx
 * <Checkbox
 *   label="Saya menyetujui syarat dan ketentuan"
 *   checked={accepted}
 *   onChange={(e) => setAccepted(e.target.checked)}
 * />
 * ```
 */
export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  (
    { label, helper, disabled, fullWidth = false, className = '', style, id: providedId, ...props },
    ref,
  ) => {
    const generatedId = useId();
    const id = providedId || generatedId;
    const helperId = `${id}-helper`;

    return (
      <div
        className={`numora-checkbox-wrapper ${fullWidth ? 'numora-checkbox-wrapper--full' : ''} ${className}`}
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 'var(--space-3)',
          width: fullWidth ? '100%' : 'auto',
          ...style,
        }}
      >
        <input
          ref={ref}
          id={id}
          type="checkbox"
          disabled={disabled}
          style={{
            width: '20px',
            height: '20px',
            margin: '2px 0 0 0',
            accentColor: 'var(--color-primary)',
            cursor: disabled ? 'not-allowed' : 'pointer',
            flexShrink: 0,
          }}
          {...props}
        />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
          <label
            htmlFor={id}
            style={{
              fontSize: 'var(--text-base)',
              color: 'var(--color-text)',
              cursor: disabled ? 'not-allowed' : 'pointer',
              opacity: disabled ? 0.62 : 1,
              lineHeight: 'var(--leading-normal)',
            }}
          >
            {label}
          </label>
          {helper && (
            <p
              id={helperId}
              style={{
                fontSize: 'var(--text-xs)',
                color: 'var(--color-text-muted)',
                margin: 0,
              }}
            >
              {helper}
            </p>
          )}
        </div>
      </div>
    );
  },
);

Checkbox.displayName = 'Checkbox';
