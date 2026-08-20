const componentRoot = document.getElementById('component-root');
const messageEl = document.getElementById('message');
let transitionId = 0;
let activeController = null;
let signedInUser = null;

// Friendly Vietnamese labels for known database columns
const FIELD_LABELS = {
  UserID: 'Mã người dùng',
  AdminID: 'Mã Admin',
  TeacherID: 'Mã giáo viên',
  FullName: 'Họ và tên',
  Username: 'Tên đăng nhập',
  Email: 'Email',
  PhoneNumber: 'Số điện thoại',
  Avatar: 'Ảnh đại diện',
  DateOfBirth: 'Ngày sinh',
  Gender: 'Giới tính',
  Role: 'Vai trò',
  Status: 'Trạng thái',
  EmailVerified: 'Email đã xác minh',
  PhoneVerified: 'SĐT đã xác minh',
  CurrentBand: 'Band hiện tại',
  TargetBand: 'Band mục tiêu',
  SpeakingBand: 'Band Speaking',
  ListeningBand: 'Band Listening',
  ReadingBand: 'Band Reading',
  WritingBand: 'Band Writing',
  LearningLevel: 'Trình độ học tập',
  Rank: 'Hạng',
  PackageID: 'Mã gói',
  AIQuizUsedThisMonth: 'AI Quiz đã dùng (tháng)',
  LevelTestUsedThisMonth: 'Level Test đã dùng (tháng)',
  UploadedStorageMB: 'Dung lượng đã upload (MB)',
  TotalTests: 'Tổng bài test',
  TotalPracticeQuestions: 'Tổng câu hỏi luyện tập',
  LearningStreak: 'Chuỗi ngày học liên tiếp',
  CreatedAt: 'Ngày tạo',
  UpdatedAt: 'Ngày cập nhật',
  LastLogin: 'Lần đăng nhập cuối',
  Biography: 'Tiểu sử',
  Qualification: 'Bằng cấp',
  QualificationFileURL: 'File bằng cấp',
  IELTSBand: 'Band IELTS',
  ExperienceYears: 'Số năm kinh nghiệm',
  Specialization: 'Chuyên môn',
  VerificationStatus: 'Trạng thái xác minh',
  NumberOfLessons: 'Số bài giảng',
  TotalMaterials: 'Tổng tài liệu',
  TotalQuestions: 'Tổng câu hỏi',
  Contribution: 'Đóng góp',
  AverageRating: 'Đánh giá trung bình',
  TotalStudents: 'Tổng học viên',
  AdminLevel: 'Cấp Admin',
  IsITCenterIssued: 'Cấp bởi IT Center',
  CreatedByAdminID: 'Admin tạo bởi',
};

