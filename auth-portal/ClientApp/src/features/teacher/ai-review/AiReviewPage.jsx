import { useEffect, useState } from 'react';
import { quizApi } from '../../../shared/api';
import { useAuth } from '../../../shared/auth/AuthContext';
import { SectionHead } from '../../../shared/ui/SectionHead';
import { ReviewItem } from './components/ReviewItem';

export function AiReviewPage() {
  const { user } = useAuth();
  const [reviewQueue, setReviewQueue] = useState([]);
  const [loadingQueue, setLoadingQueue] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [expandedQuizId, setExpandedQuizId] = useState(null);

  useEffect(() => {
    let active = true;
    async function loadQueue() {
      try {
        const payload = await quizApi.moderationQueue();
        if (active) setReviewQueue(payload.items || []);
      } catch {
        if (active) setReviewQueue([]);
      } finally {
        if (active) setLoadingQueue(false);
      }
    }
    loadQueue();
    return () => { active = false; };
  }, []);

  const handleDecision = async (quizId, status) => {
    setSubmitting(true);
    try {
      await quizApi.moderationDecision({
        quizId,
        status,
        teacherId: user?.id || user?.userId || user?.details?.Id || null,
      });
      setReviewQueue((current) => current.filter((item) => item.quizId !== quizId));
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
      await quizApi.deleteQuiz(quizId);
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
      await quizApi.editQuiz(quizId, updatedData);
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
        <SectionHead title="AI quiz moderation" actionLabel="Bulk review" />
        <div className="queue-list">
          {loadingQueue ? (
            <div className="queue-item empty-state">Loading review queue...</div>
          ) : reviewQueue.length === 0 ? (
            <div className="queue-item empty-state">No AI quiz sets are currently pending review.</div>
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
              />
            ))
          )}
        </div>
      </section>
    </div>
  );
}
