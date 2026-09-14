import { useAuth } from '../../app/AuthContext';
import { UserDashboard } from './UserDashboard';
import { TeacherDashboard } from './TeacherDashboard';
import { AdminDashboard } from './AdminDashboard';

function normalizeRole(value) {
  const role = String(value ?? '').trim().toLowerCase();
  if (role === 'student') return 'user';
  if (role === 'instructor' || role === 'teacher') return 'teacher';
  if (role === 'admin') return 'admin';
  return role || 'user';
}

export function DashboardPage() {
  const { user } = useAuth();
  const role = normalizeRole(user?.userType);

  if (role === 'teacher') return <TeacherDashboard />;
  if (role === 'admin') return <AdminDashboard />;
  return <UserDashboard />;
}
