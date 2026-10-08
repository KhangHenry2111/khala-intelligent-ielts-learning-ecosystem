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
  saveTeacherQuiz: (payload, token) => request('/api/quiz/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ ...payload, source: 'Teacher' }),
  }),
  teacherLessons: (token) => request('/api/quiz/teacher-lessons', {
    headers: { Authorization: `Bearer ${token}` },
  }),
  content: (token) => request('/api/quiz/content', { headers: { Authorization: `Bearer ${token}` } }),
  contentDetails: (id, token) => request(`/api/quiz/content/${id}`, {
    headers: { Authorization: 'Bearer ' + token },
  }),
  updateMaterialStatus: (id, status, token) => request(`/api/quiz/material/${id}/status`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ status }),
  }),
  deleteMaterial: (id, token) => request(`/api/quiz/material/${id}`, {
    method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
  }),
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
  deleteQuiz: (id, token) => request(`/api/quiz/delete/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  }),
};
