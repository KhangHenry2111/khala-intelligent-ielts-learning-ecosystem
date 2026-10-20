import { useLanguage } from '../../../../shared/i18n/LanguageContext';

export function SkillPicker({ value, onChange, options = ['Reading', 'Speaking', 'Writing', 'Listening', 'All'] }) {
  const { t } = useLanguage();
  return (
    <div className="skill-picker" role="group" aria-label={t('Select skill')}>
      {options.map((option) => (
        <button
          className={value === option ? 'selected' : ''}
          key={option}
          type="button"
          onClick={() => onChange(option)}
        >
          {t(option)}
        </button>
      ))}
    </div>
  );
}
