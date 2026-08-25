import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { AuthPage } from '../features/auth/AuthPage';
import { DashboardPage } from '../features/dashboard/DashboardPage';
import { ProfilePage } from '../features/dashboard/ProfilePage';
import { MainLayout } from './MainLayout';

function Protected({ children, role }) {
  const { user } = useAuth();
  if (!user) return <Navigate to={`/${role.toLowerCase()}/login`} replace />;
  if (role && user.userType?.toLowerCase() !== role.toLowerCase()) return <Navigate to="/" replace />;
  return children;
}

function Home() {
  const { user } = useAuth();
  return <Navigate to={user ? `/${user.userType.toLowerCase()}/dashboard` : '/user/login'} replace />;
}

export function AppRouter() {
  return <Routes>
    <Route path="/" element={<Home />} />
    <Route path="/user/login" element={<AuthPage mode="login" role="user" />} />
    <Route path="/teacher/login" element={<AuthPage mode="login" role="teacher" />} />
    <Route path="/admin/login" element={<AuthPage mode="login" role="admin" />} />
    <Route path="/user/register" element={<AuthPage mode="register" role="user" />} />
    <Route path="/teacher/register" element={<AuthPage mode="register" role="teacher" />} />
    <Route path="/:role/dashboard" element={<RoleRoute><MainLayout><DashboardPage /></MainLayout></RoleRoute>} />
    <Route path="/:role/profile" element={<RoleRoute><MainLayout><ProfilePage /></MainLayout></RoleRoute>} />
    <Route path="*" element={<Home />} />
  </Routes>;
}

function RoleRoute({ children }) {
  const { role } = useParams();
  return <Protected role={role}>{children}</Protected>;
}
