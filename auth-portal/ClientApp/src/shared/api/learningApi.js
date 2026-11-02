import { request } from './http';

export const learningApi = {
  teachers: () => request('/api/learning/teachers'),
  teacher: (teacherId) => request(`/api/learning/teachers/${teacherId}`),
  enroll: (materialId, enrollmentKey, token) => request(`/api/learning/lessons/${materialId}/enroll`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ enrollmentKey }),
  }),
};
