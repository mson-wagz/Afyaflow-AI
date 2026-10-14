import React, { useId } from 'react';

/**
 * Accessible Input component
 * Fulfills FE-APP-SHELL-AND-STAFF-ACCESS-01 acceptance criteria:
 * "Phone and desktop screens support labelled controls, keyboard use and visible focus."
 */
export default function Input({
  label,
  id,
  type = 'text',
  value,
  onChange,
  placeholder,
  error,
  hint,
  required = false,
  disabled = false,
  autoComplete,
  className = '',
  inputMode,
  maxLength,
  pattern,
  ...props
}) {
  const generatedId = useId();
  const inputId = id || generatedId;
  const errorId = `${inputId}-error`;
  const hintId = `${inputId}-hint`;

  const ariaDescribedBy = [
    error ? errorId : null,
    hint ? hintId : null,
  ].filter(Boolean).join(' ') || undefined;

  return (
    <div className={`form-group ${className}`.trim()}>
      {label && (
        <label htmlFor={inputId} className="form-label">
          {label}
          {required && <span style={{ color: 'var(--color-danger)', marginLeft: '4px' }}>*</span>}
        </label>
      )}
      <input
        id={inputId}
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        autoComplete={autoComplete}
        inputMode={inputMode}
        maxLength={maxLength}
        pattern={pattern}
        aria-invalid={Boolean(error)}
        aria-describedby={ariaDescribedBy}
        className="form-input"
        {...props}
      />
      {error && (
        <div id={errorId} className="form-error" role="alert">
          {error}
        </div>
      )}
      {hint && !error && (
        <div id={hintId} className="form-hint">
          {hint}
        </div>
      )}
    </div>
  );
}
