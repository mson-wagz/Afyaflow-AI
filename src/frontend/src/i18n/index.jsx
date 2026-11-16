import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { SW } from './sw.js';

/**
 * Interface language (English / Kiswahili). The English text is the key, so anything not yet
 * translated simply stays in English. Translations live in ./sw.js.
 */
export const LANGUAGES = { en: 'English', sw: 'Kiswahili' };
const STORAGE_KEY = 'afyaflow-language';

const readStored = () => {
  try { const v = window.localStorage.getItem(STORAGE_KEY); return v && LANGUAGES[v] ? v : 'en'; } catch { return 'en'; }
};

const LanguageContext = createContext({ lang: 'en', setLang: () => {} });

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(readStored);
  const setLang = useCallback((next) => {
    if (!LANGUAGES[next]) return;
    setLangState(next);
    try { window.localStorage.setItem(STORAGE_KEY, next); } catch { /* per-device preference only */ }
  }, []);
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  const value = useMemo(() => ({ lang, setLang }), [lang, setLang]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export const useLanguage = () => useContext(LanguageContext);

/** Translate an English string, filling {name} placeholders from `vars`. */
export function translate(lang, text, vars = {}) {
  const template = (lang === 'sw' && SW[text]) || text;
  return template.replace(/\{(\w+)\}/g, (match, key) => (key in vars ? String(vars[key]) : match));
}

export function useT() {
  const { lang } = useContext(LanguageContext);
  return useCallback((text, vars) => translate(lang, text, vars), [lang]);
}

/** English / Kiswahili switch, shown on the sign-in screen and in the header. */
export function LanguageSwitcher({ dark = false }) {
  const { lang, setLang } = useLanguage();
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem', color: dark ? '#cbd5e1' : 'var(--color-text-muted)' }}>
      <span>Language / Lugha</span>
      <select value={lang} onChange={(e) => setLang(e.target.value)} aria-label="Language / Lugha"
        style={{ padding: '0.2rem 0.35rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', fontSize: '0.8rem' }}>
        {Object.entries(LANGUAGES).map(([code, name]) => <option key={code} value={code}>{name}</option>)}
      </select>
    </label>
  );
}
