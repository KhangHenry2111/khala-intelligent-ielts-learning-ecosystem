import { SkillPicker } from './SkillPicker';
import { useLanguage } from '../../../../shared/i18n/LanguageContext';

export function QuizGeneratorForm({
  skill,
  generationMode,
  difficulty,
  content,
  status,
  isGenerating,
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
    <form className="quiz-generator" onSubmit={onSubmit} aria-busy={isGenerating}>
      <fieldset className="quiz-generator-fields" disabled={isGenerating}>
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
        <button className="feature-action" type="submit">
          {t(isGenerating ? 'Generating quiz...' : 'Generate quiz')}
          <span aria-hidden="true">{isGenerating ? '…' : '→'}</span>
        </button>
      </fieldset>
      {status ? (
        <p className={`quiz-status${isGenerating ? ' is-loading' : ''}`} role="status" aria-live="polite" aria-atomic="true">
          {isGenerating ? <span className="quiz-status-spinner" aria-hidden="true" /> : null}
          {t(status)}
        </p>
      ) : null}
    </form>
  );
}
