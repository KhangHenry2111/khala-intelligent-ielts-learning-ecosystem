import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { AuthPage } from '../features/auth/AuthPage';
import { DashboardPage } from '../features/dashboard/DashboardPage';
import { ProfilePage } from '../features/dashboard/ProfilePage';
import { UserFeaturePage } from '../features/dashboard/UserFeaturePage';
import { MainLayout } from './MainLayout';

function normalizeRole(value) {
  const role = String(value ?? '').trim().toLowerCase();
  if (role === 'student') return 'user';
  if (role === 'instructor' || role === 'teacher') return 'teacher';
  if (role === 'admin') return 'admin';
  return role || 'user';
}

function Protected({ children, role }) {
  const { user } = useAuth();
  const safeRole = normalizeRole(role);
  if (!user) return <Navigate to={`/${safeRole}/login`} replace />;
  if (safeRole && normalizeRole(user.userType) !== safeRole) return <Navigate to="/" replace />;
  return children;
}

function Home() {
  const { user } = useAuth();
  const targetRole = normalizeRole(user?.userType);
  return <Navigate to={user ? `/${targetRole}/dashboard` : '/user/login'} replace />;
}

export function AppRouter() {
  return <Routes>
    <Route path="/" element={<Home />} />
    <Route path="/user/login" element={<AuthPage mode="login" role="user" />} />
    <Route path="/teacher/login" element={<AuthPage mode="login" role="teacher" />} />
    <Route path="/instructor/login" element={<AuthPage mode="login" role="teacher" />} />
    <Route path="/admin/login" element={<AuthPage mode="login" role="admin" />} />
    <Route path="/user/register" element={<AuthPage mode="register" role="user" />} />
    <Route path="/teacher/register" element={<AuthPage mode="register" role="teacher" />} />
    <Route path="/instructor/register" element={<AuthPage mode="register" role="teacher" />} />
    <Route path="/:role/dashboard" element={<RoleRoute><MainLayout><DashboardPage /></MainLayout></RoleRoute>} />
    <Route path="/:role/feature/:feature" element={<RoleRoute><MainLayout><UserFeaturePage /></MainLayout></RoleRoute>} />
    <Route path="/:role/profile" element={<RoleRoute><MainLayout><ProfilePage /></MainLayout></RoleRoute>} />
    <Route path="*" element={<Home />} />
  </Routes>;
}

function RoleRoute({ children }) {
  const { role } = useParams();
  return <Protected role={role}>{children}</Protected>;
}
