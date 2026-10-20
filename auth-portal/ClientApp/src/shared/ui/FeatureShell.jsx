import { useAuth } from '../auth/AuthContext';
import { rankLabel, userRank } from '../lib/roles';
import { useLanguage } from '../i18n/LanguageContext';

export function FeatureShell({ icon, title, description, accessValue, children }) {
  const { user } = useAuth();
  const rank = userRank(user);
  const planName = rankLabel(rank);
  const { language, t } = useLanguage();

  return (
    <div className="user-feature-page">
      <header className="feature-hero glass-card">
        <div className="feature-hero-icon">{icon}</div>
        <div>
          <span className="eyebrow">{t(planName)} {t('plan')}</span>
          <h1>{t(title)}</h1>
          <p>{t(description)}</p>
        </div>
      </header>
      <section className="feature-workspace glass-card">
        <div>
          <span className="eyebrow">{t('Current access')}</span>
          <h2>{t(accessValue)}</h2>
          <p>
            {t('You are currently using benefits from the')} {t(planName)}
            {language === 'en' ? ` ${t('plan')}` : ''}.
          </p>
        </div>
        {children}
      </section>
    </div>
  );
}

export function PlaceholderAction({ label = 'Get started' }) {
  const { t } = useLanguage();
  return (
    <button className="feature-action" type="button">
      {t(label)} <span>→</span>
    </button>
  );
}
