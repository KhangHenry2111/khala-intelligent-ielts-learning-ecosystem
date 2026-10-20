import { NavLink, useLocation } from 'react-router-dom';
import { rankLabel, userRank } from '../lib/roles';
import { adminNavItems } from '../../features/admin/navigation';
import { teacherNavItems } from '../../features/teacher/navigation';
import { userNavItems } from '../../features/user/navigation';
import { useLanguage } from '../i18n/LanguageContext';

const menus = {
  user: userNavItems,
  teacher: teacherNavItems,
  admin: adminNavItems,
};

export function Sidebar({ role, user, onLogout }) {
  const { t } = useLanguage();
  const location = useLocation();
  const currentMenu = menus[role] || menus.user;
  const planName = rankLabel(userRank(user));

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <span className="brand-mark-small">IA</span>
        <h2>IELTS AI</h2>
      </div>
      <nav className="sidebar-nav">
        {currentMenu.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/teacher/dashboard' || item.path === '/admin/dashboard' || item.path === '/user/dashboard'}
            className={() => `nav-item ${location.pathname === item.path ? 'active' : ''}`}
          >
            <span>{t(item.name)}</span>
            {role === 'user' && item.showRank ? <small className="nav-rank">{planName}</small> : null}
          </NavLink>
        ))}
      </nav>
      <div className="sidebar-footer">
        <button className="logout-btn" onClick={onLogout}>{t('Logout')}</button>
      </div>
    </aside>
  );
}
