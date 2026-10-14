import React from 'react';

/**
 * Status and Role Badge component
 */
export default function Badge({
  children,
  variant = 'default',
  icon,
  className = '',
}) {
  const variantClass = variant ? `badge-${variant}` : '';

  return (
    <span className={`badge ${variantClass} ${className}`.trim()}>
      {icon && <span aria-hidden="true">{icon}</span>}
      {children}
    </span>
  );
}
