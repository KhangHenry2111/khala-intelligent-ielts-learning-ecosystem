function flattenQuestions(quiz) {
  if (quiz?.questions) return quiz.questions;
  const groups = quiz?.QuestionGroups || quiz?.questionGroups || [];
  return groups.flatMap((group) => group.Questions || group.questions || []);
}

function parseOptions(options) {
  if (Array.isArray(options)) return options;
  if (typeof options === 'string' && options.trim()) {
    try {
      const parsed = JSON.parse(options);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      return options.split('\n').filter(Boolean);
    }
  }
  return [];
}

export function QuizPreview({ quiz, onExport }) {
  const { t } = useLanguage();
  if (!quiz) return null;

  const title = quiz.title || quiz.Title || t('AI Generated Quiz');
  const passage = quiz.passage || quiz.Passage?.Content;
  const transcript = quiz.transcript || quiz.ListeningSection?.Transcript;
  const questions = flattenQuestions(quiz);

  return (
    <section className="quiz-result glass-card">
      <span className="eyebrow">{t('AI quiz')}</span>
      <h2>{title}</h2>
      {passage ? <p className="quiz-passage">{passage}</p> : null}
      {transcript ? <p className="quiz-passage"><strong>{t('Transcript')}:</strong> {transcript}</p> : null}
      {questions.map((question, index) => (
        <article className="quiz-question" key={`${question.Content || question.content}-${index}`}>
          <strong>{index + 1}. {question.content || question.Content}</strong>
          {parseOptions(question.options || question.Options).map((option) => (
            <div key={option}>{option}</div>
          ))}
          <small>{t('Answer')}: {question.correctAnswer || question.CorrectAnswer || '—'}</small>
        </article>
      ))}
      <div className="quiz-exports">
        <button type="button" onClick={() => onExport('docx')}>Word</button>
        <button type="button" onClick={() => onExport('xlsx')}>Excel</button>
      </div>
    </section>
  );
}
import { useLanguage } from '../../../../shared/i18n/LanguageContext';
