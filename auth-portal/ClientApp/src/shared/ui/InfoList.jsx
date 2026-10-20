import { useLanguage } from '../i18n/LanguageContext';

export function InfoList({ items, className = 'list-stack' }) {
  const { t } = useLanguage();
  return (
    <div className={className}>
      {items.map((item) => (
        <div key={item.id || item.title || item.name} className="info-list-item">
          <div>
            <h3>{t(item.title || item.name)}</h3>
            <p>{t(item.subtitle)}</p>
          </div>
          <div className="list-meta">
            {item.badge ? <span className={`status-badge ${item.badgeClass || ''}`}>{t(item.badge)}</span> : null}
            {item.meta ? <small>{t(item.meta)}</small> : null}
          </div>
        </div>
      ))}
    </div>
  );
}
