import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { quizApi } from '../../../shared/api';
import { useAuth } from '../../../shared/auth/AuthContext';
import { useLanguage } from '../../../shared/i18n/LanguageContext';

function parseOptions(value) {
  if (!value) return [];
  let parsed = value;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value);
    } catch {
      return value.split(/\r?\n/).map((text) => text.trim()).filter(Boolean);
    }
  }
  if (Array.isArray(parsed)) {
    return parsed.map((option, index) => {
      if (typeof option === 'string') {
        const match = option.match(/^([a-z0-9ivx]+)[.)-]\s*(.+)$/i);
        return { value: match ? match[1] : option, label: option };
      }
      const optionValue = option.value ?? option.id ?? option.key ?? option.label ?? String(index + 1);
      const label = option.label ?? option.text ?? option.content ?? String(optionValue);
      return { value: String(optionValue), label: String(label) };
    });
  }
  if (parsed && typeof parsed === 'object') {
    return Object.entries(parsed).map(([valueKey, label]) => ({
      value: valueKey,
      label: typeof label === 'string' ? label : JSON.stringify(label),
    }));
  }
  return [];
}

function questionOptions(question) {
  const options = parseOptions(question.options || question.sharedOptions);
  if (options.length) return options;
  const code = String(question.questionType || '').toUpperCase();
  if (code.includes('TRUE_FALSE')) {
    return ['True', 'False', 'Not Given'].map((value) => ({ value, label: value }));
  }
  if (code.includes('YES_NO')) {
    return ['Yes', 'No', 'Not Given'].map((value) => ({ value, label: value }));
  }
  return [];
}

