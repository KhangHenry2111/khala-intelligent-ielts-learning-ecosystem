import { useState } from 'react';
import { aiQuizApi } from '../../shared/api';

export function AiQuizGenerator({ user }) {
  const [skill, setSkill] = useState('Reading');
  const [difficulty, setDifficulty] = useState('Intermediate');
  const [content, setContent] = useState('');
  const [file, setFile] = useState(null);
  const [quiz, setQuiz] = useState(null);
  const [status, setStatus] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  async function submitQuiz(event) {
    event.preventDefault();
    setIsGenerating(true);
    setStatus('Đang tiếp nhận yêu cầu tạo quiz…');
    setQuiz(null);
    try {
      const payload = file
        ? {
            document: `data:${file.fileType};base64,${file.contentBase64}`,
            input_type: 'image',
            skill: skill === 'All' ? 'All' : skill,
            tier: user?.rank || user?.details?.Rank || 'Bronze',
            user_id: user?.id || null,
          }
        : {
            document: content,
            input_type: 'text',
            skill: skill === 'All' ? 'All' : skill,
            tier: user?.rank || user?.details?.Rank || 'Bronze',
            user_id: user?.id || null,
          };
      const result = await aiQuizApi.generate(payload, user, setStatus);
      setQuiz(result.success ? (result.data?.quiz_preview || result.quiz || null) : null);
      setStatus(result.message || 'Quiz generated and awaiting review.');
    } catch (error) {
      setStatus(error.message);
    } finally {
      setIsGenerating(false);
    }
  }

  async function downloadQuiz(extension) {
    const response = await aiQuizApi.export(quiz, extension);
    if (!response.ok) {
      setStatus('Unable to export the file.');
      return;
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ielts-ai-quiz.${extension}`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function handleFileChange(event) {
    const selected = event.target.files?.[0];
    if (!selected) return;
    const reader = new FileReader();
    reader.onload = () => setFile({
      fileName: selected.name,
      fileType: selected.type || 'text/plain',
      contentBase64: String(reader.result).split(',').pop(),
    });
    reader.readAsDataURL(selected);
  }

  return (
    <>
      <form className="quiz-generator" onSubmit={submitQuiz} aria-busy={isGenerating}>
        <fieldset className="quiz-generator-fields" disabled={isGenerating}>
        <div className="skill-picker" role="group" aria-label="Select skill">
          {['Reading', 'Speaking', 'Writing', 'Listening', 'All'].map((option) => (
            <button
              className={skill === option ? 'selected' : ''}
              key={option}
              type="button"
              onClick={() => setSkill(option)}
            >
              {option}
            </button>
          ))}
        </div>
        <select value={difficulty} onChange={(event) => setDifficulty(event.target.value)} aria-label="Difficulty">
          <option>Beginner</option>
          <option>Intermediate</option>
          <option>Advanced</option>
        </select>
        <input type="file" accept=".txt,.md,.csv,image/*" onChange={handleFileChange} />
        <textarea
          value={content}
          onChange={(event) => setContent(event.target.value)}
          placeholder="Paste IELTS content or upload a file..."
          rows="8"
          required={!file}
        />
        <button className="feature-action" type="submit">
          {isGenerating ? 'Generating quiz...' : 'Generate quiz'} <span>{isGenerating ? '…' : '→'}</span>
        </button>
        </fieldset>
        {status && (
          <p className={`quiz-status${isGenerating ? ' is-loading' : ''}`} role="status" aria-live="polite">
            {isGenerating && <span className="quiz-status-spinner" aria-hidden="true" />}
            {status}
          </p>
        )}
      </form>
      {quiz && (
        <section className="quiz-result glass-card">
          <span className="eyebrow">AI quiz</span>
          <h2>{quiz.Title || quiz.title}</h2>
          {(quiz.Passage?.Content || quiz.passage) && <p className="quiz-passage">{quiz.Passage?.Content || quiz.passage}</p>}
          {quiz.transcript && <p className="quiz-passage"><strong>Transcript:</strong> {quiz.transcript}</p>}
          {(quiz.QuestionGroups?.flatMap((group) => group.Questions || []) || quiz.questions || []).map((question, index) => (
            <article className="quiz-question" key={`${question.content}-${index}`}>
              <strong>{index + 1}. {question.Content || question.content}</strong>
              {(question.Options || question.options || []).map((option) => <div key={option}>{option}</div>)}
              <small>Answer: {question.CorrectAnswer || question.correctAnswer}</small>
            </article>
          ))}
          <div className="quiz-exports">
            <button type="button" onClick={() => downloadQuiz('docx')}>Word</button>
            <button type="button" onClick={() => downloadQuiz('xlsx')}>Excel</button>
          </div>
        </section>
      )}
    </>
  );
}
