import React from 'react';
import Alert from './Alert.jsx';

// Keep successful clinical decisions visible even when the review form is scrolled down.
export default function DecisionNotice({title,children,onClose}) {
  return <div style={{position:'fixed',top:'1rem',right:'1rem',zIndex:3000,
    width:'min(420px, calc(100vw - 2rem))'}}>
    <Alert variant="success" role="status" aria-live="polite" aria-atomic="true" title={title} onClose={onClose}>
      {children}
    </Alert>
  </div>;
}
