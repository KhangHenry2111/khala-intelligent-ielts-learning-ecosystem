export function normalizeRole(value) {
  const role = String(value ?? '').trim().toLowerCase();
  if (role === 'student') return 'user';
  if (role === 'instructor' || role === 'teacher') return 'teacher';
  if (role === 'admin') return 'admin';
  return role || 'user';
}

export function normalizeRank(value) {
  const rank = String(value || '').trim().toLowerCase();
  if (rank === 'gold' || rank === 'vàng') return 'gold';
  if (rank === 'silver' || rank === 'bạc') return 'silver';
  return 'bronze';
}

export function rankLabel(rank) {
  if (rank === 'gold') return 'Gold';
  if (rank === 'silver') return 'Silver';
  return 'Bronze';
}

export function userRank(user) {
  return normalizeRank(user?.rank || user?.details?.Rank || user?.details?.rank);
}

export function displayName(user, fallback = 'User') {
  return user?.fullName || user?.username || fallback;
}
