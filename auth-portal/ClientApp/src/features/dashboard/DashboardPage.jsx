import { useAuth } from '../../app/AuthContext';
import { UserDashboard } from './UserDashboard';
import { TeacherDashboard } from './TeacherDashboard';
import { AdminDashboard } from './AdminDashboard';

export function DashboardPage() {
  const { user } = useAuth();
  const role = user?.userType?.toLowerCase() || 'user';

  if (role === 'teacher') return <TeacherDashboard />;
  if (role === 'admin') return <AdminDashboard />;
  return <UserDashboard />;
}
