import { SkillPicker } from './SkillPicker';
import { getQuestionTypesForSkill } from '../../../teacher/lessons/questionTypes';
import { useLanguage } from '../../../../shared/i18n/LanguageContext';

export function QuizGeneratorForm({
  skill,
  questionType,
  difficulty,
  content,
  status,
  file,
  onSkillChange,
  onQuestionTypeChange,
  onDifficultyChange,
  onContentChange,
  onFileChange,
  onSubmit,
}) {
  const { t } = useLanguage();
  const questionTypes = getQuestionTypesForSkill(skill);
  const selectedQuestionType = questionTypes.find(({ code }) => code === questionType) || questionTypes[0];

  return (
    <form className="quiz-generator" onSubmit={onSubmit}>
      <SkillPicker value={skill} onChange={onSkillChange} />
      {questionTypes.length > 0 && <>
        <label htmlFor="ai-quiz-question-type">{t('IELTS question type')}</label>
        <select
          id="ai-quiz-question-type"
          aria-describedby="ai-quiz-question-type-description"
          value={selectedQuestionType?.code || ''}
          onChange={(event) => onQuestionTypeChange(event.target.value)}
        >
          {questionTypes.map(({ code, label }) => <option value={code} key={code}>{label}</option>)}
        </select>
        {selectedQuestionType && <small id="ai-quiz-question-type-description" className="question-type-description">{selectedQuestionType.description}</small>}
      </>}
      <select value={difficulty} onChange={(event) => onDifficultyChange(event.target.value)} aria-label={t('Difficulty')}>
        <option value="Beginner">{t('Beginner')}</option>
        <option value="Intermediate">{t('Intermediate')}</option>
        <option value="Advanced">{t('Advanced')}</option>
      </select>
      <input type="file" accept=".txt,.md,.csv,image/*" onChange={onFileChange} />
      <textarea
        value={content}
        onChange={(event) => onContentChange(event.target.value)}
        placeholder={t('Paste IELTS content or upload a file...')}
        rows="8"
        required={!file}
      />
      <button className="feature-action" type="submit">{t('Generate quiz')} <span>→</span></button>
      {status ? <p className="quiz-status" role="status">{t(status)}</p> : null}
    </form>
  );
}
