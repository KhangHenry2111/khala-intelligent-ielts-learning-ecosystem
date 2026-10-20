import { StatGroup } from './StatGroup';
import { useLanguage } from '../i18n/LanguageContext';

export function WorkspaceHero({ eyebrow, title, description, stats, className = '' }) {
  const { t } = useLanguage();
  const welcomeName = title.match(/^Welcome, (.+)\.$/);
  return (
    <div className={`dashboard-welcome glass-card ${className}`.trim()}>
      <div>
        <span className="eyebrow">{t(eyebrow)}</span>
        <h1>{welcomeName ? `${t('Welcome,')} ${welcomeName[1]}.` : t(title)}</h1>
        <p>{t(description)}</p>
      </div>
      {stats ? <StatGroup items={stats} /> : null}
    </div>
  );
}
