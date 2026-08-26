import { useAuth } from '../../app/AuthContext';

export function TeacherDashboard() {
  const { user } = useAuth();
  const name = user?.fullName || user?.username || 'Teacher';

  return (
    <div className="dashboard-container">
      <div className="dashboard-welcome glass-card">
        <div>
          <span className="eyebrow">Teacher workspace</span>
          <h1>Welcome back, {name}.</h1>
          <p>Manage your classes and review student work.</p>
        </div>
        <div className="mini-stat-group">
          <div className="mini-stat-card">
            <span className="label">Classes</span>
            <strong>4</strong>
          </div>
          <div className="mini-stat-card">
            <span className="label">Reviews</span>
            <strong className="warning">12</strong>
          </div>
        </div>
      </div>

      <div className="quick-actions grid-2">
        <div className="stat-card">
          <h3>Active Classes</h3>
          <div className="stat-value">4</div>
          <button className="text-btn">Manage classes &rarr;</button>
        </div>
        <div className="stat-card">
          <h3>Pending Reviews</h3>
          <div className="stat-value warning">12</div>
          <button className="text-btn">Start grading &rarr;</button>
        </div>
      </div>

      <div className="teacher-classes glass-card mt-30">
        <h2>Your Classes</h2>
        <table className="data-table">
          <thead>
            <tr>
              <th>Class Name</th>
              <th>Students</th>
              <th>Next Lesson</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>IELTS Writing 6.5</td>
              <td>24</td>
              <td>Today, 19:00 - 20:30</td>
              <td><button className="btn-small">Join</button></td>
            </tr>
            <tr>
              <td>IELTS Speaking Masterclass</td>
              <td>15</td>
              <td>Tomorrow, 18:00</td>
              <td><button className="btn-small">Manage</button></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
