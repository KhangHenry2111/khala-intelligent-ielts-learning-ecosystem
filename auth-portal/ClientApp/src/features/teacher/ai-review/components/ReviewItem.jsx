import { useState } from 'react';

const decisionMap = {
  Approved: { label: 'Approve', tone: 'approve' },
  PendingReview: { label: 'Under review', tone: 'review' },
  Rejected: { label: 'Reject', tone: 'reject' },
};

export function ReviewItem({ item, expanded, submitting, onToggle, onDecision, onEdit, onDelete }) {
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    title: item.title || '',
    level: item.level || 'Intermediate',
    topic: item.topic || '',
    passageContent: item.passageContent || ''
  });

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
          <p>{item.passageTitle || item.topic || (item.skill === 'Listening' ? 'IELTS Listening' : 'IELTS Reading')} · {item.level || 'Intermediate'}</p>
        </div>
        <button type="button" className="detail-toggle" onClick={onToggle}>
          {expanded ? 'Hide details' : 'View details'}
        </button>
      </div>
      <div className="queue-meta">
        <span className={`review-pill ${item.status === 'Approved' ? 'ok' : 'warning'}`}>
          {item.moderationStatus === 'Approved' ? 'Approved' : item.moderationStatus === 'Rejected' ? 'Rejected' : 'Pending'}
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
          {!isEditing && onEdit && (
             <button type="button" className="decision-btn" onClick={() => { setIsEditing(true); if(!expanded) onToggle(); }}>Edit</button>
          )}
          {onDelete && (
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
            <div><span>Word count</span><strong>{item.wordCount ?? 0}</strong></div>
            <div><span>Topic</span><strong>
              {isEditing ? (
                <input name="topic" value={editForm.topic} onChange={handleEditChange} style={{width: '120px', padding: '2px'}} />
              ) : (item.topic || 'General')}
            </strong></div>
          </div>
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
