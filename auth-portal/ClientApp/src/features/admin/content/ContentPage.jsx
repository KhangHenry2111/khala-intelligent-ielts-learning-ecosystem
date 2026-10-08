import { useCallback, useEffect, useState } from 'react';
import { SectionHead } from '../../../shared/ui/SectionHead';
import { quizApi } from '../../../shared/api';
import { useAuth } from '../../../shared/auth/AuthContext';

const skills = ['All', 'Reading', 'Listening', 'Speaking', 'Writing'];
const statuses = ['Pending', 'Approved', 'Rejected'];

function parseStructuredValue(value) {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function renderStructuredValue(value) {
  const parsed = parseStructuredValue(value);
  if (parsed == null || parsed === '') return '—';
  if (Array.isArray(parsed)) return parsed.map((item) => String(item)).join(', ');
  if (typeof parsed === 'object') {
    return Object.entries(parsed).map(([key, item]) => `${key}: ${item}`).join('\n');
  }
  return String(parsed);
}

function ContentDetailsDialog({ item, loading, error, onClose }) {
  useEffect(() => {
    function closeOnEscape(event) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  return (
    <div
      className="content-detail-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="content-detail-dialog" role="dialog" aria-modal="true" aria-labelledby="content-detail-title">
        <header className="content-detail-header">
          <div>
            <span className="content-detail-eyebrow">Lesson details</span>
            <h2 id="content-detail-title">{item?.title || 'Loading lesson…'}</h2>
          </div>
          <button type="button" className="content-detail-close" onClick={onClose} aria-label="Close lesson details">×</button>
        </header>

        {loading ? <p className="content-detail-state" role="status">Loading full lesson content…</p> : null}
        {error ? <p className="teacher-quiz-notice error" role="alert">{error}</p> : null}
        {!loading && item ? (
          <div className="content-detail-body">
            <div className="content-detail-meta">
              <div><span>Skill</span><strong>{item.skill || '—'}</strong></div>
              <div><span>Level</span><strong>{item.level || '—'}</strong></div>
              <div><span>Teacher</span><strong>{item.teacherName || '—'}</strong></div>
              <div><span>Status</span><strong>{item.status || '—'}</strong></div>
              <div><span>Access</span><strong>{item.isFree ? 'Free' : item.price != null ? `Paid · ${item.price}` : 'Paid'}</strong></div>
              <div><span>Questions</span><strong>{item.questions?.length || 0}</strong></div>
            </div>

            {item.description ? <section className="content-detail-section">
              <h3>Description</h3>
              <p>{item.description}</p>
            </section> : null}

            {item.passage ? <section className="content-detail-section">
              <h3>{item.passage.title || 'Reading passage'}</h3>
              <div className="content-detail-subtitle">
                {[item.passage.topic, item.passage.wordCount ? `${item.passage.wordCount} words` : null].filter(Boolean).join(' · ')}
              </div>
              <p className="content-detail-prose">{item.passage.content}</p>
            </section> : null}

            {item.audio ? <section className="content-detail-section">
              <h3>Listening material</h3>
              {item.audio.audioUrl ? <audio className="content-detail-audio" controls src={item.audio.audioUrl}>Your browser does not support audio playback.</audio> : null}
              {item.audio.audioUrl ? <a href={item.audio.audioUrl} target="_blank" rel="noreferrer">Open audio source</a> : <div className="content-detail-subtitle">No audio file attached</div>}
              {item.audio.transcript ? <div className="content-detail-transcript"><h4>Transcript</h4><p className="content-detail-prose">{item.audio.transcript}</p></div> : null}
            </section> : null}

            {item.fileUrl ? <section className="content-detail-section">
              <h3>Lesson file</h3>
              <a href={item.fileUrl} target="_blank" rel="noreferrer">{item.fileType || 'Open uploaded file'}</a>
            </section> : null}

            {item.extraContent ? <section className="content-detail-section">
              <h3>Additional content</h3>
              <p className="content-detail-prose">{item.extraContent}</p>
            </section> : null}

            {item.sections?.length ? <section className="content-detail-section">
              <h3>Lesson sections</h3>
              <div className="content-detail-sections">
                {item.sections.map((section, index) => <article className="content-detail-section-card" key={`${section.sectionType}-${section.orderIndex}-${index}`}>
                  <h4>{section.title || section.sectionType || section.skill}</h4>
                  {section.prompt ? <p className="content-detail-prose">{section.prompt}</p> : null}
                  {section.transcript ? <div className="content-detail-subsection"><strong>Transcript</strong><p className="content-detail-prose">{section.transcript}</p></div> : null}
                  {section.modelAnswer ? <div className="content-detail-subsection"><strong>Model answer</strong><p className="content-detail-prose">{section.modelAnswer}</p></div> : null}
                  {section.extraJson ? <pre>{renderStructuredValue(section.extraJson)}</pre> : null}
                </article>)}
              </div>
            </section> : null}

            {item.questions?.length ? <section className="content-detail-section">
              <h3>Questions and answer key</h3>
              <div className="content-detail-questions">
                {item.questions.map((question, index) => <article className="content-detail-question" key={`${question.orderIndex}-${index}`}>
                  <div className="content-detail-question-heading">
                    <strong>Question {index + 1}</strong>
                    <span>{question.questionTypeNameEn || question.questionTypeNameVi || question.questionTypeCode || 'Question'}</span>
                  </div>
                  {question.instruction ? <p className="content-detail-instruction">{question.instruction}</p> : null}
                  <p className="content-detail-prose">{question.content}</p>
                  {question.options ? <pre>{renderStructuredValue(question.options)}</pre> : null}
                  {question.sharedOptions ? <div className="content-detail-subsection"><strong>Shared choices</strong><pre>{renderStructuredValue(question.sharedOptions)}</pre></div> : null}
                  {question.wordLimit ? <div className="content-detail-subtitle">Word limit: {question.wordLimit}</div> : null}
                  {question.imageUrl ? <a href={question.imageUrl} target="_blank" rel="noreferrer">View question image</a> : null}
                  {question.audioTimestampSeconds != null ? <div className="content-detail-subtitle">Audio timestamp: {question.audioTimestampSeconds}s</div> : null}
                  <div className="content-detail-answer"><strong>Answer</strong><p>{question.correctAnswer || '—'}</p></div>
                  {question.explanation ? <div className="content-detail-subsection"><strong>Explanation</strong><p className="content-detail-prose">{question.explanation}</p></div> : null}
                </article>)}
              </div>
            </section> : null}
          </div>
        ) : null}
      </section>
    </div>
  );
}

export function ContentPage() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [skill, setSkill] = useState('All');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');
  const [selectedItem, setSelectedItem] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await quizApi.content(user?.accessToken);
      setItems(data.items || []);
    } catch (e) {
      setError(e.message || 'Could not load content.');
    } finally {
      setLoading(false);
    }
  }, [user?.accessToken]);

  useEffect(() => { load(); }, [load]);

  async function showDetails(item) {
    setSelectedItem(item);
    setDetailLoading(true);
    setDetailError('');
    try {
      const result = await quizApi.contentDetails(item.materialId, user?.accessToken);
      if (!result.item) {
        throw new Error(result.message || 'The lesson detail endpoint returned no lesson data. Restart the web app to load the latest API changes.');
      }
      setSelectedItem({ ...result.item, questions: result.questions || [], sections: result.sections || [] });
    } catch (e) {
      setDetailError(e.message || 'Could not load lesson details.');
    } finally {
      setDetailLoading(false);
    }
  }

  async function updateStatus(item, status) {
    setBusyId(item.materialId);
    setError('');
    try {
      await quizApi.updateMaterialStatus(item.materialId, status, user?.accessToken);
      setItems((all) => all.map((row) => row.materialId === item.materialId ? { ...row, status } : row));
      setSelectedItem((current) => current?.materialId === item.materialId ? { ...current, status } : current);
    } catch (e) {
      setError(e.message || 'Could not update status.');
    } finally {
      setBusyId('');
    }
  }

  async function deleteItem(item) {
    if (!window.confirm(`Xóa bài giảng “${item.title}”?`)) return;
    setBusyId(item.materialId);
    setError('');
    try {
      if (item.quizId) await quizApi.deleteQuiz(item.quizId, user?.accessToken);
      else await quizApi.deleteMaterial(item.materialId, user?.accessToken);
      setItems((all) => all.filter((row) => row.materialId !== item.materialId));
      setSelectedItem((current) => current?.materialId === item.materialId ? null : current);
    } catch (e) {
      setError(e.message || 'Could not delete content.');
    } finally {
      setBusyId('');
    }
  }

  const visible = skill === 'All' ? items : items.filter((item) => item.skill === skill);
  const pendingCount = items.filter((item) => item.status === 'Pending').length;
  const readingListeningCount = items.filter((item) => ['Reading', 'Listening'].includes(item.skill)).length;

  return (
    <div className="dashboard-container admin-content-page">
      <section className="admin-content-hero">
        <div>
          <span className="admin-content-eyebrow">Admin workspace</span>
          <h1>Content management</h1>
          <p>Review lesson material, inspect question sets, and manage publication status.</p>
        </div>
        <button type="button" className="admin-content-refresh" onClick={load} disabled={loading}>
          <span aria-hidden="true">↻</span> {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </section>

      <div className="admin-content-stats">
        <article><span>Total lessons</span><strong>{items.length}</strong></article>
        <article><span>Awaiting review</span><strong className={pendingCount ? 'is-pending' : ''}>{pendingCount}</strong></article>
        <article><span>Reading & Listening</span><strong>{readingListeningCount}</strong></article>
      </div>

      <section className="glass-card admin-content-card">
        <div className="admin-content-toolbar">
          <div>
            <h2>Lesson library</h2>
            <p>Choose a lesson to view its full description, reading passage or transcript, sections, and answer key.</p>
          </div>
          <div className="teacher-quiz-filters admin-content-filters" role="tablist" aria-label="Filter lessons by skill">
            {skills.map((value) => <button key={value} type="button" role="tab" aria-selected={skill === value} className={skill === value ? 'active' : ''} onClick={() => setSkill(value)}>{value}</button>)}
          </div>
        </div>

        {error && <p className="teacher-quiz-notice error" role="alert">{error}</p>}
        {loading ? <p className="content-list-state" role="status">Loading content…</p> : visible.length === 0 ? <p className="content-list-state">No lessons found for this skill.</p> : (
          <div className="table-wrap admin-content-table-wrap">
            <table className="data-table admin-content-table">
              <thead><tr><th>Lesson</th><th>Skill</th><th>Level</th><th>Teacher</th><th>Questions</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>{visible.map((item) => <tr key={item.materialId}>
                <td><strong>{item.title}</strong><small>{new Date(item.createdAt).toLocaleDateString()}</small></td>
                <td><span className="admin-content-skill">{item.skill}</span></td>
                <td>{item.level || '—'}</td>
                <td>{item.teacherName || '—'}</td>
                <td><span className="admin-content-question-count">{item.questionCount ?? 0}</span></td>
                <td><select className="admin-content-status" aria-label={`Status for ${item.title}`} value={item.status} disabled={busyId === item.materialId} onChange={(e) => updateStatus(item, e.target.value)}>{statuses.map((status) => <option key={status}>{status}</option>)}</select></td>
                <td><div className="admin-content-actions">
                  <button type="button" className="admin-content-view" onClick={() => showDetails(item)}>View details</button>
                  <button type="button" className="button-danger" disabled={busyId === item.materialId} onClick={() => deleteItem(item)}>Delete</button>
                </div></td>
              </tr>)}</tbody>
            </table>
          </div>
        )}
      </section>

      {selectedItem ? <ContentDetailsDialog item={selectedItem} loading={detailLoading} error={detailError} onClose={() => setSelectedItem(null)} /> : null}
    </div>
  );
}
