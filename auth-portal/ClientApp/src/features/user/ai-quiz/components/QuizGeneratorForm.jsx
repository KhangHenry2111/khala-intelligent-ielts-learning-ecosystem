import { SkillPicker } from './SkillPicker';
import { useLanguage } from '../../../../shared/i18n/LanguageContext';

export function QuizGeneratorForm({
  skill,
  generationMode,
  difficulty,
  content,
  status,
  file,
  onSkillChange,
  onGenerationModeChange,
  onDifficultyChange,
  onContentChange,
  onFileChange,
  onSubmit,
}) {
  const { t } = useLanguage();

  return (
    <form className="quiz-generator" onSubmit={onSubmit}>
      <SkillPicker value={skill} onChange={onSkillChange} options={['Reading', 'Listening']} />
      <div className="skill-picker" role="group" aria-label={t('Source mode')}>
        {[
          { value: 'topic', label: t('Generate from topic') },
          { value: 'source', label: t('Use source material') },
        ].map((option) => (
          <button
            className={generationMode === option.value ? 'selected' : ''}
            key={option.value}
            type="button"
            onClick={() => onGenerationModeChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
      <select value={difficulty} onChange={(event) => onDifficultyChange(event.target.value)} aria-label={t('Difficulty')}>
        <option value="Beginner">{t('Beginner')}</option>
        <option value="Intermediate">{t('Intermediate')}</option>
        <option value="Advanced">{t('Advanced')}</option>
      </select>
      {generationMode === 'source' && <input type="file" accept=".txt,.md,.csv,image/*" onChange={onFileChange} />}
      <textarea
        value={content}
        onChange={(event) => onContentChange(event.target.value)}
        placeholder={t(generationMode === 'topic' ? 'Enter a topic for your IELTS practice set...' : 'Paste source material or upload a file...')}
        rows="8"
        required={!file}
      />
      <button className="feature-action" type="submit">{t('Generate quiz')} <span>→</span></button>
      {status ? <p className="quiz-status" role="status">{t(status)}</p> : null}
    </form>
  );
}
