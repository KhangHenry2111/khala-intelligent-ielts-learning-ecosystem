import { SkillPicker } from './SkillPicker';

export function QuizGeneratorForm({
  skill,
  difficulty,
  content,
  status,
  file,
  onSkillChange,
  onDifficultyChange,
  onContentChange,
  onFileChange,
  onSubmit,
}) {
  return (
    <form className="quiz-generator" onSubmit={onSubmit}>
      <SkillPicker value={skill} onChange={onSkillChange} />
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
