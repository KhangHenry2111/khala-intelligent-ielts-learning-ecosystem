import { Link } from 'react-router-dom';
import { useLanguage, LanguageSwitcher } from '../i18n/LanguageContext';

export function Topbar({ role, user }) {
  const { t } = useLanguage();
  return (
    <header className="topbar">
      <div className="search-bar">
        <input type="text" placeholder={t('Search...')} />
      </div>
      <div className="topbar-actions">
        <LanguageSwitcher />
        <button className="notification-btn" type="button">🔔</button>
        <Link className="avatar-btn" to={`/${role}/profile`}>
          {(user?.fullName || user?.username || 'U')[0].toUpperCase()}
        </Link>
      </div>
    </header>
  );
}
