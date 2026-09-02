import { useAuth } from '../../app/AuthContext';

const summaryStats = [
  { label: 'Lớp học', value: '08', tone: 'default' },
  { label: 'Học viên', value: '286', tone: 'default' },
  { label: 'Bài chấm', value: '24', tone: 'warning' },
  { label: 'AI cần duyệt', value: '07', tone: 'danger' },
];

const classList = [
  { name: 'IELTS Writing 6.5', students: 24, nextLesson: 'Hôm nay · 19:00 - 20:30', meet: 'Google Meet', status: 'Đang diễn ra' },
  { name: 'IELTS Speaking Masterclass', students: 15, nextLesson: 'Ngày mai · 18:00', meet: 'Google Meet', status: 'Sắp mở' },
  { name: 'General English Booster', students: 31, nextLesson: 'Thứ 5 · 17:30', meet: 'Google Meet', status: 'Đã lên lịch' },
];

const lessonList = [
  { title: 'Lesson 04: Task 2 Structure', type: 'Writing', price: 'Miễn phí', updated: '2 giờ trước' },
  { title: 'Speaking Part 3 Cue Cards', type: 'Speaking', price: 'Gold', updated: 'Hôm qua' },
  { title: 'Vocabulary Booster Band 7.5+', type: 'Vocabulary', price: 'Trả phí', updated: '3 ngày trước' },
];

const gradingQueue = [
  { name: 'Nguyễn Minh A', task: 'Writing Task 2', score: '7.0', status: 'Chờ chấm' },
  { name: 'Lê Hoàng B', task: 'Speaking Part 2', score: '8.5', status: 'Đã gửi nhận xét' },
  { name: 'Phạm Thảo C', task: 'Writing Task 1', score: '6.5', status: 'Cần xem lại' },
];

const aiReviewQueue = [
  { title: 'Set 18 - Reading Passage 2', level: 'Needs fix', author: 'AI Draft', action: 'Review' },
  { title: 'Speaking Cue Card Pack', level: 'Ready', author: 'AI Draft', action: 'Approve' },
  { title: 'Listening Gap Fill Set', level: 'Needs fix', author: 'AI Draft', action: 'Edit' },
];

const quickActions = [
  { title: 'Quản lý lớp học', description: 'Tạo lớp, thêm học viên, lên lịch học và chia sẻ link Google Meet.', accent: 'primary-gradient' },
  { title: 'Quản lý bài giảng', description: 'Upload tài liệu, bài giảng, thiết lập miễn phí hoặc trả phí.', accent: 'secondary-gradient' },
  { title: 'Chấm bài', description: 'Chấm Speaking và Writing cho học viên gói Vàng, gửi nhận xét.', accent: 'dark-gradient' },
  { title: 'Kiểm duyệt AI', description: 'Xem xét, chỉnh sửa và phê duyệt bộ đề AI trước khi công khai.', accent: 'primary-gradient' },
];

