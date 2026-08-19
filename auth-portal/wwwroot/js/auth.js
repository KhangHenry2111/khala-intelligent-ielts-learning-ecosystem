const componentRoot = document.getElementById('component-root');
const messageEl = document.getElementById('message');

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
      <button class="btn-logout" onclick="logout()">🔓 Đăng xuất</button>
    </div>`;
}

function logout() {
  messageEl.textContent = '';
  messageEl.className = 'message';
  loadComponent(document.querySelector('.tab.active')?.dataset.type || 'Admin');
}

async function loadComponent(type, mode = 'login'){
  const url = `/components/${type.toLowerCase()}-${mode}.html?v=2`;
  const res = await fetch(url);
  const html = await res.text();
  componentRoot.innerHTML = html;

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
      if(r.ok && !isRegister){
        const u = data.user || {};
        componentRoot.innerHTML = renderUserProfile(u);
        showMessage('✅ Đăng nhập thành công!', 'success');
      } else if (r.ok) {
        await loadComponent(type, 'login');
        showMessage('✅ Đăng ký thành công! Bạn có thể đăng nhập.', 'success');
      } else {
        showMessage(data.message || 'Đăng nhập thất bại', 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = isRegister ? `Create ${type} Account` : `Sign in as ${type}`;
      }
    }catch(err){
      showMessage('Lỗi kết nối mạng', 'error');
      submitBtn.disabled = false;
      submitBtn.textContent = isRegister ? `Create ${type} Account` : `Sign in as ${type}`;
    }
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
