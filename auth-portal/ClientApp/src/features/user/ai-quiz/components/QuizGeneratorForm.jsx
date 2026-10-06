import { SkillPicker } from './SkillPicker';
import { getQuestionTypesForSkill } from '../../../teacher/lessons/questionTypes';

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
  const questionTypes = getQuestionTypesForSkill(skill);
  const selectedQuestionType = questionTypes.find(({ code }) => code === questionType) || questionTypes[0];

  return (
    <form className="quiz-generator" onSubmit={onSubmit}>
      <SkillPicker value={skill} onChange={onSkillChange} />
      {questionTypes.length > 0 && <>
        <label htmlFor="ai-quiz-question-type">IELTS question type</label>
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
      <select value={difficulty} onChange={(event) => onDifficultyChange(event.target.value)} aria-label="Difficulty">
        <option>Beginner</option>
        <option>Intermediate</option>
        <option>Advanced</option>
      </select>
      <input type="file" accept=".txt,.md,.csv,image/*" onChange={onFileChange} />
      <textarea
        value={content}
        onChange={(event) => onContentChange(event.target.value)}
        placeholder="Paste IELTS content or upload a file..."
        rows="8"
        required={!file}
      />
      <button className="feature-action" type="submit">Generate quiz <span>→</span></button>
      {status ? <p className="quiz-status" role="status">{status}</p> : null}
    </form>
  );
}
