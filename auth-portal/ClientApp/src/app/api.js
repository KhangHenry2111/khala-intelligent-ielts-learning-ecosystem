async function request(path, options) {
  const response = await fetch(path, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || 'Request failed');
  return data;
}

export const authApi = {
  login: (payload) => request('/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  }),
  register: (payload) => request('/api/auth/register', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Frontend-Client': 'auth-portal' }, body: JSON.stringify(payload),
  }),
};
