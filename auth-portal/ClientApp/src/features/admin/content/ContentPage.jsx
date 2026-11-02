import { useCallback, useEffect, useRef, useState } from 'react';
import { SectionHead } from '../../../shared/ui/SectionHead';
import { quizApi } from '../../../shared/api';
import { useAuth } from '../../../shared/auth/AuthContext';
import { useLanguage } from '../../../shared/i18n/LanguageContext';

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

function ContentDetailsDialog({ item, loading, error, onClose, onGenerateKey, generatingKey, generatedKey, keyError }) {
  const { t } = useLanguage();
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
            <span className="content-detail-eyebrow">{t('Lesson details')}</span>
            <h2 id="content-detail-title">{item?.title || t('Loading lesson…')}</h2>
          </div>
          <button type="button" className="content-detail-close" onClick={onClose} aria-label={t('Close lesson details')}>×</button>
        </header>

        {loading ? <p className="content-detail-state" role="status">{t('Loading full lesson content…')}</p> : null}
        {error ? <p className="teacher-quiz-notice error" role="alert">{t(error)}</p> : null}
        {!loading && item ? (
          <div className="content-detail-body">
            <div className="content-detail-meta">
              <div><span>{t('Skill')}</span><strong>{t(item.skill || '—')}</strong></div>
              <div><span>{t('Level')}</span><strong>{t(item.level || '—')}</strong></div>
              <div><span>{t('Created by')}</span><strong>{item.creatorName || '—'}</strong></div>
              <div><span>{t('Status')}</span><strong>{t(item.status || '—')}</strong></div>
              {item.materialId ? <div><span>{t('Access')}</span><strong>{item.isFree ? t('Free') : item.price != null ? `${t('Paid')} · ${item.price}` : t('Paid')}</strong></div> : null}
              <div><span>{t('Questions')}</span><strong>{item.questions?.length || 0}</strong></div>
            </div>

            {item.materialId && item.contentType === 'Teacher' ? (
              <section className="content-detail-section admin-enrollment-key">
                <h3>{t('Enrollment key')}</h3>
                <p>{t('Create a separate key for this lesson. Replacing it invalidates the previous key.')}</p>
                {keyError ? <p className="teacher-quiz-notice error" role="alert">{t(keyError)}</p> : null}
                <div className="admin-enrollment-key-controls">
                  <button type="button" className="admin-content-view" onClick={() => onGenerateKey(item)} disabled={generatingKey}>
                    {generatingKey ? t('Generating…') : item.hasEnrollmentKey ? t('Replace enrollment key') : t('Generate enrollment key')}
                  </button>
                  {generatedKey ? <code className="admin-enrollment-key-code" aria-label={t('Generated enrollment key')}>{generatedKey}</code> : null}
                </div>
                {generatedKey ? <small>{t('Copy this key now. It will not be shown again after closing this dialog.')}</small> : null}
              </section>
            ) : null}

            {item.description ? <section className="content-detail-section">
              <h3>{t('Description')}</h3>
              <p>{item.description}</p>
            </section> : null}

            {item.passage ? <section className="content-detail-section">
              <h3>{item.passage.title || t('Reading passage')}</h3>
              <div className="content-detail-subtitle">
                {[item.passage.topic, item.passage.wordCount ? `${item.passage.wordCount} words` : null].filter(Boolean).join(' · ')}
              </div>
              <p className="content-detail-prose">{item.passage.content}</p>
            </section> : null}

            {item.audio ? <section className="content-detail-section">
              <h3>{t('Listening material')}</h3>
              {item.audio.audioUrl ? <audio className="content-detail-audio" controls src={item.audio.audioUrl}>{t('Your browser does not support audio playback.')}</audio> : null}
              {item.audio.audioUrl ? <a href={item.audio.audioUrl} target="_blank" rel="noreferrer">{t('Open audio source')}</a> : <div className="content-detail-subtitle">{t('No audio file attached')}</div>}
              {item.audio.transcript ? <div className="content-detail-transcript"><h4>{t('Transcript')}</h4><p className="content-detail-prose">{item.audio.transcript}</p></div> : null}
            </section> : null}

            {item.fileUrl ? <section className="content-detail-section">
              <h3>{t('Lesson file')}</h3>
              <a href={item.fileUrl} target="_blank" rel="noreferrer">{item.fileType || t('Open uploaded file')}</a>
            </section> : null}

            {item.extraContent ? <section className="content-detail-section">
              <h3>{t('Additional content')}</h3>
              <p className="content-detail-prose">{item.extraContent}</p>
            </section> : null}

            {item.sections?.length ? <section className="content-detail-section">
              <h3>{t('Lesson sections')}</h3>
              <div className="content-detail-sections">
                {item.sections.map((section, index) => <article className="content-detail-section-card" key={`${section.sectionType}-${section.orderIndex}-${index}`}>
                  <h4>{section.title || section.sectionType || section.skill}</h4>
                  {section.prompt ? <p className="content-detail-prose">{section.prompt}</p> : null}
                  {section.transcript ? <div className="content-detail-subsection"><strong>{t('Transcript')}</strong><p className="content-detail-prose">{section.transcript}</p></div> : null}
                  {section.modelAnswer ? <div className="content-detail-subsection"><strong>{t('Model answer')}</strong><p className="content-detail-prose">{section.modelAnswer}</p></div> : null}
                  {section.extraJson ? <pre>{renderStructuredValue(section.extraJson)}</pre> : null}
                </article>)}
              </div>
            </section> : null}

            {item.questions?.length ? <section className="content-detail-section">
              <h3>{t('Questions and answer key')}</h3>
              <div className="content-detail-questions">
                {item.questions.map((question, index) => <article className="content-detail-question" key={`${question.orderIndex}-${index}`}>
                  <div className="content-detail-question-heading">
                    <strong>{t('Question')} {index + 1}</strong>
                    <span>{t(question.questionTypeNameEn || question.questionTypeNameVi || question.questionTypeCode || 'Question')}</span>
                  </div>
                  {question.instruction ? <p className="content-detail-instruction">{question.instruction}</p> : null}
                  <p className="content-detail-prose">{question.content}</p>
                  {question.options ? <pre>{renderStructuredValue(question.options)}</pre> : null}
                  {question.sharedOptions ? <div className="content-detail-subsection"><strong>{t('Shared choices')}</strong><pre>{renderStructuredValue(question.sharedOptions)}</pre></div> : null}
                  {question.wordLimit ? <div className="content-detail-subtitle">{t('Word limit')}: {question.wordLimit}</div> : null}
                  {question.imageUrl ? <a href={question.imageUrl} target="_blank" rel="noreferrer">{t('View question image')}</a> : null}
                  {question.audioTimestampSeconds != null ? <div className="content-detail-subtitle">{t('Audio timestamp')}: {question.audioTimestampSeconds}s</div> : null}
                  <div className="content-detail-answer"><strong>{t('Answer')}</strong><p>{question.correctAnswer || '—'}</p></div>
                  {question.explanation ? <div className="content-detail-subsection"><strong>{t('Explanation')}</strong><p className="content-detail-prose">{question.explanation}</p></div> : null}
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
  const { t } = useLanguage();
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [skill, setSkill] = useState('All');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');
  const [selectedItem, setSelectedItem] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [generatingKey, setGeneratingKey] = useState(false);
  const [generatedKey, setGeneratedKey] = useState('');
  const [keyError, setKeyError] = useState('');
  const selectedItemIdRef = useRef('');

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
    selectedItemIdRef.current = item.materialId || '';
    setSelectedItem(item);
    setDetailLoading(true);
    setDetailError('');
    setGeneratedKey('');
    setKeyError('');
    try {
      const result = await quizApi.contentDetails(item.id, user?.accessToken);
      if (!result.item) {
        throw new Error(result.message || 'The lesson detail endpoint returned no lesson data. Restart the web app to load the latest API changes.');
      }
      setSelectedItem({
        ...result.item,
        contentType: item.contentType,
        hasEnrollmentKey: item.hasEnrollmentKey,
        questions: result.questions || [],
        sections: result.sections || [],
      });
    } catch (e) {
      setDetailError(e.message || 'Could not load lesson details.');
    } finally {
      setDetailLoading(false);
    }
  }

  async function generateEnrollmentKey(item) {
    if (item.hasEnrollmentKey && !window.confirm(t('Replacing this key will invalidate the previous key. Continue?'))) return;
    setGeneratingKey(true);
    setGeneratedKey('');
    setKeyError('');
    try {
      const result = await quizApi.generateEnrollmentKey(item.materialId, user?.accessToken);
      setItems((current) => current.map((row) => row.materialId === item.materialId ? { ...row, hasEnrollmentKey: true } : row));
      if (selectedItemIdRef.current === item.materialId) {
        setGeneratedKey(result.enrollmentKey);
        setSelectedItem((current) => current?.materialId === item.materialId ? { ...current, hasEnrollmentKey: true } : current);
      }
    } catch (cause) {
      if (selectedItemIdRef.current === item.materialId) {
        setKeyError(cause.message || 'Could not generate an enrollment key.');
      }
    } finally {
      setGeneratingKey(false);
    }
  }

  async function updateStatus(item, status) {
    setBusyId(item.id);
    setError('');
    try {
      await quizApi.updateMaterialStatus(item.id, status, user?.accessToken);
      setItems((all) => all.map((row) => row.id === item.id ? { ...row, status } : row));
      setSelectedItem((current) => current?.id === item.id ? { ...current, status } : current);
    } catch (e) {
      setError(e.message || 'Could not update status.');
    } finally {
      setBusyId('');
    }
  }

  async function deleteItem(item) {
    if (!window.confirm(`Xóa nội dung “${item.title}”?`)) return;
    setBusyId(item.id);
    setError('');
    try {
      if (item.quizId) await quizApi.deleteQuiz(item.quizId, user?.accessToken);
      else await quizApi.deleteMaterial(item.materialId, user?.accessToken);
      setItems((all) => all.filter((row) => row.id !== item.id));
      setSelectedItem((current) => current?.id === item.id ? null : current);
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
          <span className="admin-content-eyebrow">{t('Admin workspace')}</span>
          <h1>{t('Content management')}</h1>
          <p>{t('Review all platform content, including AI-generated quizzes, and manage publication status.')}</p>
        </div>
        <button type="button" className="admin-content-refresh" onClick={load} disabled={loading}>
          <span aria-hidden="true">↻</span> {loading ? t('Refreshing…') : t('Refresh')}
        </button>
      </section>

      <div className="admin-content-stats">
        <article><span>{t('Total content')}</span><strong>{items.length}</strong></article>
        <article><span>{t('Awaiting review')}</span><strong className={pendingCount ? 'is-pending' : ''}>{pendingCount}</strong></article>
        <article><span>{t('Reading & Listening')}</span><strong>{readingListeningCount}</strong></article>
      </div>

      <section className="glass-card admin-content-card">
        <div className="admin-content-toolbar">
          <div>
            <h2>{t('Content library')}</h2>
            <p>{t('Choose content to view its full description, reading passage or transcript, sections, and answer key.')}</p>
          </div>
          <div className="teacher-quiz-filters admin-content-filters" role="tablist" aria-label={t('Filter lessons by skill')}>
            {skills.map((value) => <button key={value} type="button" role="tab" aria-selected={skill === value} className={skill === value ? 'active' : ''} onClick={() => setSkill(value)}>{t(value)}</button>)}
          </div>
        </div>

        {error && <p className="teacher-quiz-notice error" role="alert">{t(error)}</p>}
        {loading ? <p className="content-list-state" role="status">{t('Loading content…')}</p> : visible.length === 0 ? <p className="content-list-state">{t('No content found for this skill.')}</p> : (
          <div className="table-wrap admin-content-table-wrap">
            <table className="data-table admin-content-table">
              <thead><tr><th>{t('Content')}</th><th>{t('Type')}</th><th>{t('Skill')}</th><th>{t('Level')}</th><th>{t('Created by')}</th><th>{t('Questions')}</th><th>{t('Status')}</th><th>{t('Actions')}</th></tr></thead>
              <tbody>{visible.map((item) => <tr key={item.id}>
                <td><strong>{item.title}</strong><small>{new Date(item.createdAt).toLocaleDateString()}</small></td>
                <td>{t(item.contentType === 'AI' ? 'AI-generated' : item.contentType === 'Teacher' ? 'Teacher-created' : 'Document')}</td>
                <td><span className="admin-content-skill">{t(item.skill)}</span></td>
                <td>{t(item.level || '—')}</td>
                <td>{item.creatorName || '—'}</td>
                <td><span className="admin-content-question-count">{item.questionCount ?? 0}</span></td>
                <td><select className="admin-content-status" aria-label={`${t('Status for')} ${item.title}`} value={item.status} disabled={busyId === item.id} onChange={(e) => updateStatus(item, e.target.value)}>{statuses.map((status) => <option key={status} value={status}>{t(status)}</option>)}</select></td>
                <td><div className="admin-content-actions">
                  <button type="button" className="admin-content-view" onClick={() => showDetails(item)}>{t('View details')}</button>
                  <button type="button" className="button-danger" disabled={busyId === item.id} onClick={() => deleteItem(item)}>{t('Delete')}</button>
                </div></td>
              </tr>)}</tbody>
            </table>
          </div>
        )}
      </section>

      {selectedItem ? <ContentDetailsDialog
        item={selectedItem}
        loading={detailLoading}
        error={detailError}
        onClose={() => {
          selectedItemIdRef.current = '';
          setSelectedItem(null);
          setGeneratedKey('');
          setKeyError('');
        }}
        onGenerateKey={generateEnrollmentKey}
        generatingKey={generatingKey}
        generatedKey={generatedKey}
        keyError={keyError}
      /> : null}
    </div>
  );
}
