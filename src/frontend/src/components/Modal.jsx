import React, { useEffect, useId } from 'react';

/**
 * Accessible Modal Dialog component
 * Supports keyboard escape handling, visible focus, and ARIA attributes
 */
export default function Modal({
  isOpen,
  onClose,
  title,
  children,
  footer,
  maxWidth = '520px',
}) {
  const titleId = useId();

  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    }
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleKeyDown);
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="modal-overlay"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="modal-content"
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        style={{ maxWidth }}
      >
        {title && (
          <div
            style={{
              padding: '1rem 1.25rem',
              borderBottom: '1px solid var(--color-border-subtle)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <h2 id={titleId} style={{ fontSize: '1.15rem', fontWeight: 700 }}>
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close modal"
              style={{
                background: 'transparent',
                border: 'none',
                fontSize: '1.5rem',
                lineHeight: 1,
                cursor: 'pointer',
                color: 'var(--color-text-muted)',
                padding: '4px 8px',
                borderRadius: 'var(--radius-sm)',
              }}
            >
              &times;
            </button>
          </div>
        )}
        <div style={{ padding: '1.25rem' }}>{children}</div>
        {footer && (
          <div
            style={{
              padding: '0.85rem 1.25rem',
              borderTop: '1px solid var(--color-border-subtle)',
              backgroundColor: '#f8fafc',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '0.75rem',
            }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
