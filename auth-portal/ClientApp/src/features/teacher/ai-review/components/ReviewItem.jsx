import { useEffect, useState } from 'react';
import { quizApi } from '../../../../shared/api';

const decisionMap = {
  Approved: { label: 'Approve', tone: 'approve' },
  PendingReview: { label: 'Under review', tone: 'review' },
  Rejected: { label: 'Reject', tone: 'reject' },
};

export function ReviewItem({ item, expanded, submitting, onToggle, onDecision, onEdit, onDelete, token, canManage }) {
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
    if (!window.confirm('Delete this question and its saved answers?')) return;
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
          <p>{item.passageTitle || item.topic || (item.skill === 'Listening' ? 'IELTS Listening' : 'IELTS Reading')} · {item.level || 'Intermediate'} · {item.quizId}</p>
        </div>
        <button type="button" className="detail-toggle" onClick={onToggle}>
          {expanded ? 'Hide details' : 'View details'}
        </button>
      </div>
      <div className="queue-meta">
        <span className={`review-pill ${item.status === 'Approved' ? 'ok' : 'warning'}`}>
          Quiz: {item.status || 'Pending'}
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
              {config.label}
            </button>
          ))}
          {!isEditing && onEdit && canManage && (
             <button type="button" className="decision-btn" onClick={() => { setIsEditing(true); if(!expanded) onToggle(); }}>Edit</button>
          )}
          {onDelete && canManage && (
             <button type="button" className="decision-btn reject" onClick={() => onDelete(item.quizId)}>Delete</button>
          )}
        </div>
      </div>
      {expanded && (
        <div className="review-detail-panel">
          <div className="detail-grid">
            <div><span>Skill</span><strong>{item.skill || 'Reading'}</strong></div>
            <div><span>Level</span><strong>
              {isEditing ? (
                <select name="level" value={editForm.level} onChange={handleEditChange} style={{ padding: '2px' }}>
                  <option value="Beginner">Beginner</option>
                  <option value="Intermediate">Intermediate</option>
                  <option value="Advanced">Advanced</option>
                </select>
              ) : (item.level || 'Intermediate')}
            </strong></div>
            <div><span>Source</span><strong>{item.source || 'AI'}</strong></div>
            <div><span>Question count</span><strong>{item.questionCount ?? 0}</strong></div>
            <div><span>Created by</span><strong>{item.creatorName || (item.creatorId ? item.creatorId : 'Missing creator')}</strong></div>
            <div><span>Approved by</span><strong>{item.approverName || item.approvedBy || '—'}</strong></div>
            <div><span>Word count</span><strong>{item.wordCount ?? 0}</strong></div>
            <div><span>Topic</span><strong>
              {isEditing ? (
                <input name="topic" value={editForm.topic} onChange={handleEditChange} style={{width: '120px', padding: '2px'}} />
              ) : (item.topic || 'General')}
            </strong></div>
          </div>
          <section className="review-questions-section">
            <div className="review-questions-heading"><h4>Questions · {questions.length}</h4><span>Question moderation is saved directly to SQL.</span></div>
            {questionError && <p className="teacher-quiz-notice error" role="alert">{questionError}</p>}
            {questions.map((question, index) => <QuestionEditor key={question.questionId} question={question} index={index} questionTypes={questionTypes} busy={questionBusy} editable={canManage} onSave={saveQuestion} onDelete={deleteQuestion} />)}
            {canManage && <form className="review-question-add" onSubmit={addQuestion}>
              <h5>Add question</h5>
              <select required value={newQuestion.questionTypeId} onChange={(event) => setNewQuestion({ ...newQuestion, questionTypeId: event.target.value })}>
                {questionTypes.map((type) => <option value={type.id} key={type.id}>{type.nameEN || type.code}</option>)}
              </select>
              <textarea required placeholder="Question prompt" value={newQuestion.content} onChange={(event) => setNewQuestion({ ...newQuestion, content: event.target.value })} />
              <input placeholder="Options (JSON, optional)" value={newQuestion.options} onChange={(event) => setNewQuestion({ ...newQuestion, options: event.target.value })} />
              <div className="review-question-add-row"><input placeholder="Correct answer" value={newQuestion.correctAnswer} onChange={(event) => setNewQuestion({ ...newQuestion, correctAnswer: event.target.value })} /><input placeholder="Explanation" value={newQuestion.explanation} onChange={(event) => setNewQuestion({ ...newQuestion, explanation: event.target.value })} /></div>
              <button type="submit" className="decision-btn approve" disabled={questionBusy || !questionTypes.length}>Add question</button>
            </form>}
          </section>
          <div className="detail-section">
            <span>{item.skill === 'Listening' ? 'Listening audio and transcript' : 'Passage'}</span>
            {item.audioURL && <p><a href={item.audioURL} target="_blank" rel="noreferrer">Open listening audio</a></p>}
            {isEditing ? (
              <textarea 
                name="passageContent" 
                value={editForm.passageContent} 
                onChange={handleEditChange}
                rows="8"
                style={{ width: '100%', marginTop: '8px', padding: '8px', border: '1px solid #ccc', borderRadius: '4px', fontFamily: 'inherit' }}
              />
            ) : (
              <p>{item.passageContent || item.transcript || (item.audioURL ? 'Audio is available at the link above.' : 'No passage content available.')}</p>
            )}
          </div>
          {isEditing && (
            <div style={{ marginTop: '16px', display: 'flex', gap: '8px' }}>
              <button type="button" className="decision-btn approve" onClick={handleSave}>Save Changes</button>
              <button type="button" className="decision-btn" onClick={handleCancel}>Cancel</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function QuestionEditor({ question, index, questionTypes, busy, editable, onSave, onDelete }) {
  const [form, setForm] = useState({ ...question, moderationStatus: question.moderationStatus || 'Pending' });
  useEffect(() => setForm({ ...question, moderationStatus: question.moderationStatus || 'Pending' }), [question]);
  const change = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  return (
    <form className="review-question-card" onSubmit={(event) => { event.preventDefault(); onSave(form); }}>
      <div className="review-question-card-head"><strong>Question {index + 1}</strong><span>Created by {question.creatorName || question.createdBy || 'Unknown'} · Moderated by {question.moderatorName || question.moderatedBy || '—'}</span></div>
      <textarea aria-label={`Question ${index + 1} content`} value={form.content} onChange={(event) => change('content', event.target.value)} required readOnly={!editable} />
      <div className="review-question-edit-grid">
        <select aria-label="Question type" value={form.questionTypeId} onChange={(event) => change('questionTypeId', Number(event.target.value))} disabled={!editable}>
          {questionTypes.map((type) => <option key={type.id} value={type.id}>{type.nameEN || type.code}</option>)}
        </select>
        <select aria-label="Question difficulty" value={form.difficulty || ''} onChange={(event) => change('difficulty', event.target.value)} disabled={!editable}><option value="">Unspecified</option><option>Beginner</option><option>Intermediate</option><option>Advanced</option></select>
        {editable ? <select aria-label="Question moderation status" value={form.moderationStatus} onChange={(event) => change('moderationStatus', event.target.value)}><option>Pending</option><option>Approved</option><option>Rejected</option></select> : <span className={`review-pill ${form.moderationStatus === 'Approved' ? 'ok' : 'warning'}`}>{form.moderationStatus}</span>}
        <input aria-label="Order" type="number" min="1" value={form.orderIndex || 1} onChange={(event) => change('orderIndex', Number(event.target.value))} readOnly={!editable} />
      </div>
      <div className="review-question-add-row"><input aria-label="Options JSON" value={form.options || ''} onChange={(event) => change('options', event.target.value)} placeholder="Options (JSON)" readOnly={!editable} /><input aria-label="Correct answer" value={form.correctAnswer || ''} onChange={(event) => change('correctAnswer', event.target.value)} placeholder="Correct answer" readOnly={!editable} /></div>
      <textarea aria-label="Answer explanation" value={form.explanation || ''} onChange={(event) => change('explanation', event.target.value)} placeholder="Explanation" readOnly={!editable} />
      {editable && <div className="review-question-actions"><button className="decision-btn approve" type="submit" disabled={busy}>Save question</button><button className="decision-btn reject" type="button" disabled={busy} onClick={() => onDelete(question)}>Delete</button></div>}
    </form>
  );
}
