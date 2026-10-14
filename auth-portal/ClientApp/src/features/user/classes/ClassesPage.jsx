import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../../shared/auth/AuthContext';
import { learningApi } from '../../../shared/api';

const money = (value) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value || 0);

export function ClassesPage() {
  const [params, setParams] = useSearchParams();
  const { user } = useAuth();
  const selectedId = params.get('teacher');
  const [teachers, setTeachers] = useState([]);
  const [profile, setProfile] = useState(null);
  const [lessons, setLessons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busyId, setBusyId] = useState('');
  const [registered, setRegistered] = useState(() => new Set());

  useEffect(() => {
    let active = true;
    learningApi.teachers().then((result) => { if (active) setTeachers(result.items || []); })
      .catch((cause) => { if (active) setError(cause.message || 'Không thể tải danh sách giáo viên.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!selectedId) { setProfile(null); setLessons([]); return undefined; }
    let active = true;
    setDetailLoading(true); setError(''); setNotice('');
    learningApi.teacher(selectedId).then((result) => {
      if (active) { setProfile(result.teacher); setLessons(result.lessons || []); }
    }).catch((cause) => { if (active) setError(cause.message || 'Không thể tải hồ sơ giáo viên.'); })
      .finally(() => { if (active) setDetailLoading(false); });
    return () => { active = false; };
  }, [selectedId]);

  const enroll = async (lesson) => {
    if (!user?.accessToken) { setError('Vui lòng đăng nhập tài khoản học viên để đăng ký lớp.'); return; }
    setBusyId(lesson.materialId); setError(''); setNotice('');
    try {
      const result = await learningApi.enroll(lesson.materialId, user.accessToken);
      setRegistered((current) => new Set(current).add(lesson.materialId));
      setNotice(result.message || 'Đăng ký lớp thành công.');
    } catch (cause) {
      setError(cause.message || 'Không thể đăng ký lesson.');
    } finally { setBusyId(''); }
  };

  return (
    <div className="dashboard-container learner-classes-page">
      <section className="glass-card available-lessons-card">
        <div className="available-lessons-heading">
          <div><span className="content-detail-eyebrow">IELTS LEARNING</span><h1>{profile ? 'Giáo viên & lớp học' : 'Lớp học'}</h1><p>{profile ? 'Thông tin giáo viên và các lesson đang mở đăng ký.' : 'Chọn giáo viên để xem hồ sơ và các lớp học.'}</p></div>
          {profile && <button type="button" className="secondary-btn" onClick={() => setParams({})}>← Danh sách giáo viên</button>}
        </div>
        {error && <p className="teacher-quiz-notice error" role="alert">{error}</p>}
        {notice && <p className="teacher-quiz-notice success" role="status">{notice}</p>}
        {detailLoading ? <p className="content-list-state" role="status">Đang tải hồ sơ giáo viên…</p> : profile ? (
          <>
            <article className="teacher-profile-panel">
              {profile.avatar ? <img src={profile.avatar} alt={profile.name} /> : <div className="teacher-profile-avatar">{profile.name?.[0]?.toUpperCase() || 'T'}</div>}
              <div className="teacher-profile-copy"><span className="content-detail-eyebrow">GIÁO VIÊN IELTS</span><h2>{profile.name}</h2>
                <p>{profile.biography || 'Giáo viên sẵn sàng đồng hành cùng lộ trình IELTS của bạn.'}</p>
                <div className="teacher-profile-tags">{profile.specialization && <span>{profile.specialization}</span>}{profile.qualification && <span>{profile.qualification}</span>}{profile.ieltsBand != null && <span>IELTS {profile.ieltsBand}</span>}{profile.experienceYears != null && <span>{profile.experienceYears} năm kinh nghiệm</span>}</div>
              </div>
              <div className="teacher-profile-stat"><strong>{profile.totalStudents || 0}</strong><span>học viên</span>{profile.rating != null && <><strong>★ {profile.rating.toFixed(1)}</strong><span>đánh giá</span></>}</div>
            </article>
            <div className="available-lessons-heading teacher-classes-heading"><div><h2>Lớp & lesson</h2><p>{lessons.length} lesson đang mở</p></div></div>
            {lessons.length === 0 ? <div className="available-lessons-empty"><h2>Chưa có lớp học</h2><p>Giáo viên chưa đăng lesson nào được duyệt.</p></div> : <div className="available-lessons-grid">
              {lessons.map((lesson) => <article className="available-lesson-tile" key={lesson.materialId}>
                <div className="available-lesson-topline"><span className="admin-content-skill">{lesson.skill || 'IELTS'}</span><span className="available-lesson-level">{lesson.level || 'Mọi trình độ'}</span></div>
                <h2>{lesson.title}</h2><p className="available-lesson-description">{lesson.description || 'Lesson luyện tập do giáo viên biên soạn.'}</p>
                <div className="available-lesson-details"><span>{lesson.questionCount} câu hỏi</span>{lesson.quizId && <span>Quiz có sẵn</span>}</div>
                <div className="available-lesson-footer"><span className={lesson.isFree ? 'available-lesson-free' : 'available-lesson-price'}>{lesson.isFree ? 'Miễn phí' : money(lesson.price)}</span><button className="feature-action learner-enroll-button" type="button" disabled={!lesson.isFree || busyId === lesson.materialId || registered.has(lesson.materialId)} onClick={() => enroll(lesson)}>{registered.has(lesson.materialId) ? 'Đã đăng ký' : busyId === lesson.materialId ? 'Đang đăng ký…' : lesson.isFree ? 'Đăng ký lesson' : 'Cần thanh toán'}</button></div>
              </article>)}
            </div>}
          </>
        ) : loading ? <p className="content-list-state" role="status">Đang tải giáo viên…</p> : teachers.length === 0 ? <div className="available-lessons-empty"><h2>Chưa có giáo viên</h2><p>Danh sách giáo viên sẽ được hiển thị tại đây.</p></div> : <div className="teacher-directory-grid">
          {teachers.map((teacher) => <button className="teacher-directory-card" key={teacher.teacherId} type="button" onClick={() => setParams({ teacher: teacher.teacherId })}>
            {teacher.avatar ? <img src={teacher.avatar} alt="" /> : <span className="teacher-profile-avatar">{teacher.name?.[0]?.toUpperCase() || 'T'}</span>}
            <span className="teacher-directory-details"><strong>{teacher.name}</strong><span>{teacher.specialization || teacher.qualification || 'Giáo viên IELTS'}</span><span>{teacher.experienceYears ?? 0} năm kinh nghiệm · {teacher.classCount} lớp</span></span>
            {teacher.ieltsBand != null && <span className="teacher-band">IELTS {teacher.ieltsBand}</span>}
          </button>)}
        </div>}
      </section>
    </div>
  );
}
