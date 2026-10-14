import { request } from './http';

export const learningApi = {
  teachers: () => request('/api/learning/teachers'),
  teacher: (teacherId) => request(`/api/learning/teachers/${teacherId}`),
  enroll: (materialId, token) => request(`/api/learning/lessons/${materialId}/enroll`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}` },
  }),
};
