import { request } from './http';

export const quizApi = {
  catalog: () => request('/api/quiz/catalog'),
  userTier: (params = {}) => {
    const query = new URLSearchParams();
    if (params.userId) query.set('userId', params.userId);
    if (params.username) query.set('username', params.username);
    const suffix = query.toString() ? `?${query}` : '';
    return request(`/api/quiz/user-tier${suffix}`);
  },
  moderationQueue: () => request('/api/quiz/moderation-queue'),
  moderationDecision: (payload) => request('/api/quiz/moderation-decision', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }),
  editQuiz: (id, payload) => request(`/api/quiz/edit/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }),
  deleteQuiz: (id) => request(`/api/quiz/delete/${id}`, {
    method: 'DELETE',
  }),
};
