import { Link } from 'react-router-dom';
import { useLanguage, LanguageSwitcher } from '../i18n/LanguageContext';
import { useTheme } from '../ui/ThemeContext';

export function Topbar({ role, user, onMenuToggle, menuOpen }) {
  const { t } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  return (
    <header className="topbar">
      <button className="menu-toggle" type="button" onClick={onMenuToggle} aria-label={menuOpen ? t('Close navigation') : t('Open navigation')} aria-expanded={menuOpen}>
        <span aria-hidden="true">{menuOpen ? '×' : '☰'}</span>
      </button>
      <div className="search-bar">
        <input type="text" placeholder={t('Search...')} />
      </div>
      <div className="topbar-actions">
        <LanguageSwitcher />
        <button className="theme-switcher" type="button" onClick={toggleTheme} aria-label={theme === 'dark' ? t('Switch to light mode') : t('Switch to dark mode')} title={theme === 'dark' ? t('Switch to light mode') : t('Switch to dark mode')}>
          <span aria-hidden="true">{theme === 'dark' ? '☼' : '◐'}</span>
          <span className="theme-switcher-label">{theme === 'dark' ? t('Light') : t('Dark')}</span>
        </button>
        <button className="notification-btn" type="button">🔔</button>
        <Link className="avatar-btn" to={`/${role}/profile`}>
          {(user?.fullName || user?.username || 'U')[0].toUpperCase()}
        </Link>
      </div>
    </header>
  );
}
