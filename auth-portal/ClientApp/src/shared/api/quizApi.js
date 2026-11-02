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
  moderationQueue: (filters = {}, token) => {
    const query = new URLSearchParams({ scope: filters.scope || 'all' });
    if (filters.creatorId) query.set('creatorId', filters.creatorId);
    return request(`/api/quiz/moderation-queue?${query}`, { headers: { Authorization: `Bearer ${token}` } });
  },
  reviewQuestions: (quizId, token) => request(`/api/quiz/review-questions/${quizId}`, { headers: { Authorization: `Bearer ${token}` } }),
  addReviewQuestion: (quizId, payload, token) => request(`/api/quiz/review-questions/${quizId}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(payload),
  }),
  updateReviewQuestion: (questionId, payload, token) => request(`/api/quiz/review-question/${questionId}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(payload),
  }),
  deleteReviewQuestion: (questionId, token) => request(`/api/quiz/review-question/${questionId}`, {
    method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
  }),
  repairMissingCreators: (token) => request('/api/quiz/repair-missing-creators', {
    method: 'POST', headers: { Authorization: `Bearer ${token}` },
  }),
  saveTeacherQuiz: (payload, token) => request('/api/quiz/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ ...payload, source: 'Teacher' }),
  }),
  teacherLessons: (token) => request('/api/quiz/teacher-lessons', {
    headers: { Authorization: `Bearer ${token}` },
  }),
  availableLessons: () => request('/api/quiz/available-lessons'),
  playQuiz: (quizId, token) => request(`/api/quiz/play/${encodeURIComponent(quizId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  }),
  submitAttempt: (payload, token) => request('/api/quiz/attempt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  }),
  myAttempts: (token) => request('/api/quiz/attempts', {
    headers: { Authorization: `Bearer ${token}` },
  }),
  packages: () => request('/api/quiz/packages'),
  content: (token) => request('/api/quiz/content', { headers: { Authorization: `Bearer ${token}` } }),
  contentDetails: (id, token) => request(`/api/quiz/content/${id}`, {
    headers: { Authorization: 'Bearer ' + token },
  }),
  generateEnrollmentKey: (materialId, token) => request(`/api/quiz/material/${materialId}/enrollment-key`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  }),
  updateMaterialStatus: (id, status, token) => request(`/api/quiz/material/${id}/status`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ status }),
  }),
  deleteMaterial: (id, token) => request(`/api/quiz/material/${id}`, {
    method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
  }),
  moderationDecision: (payload, token) => request('/api/quiz/moderation-decision', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  }),
  editQuiz: (id, payload, token) => request(`/api/quiz/edit/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  }),
  deleteQuiz: (id, token) => request(`/api/quiz/delete/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  }),
};
