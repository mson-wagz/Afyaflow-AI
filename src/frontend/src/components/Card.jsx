import React from 'react';

/**
 * Card container component
 */
export default function Card({
  title,
  subtitle,
  actions,
  children,
  footer,
  className = '',
  ...props
}) {
  return (
    <div className={`card ${className}`.trim()} {...props}>
      {(title || actions) && (
        <div className="card-header">
          <div>
            {title && <h2 className="card-title">{title}</h2>}
            {subtitle && (
              <p style={{ fontSize: '0.85rem', color: 'var(--color-text-subtle)', marginTop: '2px' }}>
                {subtitle}
              </p>
            )}
          </div>
          {actions && <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>{actions}</div>}
        </div>
      )}
      <div className="card-body">{children}</div>
      {footer && <div className="card-footer">{footer}</div>}
    </div>
  );
}
