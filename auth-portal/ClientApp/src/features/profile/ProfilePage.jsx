import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../shared/auth/AuthContext';
import { normalizeRole } from '../../shared/lib/roles';
import { useLanguage } from '../../shared/i18n/LanguageContext';

export function ProfilePage() {
  const { t } = useLanguage();
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const details = user.details || {};
  const role = normalizeRole(user.userType);

  return (
    <main className="profile-page">
      <Link className="back-link" to={`/${role}/dashboard`}>← {t('Back to dashboard')}</Link>
      <section className="profile-card">
        <div className="profile-intro">
          <div className="profile-avatar">{(user.fullName || user.username)[0].toUpperCase()}</div>
          <div>
            <span className="eyebrow">{t('Account profile')}</span>
            <h1>{user.fullName || user.username}</h1>
            <p>{user.email}</p>
          </div>
        </div>
        <div className="details">
          <h2>{t('Your details')}</h2>
          {Object.entries({ Username: user.username, Role: user.userType, ...details }).map(([key, value]) => (
            <div key={key}>
              <span>{t(key)}</span>
              <strong>{t(String(value ?? 'Not set'))}</strong>
            </div>
          ))}
        </div>
        <button
          className="quiet-button"
          onClick={() => {
            signOut();
            navigate(`/${role}/login`);
          }}
        >
          {t('Log out')}
        </button>
      </section>
    </main>
  );
}
