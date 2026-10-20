import { useLanguage } from '../i18n/LanguageContext';

export function StatGroup({ items }) {
  const { t } = useLanguage();
  return (
    <div className="mini-stat-group">
      {items.map((item) => (
        <div key={item.label} className="mini-stat-card">
          <span className="label">{t(item.label)}</span>
          <strong className={item.tone === 'warning' ? 'warning' : item.tone === 'danger' ? 'danger' : ''}>
            {item.value}
          </strong>
        </div>
      ))}
    </div>
  );
}
