import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { LanguageProvider, LanguageSwitcher, translate } from './index.jsx';
import { SW } from './sw.js';
import Navigation from '../components/Navigation.jsx';

const renderNav = () => render(
  <LanguageProvider>
    <LanguageSwitcher />
    <Navigation currentView="queue" onNavigate={() => {}} staffRole="nurse" isClinical pendingSyncCount={2} />
  </LanguageProvider>,
);

describe('English / Kiswahili interface', () => {
  beforeEach(() => { localStorage.clear(); document.documentElement.lang = ''; });

  it('starts in English and switches the navigation to Kiswahili, remembering the choice', () => {
    const { unmount } = renderNav();
    expect(screen.getByText('Hospital Queue')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Language / Lugha'), { target: { value: 'sw' } });
    expect(screen.getByText('Foleni ya Hospitali')).toBeInTheDocument();
    expect(screen.getByText('Usajili wa Mgonjwa')).toBeInTheDocument();
    expect(screen.getByText('2 zinasubiri')).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('sw');
    unmount();
    renderNav();
    expect(screen.getByText('Foleni ya Hospitali')).toBeInTheDocument();
  });

  it('fills placeholders and falls back to English for text not yet translated', () => {
    expect(translate('sw', 'Tied {position} of {size}', { position: 1, size: 3 })).toBe('Sawa 1 kati ya 3');
    expect(translate('sw', 'Some text without a translation')).toBe('Some text without a translation');
    expect(translate('en', 'Hospital Queue')).toBe('Hospital Queue');
  });

  it('keeps every placeholder of the English text in the Kiswahili text', () => {
    const names = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const [english, swahili] of Object.entries(SW)) expect(names(swahili), english).toEqual(names(english));
  });
});
