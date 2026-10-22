import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { quizApi } from '../../../shared/api';
import { useAuth } from '../../../shared/auth/AuthContext';
import { useLanguage } from '../../../shared/i18n/LanguageContext';

function formatDuration(value, t) {
  const minutes = Math.floor((value || 0) / 60);
  const seconds = (value || 0) % 60;
  return minutes
    ? `${minutes} ${t('minutes')} ${seconds} ${t('seconds')}`
    : `${seconds} ${t('seconds')}`;
}

export function ResultsPage() {
  const { user } = useAuth();
  const { t, language } = useLanguage();
  const [attempts, setAttempts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    quizApi.myAttempts(user?.accessToken)
      .then((payload) => { if (active) setAttempts(payload.items || []); })
      .catch((cause) => { if (active) setError(cause.message || 'Could not load quiz results.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [user?.accessToken]);

  return (
    <div className="dashboard-container">
      <section className="glass-card learner-results-card">
        <header className="learner-results-heading">
          <div>
            <span className="eyebrow">{t('Practice history')}</span>
            <h1>{t('Quiz results')}</h1>
            <p>{t('Review your past quiz scores and continue practicing.')}</p>
          </div>
          <Link className="feature-action" to="/user/available-quiz">{t('Browse quizzes')}</Link>
        </header>
        {error && <p className="teacher-quiz-notice error" role="alert">{t(error)}</p>}
        {loading ? <p className="content-list-state" role="status">{t('Loading quiz results…')}</p> : !error && attempts.length === 0 ? (
          <div className="available-lessons-empty">
            <span aria-hidden="true">✦</span>
            <h2>{t('No quiz attempts yet')}</h2>
            <p>{t('Take an available quiz to see your score and answers here.')}</p>
            <Link className="feature-action" to="/user/available-quiz">{t('Find a quiz')}</Link>
          </div>
        ) : <div className="learner-attempt-list">
          {attempts.map((attempt) => (
            <article className="learner-attempt-item" key={attempt.attemptId}>
              <div className="learner-attempt-copy">
                <span className="admin-content-skill">{t(attempt.skill)}</span>
                <h2>{attempt.title}</h2>
                <p className="learner-attempt-date">
                  {attempt.submittedAt ? (
                    <time dateTime={attempt.submittedAt}>
                      {new Date(attempt.submittedAt).toLocaleString(language === 'vi' ? 'vi-VN' : 'en-US')}
                    </time>
                  ) : '—'}
                </p>
              </div>
              <div className="learner-attempt-stats">
                <div className="learner-attempt-stat learner-attempt-score">
                  <span>{t('Quiz score')}</span>
                  <strong>{Math.round(attempt.score)}%</strong>
                </div>
                <div className="learner-attempt-stat">
                  <span>{t('Correct answers')}</span>
                  <strong>{attempt.correctCount}/{attempt.totalQuestions}</strong>
                </div>
                <div className="learner-attempt-stat">
                  <span>{t('Time spent')}</span>
                  <strong>{formatDuration(attempt.timeTaken, t)}</strong>
                </div>
              </div>
              <Link className="learner-attempt-retry" to={`/user/quiz/${attempt.quizId}`}>
                {t('Retake quiz')} <span aria-hidden="true">→</span>
              </Link>
            </article>
          ))}
        </div>}
      </section>
    </div>
  );
}
