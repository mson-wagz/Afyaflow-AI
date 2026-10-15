import React from 'react';
import { render, screen } from '@testing-library/react';
import { test, expect } from 'vitest';
import Navigation from './Navigation.jsx';

test('competition navigation omits historical research while retaining staff workflow',()=>{
  const view=render(<Navigation competitionMode onNavigate={()=>{}} />);
  expect(screen.queryByRole('button',{name:/Historical Research Cases/})).not.toBeInTheDocument();
  expect(screen.getByRole('button',{name:/Patient Registration/})).toBeInTheDocument();
  view.rerender(<Navigation onNavigate={()=>{}} />);
  expect(screen.getByRole('button',{name:/Historical Research Cases/})).toBeInTheDocument();
});
