import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../../shared/auth/AuthContext';
import { learningApi } from '../../../shared/api';
import { useLanguage } from '../../../shared/i18n/LanguageContext';

const money = (value) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value || 0);

export function ClassesPage() {
  const [params, setParams] = useSearchParams();
  const { user } = useAuth();
  const { t } = useLanguage();
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
          <div><span className="content-detail-eyebrow">{t('IELTS LEARNING')}</span><h1>{t(profile ? 'Giáo viên & lớp học' : 'Lớp học')}</h1><p>{t(profile ? 'Thông tin giáo viên và các lesson đang mở đăng ký.' : 'Chọn giáo viên để xem hồ sơ và các lớp học.')}</p></div>
          {profile && <button type="button" className="secondary-btn" onClick={() => setParams({})}>← {t('Danh sách giáo viên')}</button>}
        </div>
        {error &&         <p className="teacher-quiz-notice error" role="alert">{t(error)}</p>}
        {notice &&         <p className="teacher-quiz-notice success" role="status">{t(notice)}</p>}
        {detailLoading ? <p className="content-list-state" role="status">{t('Đang tải hồ sơ giáo viên…')}</p> : profile ? (
          <>
            <article className="teacher-profile-panel">
              {profile.avatar ? <img src={profile.avatar} alt={profile.name} /> : <div className="teacher-profile-avatar">{profile.name?.[0]?.toUpperCase() || 'T'}</div>}
              <div className="teacher-profile-copy"><span className="content-detail-eyebrow">{t('GIÁO VIÊN IELTS')}</span><h2>{profile.name}</h2>
                <p>{profile.biography || t('Giáo viên sẵn sàng đồng hành cùng lộ trình IELTS của bạn.')}</p>
                <div className="teacher-profile-tags">{profile.specialization && <span>{t(profile.specialization)}</span>}{profile.qualification && <span>{t(profile.qualification)}</span>}{profile.ieltsBand != null && <span>IELTS {profile.ieltsBand}</span>}{profile.experienceYears != null && <span>{profile.experienceYears} {t('năm kinh nghiệm')}</span>}</div>
              </div>
              <div className="teacher-profile-stat"><strong>{profile.totalStudents || 0}</strong><span>{t('học viên')}</span>{profile.rating != null && <><strong>★ {profile.rating.toFixed(1)}</strong><span>{t('đánh giá')}</span></>}</div>
            </article>
            <div className="available-lessons-heading teacher-classes-heading"><div><h2>{t('Lớp & lesson')}</h2><p>{lessons.length} {t('lesson đang mở')}</p></div></div>
            {lessons.length === 0 ? <div className="available-lessons-empty"><h2>{t('Chưa có lớp học')}</h2><p>{t('Giáo viên chưa đăng lesson nào được duyệt.')}</p></div> : <div className="available-lessons-grid">
              {lessons.map((lesson) => <article className="available-lesson-tile" key={lesson.materialId}>
                <div className="available-lesson-topline"><span className="admin-content-skill">{t(lesson.skill || 'IELTS')}</span><span className="available-lesson-level">{t(lesson.level || 'Mọi trình độ')}</span></div>
                <h2>{lesson.title}</h2><p className="available-lesson-description">{lesson.description || t('Lesson luyện tập do giáo viên biên soạn.')}</p>
                <div className="available-lesson-details"><span>{lesson.questionCount} {t('câu hỏi')}</span>{lesson.quizId && <span>{t('Quiz có sẵn')}</span>}</div>
                <div className="available-lesson-footer"><span className={lesson.isFree ? 'available-lesson-free' : 'available-lesson-price'}>{lesson.isFree ? t('Miễn phí') : money(lesson.price)}</span>{lesson.isFree ? <button className="feature-action learner-enroll-button" type="button" disabled={busyId === lesson.materialId || registered.has(lesson.materialId)} onClick={() => enroll(lesson)}>{registered.has(lesson.materialId) ? t('Đã đăng ký') : busyId === lesson.materialId ? t('Đang đăng ký…') : t('Đăng ký lesson')}</button> : <button className="secondary-btn learner-enroll-button" type="button" disabled>{t('Mua lẻ — sắp có')}</button>}</div>
                {!lesson.isFree && <small><Link to="/user/dashboard">{t('Xem gói thành viên')}</Link></small>}
              </article>)}
            </div>}
          </>
        ) : loading ? <p className="content-list-state" role="status">{t('Đang tải giáo viên…')}</p> : teachers.length === 0 ? <div className="available-lessons-empty"><h2>{t('Chưa có giáo viên')}</h2><p>{t('Danh sách giáo viên sẽ được hiển thị tại đây.')}</p></div> : <div className="teacher-directory-grid">
          {teachers.map((teacher) => <button className="teacher-directory-card" key={teacher.teacherId} type="button" onClick={() => setParams({ teacher: teacher.teacherId })}>
            {teacher.avatar ? <img src={teacher.avatar} alt="" /> : <span className="teacher-profile-avatar">{teacher.name?.[0]?.toUpperCase() || 'T'}</span>}
            <span className="teacher-directory-details"><strong>{teacher.name}</strong><span>{t(teacher.specialization || teacher.qualification || 'Giáo viên IELTS')}</span><span>{teacher.experienceYears ?? 0} {t('năm kinh nghiệm')} · {teacher.classCount} {t('lớp')}</span></span>
            {teacher.ieltsBand != null && <span className="teacher-band">IELTS {teacher.ieltsBand}</span>}
          </button>)}
        </div>}
      </section>
    </div>
  );
}