function formatTime(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const seconds = (totalSeconds % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
}

export function TakeQuizPage() {
  const { quizId } = useParams();
  const { user } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [quiz, setQuiz] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [result, setResult] = useState(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const questionStartedAt = useRef(Date.now());
  const questionTimeById = useRef({});

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    quizApi.playQuiz(quizId, user?.accessToken)
      .then((payload) => {
        if (!active) return;
        setQuiz(payload.quiz);
        setQuestions(payload.questions || []);
        questionStartedAt.current = Date.now();
        questionTimeById.current = {};
        if (!payload.questions?.length) setError('No questions were found for this quiz.');
      })
      .catch((cause) => { if (active) setError(cause.message || 'The quiz could not be loaded.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [quizId, user?.accessToken]);

  useEffect(() => {
    if (loading || result || questions.length === 0) return undefined;
    const timer = window.setInterval(() => setElapsedSeconds((seconds) => seconds + 1), 1000);
    return () => window.clearInterval(timer);
  }, [loading, result, questions.length]);

  const currentQuestion = questions[currentIndex];
  const answeredCount = useMemo(() => Object.values(answers).filter((answer) => {
    if (Array.isArray(answer)) return answer.length > 0;
    return Boolean(String(answer ?? '').trim());
  }).length, [answers]);

  function updateAnswer(question, value) {
    setAnswers((current) => ({ ...current, [question.questionId]: value }));
  }

  function trackQuestionTime() {
    const question = questions[currentIndex];
    if (question) {
      const seconds = Math.max(0, Math.floor((Date.now() - questionStartedAt.current) / 1000));
      questionTimeById.current[question.questionId] = (questionTimeById.current[question.questionId] || 0) + seconds;
    }
    questionStartedAt.current = Date.now();
  }

  function navigateQuestion(nextIndex) {
    trackQuestionTime();
    setCurrentIndex(nextIndex);
  }

  function toggleMultiAnswer(question, optionValue) {
    const selected = Array.isArray(answers[question.questionId]) ? answers[question.questionId] : [];
    updateAnswer(
      question,
      selected.includes(optionValue)
        ? selected.filter((value) => value !== optionValue)
        : [...selected, optionValue],
    );
  }

  async function submitQuiz() {
    if (!window.confirm(t('Finish and submit your answers?'))) return;
    trackQuestionTime();
    setSubmitting(true);
    setError('');
    try {
      const payload = await quizApi.submitAttempt({
        quizId,
        timeTaken: elapsedSeconds,
        answers: questions.map((question) => ({
          questionId: question.questionId,
          answer: Array.isArray(answers[question.questionId])
            ? answers[question.questionId].join(',')
            : answers[question.questionId] || '',
          timeSpent: questionTimeById.current[question.questionId] || 0,
        })),
      }, user?.accessToken);
      setResult(payload);
    } catch (cause) {
      setError(cause.message || t('The quiz could not be loaded.'));
    } finally {
      setSubmitting(false);
    }
  }

  const questionResults = useMemo(() => new Map((result?.results || []).map((item) => [item.questionId, item])), [result]);

  return (
    <div className="take-quiz-page">
      <div className="take-quiz-topline">
        <Link to="/user/available-quiz" className="take-quiz-back">{t('Back to quizzes')}</Link>
        {quiz && !result && <span className="take-quiz-timer">{t('Time elapsed')}: {formatTime(elapsedSeconds)}</span>}
      </div>

      {loading ? <p className="content-list-state" role="status">{t('Loading quiz...')}</p> : error && !quiz ? (
        <section className="glass-card take-quiz-error" role="alert">
          <p>{t(error)}</p>
          <button type="button" className="secondary-btn" onClick={() => navigate('/user/available-quiz')}>
            {t('Back to quizzes')}
          </button>
        </section>
      ) : quiz && result ? (
        <section className="glass-card quiz-result-card">
          <span className="eyebrow">{t('Your result')}</span>
          <h1>{quiz.title}</h1>
          <div className="quiz-result-score">
            <strong>{Math.round(result.score)}%</strong>
            <span>{result.correctCount} {t('correct')} {t('of')} {result.totalQuestions} {t('questions')}</span>
          </div>
          <p className="quiz-result-time">{t('Time elapsed')}: {formatTime(result.timeTaken)}</p>
          <div className="quiz-review-list">
            {questions.map((question, index) => {
              const answerResult = questionResults.get(question.questionId);
              return (
                <article className={`quiz-review-item ${answerResult?.isCorrect ? 'correct' : 'incorrect'}`} key={question.questionId}>
                  <h2>{t('Question')} {index + 1}: {question.content}</h2>
                  <p><strong>{t('Your answer')}:</strong> {answerResult?.answer || t('No answer')}</p>
                  <p><strong>{t('Correct answer')}:</strong> {answerResult?.correctAnswer || '—'}</p>
                  {answerResult?.explanation && <p><strong>{t('Explanation')}:</strong> {answerResult.explanation}</p>}
                </article>
              );
            })}
          </div>
          <div className="quiz-result-actions">
            <button type="button" className="secondary-btn" onClick={() => navigate('/user/available-quiz')}>
              {t('Back to quizzes')}
            </button>
            <button type="button" className="primary-btn" onClick={() => window.location.reload()}>
              {t('Retake quiz')}
            </button>
          </div>
        </section>
      ) : quiz && currentQuestion ? (
        <section className="glass-card take-quiz-card">
          <header className="take-quiz-heading">
            <div>
              <span className="eyebrow">{t(quiz.skill)} · {t(quiz.level)}</span>
              <h1>{quiz.title}</h1>
            </div>
            <span className="take-quiz-progress">{t('Progress')}: {answeredCount}/{questions.length}</span>
          </header>

          {quiz.passageContent && (
            <section className="take-quiz-passage">
              <h2>{quiz.passageTitle || t('Reading passage')}</h2>
              <p>{quiz.passageContent}</p>
            </section>
          )}
          {quiz.audioUrl && (
            <section className="take-quiz-audio">
              <h2>{t('Listening audio')}</h2>
              <audio controls preload="metadata" src={quiz.audioUrl}>{t('Listening audio')}</audio>
              {quiz.transcript && <details><summary>{t('Show transcript')}</summary><p>{quiz.transcript}</p></details>}
            </section>
          )}

          <article className="take-quiz-question">
            <div className="take-quiz-question-count">{t('Question')} {currentIndex + 1} {t('of')} {questions.length}</div>
            {currentQuestion.instruction && <p className="take-quiz-instruction">{currentQuestion.instruction}</p>}
            {currentQuestion.wordLimit && <p className="take-quiz-instruction">{currentQuestion.wordLimit}</p>}
            <h2>{currentQuestion.content}</h2>
            {questionOptions(currentQuestion).length > 0 ? (
              <div className="take-quiz-options">
                {questionOptions(currentQuestion).map((option) => {
                  const multiple = /MULTIPLE_CHOICE_MULTI|MULTIPLE_ANSWER|MULTIPLE_SELECT|CHECKBOX/.test(String(currentQuestion.questionType).toUpperCase());
                  const selected = multiple
                    ? (answers[currentQuestion.questionId] || []).includes(option.value)
                    : answers[currentQuestion.questionId] === option.value;
                  return (
                    <label className={`take-quiz-option ${selected ? 'selected' : ''}`} key={option.value}>
                      <input
                        type={multiple ? 'checkbox' : 'radio'}
                        name={currentQuestion.questionId}
                        checked={selected}
                        onChange={() => multiple
                          ? toggleMultiAnswer(currentQuestion, option.value)
                          : updateAnswer(currentQuestion, option.value)}
                      />
                      <span>{t(option.label)}</span>
                    </label>
                  );
                })}
              </div>
            ) : (
              <label className="take-quiz-short-answer">
                <span>{t('Your answer')}</span>
                <input
                  type="text"
                  value={answers[currentQuestion.questionId] || ''}
                  onChange={(event) => updateAnswer(currentQuestion, event.target.value)}
                  placeholder={t('Enter your answer')}
                />
              </label>
            )}
          </article>

          {error && <p className="teacher-quiz-notice error" role="alert">{t(error)}</p>}
          <footer className="take-quiz-footer">
            <button
              type="button"
              className="secondary-btn"
              disabled={currentIndex === 0 || submitting}
              onClick={() => navigateQuestion(currentIndex - 1)}
            >
              {t('Previous question')}
            </button>
            {currentIndex < questions.length - 1 ? (
              <button type="button" className="primary-btn" onClick={() => navigateQuestion(currentIndex + 1)}>
                {t('Next question')}
              </button>
            ) : (
              <button type="button" className="primary-btn" disabled={submitting} onClick={submitQuiz}>
                {submitting ? t('Submitting...') : t('Submit quiz')}
              </button>
            )}
          </footer>
        </section>
      ) : null}
    </div>
  );
}
