import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';

function normalizeRole(value) {
  const role = String(value ?? '').trim().toLowerCase();
  if (role === 'student') return 'user';
  if (role === 'instructor' || role === 'teacher') return 'teacher';
  if (role === 'admin') return 'admin';
  return role || 'user';
}

export function MainLayout({ children }) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const role = normalizeRole(user?.userType);
  const userRank = String(user?.rank || user?.details?.Rank || user?.details?.rank || 'Bronze').trim().toLowerCase();
  const rankName = userRank === 'gold' || userRank === 'vàng' ? 'Vàng' : userRank === 'silver' || userRank === 'bạc' ? 'Bạc' : 'Đồng';

  const menuItems = {
    user: [
      { name: 'Quiz có sẵn', path: '/user/feature/available-quiz' },
      { name: 'AI tạo quiz', path: '/user/feature/ai-quiz' },
      { name: 'Test trình độ', path: '/user/feature/level-test' },
      { name: 'Upload tài liệu', path: '/user/feature/upload' },
      { name: 'Kho tri thức', path: '/user/feature/knowledge' },
      { name: 'Kết quả', path: '/user/feature/results' },
      { name: 'Gói học', path: '/user/dashboard' },
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
              <span>{item.name}</span>
              {role === 'user' && item.name !== 'Gói học' && item.name !== 'Kết quả' && (
                <small className="nav-rank">{rankName}</small>
              )}
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
