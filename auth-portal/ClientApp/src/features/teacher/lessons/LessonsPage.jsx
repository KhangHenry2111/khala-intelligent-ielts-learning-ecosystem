import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SectionHead } from '../../../shared/ui/SectionHead';
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
  const [lessons, setLessons] = useState(defaultLessons);

  useEffect(() => {
    setLessons(readStoredLessons());
  }, []);

  return (
    <div className="dashboard-container">
      <section className="glass-card">
        <SectionHead title="Lesson management" actionLabel="Upload" onAction={() => navigate('/teacher/upload-lesson')} />
        <div className="list-stack">
          {lessons.map((lesson) => (
            <div key={lesson.title + lesson.updated} className="info-list-item lesson-item">
              <div>
                <h3>{lesson.title}</h3>
                <p>{lesson.type}</p>
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
