export async function request(path, options) {
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
