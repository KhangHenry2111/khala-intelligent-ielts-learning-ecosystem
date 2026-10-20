import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SectionHead } from '../../../shared/ui/SectionHead';
import { quizApi } from '../../../shared/api';
import { useAuth } from '../../../shared/auth/AuthContext';
import { useLanguage } from '../../../shared/i18n/LanguageContext';

export function LessonsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t } = useLanguage();
  const [lessons, setLessons] = useState([]);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let active = true;
    quizApi.teacherLessons(user?.accessToken)
      .then((payload) => {
        if (!active) return;
        const savedLessons = (payload.items || []).map((item) => ({
          ...item,
          type: item.skill,
          price: item.isFree ? t('Free') : new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(item.price || 0),
          updated: item.createdAt ? new Date(item.createdAt).toLocaleDateString() : '—',
        }));
        setLessons(savedLessons);
      })
      .catch((error) => {
        if (!active) return;
        setLessons([]);
        setLoadError(t(error.message || 'Could not load saved lessons.'));
      });
    return () => { active = false; };
  }, [user?.accessToken, t]);

  async function updateStatus(lesson, status) {
    try {
      await quizApi.updateMaterialStatus(lesson.materialId, status, user?.accessToken);
      setLessons((items) => items.map((item) => item.materialId === lesson.materialId ? { ...item, status } : item));
    } catch (error) { setLoadError(t(error.message || 'Could not update lesson status.')); }
  }

  async function deleteLesson(lesson) {
    if (!lesson.quizId || !window.confirm(`${t('Delete')} “${lesson.title}”?`)) return;
    try {
      await quizApi.deleteQuiz(lesson.quizId, user?.accessToken);
      setLessons((items) => items.filter((item) => item.materialId !== lesson.materialId));
    } catch (error) { setLoadError(t(error.message || 'Could not delete lesson.')); }
  }

  return (
    <div className="dashboard-container">
      <section className="glass-card">
        <SectionHead title="Lesson management" actionLabel="Upload" onAction={() => navigate('/teacher/upload-lesson')} />
        {loadError && <p className="teacher-quiz-notice error" role="status">{t(loadError)}</p>}
        <div className="list-stack">
          {lessons.map((lesson) => (
            <div key={lesson.materialId} className="info-list-item lesson-item">
              <div>
                <h3>{lesson.title}</h3>
                <p>{t(lesson.type || 'Lesson')}{lesson.level ? ` · ${t(lesson.level)}` : ''} · {lesson.questionCount ?? 0} {t('questions')}</p>
              </div>
              <div className="list-meta lesson-meta">
                <span className="pricing-badge">{lesson.price}</span>
                <small>{lesson.updated}</small>
                <select aria-label={`${t('Status for')} ${lesson.title}`} value={lesson.status || 'Pending'} onChange={(event) => updateStatus(lesson, event.target.value)}>
                  {['Pending', 'Approved', 'Rejected'].map((status) => <option key={status} value={status}>{t(status)}</option>)}
                </select>
                {lesson.quizId && <button type="button" className="button-danger" onClick={() => deleteLesson(lesson)}>{t('Delete')}</button>}
              </div>
            </div>
          ))}
          {!lessons.length && !loadError && <p className="content-list-state">{t('No lessons yet. Upload a lesson to see its quiz and status here.')}</p>}
        </div>
      </section>
    </div>
  );
}
