import { Link } from 'react-router-dom';

export function Topbar({ role, user }) {
  return (
    <header className="topbar">
      <div className="search-bar">
        <input type="text" placeholder="Search..." />
      </div>
      <div className="topbar-actions">
        <button className="notification-btn" type="button">🔔</button>
        <Link className="avatar-btn" to={`/${role}/profile`}>
          {(user?.fullName || user?.username || 'U')[0].toUpperCase()}
        </Link>
      </div>
    </header>
  );
}
