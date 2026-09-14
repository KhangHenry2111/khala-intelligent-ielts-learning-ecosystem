import { useState } from 'react';
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

export function UploadLessonPage() {
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [type, setType] = useState('Writing');
  const [price, setPrice] = useState('Free');
  const [description, setDescription] = useState('');

  const handleSubmit = (event) => {
    event.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;

    const nextLesson = {
      title: trimmedTitle,
      type,
      price,
      updated: 'Just now',
      description: description.trim() || 'New lesson uploaded by teacher',
    };

    const currentLessons = readStoredLessons();
    localStorage.setItem(STORAGE_KEY, JSON.stringify([nextLesson, ...currentLessons]));
    navigate('/teacher/lessons');
  };

  return (
    <div className="dashboard-container">
      <section className="glass-card upload-lesson-card">
        <SectionHead title="Upload lesson" actionLabel="Back to lessons" onAction={() => navigate('/teacher/lessons')} />

        <form className="upload-lesson-form" onSubmit={handleSubmit}>
          <div className="upload-field-group">
            <label htmlFor="lesson-title">Lesson title</label>
            <input
              id="lesson-title"
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="IELTS Writing Task 2: Argument Essay"
              required
            />
          </div>

          <div className="upload-grid">
            <div className="upload-field-group">
              <label htmlFor="lesson-type">Lesson type</label>
              <select id="lesson-type" value={type} onChange={(event) => setType(event.target.value)}>
                <option value="Writing">Writing</option>
                <option value="Speaking">Speaking</option>
                <option value="Listening">Listening</option>
                <option value="Reading">Reading</option>
                <option value="Vocabulary">Vocabulary</option>
              </select>
            </div>

            <div className="upload-field-group">
              <label htmlFor="lesson-price">Access</label>
              <select id="lesson-price" value={price} onChange={(event) => setPrice(event.target.value)}>
                <option value="Free">Free</option>
                <option value="Gold">Gold</option>
                <option value="Paid">Paid</option>
              </select>
            </div>
          </div>

          <div className="upload-field-group">
            <label htmlFor="lesson-description">Description</label>
            <textarea
              id="lesson-description"
              rows="5"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Add lesson summary, learning goals, or teaching notes..."
            />
          </div>

          <div className="upload-field-group">
            <label htmlFor="lesson-file">Lesson file</label>
            <input id="lesson-file" type="file" accept=".pdf,.doc,.docx,.ppt,.pptx,.txt,.zip" />
          </div>

          <div className="upload-actions">
            <button type="button" className="secondary-btn" onClick={() => navigate('/teacher/lessons')}>
              Cancel
            </button>
            <button type="submit" className="feature-action upload-submit">
              Upload lesson <span>→</span>
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
