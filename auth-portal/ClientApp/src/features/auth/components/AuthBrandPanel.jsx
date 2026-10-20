import { useLanguage } from '../../../shared/i18n/LanguageContext';

export function AuthBrandPanel({ title }) {
  const { t } = useLanguage();
  return (
    <aside className="brand-panel">
      <span className="brand-mark">IA</span>
      <p className="eyebrow">IELTS Study Assistant</p>
      <h1>{t('Make progress')}<br /><i>{t('visible.')}</i></h1>
      <p>{t('Focused tools for the next confident step in your English journey.')}</p>
      <div className="orbit-label">{title} {t('workspace')}</div>
    </aside>
  );
}
