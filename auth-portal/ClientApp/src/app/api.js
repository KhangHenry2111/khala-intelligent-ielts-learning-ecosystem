async function request(path, options) {
  const response = await fetch(path, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const validation = Array.isArray(data.detail)
      ? data.detail.map((item) => `${item.loc?.join('.')}: ${item.msg}`).join('; ')
      : data.detail;
    throw new Error(data.message || validation || 'Request failed');
  }
  return data;
}

const AI_QUIZ_PORT_CANDIDATES = [8000, 8001, 8002, 8003, 8004, 8005, 8006, 8007, 8008, 8009];
let resolvedAiQuizUrl = null;

async function resolveAiQuizUrl() {
  if (resolvedAiQuizUrl) {
    return resolvedAiQuizUrl;
  }

  const configured = import.meta.env.VITE_AI_QUIZ_URL;
  if (configured) {
    resolvedAiQuizUrl = configured.replace(/\/$/, '');
    return resolvedAiQuizUrl;
  }

  for (const port of AI_QUIZ_PORT_CANDIDATES) {
    const candidate = `http://localhost:${port}`;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 1200);
      const response = await fetch(`${candidate}/api/quiz/health`, { method: 'GET', signal: controller.signal });
      clearTimeout(timeout);
      if (response.ok) {
        resolvedAiQuizUrl = candidate;
        return candidate;
      }
    } catch (error) {
      // Try the next candidate port.
    }
  }

  resolvedAiQuizUrl = 'http://localhost:8000';
  return resolvedAiQuizUrl;
}

export const authApi = {
  login: (payload) => request('/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  }),
  register: (payload) => request('/api/auth/register', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Frontend-Client': 'auth-portal' }, body: JSON.stringify(payload),
  }),
};

export const aiQuizApi = {
  generate: async (payload, user) => {
    const aiQuizUrl = await resolveAiQuizUrl();
    return request(`${aiQuizUrl}/api/quiz/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-ID': user?.id || '',
        'X-User-Tier': user?.rank || user?.details?.Rank || 'Bronze',
      },
      body: JSON.stringify(payload),
    });
  },
  export: async (quiz, extension) => {
    const aiQuizUrl = await resolveAiQuizUrl();
    return fetch(`${aiQuizUrl}/api/ai-quiz/export/${extension}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ quiz }),
    });
  },
};
