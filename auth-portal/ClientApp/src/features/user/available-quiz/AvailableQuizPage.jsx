import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { quizApi } from '../../../shared/api';

const money = (value) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value || 0);

export function AvailableQuizPage() {
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
          <div><span className="content-detail-eyebrow">LEARNER LIBRARY</span><h1>Available lessons</h1><p>Browse teacher approved IELTS lessons and their question sets. <Link to="/user/dashboard">View membership plans</Link>.</p></div>
          <div className="available-lessons-actions">
            <span className="available-lessons-total">{loading ? 'Loading…' : `${lessons.length} lessons`}</span>
            <button type="button" className="available-lessons-refresh" onClick={() => { setLoading(true); setError(''); setRefreshKey((key) => key + 1); }} disabled={loading}>
              {loading ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        </div>
        {error && <p className="teacher-quiz-notice error" role="alert">{error}</p>}
        {loading ? <p className="content-list-state" role="status">Loading lessons…</p> : !error && lessons.length === 0 ? (
          <div className="available-lessons-empty"><span aria-hidden="true">✦</span><h2>No approved lessons yet</h2><p>New lessons will appear here after a teacher or administrator approves them.</p></div>
        ) : <div className="available-lessons-grid">
          {lessons.map((lesson) => <article className="available-lesson-tile" key={lesson.materialId || lesson.quizId}>
            <div className="available-lesson-topline"><span className="admin-content-skill">{lesson.skill || 'IELTS'}</span><span className="available-lesson-level">{lesson.level || 'All levels'}</span></div>
            <h2>{lesson.title}</h2>
            <p className="available-lesson-description">{lesson.description || 'Practice with this teacher prepared question set.'}</p>
            <div className="available-lesson-details"><span>{lesson.questionCount} questions</span><span>{lesson.teacherName ? `By ${lesson.teacherName}` : 'Teacher lesson'}</span></div>
            <div className="available-lesson-footer"><span className={lesson.isFree ? 'available-lesson-free' : 'available-lesson-price'}>{lesson.isFree ? 'Free' : money(lesson.price)}</span><span>{lesson.createdAt ? new Date(lesson.createdAt).toLocaleDateString() : ''}</span></div>
            {!lesson.isFree && <button type="button" className="secondary-btn" disabled>Buy lesson individually — coming soon</button>}
          </article>)}
        </div>}
      </section>
    </div>
  );
}
