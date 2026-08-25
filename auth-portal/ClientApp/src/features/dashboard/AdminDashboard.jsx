import { useAuth } from '../../app/AuthContext';

export function AdminDashboard() {
  const { user } = useAuth();

  return (
    <div className="dashboard-container">
      <div className="dashboard-welcome glass-card">
        <h1>Admin Control Panel</h1>
        <p>System overview and management.</p>
      </div>

      <div className="quick-actions grid-4">
        <div className="stat-card admin-stat">
          <h3>Total Users</h3>
          <div className="stat-value">1,245</div>
        </div>
        <div className="stat-card admin-stat">
          <h3>Total Teachers</h3>
          <div className="stat-value">48</div>
        </div>
        <div className="stat-card admin-stat">
          <h3>Active Lessons</h3>
          <div className="stat-value">312</div>
        </div>
        <div className="stat-card admin-stat">
          <h3>Pending Reports</h3>
          <div className="stat-value danger">5</div>
        </div>
      </div>

      <div className="recent-activity glass-card mt-30">
        <h2>Recent Registrations</h2>
        <ul className="activity-list">
          <li><strong>Nguyen Van A</strong> registered as User <span className="time">10 mins ago</span></li>
          <li><strong>Tran Thi B</strong> registered as Teacher <span className="time">1 hour ago</span></li>
          <li><strong>Le Van C</strong> completed Placement Test <span className="time">2 hours ago</span></li>
        </ul>
      </div>
    </div>
  );
}
