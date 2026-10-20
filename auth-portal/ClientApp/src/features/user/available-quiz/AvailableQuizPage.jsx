import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { quizApi } from '../../../shared/api';
import { useLanguage } from '../../../shared/i18n/LanguageContext';

const money = (value, language) => new Intl.NumberFormat(language === 'vi' ? 'vi-VN' : 'en-US', { style: 'currency', currency: 'VND' }).format(value || 0);

export function AvailableQuizPage() {
  const { t, language } = useLanguage();
  const navigate = useNavigate();
  const [lessons, setLessons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;
    quizApi.availableLessons()
      .then((result) => { if (active) setLessons(result.items || []); })
      .catch((cause) => { if (active) setError(cause.message || 'Could not load lessons.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [refreshKey]);

  return (
    <div className="dashboard-container">
      <section className="glass-card available-lessons-card">
        <div className="available-lessons-heading">
          <div><span className="content-detail-eyebrow">{t('LEARNER LIBRARY')}</span><h1>{t('Available lessons')}</h1><p>{t('Browse teacher approved IELTS lessons and their question sets.')} <Link to="/user/dashboard">{t('View membership plans')}</Link>.</p></div>
          <div className="available-lessons-actions">
            <span className="available-lessons-total">{loading ? t('Loading…') : `${lessons.length} ${t('lessons')}`}</span>
            <button type="button" className="available-lessons-refresh" onClick={() => { setLoading(true); setError(''); setRefreshKey((key) => key + 1); }} disabled={loading}>
              {loading ? t('Refreshing…') : t('Refresh')}
            </button>
          </div>
        </div>
        {error && <p className="teacher-quiz-notice error" role="alert">{t(error)}</p>}
        {loading ? <p className="content-list-state" role="status">{t('Loading lessons…')}</p> : !error && lessons.length === 0 ? (
          <div className="available-lessons-empty"><span aria-hidden="true">✦</span><h2>{t('No approved lessons yet')}</h2><p>{t('New lessons will appear here after a teacher or administrator approves them.')}</p></div>
        ) : <div className="available-lessons-grid">
          {lessons.map((lesson) => <article className="available-lesson-tile" key={lesson.materialId || lesson.quizId}>
            <div className="available-lesson-topline"><span className="admin-content-skill">{t(lesson.skill || 'IELTS')}</span><span className="available-lesson-level">{t(lesson.level || 'All levels')}</span></div>
            <h2>{lesson.title}</h2>
            <p className="available-lesson-description">{lesson.description || t('Practice with this teacher prepared question set.')}</p>
            <div className="available-lesson-details"><span>{lesson.questionCount} {t('questions')}</span><span>{lesson.teacherName ? `${t('By')} ${lesson.teacherName}` : t('Teacher lesson')}</span></div>
            <div className="available-lesson-footer"><span className={lesson.isFree ? 'available-lesson-free' : 'available-lesson-price'}>{lesson.isFree ? t('Free') : money(lesson.price, language)}</span><span>{lesson.createdAt ? new Date(lesson.createdAt).toLocaleDateString(language === 'vi' ? 'vi-VN' : 'en-US') : ''}</span></div>
            {lesson.isFree && lesson.quizId ? (
              <button type="button" className="secondary-btn" onClick={() => navigate(`/user/quiz/${lesson.quizId}`)}>
                {t('Start quiz')}
              </button>
            ) : <button type="button" className="secondary-btn" disabled>{t('Buy lesson individually — coming soon')}</button>}
          </article>)}
        </div>}
      </section>
    </div>
  );
}
