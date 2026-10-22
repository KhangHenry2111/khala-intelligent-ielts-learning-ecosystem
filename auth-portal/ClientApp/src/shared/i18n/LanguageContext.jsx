import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { messages as english } from './locales/EN/index.js';
import { messages as vietnamese } from './locales/VI/index.js';

const languageStorageKey = 'ielts.ui.language';

const LanguageContext = createContext(null);

function getInitialLanguage() {
  try {
    return localStorage.getItem(languageStorageKey) === 'en' ? 'en' : 'vi';
  } catch {
    return 'vi';
  }
}

export function LanguageProvider({ children }) {
  const [language, setLanguage] = useState(getInitialLanguage);

  useEffect(() => {
    document.documentElement.lang = language;
    try {
      localStorage.setItem(languageStorageKey, language);
    } catch {
      // Language switching still works for this page when storage is unavailable.
    }
  }, [language]);

  const t = useCallback((text) => {
    const value = String(text ?? '');
    if (language !== 'vi') return english[value] || value;
    const quota = value.match(/^(\d+) per month$/);
    if (quota) return `${quota[1]} ${vietnamese['per month']}`;
    const levelTest = value.match(/^Start (.+) level test$/);
    if (levelTest) return `Bắt đầu kiểm tra trình độ ${vietnamese[levelTest[1]] || levelTest[1]}`;
    return vietnamese[value] || value;
  }, [language]);

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error('useLanguage must be used inside LanguageProvider.');
  return context;
}

export function LanguageSwitcher() {
  const { language, setLanguage } = useLanguage();
  const nextLanguage = language === 'vi' ? 'en' : 'vi';
  return (
    <button
      className="language-switcher"
      type="button"
      onClick={() => setLanguage(nextLanguage)}
      aria-label={language === 'vi' ? 'Switch language to English' : 'Chuyển ngôn ngữ sang tiếng Việt'}
      title={language === 'vi' ? 'Switch to English' : 'Chuyển sang tiếng Việt'}
    >
      <span aria-hidden="true">◎</span>
      {language === 'vi' ? 'English' : 'Tiếng Việt'}
    </button>
  );
}
