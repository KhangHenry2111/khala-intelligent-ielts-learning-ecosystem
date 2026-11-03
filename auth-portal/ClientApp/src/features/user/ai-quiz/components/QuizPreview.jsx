import { useLanguage } from '../../../../shared/i18n/LanguageContext';

function getQuestionGroups(quiz) {
  const groups = quiz?.QuestionGroups || quiz?.questionGroups;
  if (Array.isArray(groups) && groups.length) return groups;
  if (Array.isArray(quiz?.questions)) return [{ Questions: quiz.questions }];
  return [];
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

export function QuizPreview({ quiz, onClose, onExport }) {
  const { t } = useLanguage();
  if (!quiz) return null;

  const title = quiz.title || quiz.Title || t('AI Generated Quiz');
  const passage = quiz.passage || quiz.Passage?.Content;
  const transcript = quiz.transcript || quiz.ListeningSection?.Transcript;
  const groups = getQuestionGroups(quiz);
  let questionNumber = 0;

  return (
    <section className="quiz-fullscreen" role="dialog" aria-modal="true" aria-labelledby="ai-quiz-result-title">
      <div className="quiz-fullscreen-content">
        <header className="quiz-fullscreen-header">
          <div>
            <span className="eyebrow">{t('AI quiz')}</span>
            <h1 id="ai-quiz-result-title">{title}</h1>
          </div>
          <button className="quiz-close" type="button" onClick={onClose}>
            {t('Back to generator')}
          </button>
        </header>
        {passage ? <p className="quiz-passage">{passage}</p> : null}
        {transcript ? <p className="quiz-passage"><strong>{t('Transcript')}:</strong> {transcript}</p> : null}
        {groups.map((group, groupIndex) => {
          const questions = group.Questions || group.questions || [];
          const typeCode = group.QuestionTypeCode || group.questionTypeCode;
          return (
            <section className="quiz-question-stream" key={`${typeCode || 'stream'}-${groupIndex}`}>
              {typeCode && <h2>{t(typeCode.replaceAll('_', ' '))} · {questions.length}</h2>}
              {group.Instruction && <p className="question-type-description">{group.Instruction}</p>}
              {questions.map((question, index) => {
                questionNumber += 1;
                return (
                  <article className="quiz-question" key={`${question.Content || question.content}-${index}`}>
                    <strong>{questionNumber}. {question.content || question.Content}</strong>
                    {parseOptions(question.options || question.Options).map((option) => (
                      <div key={option}>{option}</div>
                    ))}
                    <small>{t('Answer')}: {question.correctAnswer || question.CorrectAnswer || '—'}</small>
                  </article>
                );
              })}
            </section>
          );
        })}
        <div className="quiz-exports">
          <button type="button" onClick={() => onExport('docx')}>Word</button>
          <button type="button" onClick={() => onExport('xlsx')}>Excel</button>
        </div>
      </div>
    </section>
  );
}
