import React from 'react';

/**
 * Accessible Alert message banner component
 */
export default function Alert({
  children,
  variant = 'info',
  title,
  onClose,
  className = '',
  ...props
}) {
  return (
    <div
      role="alert"
      className={`alert alert-${variant} ${className}`.trim()}
      {...props}
    >
      <div style={{ flex: 1 }}>
        {title && <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>{title}</div>}
        <div>{children}</div>
      </div>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Close alert"
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            fontSize: '1.25rem',
            lineHeight: 1,
            color: 'inherit',
            opacity: 0.8,
            padding: '4px',
          }}
        >
          &times;
        </button>
      )}
    </div>
  );
}
