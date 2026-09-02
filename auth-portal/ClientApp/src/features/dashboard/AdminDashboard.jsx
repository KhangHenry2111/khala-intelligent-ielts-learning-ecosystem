import { useAuth } from '../../app/AuthContext';

const adminStats = [
  { label: 'Người dùng', value: '1,245', tone: 'default' },
  { label: 'Giáo viên', value: '48', tone: 'default' },
  { label: 'Phản hồi', value: '17', tone: 'warning' },
  { label: 'Khóa tài khoản', value: '06', tone: 'danger' },
];

const accountRows = [
  { name: 'Nguyễn Văn A', role: 'User', status: 'Active', lastSeen: '2 phút trước' },
  { name: 'Trần Thị B', role: 'Teacher', status: 'Pending', lastSeen: '35 phút trước' },
  { name: 'Lê Hoàng C', role: 'Admin', status: 'Active', lastSeen: '1 giờ trước' },
  { name: 'Phạm Mai D', role: 'User', status: 'Suspended', lastSeen: 'Hôm qua' },
];

const feedbackRows = [
  { title: 'Lỗi đăng nhập trên app mobile', sender: 'Học viên #1024', priority: 'High', status: 'Đang xử lý' },
  { title: 'Góp ý về bài giảng Speaking', sender: 'Học viên #4102', priority: 'Medium', status: 'Mới' },
  { title: 'Tài liệu vi phạm chính sách', sender: 'Khiếu nại nội dung', priority: 'High', status: 'Cần duyệt' },
];

const contentRows = [
  { title: 'IELTS Writing Task 2 - Practice Set', type: 'Bài giảng', reason: 'Sai nội dung đề', status: 'Chờ xử lý' },
  { title: 'Vocabulary Booster PDF', type: 'Tài liệu', reason: 'Bản quyền', status: 'Đã xoá' },
  { title: 'Speaking Lesson 08', type: 'Bài giảng', reason: 'Nội dung không phù hợp', status: 'Đang kiểm tra' },
];

const accessRows = [
  { name: 'Nguyễn Tiến', role: 'Teacher', reason: 'Vi phạm quy định lớp học', action: 'Ban' },
  { name: 'Phan Huy', role: 'User', reason: 'Spam phản hồi', action: 'Temporarily suspend' },
  { name: 'Đỗ Lan', role: 'Admin', reason: 'Yêu cầu điều chỉnh quyền', action: 'Review' },
];

const quickActions = [
  { title: 'Quản lý tài khoản', description: 'Thêm, chỉnh sửa, khóa hoặc xóa thông tin tài khoản người dùng, giáo viên và admin.', accent: 'primary-gradient' },
  { title: 'Quản lý phản hồi', description: 'Theo dõi yêu cầu góp ý, phản ánh lỗi hoặc vấn đề từ người dùng.', accent: 'secondary-gradient' },
  { title: 'Quản lý nội dung', description: 'Kiểm tra và xóa bài giảng, tài liệu vi phạm chính sách.', accent: 'dark-gradient' },
  { title: 'Quản lý quyền truy cập', description: 'Đình chỉ tài khoản khi có phê duyệt theo quy trình quản lý.', accent: 'primary-gradient' },
];

export function AdminDashboard() {
  const { user } = useAuth();
  const name = user?.fullName || user?.username || 'Admin';

  return (
    <div className="dashboard-container admin-dashboard">
      <div className="dashboard-welcome glass-card admin-hero">
        <div>
          <span className="eyebrow">Admin workspace</span>
          <h1>Xin chào, {name}.</h1>
          <p>Quản trị hệ thống, giám sát nội dung và duyệt quyền truy cập theo quy trình quản lý.</p>
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
            <h2>Quản lý tài khoản</h2>
            <button type="button" className="link-btn">+ Tạo giáo viên</button>
          </div>

          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Tên</th>
                  <th>Vai trò</th>
                  <th>Trạng thái</th>
                  <th>Lần hoạt động</th>
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
            <h2>Quản lý phản hồi</h2>
            <button type="button" className="link-btn">Xem tất cả</button>
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
            <h2>Quản lý nội dung</h2>
            <button type="button" className="link-btn">Kiểm tra</button>
          </div>

          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Tiêu đề</th>
                  <th>Loại</th>
                  <th>Lý do</th>
                  <th>Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {contentRows.map((row) => (
                  <tr key={row.title}>
                    <td>{row.title}</td>
                    <td>{row.type}</td>
                    <td>{row.reason}</td>
                    <td><span className={`status-pill ${row.status === 'Đã xoá' ? 'danger' : row.status === 'Đang kiểm tra' ? 'warning' : ''}`}>{row.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="glass-card">
          <div className="section-head">
            <h2>Quản lý quyền truy cập</h2>
            <button type="button" className="link-btn">Duyệt</button>
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
          <h2>Tạo tài khoản giáo viên</h2>
          <button type="button" className="link-btn">Lưu tài khoản</button>
        </div>

        <div className="teacher-form-grid">
          <label>
            Họ và tên
            <input type="text" placeholder="Nhập tên giáo viên" />
          </label>
          <label>
            Email
            <input type="email" placeholder="teacher@ielts.ai" />
          </label>
          <label>
            Số điện thoại
            <input type="tel" placeholder="0987 654 321" />
          </label>
          <label>
            Chuyên môn
            <input type="text" placeholder="Speaking / Writing / General" />
          </label>
          <label>
            Trình độ
            <input type="text" placeholder="IELTS 8.5 / CELTA" />
          </label>
          <label>
            Quyền truy cập
            <select defaultValue="teacher">
              <option value="teacher">Giáo viên</option>
              <option value="editor">Biên tập nội dung</option>
              <option value="reviewer">Reviewer</option>
            </select>
          </label>
        </div>
      </div>
    </div>
  );
}