function formatValue(key, val) {
  if (val === null || val === undefined || val === '') return '<span class="null-value">—</span>';
  // Boolean columns
  if (typeof val === 'boolean' || val === 0 || val === 1) {
    if (key.toLowerCase().includes('verified') || key === 'IsITCenterIssued') {
      const boolVal = val === true || val === 1;
      return boolVal
        ? '<span class="badge badge-yes">✓ Có</span>'
        : '<span class="badge badge-no">✗ Chưa</span>';
    }
  }
  // Date-like strings
  if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}/.test(val)) {
    try {
      const d = new Date(val);
      return d.toLocaleDateString('vi-VN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    } catch { return val; }
  }
  return String(val);
}

function renderUserProfile(user) {
  const details = user.details || {};

  // Build rows from Details (which contains ALL columns except Password)
  let rows = '';
  for (const [key, val] of Object.entries(details)) {
    const label = FIELD_LABELS[key] || key;
    rows += `<tr><td class="detail-label">${label}</td><td class="detail-value">${formatValue(key, val)}</td></tr>`;
  }

  return `
    <div class="profile-card">
      <div class="profile-header">
        <div class="profile-avatar">${(user.fullName || user.username || '?')[0].toUpperCase()}</div>
        <div class="profile-summary">
          <h2>${user.fullName || user.username}</h2>
          <span class="badge badge-role">${user.userType || ''}</span>
          <p class="profile-email">${user.email || ''}</p>
        </div>
      </div>
      <h3 class="section-title">📋 Toàn bộ thông tin</h3>
      <div class="details-table-wrap">
        <table class="details-table">
          <tbody>${rows}</tbody>
        </table>
      </div>
      ${String(user.userType).toLowerCase() === 'student' ? '<button class="text-button" type="button" data-dashboard-action="back">← Back to dashboard</button>' : ''}
      <button class="btn-logout" onclick="logout()">🔓 Đăng xuất</button>
    </div>`;
}

function renderStudentDashboard(user) {
  const name = escapeHtml(user.fullName || user.username || 'Student');
  const initial = escapeHtml((user.fullName || user.username || '?')[0].toUpperCase());
  return `
    <section class="student-dashboard" aria-label="Student dashboard">
      <header class="dashboard-header">
        <div>
          <p class="eyebrow">Student workspace</p>
          <h2>Good to see you, ${name}.</h2>
          <p class="dashboard-lede">A small step today makes your target band feel closer.</p>
        </div>
        <div class="dashboard-actions">
          <button class="icon-button" type="button" data-dashboard-action="profile" title="View profile" aria-label="View profile">${initial}</button>
          <button class="btn-logout" type="button" data-dashboard-action="logout">Log out</button>
        </div>
      </header>
      <div class="progress-strip">
        <div><span class="progress-label">Your learning streak</span><strong>Keep it going</strong></div>
        <div class="progress-track"><span style="width: 42%"></span></div>
        <span class="progress-note">Build a daily habit</span>
      </div>
      <div class="option-grid">
        <button class="option-card option-primary" type="button" data-dashboard-action="study">
          <span class="option-icon">↗</span><span><small>Practice today</small><strong>Study</strong><em>Build skills with focused lessons.</em></span><span class="card-arrow">→</span>
        </button>
        <button class="option-card" type="button" data-dashboard-action="level-test">
          <span class="option-icon">◉</span><span><small>Find your starting point</small><strong>Test your level</strong><em>See where your English stands.</em></span><span class="card-arrow">→</span>
        </button>
        <button class="option-card" type="button" data-dashboard-action="documents">
          <span class="option-icon">▤</span><span><small>Keep everything close</small><strong>Your documents</strong><em>Review saved learning materials.</em></span><span class="card-arrow">→</span>
        </button>
        <button class="option-card" type="button" data-dashboard-action="classes">
          <span class="option-icon">⌂</span><span><small>Learn together</small><strong>Your class</strong><em>Meet your lessons and classmates.</em></span><span class="card-arrow">→</span>
        </button>
        <button class="option-card" type="button" data-dashboard-action="payment">
          <span class="option-icon">$</span><span><small>Manage your plan</small><strong>Payment</strong><em>View your package and billing.</em></span><span class="card-arrow">→</span>
        </button>
        <button class="option-card" type="button" data-dashboard-action="support">
          <span class="option-icon">?</span><span><small>We are here to help</small><strong>Support</strong><em>Get answers when you need them.</em></span><span class="card-arrow">→</span>
        </button>
      </div>
      <div class="dashboard-toast" id="dashboard-toast" role="status" aria-live="polite"></div>
    </section>`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
}

function logout() {
  signedInUser = null;
  messageEl.textContent = '';
  messageEl.className = 'message';
  loadComponent(document.querySelector('.tab.active')?.dataset.type || 'Admin');
}

async function loadComponent(type, mode = 'login'){
  const requestId = ++transitionId;
  activeController?.abort();
  const controller = new AbortController();
  activeController = controller;
  const url = `/components/${type.toLowerCase()}-${mode}.html?v=2`;
  let res;
  try {
    res = await fetch(url, { signal: controller.signal });
    const html = await res.text();
    if (requestId !== transitionId) return;
    componentRoot.innerHTML = html;
  } catch (err) {
    if (err.name === 'AbortError' || requestId !== transitionId) return;
    showMessage('Không thể tải giao diện. Vui lòng thử lại.', 'error');
    return;
  }

  const form = componentRoot.querySelector('form');
  if (!form) {
    showMessage('Không thể tải giao diện xác thực', 'error');
    return;
  }

  componentRoot.querySelector('[data-action="register"]')?.addEventListener('click', () => {
    loadComponent(type, 'register');
  });
  componentRoot.querySelector('[data-action="login"]')?.addEventListener('click', () => {
    loadComponent(type, 'login');
  });

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const fd = new FormData(form);
    const isRegister = form.dataset.form === 'register';
    const payload = Object.fromEntries(fd.entries());
    delete payload.confirmPassword;
    payload.userType = form.dataset.usertype || type;

    if (isRegister && payload.ieltsBand !== undefined) {
      payload.ieltsBand = Number(payload.ieltsBand);
      payload.experienceYears = Number(payload.experienceYears);
    }

    if (isRegister && fd.get('password') !== fd.get('confirmPassword')) {
      showMessage('Mật khẩu xác nhận không khớp', 'error');
      return;
    }

    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Đang xử lý...';

    try{
      const r = await fetch(`/api/auth/${isRegister ? 'register' : 'login'}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(isRegister ? {'X-Frontend-Client': 'auth-portal'} : {}),
        },
        body: JSON.stringify(payload)
      });

      const data = await r.json().catch(()=>({}));
      if (requestId !== transitionId) return;
      if(r.ok && !isRegister){
        const u = data.user || {};
        signedInUser = u;
        componentRoot.innerHTML = type.toLowerCase() === 'student' ? renderStudentDashboard(u) : renderUserProfile(u);
        messageEl.textContent = '';
        messageEl.className = 'message';
        bindDashboardActions();
      } else if (r.ok) {
        await loadComponent(type, 'login');
        if (requestId !== transitionId) return;
        showMessage('✅ Đăng ký thành công! Bạn có thể đăng nhập.', 'success');
      } else {
        showMessage(data.message || 'Đăng nhập thất bại', 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = isRegister ? `Create ${type} Account` : `Sign in as ${type}`;
      }
    }catch(err){
      if (requestId !== transitionId) return;
      showMessage('Lỗi kết nối mạng', 'error');
      submitBtn.disabled = false;
      submitBtn.textContent = isRegister ? `Create ${type} Account` : `Sign in as ${type}`;
    }
  });
}

function bindDashboardActions() {
  componentRoot.querySelectorAll('[data-dashboard-action]').forEach(button => {
    button.addEventListener('click', () => {
      const action = button.dataset.dashboardAction;
      if (action === 'logout') { logout(); return; }
      if (action === 'profile') {
        componentRoot.innerHTML = renderUserProfile(signedInUser || {});
        componentRoot.querySelector('[data-dashboard-action="back"]')?.addEventListener('click', () => {
          componentRoot.innerHTML = renderStudentDashboard(signedInUser || {});
          bindDashboardActions();
        });
        return;
      }
      const toast = componentRoot.querySelector('#dashboard-toast');
      if (toast) toast.textContent = `${button.querySelector('strong')?.textContent || 'Tính năng'} đang được chuẩn bị cho bạn.`;
    });
  });
}

function showMessage(text, type){
  messageEl.textContent = text;
  messageEl.className = `message ${type}`;
}

document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    loadComponent(btn.dataset.type);
  });
});

// initial load
loadComponent(document.querySelector('.tab.active')?.dataset.type || 'Student');
