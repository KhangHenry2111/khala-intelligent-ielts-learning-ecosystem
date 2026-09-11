import { useState } from 'react';
import { aiQuizApi } from '../../app/api';

export function AiQuizGenerator({ user }) {
  const [skill, setSkill] = useState('Reading');
  const [difficulty, setDifficulty] = useState('Intermediate');
  const [content, setContent] = useState('');
  const [file, setFile] = useState(null);
  const [quiz, setQuiz] = useState(null);
  const [status, setStatus] = useState('');

  async function submitQuiz(event) {
    event.preventDefault();
    setStatus('Đang kiểm tra tài liệu và tạo quiz...');
    setQuiz(null);
    try {
      const payload = file
        ? {
            document: `data:${file.fileType};base64,${file.contentBase64}`,
            input_type: 'image',
            skill: skill === 'Toàn bộ' ? 'All' : skill,
            tier: user?.rank || user?.details?.Rank || 'Bronze',
            user_id: user?.id || null,
          }
        : {
            document: content,
            input_type: 'text',
            skill: skill === 'Toàn bộ' ? 'All' : skill,
            tier: user?.rank || user?.details?.Rank || 'Bronze',
            user_id: user?.id || null,
          };
      const result = await aiQuizApi.generate(
        payload,
        user
      );
      setQuiz(result.quiz);
      setStatus('Quiz đã tạo và đang chờ kiểm duyệt.');
    } catch (error) {
      setStatus(error.message);
    }
  }

  async function downloadQuiz(extension) {
    const response = await aiQuizApi.export(quiz, extension);
    if (!response.ok) {
      setStatus('Không thể xuất file.');
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
      <form className="quiz-generator" onSubmit={submitQuiz}>
        <div className="skill-picker" role="group" aria-label="Chọn kỹ năng">
          {['Reading', 'Speaking', 'Writing', 'Listening', 'Toàn bộ'].map((option) => (
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
        <select value={difficulty} onChange={(event) => setDifficulty(event.target.value)} aria-label="Độ khó">
          <option>Beginner</option>
          <option>Intermediate</option>
          <option>Advanced</option>
        </select>
        <input type="file" accept=".txt,.md,.csv,image/*" onChange={handleFileChange} />
        <textarea
          value={content}
          onChange={(event) => setContent(event.target.value)}
          placeholder="Dán tài liệu IELTS hoặc chọn file..."
          rows="8"
          required={!file}
        />
        <button className="feature-action" type="submit">Tạo quiz <span>→</span></button>
        {status && <p className="quiz-status" role="status">{status}</p>}
      </form>
      {quiz && (
        <section className="quiz-result glass-card">
          <span className="eyebrow">AI quiz</span>
          <h2>{quiz.title}</h2>
          {quiz.passage && <p className="quiz-passage">{quiz.passage}</p>}
          {quiz.transcript && <p className="quiz-passage"><strong>Transcript:</strong> {quiz.transcript}</p>}
          {quiz.questions?.map((question, index) => (
            <article className="quiz-question" key={`${question.content}-${index}`}>
              <strong>{index + 1}. {question.content}</strong>
              {question.options?.map((option) => <div key={option}>{option}</div>)}
              <small>Đáp án: {question.correctAnswer}</small>
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
