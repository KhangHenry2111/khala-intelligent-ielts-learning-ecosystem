import { useEffect, useState } from 'react';
import { quizApi } from '../../../../shared/api';
import { useLanguage } from '../../../../shared/i18n/LanguageContext';

const decisionMap = {
  Approved: { label: 'Approve', tone: 'approve' },
  PendingReview: { label: 'Under review', tone: 'review' },
  Rejected: { label: 'Reject', tone: 'reject' },
};

export function ReviewItem({ item, expanded, submitting, onToggle, onDecision, onEdit, onDelete, token, canManage }) {
  const { t } = useLanguage();
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    title: item.title || '',
    level: item.level || 'Intermediate',
    topic: item.topic || '',
    passageContent: item.passageContent || ''
  });
  const [questions, setQuestions] = useState([]);
  const [questionTypes, setQuestionTypes] = useState([]);
  const [questionError, setQuestionError] = useState('');
  const [questionBusy, setQuestionBusy] = useState(false);
  const [newQuestion, setNewQuestion] = useState({ questionTypeId: '', content: '', options: '', correctAnswer: '', explanation: '', difficulty: 'Intermediate' });

  useEffect(() => {
    if (!expanded) return;
    let active = true;
    Promise.all([quizApi.reviewQuestions(item.quizId, token), quizApi.catalog()])
      .then(([questionResult, catalog]) => {
        if (!active) return;
        setQuestions(questionResult.items || []);
        const types = catalog.items || [];
        setQuestionTypes(types);
        setNewQuestion((current) => ({ ...current, questionTypeId: current.questionTypeId || String(types[0]?.id || '') }));
      })
      .catch((error) => { if (active) setQuestionError(error.message || 'Could not load questions.'); });
    return () => { active = false; };
  }, [expanded, item.quizId, item.status, token]);

  const handleEditChange = (e) => {
    setEditForm({ ...editForm, [e.target.name]: e.target.value });
  };

  const handleSave = () => {
    if (onEdit) {
      onEdit(item.quizId, editForm);
    }
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditForm({
      title: item.title || '',
      level: item.level || 'Intermediate',
      topic: item.topic || '',
      passageContent: item.passageContent || ''
    });
    setIsEditing(false);
  };

  const saveQuestion = async (question) => {
    setQuestionBusy(true); setQuestionError('');
    try {
      const payload = { ...question, questionTypeID: Number(question.questionTypeId), orderIndex: Number(question.orderIndex) || 1 };
      const result = await quizApi.updateReviewQuestion(question.questionId, payload, token);
      setQuestions((rows) => rows.map((row) => row.questionId === question.questionId ? { ...question, ...result, moderatedBy: result.moderatedBy, moderatorName: 'You' } : row));
    } catch (error) { setQuestionError(error.message || 'Could not save question.'); }
    finally { setQuestionBusy(false); }
  };

  const addQuestion = async (event) => {
    event.preventDefault(); setQuestionBusy(true); setQuestionError('');
    try {
      const { questionTypeId, ...fields } = newQuestion;
      await quizApi.addReviewQuestion(item.quizId, { ...fields, questionTypeID: Number(questionTypeId), orderIndex: questions.length + 1 }, token);
      const result = await quizApi.reviewQuestions(item.quizId, token);
      setQuestions(result.items || []);
      setNewQuestion((current) => ({ ...current, content: '', options: '', correctAnswer: '', explanation: '' }));
    } catch (error) { setQuestionError(error.message || 'Could not add question.'); }
    finally { setQuestionBusy(false); }
  };

  const deleteQuestion = async (question) => {
    if (!window.confirm(t('Delete this question and its saved answers?'))) return;
    setQuestionBusy(true); setQuestionError('');
    try { await quizApi.deleteReviewQuestion(question.questionId, token); setQuestions((rows) => rows.filter((row) => row.questionId !== question.questionId)); }
    catch (error) { setQuestionError(error.message || 'Could not delete question.'); }
    finally { setQuestionBusy(false); }
  };

  return (
    <div className="queue-item review-item">
      <div className="review-main">
        <div className="review-summary">
          {isEditing ? (
            <input 
              name="title"
              value={editForm.title} 
              onChange={handleEditChange} 
              style={{ display: 'block', width: '100%', marginBottom: '4px', padding: '4px' }}
            />
          ) : (
            <h3>{item.title}</h3>
          )}
          <p>{t(item.passageTitle || item.topic || (item.skill === 'Listening' ? 'IELTS Listening' : 'IELTS Reading'))} · {t(item.level || 'Intermediate')} · {item.quizId}</p>
        </div>
        <button type="button" className="detail-toggle" onClick={onToggle}>
          {expanded ? t('Hide details') : t('View details')}
        </button>
      </div>
      <div className="queue-meta">
        <span className={`review-pill ${item.status === 'Approved' ? 'ok' : 'warning'}`}>
          {t('Quiz')}: {t(item.status || 'Pending')}
        </span>
        <div className="review-actions">
          {Object.entries(decisionMap).map(([status, config]) => (
            <button
              key={status}
              type="button"
              className={`decision-btn ${config.tone}`}
              disabled={submitting}
              onClick={() => onDecision(item.quizId, status)}
            >
              {t(config.label)}
            </button>
          ))}
          {!isEditing && onEdit && canManage && (
             <button type="button" className="decision-btn" onClick={() => { setIsEditing(true); if(!expanded) onToggle(); }}>{t('Edit')}</button>
          )}
          {onDelete && canManage && (
             <button type="button" className="decision-btn reject" onClick={() => onDelete(item.quizId)}>{t('Delete')}</button>
          )}
        </div>
      </div>
      {expanded && (
        <div className="review-detail-panel">
          <div className="detail-grid">
            <div><span>{t('Skill')}</span><strong>{t(item.skill || 'Reading')}</strong></div>
            <div><span>{t('Level')}</span><strong>
              {isEditing ? (
                <select name="level" value={editForm.level} onChange={handleEditChange} style={{ padding: '2px' }}>
                  <option value="Beginner">{t('Beginner')}</option>
                  <option value="Intermediate">{t('Intermediate')}</option>
                  <option value="Advanced">{t('Advanced')}</option>
                </select>
              ) : t(item.level || 'Intermediate')}
            </strong></div>
            <div><span>{t('Source')}</span><strong>{t(item.source || 'AI')}</strong></div>
            <div><span>{t('Question count')}</span><strong>{item.questionCount ?? 0}</strong></div>
            <div><span>{t('Created by')}</span><strong>{item.creatorName || (item.creatorId ? item.creatorId : t('Missing creator'))}</strong></div>
            <div><span>{t('Approved by')}</span><strong>{item.approverName || item.approvedBy || '—'}</strong></div>
            <div><span>{t('Word count')}</span><strong>{item.wordCount ?? 0}</strong></div>
            <div><span>{t('Topic')}</span><strong>
              {isEditing ? (
                <input name="topic" value={editForm.topic} onChange={handleEditChange} style={{width: '120px', padding: '2px'}} />
              ) : t(item.topic || 'General')}
            </strong></div>
          </div>
          <section className="review-questions-section">
            <div className="review-questions-heading"><h4>{t('Questions')} · {questions.length}</h4><span>{t('Question moderation is saved directly to SQL.')}</span></div>
            {questionError && <p className="teacher-quiz-notice error" role="alert">{t(questionError)}</p>}
            {questions.map((question, index) => <QuestionEditor key={question.questionId} question={question} index={index} questionTypes={questionTypes} busy={questionBusy} editable={canManage} onSave={saveQuestion} onDelete={deleteQuestion} />)}
            {canManage && <form className="review-question-add" onSubmit={addQuestion}>
              <h5>{t('Add question')}</h5>
              <select required value={newQuestion.questionTypeId} onChange={(event) => setNewQuestion({ ...newQuestion, questionTypeId: event.target.value })}>
                {questionTypes.map((type) => <option value={type.id} key={type.id}>{type.nameEN || type.code}</option>)}
              </select>
              <textarea required placeholder={t('Question prompt')} value={newQuestion.content} onChange={(event) => setNewQuestion({ ...newQuestion, content: event.target.value })} />
              <input placeholder={t('Options (JSON, optional)')} value={newQuestion.options} onChange={(event) => setNewQuestion({ ...newQuestion, options: event.target.value })} />
              <div className="review-question-add-row"><input placeholder={t('Correct answer')} value={newQuestion.correctAnswer} onChange={(event) => setNewQuestion({ ...newQuestion, correctAnswer: event.target.value })} /><input placeholder={t('Explanation')} value={newQuestion.explanation} onChange={(event) => setNewQuestion({ ...newQuestion, explanation: event.target.value })} /></div>
              <button type="submit" className="decision-btn approve" disabled={questionBusy || !questionTypes.length}>{t('Add question')}</button>
            </form>}
          </section>
          <div className="detail-section">
            <span>{t(item.skill === 'Listening' ? 'Listening audio and transcript' : 'Passage')}</span>
            {item.audioURL && <p><a href={item.audioURL} target="_blank" rel="noreferrer">{t('Open listening audio')}</a></p>}
            {isEditing ? (
              <textarea 
                name="passageContent" 
                value={editForm.passageContent} 
                onChange={handleEditChange}
                rows="8"
                style={{ width: '100%', marginTop: '8px', padding: '8px', border: '1px solid #ccc', borderRadius: '4px', fontFamily: 'inherit' }}
              />
            ) : (
              <p>{item.passageContent || item.transcript || t(item.audioURL ? 'Audio is available at the link above.' : 'No passage content available.')}</p>
            )}
          </div>
          {isEditing && (
            <div style={{ marginTop: '16px', display: 'flex', gap: '8px' }}>
              <button type="button" className="decision-btn approve" onClick={handleSave}>{t('Save Changes')}</button>
              <button type="button" className="decision-btn" onClick={handleCancel}>{t('Cancel')}</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function QuestionEditor({ question, index, questionTypes, busy, editable, onSave, onDelete }) {
  const { t } = useLanguage();
  const [form, setForm] = useState({ ...question, moderationStatus: question.moderationStatus || 'Pending' });
  useEffect(() => setForm({ ...question, moderationStatus: question.moderationStatus || 'Pending' }), [question]);
  const change = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  return (
    <form className="review-question-card" onSubmit={(event) => { event.preventDefault(); onSave(form); }}>
      <div className="review-question-card-head"><strong>{t('Question')} {index + 1}</strong><span>{t('Created by')} {question.creatorName || question.createdBy || t('Unknown')} · {t('Moderated by')} {question.moderatorName || question.moderatedBy || '—'}</span></div>
      <textarea aria-label={`${t('Question')} ${index + 1} ${t('content')}`} value={form.content} onChange={(event) => change('content', event.target.value)} required readOnly={!editable} />
      <div className="review-question-edit-grid">
        <select aria-label={t('Question type')} value={form.questionTypeId} onChange={(event) => change('questionTypeId', Number(event.target.value))} disabled={!editable}>
          {questionTypes.map((type) => <option key={type.id} value={type.id}>{t(type.nameEN || type.code)}</option>)}
        </select>
        <select aria-label={t('Question difficulty')} value={form.difficulty || ''} onChange={(event) => change('difficulty', event.target.value)} disabled={!editable}><option value="">{t('Unspecified')}</option><option value="Beginner">{t('Beginner')}</option><option value="Intermediate">{t('Intermediate')}</option><option value="Advanced">{t('Advanced')}</option></select>
        {editable ? <select aria-label={t('Question moderation status')} value={form.moderationStatus} onChange={(event) => change('moderationStatus', event.target.value)}><option value="Pending">{t('Pending')}</option><option value="Approved">{t('Approved')}</option><option value="Rejected">{t('Rejected')}</option></select> : <span className={`review-pill ${form.moderationStatus === 'Approved' ? 'ok' : 'warning'}`}>{t(form.moderationStatus)}</span>}
        <input aria-label={t('Order')} type="number" min="1" value={form.orderIndex || 1} onChange={(event) => change('orderIndex', Number(event.target.value))} readOnly={!editable} />
      </div>
      <div className="review-question-add-row"><input aria-label={t('Options JSON')} value={form.options || ''} onChange={(event) => change('options', event.target.value)} placeholder={t('Options (JSON)')} readOnly={!editable} /><input aria-label={t('Correct answer')} value={form.correctAnswer || ''} onChange={(event) => change('correctAnswer', event.target.value)} placeholder={t('Correct answer')} readOnly={!editable} /></div>
      <textarea aria-label={t('Answer explanation')} value={form.explanation || ''} onChange={(event) => change('explanation', event.target.value)} placeholder={t('Explanation')} readOnly={!editable} />
      {editable && <div className="review-question-actions"><button className="decision-btn approve" type="submit" disabled={busy}>{t('Save question')}</button><button className="decision-btn reject" type="button" disabled={busy} onClick={() => onDelete(question)}>{t('Delete')}</button></div>}
    </form>
  );
}
