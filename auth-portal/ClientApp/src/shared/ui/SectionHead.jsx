import { useLanguage } from '../i18n/LanguageContext';

export function SectionHead({ title, actionLabel, onAction }) {
  const { t } = useLanguage();
  return (
    <div className="section-head">
      <h2>{t(title)}</h2>
      {actionLabel ? (
        <button type="button" className="link-btn" onClick={onAction}>
          {t(actionLabel)}
        </button>
      ) : null}
    </div>
  );
}
