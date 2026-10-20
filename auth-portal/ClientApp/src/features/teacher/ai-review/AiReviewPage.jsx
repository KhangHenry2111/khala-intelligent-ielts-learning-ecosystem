import { useEffect, useState } from 'react';
import { quizApi } from '../../../shared/api';
import { useAuth } from '../../../shared/auth/AuthContext';
import { SectionHead } from '../../../shared/ui/SectionHead';
import { ReviewItem } from './components/ReviewItem';
import { useLanguage } from '../../../shared/i18n/LanguageContext';

export function AiReviewPage() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [reviewQueue, setReviewQueue] = useState([]);
  const [loadingQueue, setLoadingQueue] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [expandedQuizId, setExpandedQuizId] = useState(null);
  const [scope, setScope] = useState('all');
  const [creatorId, setCreatorId] = useState('');
  const [creators, setCreators] = useState([]);
  const [repairing, setRepairing] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let active = true;
    async function loadQueue() {
      if (scope === 'creator' && !creatorId) {
        setReviewQueue([]); setLoadingQueue(false); setLoadError('');
        return;
      }
      try {
        setLoadingQueue(true);
        const payload = await quizApi.moderationQueue({ scope, creatorId }, user?.accessToken);
        if (active) {
          setReviewQueue(payload.items || []);
          setCreators(payload.creators || []);
          setLoadError('');
        }
      } catch (error) {
        if (active) {
          setReviewQueue([]);
          setLoadError(error.message || 'Could not load the AI review queue.');
        }
      } finally {
        if (active) setLoadingQueue(false);
      }
    }
    loadQueue();
    return () => { active = false; };
  }, [scope, creatorId, user?.accessToken]);

  const handleRepair = async () => {
    if (!window.confirm('Fill missing creator IDs from the recorded approver/moderator IDs for approved quizzes and content? This writes the updates to SQL.')) return;
    setRepairing(true); setNotice('');
    try {
      const result = await quizApi.repairMissingCreators(user?.accessToken);
      const totals = result.updated || {};
      setNotice(`Creator records updated: ${totals.quizzes || 0} quizzes, ${totals.questions || 0} questions, ${totals.passages || 0} passages, ${totals.audios || 0} audio items.`);
      const payload = await quizApi.moderationQueue({ scope, creatorId }, user?.accessToken);
      setReviewQueue(payload.items || []); setCreators(payload.creators || []);
    } catch (error) { setLoadError(error.message || 'Could not repair creator records.'); }
    finally { setRepairing(false); }
  };

  const handleDecision = async (quizId, status) => {
    setSubmitting(true);
    try {
      await quizApi.moderationDecision({ quizId, status }, user?.accessToken);
      setReviewQueue((current) => current.map((item) => item.quizId === quizId ? { ...item, status, moderationStatus: status === 'PendingReview' ? 'Pending' : status } : item));
    } catch (error) {
      alert(error.message || 'Unable to update review status');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (quizId) => {
    if (!window.confirm("Are you sure you want to delete this quiz?")) return;
    setSubmitting(true);
    try {
      await quizApi.deleteQuiz(quizId, user?.accessToken);
      setReviewQueue((current) => current.filter((item) => item.quizId !== quizId));
    } catch (error) {
      alert(error.message || 'Unable to delete quiz');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = async (quizId, updatedData) => {
    setSubmitting(true);
    try {
      await quizApi.editQuiz(quizId, updatedData, user?.accessToken);
      setReviewQueue((current) => 
        current.map((item) => item.quizId === quizId ? { ...item, ...updatedData, passageContent: updatedData.passageContent } : item)
      );
    } catch (error) {
      alert(error.message || 'Unable to update quiz');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="dashboard-container">
      <section className="glass-card">
        <SectionHead title="Quiz review" actionLabel="Repair missing creators" onAction={handleRepair} />
        {notice && <p className="teacher-quiz-notice success" role="status">{t(notice)}</p>}
        {repairing && <p className="content-list-state" role="status">{t('Updating creator records…')}</p>}
        {loadError && <p className="teacher-quiz-notice error" role="alert">{t(loadError)}</p>}
        <div className="quiz-review-toolbar">
          <label htmlFor="quiz-review-scope">{t('Creator filter')}</label>
          <select id="quiz-review-scope" value={scope} onChange={(event) => { setScope(event.target.value); setCreatorId(''); }}>
            <option value="all">{t('All quizzes')}</option><option value="mine">{t('Created by me')}</option><option value="unassigned">{t('Missing creator')}</option><option value="creator">{t('Created by…')}</option>
          </select>
          {scope === 'creator' && <select aria-label="Select quiz creator" value={creatorId} onChange={(event) => setCreatorId(event.target.value)}>
            <option value="">{t('Select a creator')}</option>{creators.map((creator) => <option key={creator.id} value={creator.id}>{creator.name} · {creator.id}</option>)}
          </select>}
          <span>{reviewQueue.length} {t('quizzes')}</span>
        </div>
        <div className="queue-list">
          {loadingQueue ? (
            <div className="queue-item empty-state">{t('Loading review queue...')}</div>
          ) : reviewQueue.length === 0 ? (
            <div className="queue-item empty-state">{t('No quizzes match this creator filter.')}</div>
          ) : (
            reviewQueue.map((item) => (
              <ReviewItem
                key={item.quizId}
                item={item}
                expanded={expandedQuizId === item.quizId}
                submitting={submitting}
                onToggle={() => setExpandedQuizId(expandedQuizId === item.quizId ? null : item.quizId)}
                onDecision={handleDecision}
                onDelete={handleDelete}
                onEdit={handleEdit}
                token={user?.accessToken}
                canManage={item.canManage}
              />
            ))
          )}
        </div>
      </section>
    </div>
  );
}
