import { SectionHead } from '../../../shared/ui/SectionHead';
import { useLanguage } from '../../../shared/i18n/LanguageContext';

export function TeachersPage() {
  const { t } = useLanguage();
  return (
    <div className="dashboard-container">
      <section className="glass-card admin-create-teacher">
        <SectionHead title="Create teacher account" actionLabel="Save account" />
        <div className="teacher-form-grid">
          <label>{t('Full name')}<input type="text" placeholder={t('Enter teacher name')} /></label>
          <label>{t('Email')}<input type="email" placeholder="teacher@ielts.ai" /></label>
          <label>{t('Phone number')}<input type="tel" placeholder="0987 654 321" /></label>
          <label>{t('Specialization')}<input type="text" placeholder={t('Speaking / Writing / General')} /></label>
          <label>{t('Qualification')}<input type="text" placeholder="IELTS 8.5 / CELTA" /></label>
          <label>
            {t('Access level')}
            <select defaultValue="teacher">
              <option value="teacher">{t('Teacher')}</option>
              <option value="editor">{t('Content editor')}</option>
              <option value="reviewer">{t('Reviewer')}</option>
            </select>
          </label>
        </div>
      </section>
    </div>
  );
}
