import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SectionHead } from '../../../shared/ui/SectionHead';
import { quizApi } from '../../../shared/api';
import { useAuth } from '../../../shared/auth/AuthContext';
import { lessonList as defaultLessons } from '../data';

const STORAGE_KEY = 'teacher.lesson.list';

function readStoredLessons() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultLessons;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length ? parsed : defaultLessons;
  } catch {
    return defaultLessons;
  }
}

export function LessonsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [lessons, setLessons] = useState(defaultLessons);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let active = true;
    quizApi.teacherLessons(user?.accessToken)
      .then((payload) => {
        if (!active) return;
        const savedLessons = (payload.items || []).map((item) => ({
          ...item,
          type: item.skill,
          price: item.isFree ? 'Free' : `${item.price}`,
          updated: new Date(item.createdAt).toLocaleDateString(),
        }));
        setLessons([...savedLessons, ...readStoredLessons()]);
      })
      .catch((error) => {
        if (!active) return;
        setLessons(readStoredLessons());
        setLoadError(error.message || 'Could not load saved lessons.');
      });
    return () => { active = false; };
  }, [user?.accessToken]);

  return (
    <div className="dashboard-container">
      <section className="glass-card">
        <SectionHead title="Lesson management" actionLabel="Upload" onAction={() => navigate('/teacher/upload-lesson')} />
        {loadError && <p className="teacher-quiz-notice error" role="status">{loadError}</p>}
        <div className="list-stack">
          {lessons.map((lesson) => (
            <div key={lesson.title + lesson.updated} className="info-list-item lesson-item">
              <div>
                <h3>{lesson.title}</h3>
                  <p>{lesson.type}{lesson.level ? ` · ${lesson.level}` : ''}{lesson.questionCount ? ` · ${lesson.questionCount} questions` : ''}</p>
              </div>
              <div className="list-meta lesson-meta">
                <span className="pricing-badge">{lesson.price}</span>
                <small>{lesson.updated}</small>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
