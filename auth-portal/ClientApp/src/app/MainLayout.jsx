import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';

export function MainLayout({ children }) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const role = user?.userType?.toLowerCase() || 'user';

  const menuItems = {
    user: [
      { name: 'Dashboard', path: '/user/dashboard' },
      { name: 'Learn', path: '/user/dashboard' },
      { name: 'Practice', path: '/user/dashboard' },
      { name: 'Test', path: '/user/dashboard' },
      { name: 'AI Quiz', path: '/user/dashboard' },
      { name: 'Lessons', path: '/user/dashboard' },
      { name: 'Progress', path: '/user/dashboard' },
      { name: 'Package', path: '/user/dashboard' },
    ],
    teacher: [
      { name: 'Dashboard', path: '/teacher/dashboard' },
      { name: 'Classes', path: '/teacher/dashboard' },
      { name: 'Lessons', path: '/teacher/dashboard' },
      { name: 'Grading', path: '/teacher/dashboard' },
      { name: 'AI Review', path: '/teacher/dashboard' },
    ],
    admin: [
      { name: 'Dashboard', path: '/admin/dashboard' },
      { name: 'Accounts', path: '/admin/dashboard' },
      { name: 'Teachers', path: '/admin/dashboard' },
      { name: 'Content', path: '/admin/dashboard' },
      { name: 'Feedback', path: '/admin/dashboard' },
      { name: 'Reports', path: '/admin/dashboard' },
    ]
  };

  const currentMenu = menuItems[role] || menuItems.user;

  return (
    <div className="main-layout">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <span className="brand-mark-small">IA</span>
          <h2>IELTS AI</h2>
        </div>
        <nav className="sidebar-nav">
          {currentMenu.map((item, idx) => (
            <NavLink
              key={idx}
              to={item.path}
              end
              className={() => `nav-item ${location.pathname === item.path ? 'active' : ''}`}
            >
              {item.name}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <button className="logout-btn" onClick={() => { signOut(); navigate(`/${role}/login`); }}>
            Logout
          </button>
        </div>
      </aside>
      <div className="main-content">
        <header className="topbar">
          <div className="search-bar">
            <input type="text" placeholder="Search..." />
          </div>
          <div className="topbar-actions">
            <button className="notification-btn">🔔</button>
            <Link className="avatar-btn" to={`/${role}/profile`}>
              {(user?.fullName || user?.username || 'U')[0].toUpperCase()}
            </Link>
          </div>
        </header>
        <main className="content-area">
          {children}
        </main>
      </div>
    </div>
  );
}
