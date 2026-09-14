import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { normalizeRole } from '../lib/roles';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

export function MainLayout({ children }) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const role = normalizeRole(user?.userType);

  return (
    <div className="main-layout">
      <Sidebar
        role={role}
        user={user}
        onLogout={() => {
          signOut();
          navigate(`/${role}/login`);
        }}
      />
      <div className="main-content">
        <Topbar role={role} user={user} />
        <main className="content-area">{children}</main>
      </div>
    </div>
  );
}
