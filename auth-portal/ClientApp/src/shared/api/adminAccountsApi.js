import { request } from './http';

export const adminAccountsApi = {
  list: (token) => request('/api/admin/accounts', {
    headers: { Authorization: `Bearer ${token}` },
  }),
  update: (account, payload, token) => request(
    `/api/admin/accounts/${account.accountType.toLowerCase()}/${account.id}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    },
  ),
  remove: (account, token) => request(
    `/api/admin/accounts/${account.accountType.toLowerCase()}/${account.id}`,
    { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } },
  ),
};