export function TeacherDashboard() {
  const { user } = useAuth();
  const name = user?.fullName || user?.username || 'Teacher';

  return (
    <div className="dashboard-container teacher-dashboard">
      <div className="dashboard-welcome glass-card teacher-hero">
        <div>
          <span className="eyebrow">Teacher workspace</span>
          <h1>Xin chào, {name}.</h1>
          <p>Quản lý hồ sơ, lớp học, bài giảng, chấm bài và kiểm duyệt đề AI từ một nơi.</p>
        </div>
        <div className="mini-stat-group">
          {summaryStats.map((item) => (
            <div key={item.label} className="mini-stat-card">
              <span className="label">{item.label}</span>
              <strong className={item.tone === 'warning' ? 'warning' : item.tone === 'danger' ? 'danger' : ''}>{item.value}</strong>
            </div>
          ))}
        </div>
      </div>

      <div className="grid-2 teacher-quick-actions">
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

      <div className="content-grid teacher-main-grid">
        <section className="glass-card">
          <div className="section-head">
            <h2>Hồ sơ giảng viên</h2>
            <button type="button" className="link-btn">Chỉnh sửa</button>
          </div>

          <div className="teacher-profile-panel">
            <div className="teacher-avatar">{(name || 'T')[0].toUpperCase()}</div>
            <div className="teacher-profile-info">
              <h3>{name}</h3>
              <p>IELTS Instructor · Speaking & Writing Specialist</p>
              <div className="tag-row">
                <span className="tag">IELTS 8.5</span>
                <span className="tag">8+ năm kinh nghiệm</span>
                <span className="tag">Cambridge Trainer</span>
              </div>
            </div>
          </div>

          <div className="teacher-bio-block">
            <p>
              Tạo lộ trình học cá nhân hóa, xây dựng bài giảng thực chiến và hướng dẫn học viên luyện thi IELTS theo chuẩn chấm điểm quốc tế.
            </p>
          </div>

          <div className="teacher-certificates">
            <div>
              <span className="label">Chứng chỉ</span>
              <strong>CELTA · TESOL · IELTS Trainer</strong>
            </div>
            <div>
              <span className="label">Thông tin giới thiệu</span>
              <strong>Học viên gói Vàng · 1:1 feedback · Speaking/Writing coach</strong>
            </div>
          </div>
        </section>

        <section className="glass-card">
          <div className="section-head">
            <h2>Tổng quan tháng</h2>
            <button type="button" className="link-btn">Xem báo cáo</button>
          </div>

          <div className="metric-stack">
            <div className="metric-box">
              <span className="label">Buổi dạy</span>
              <strong>32</strong>
            </div>
            <div className="metric-box">
              <span className="label">Tỷ lệ hài lòng</span>
              <strong>96%</strong>
            </div>
            <div className="metric-box">
              <span className="label">Khóa học mới</span>
              <strong>5</strong>
            </div>
          </div>
        </section>
      </div>

      <div className="grid-2 mt-30">
        <section className="glass-card">
          <div className="section-head">
            <h2>Quản lý lớp học</h2>
            <button type="button" className="link-btn">+ Tạo lớp</button>
          </div>

          <div className="list-stack">
            {classList.map((item) => (
              <div key={item.name} className="info-list-item">
                <div>
                  <h3>{item.name}</h3>
                  <p>{item.students} học viên · {item.meet}</p>
                </div>
                <div className="list-meta">
                  <span className="status-badge">{item.status}</span>
                  <small>{item.nextLesson}</small>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="glass-card">
          <div className="section-head">
            <h2>Quản lý bài giảng</h2>
            <button type="button" className="link-btn">Upload</button>
          </div>

          <div className="list-stack">
            {lessonList.map((lesson) => (
              <div key={lesson.title} className="info-list-item lesson-item">
                <div>
                  <h3>{lesson.title}</h3>
                  <p>{lesson.type}</p>
                </div>
                <div className="list-meta lesson-meta">
                  <span className="pricing-badge">{lesson.price}</span>
                  <small>{lesson.updated}</small>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="grid-2 mt-30">
        <section className="glass-card">
          <div className="section-head">
            <h2>Chấm bài</h2>
            <button type="button" className="link-btn">Xem tất cả</button>
          </div>

          <div className="queue-list">
            {gradingQueue.map((item) => (
              <div key={item.name + item.task} className="queue-item">
                <div>
                  <h3>{item.name}</h3>
                  <p>{item.task}</p>
                </div>
                <div className="queue-meta">
                  <span className="score-pill">{item.score}</span>
                  <small>{item.status}</small>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="glass-card">
          <div className="section-head">
            <h2>Kiểm duyệt bộ đề AI</h2>
            <button type="button" className="link-btn">Duyệt hàng loạt</button>
          </div>

          <div className="queue-list">
            {aiReviewQueue.map((item) => (
              <div key={item.title} className="queue-item">
                <div>
                  <h3>{item.title}</h3>
                  <p>{item.author}</p>
                </div>
                <div className="queue-meta">
                  <span className={`review-pill ${item.level === 'Ready' ? 'ok' : 'warning'}`}>{item.level}</span>
                  <small>{item.action}</small>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
