import { useAuth } from '../../app/AuthContext';

const adminStats = [
  { label: 'Users', value: '1,245', tone: 'default' },
  { label: 'Teachers', value: '48', tone: 'default' },
  { label: 'Feedback', value: '17', tone: 'warning' },
  { label: 'Blocked accounts', value: '06', tone: 'danger' },
];

const accountRows = [
  { name: 'Nguyen Van A', role: 'User', status: 'Active', lastSeen: '2 minutes ago' },
  { name: 'Tran Thi B', role: 'Teacher', status: 'Pending', lastSeen: '35 minutes ago' },
  { name: 'Le Hoang C', role: 'Admin', status: 'Active', lastSeen: '1 hour ago' },
  { name: 'Pham Mai D', role: 'User', status: 'Suspended', lastSeen: 'Yesterday' },
];

const feedbackRows = [
  { title: 'Login issue on mobile app', sender: 'Student #1024', priority: 'High', status: 'In progress' },
  { title: 'Feedback on Speaking lesson', sender: 'Student #4102', priority: 'Medium', status: 'New' },
  { title: 'Policy violation document', sender: 'Content complaint', priority: 'High', status: 'Needs review' },
];

const contentRows = [
  { title: 'IELTS Writing Task 2 - Practice Set', type: 'Lesson', reason: 'Incorrect prompt content', status: 'Pending review' },
  { title: 'Vocabulary Booster PDF', type: 'Document', reason: 'Copyright issue', status: 'Removed' },
  { title: 'Speaking Lesson 08', type: 'Lesson', reason: 'Inappropriate content', status: 'Under review' },
];

const accessRows = [
  { name: 'Nguyen Tien', role: 'Teacher', reason: 'Violation of class rules', action: 'Ban' },
  { name: 'Phan Huy', role: 'User', reason: 'Spam feedback', action: 'Temporarily suspend' },
  { name: 'Do Lan', role: 'Admin', reason: 'Permission adjustment request', action: 'Review' },
];

const quickActions = [
  { title: 'Account management', description: 'Add, edit, lock, or remove accounts for users, teachers, and admins.', accent: 'primary-gradient' },
  { title: 'Feedback management', description: 'Track suggestions, bug reports, and issues raised by users.', accent: 'secondary-gradient' },
  { title: 'Content management', description: 'Review and remove lessons or documents that violate policy.', accent: 'dark-gradient' },
  { title: 'Access management', description: 'Suspend accounts after approval through the management workflow.', accent: 'primary-gradient' },
];

export function AdminDashboard() {
  const { user } = useAuth();
  const name = user?.fullName || user?.username || 'Admin';

  return (
    <div className="dashboard-container admin-dashboard">
      <div className="dashboard-welcome glass-card admin-hero">
        <div>
          <span className="eyebrow">Admin workspace</span>
          <h1>Welcome, {name}.</h1>
          <p>Manage the platform, monitor content quality, and review access approvals through the admin workflow.</p>
        </div>
        <div className="mini-stat-group">
          {adminStats.map((item) => (
            <div key={item.label} className="mini-stat-card">
              <span className="label">{item.label}</span>
              <strong className={item.tone === 'warning' ? 'warning' : item.tone === 'danger' ? 'danger' : ''}>{item.value}</strong>
            </div>
          ))}
        </div>
      </div>

      <div className="grid-2 admin-quick-actions">
        {quickActions.map((action) => (
          <button key={action.title} type="button" className={`action-btn ${action.accent}`}>
            <span className="icon">✦</span>
            <div>
              <h3>{action.title}</h3>
              <p>{action.description}</p>
            </div>
          </button>
        ))}
      </div>

      <div className="content-grid admin-main-grid">
        <section className="glass-card">
          <div className="section-head">
            <h2>Account management</h2>
            <button type="button" className="link-btn">+ Create teacher</button>
          </div>

          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Last active</th>
                </tr>
              </thead>
              <tbody>
                {accountRows.map((row) => (
                  <tr key={row.name}>
                    <td>{row.name}</td>
                    <td>{row.role}</td>
                    <td><span className={`status-pill ${row.status === 'Suspended' ? 'danger' : row.status === 'Pending' ? 'warning' : ''}`}>{row.status}</span></td>
                    <td>{row.lastSeen}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="glass-card">
          <div className="section-head">
            <h2>Feedback management</h2>
            <button type="button" className="link-btn">View all</button>
          </div>

          <div className="list-stack">
            {feedbackRows.map((item) => (
              <div key={item.title} className="info-list-item">
                <div>
                  <h3>{item.title}</h3>
                  <p>{item.sender}</p>
                </div>
                <div className="list-meta">
                  <span className={`status-badge ${item.priority === 'High' ? 'danger-bg' : ''}`}>{item.priority}</span>
                  <small>{item.status}</small>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="grid-2 mt-30">
        <section className="glass-card">
          <div className="section-head">
            <h2>Content management</h2>
            <button type="button" className="link-btn">Review</button>
          </div>

          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Type</th>
                  <th>Reason</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {contentRows.map((row) => (
                  <tr key={row.title}>
                    <td>{row.title}</td>
                    <td>{row.type}</td>
                    <td>{row.reason}</td>
                    <td><span className={`status-pill ${row.status === 'Removed' ? 'danger' : row.status === 'Under review' ? 'warning' : ''}`}>{row.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="glass-card">
          <div className="section-head">
            <h2>Access management</h2>
            <button type="button" className="link-btn">Approve</button>
          </div>

          <div className="list-stack">
            {accessRows.map((item) => (
              <div key={item.name} className="info-list-item">
                <div>
                  <h3>{item.name}</h3>
                  <p>{item.role}</p>
                </div>
                <div className="list-meta">
                  <span className="status-badge warning-bg">{item.reason}</span>
                  <small>{item.action}</small>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="glass-card mt-30 admin-create-teacher">
        <div className="section-head">
          <h2>Create teacher account</h2>
          <button type="button" className="link-btn">Save account</button>
        </div>

        <div className="teacher-form-grid">
          <label>
            Full name
            <input type="text" placeholder="Enter teacher name" />
          </label>
          <label>
            Email
            <input type="email" placeholder="teacher@ielts.ai" />
          </label>
          <label>
            Phone number
            <input type="tel" placeholder="0987 654 321" />
          </label>
          <label>
            Specialization
            <input type="text" placeholder="Speaking / Writing / General" />
          </label>
          <label>
            Qualification
            <input type="text" placeholder="IELTS 8.5 / CELTA" />
          </label>
          <label>
            Access level
            <select defaultValue="teacher">
              <option value="teacher">Teacher</option>
              <option value="editor">Content editor</option>
              <option value="reviewer">Reviewer</option>
            </select>
          </label>
        </div>
      </div>
    </div>
  );
}
