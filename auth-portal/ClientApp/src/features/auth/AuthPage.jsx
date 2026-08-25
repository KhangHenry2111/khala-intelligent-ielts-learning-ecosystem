import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { authApi } from '../../app/api';
import { useAuth } from '../../app/AuthContext';

const labels = { user: 'User', teacher: 'Teacher', admin: 'Admin' };

export function AuthPage({ mode, role: fixedRole }) {
  const { role: routeRole } = useParams();
  const role = (fixedRole || routeRole || 'user').toLowerCase();
  const title = labels[role] || 'Student';
  const isRegister = mode === 'register';
  const [form, setForm] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const update = (event) => setForm({ ...form, [event.target.name]: event.target.value });

  async function submit(event) {
    event.preventDefault(); setError('');
    if (isRegister && form.password !== form.confirmPassword) return setError('Mật khẩu xác nhận không khớp.');
    setBusy(true);
    try {
      const payload = { ...form, userType: title };
      delete payload.confirmPassword;
      if (isRegister && role === 'teacher') {
        payload.ieltsBand = Number(payload.ieltsBand); payload.experienceYears = Number(payload.experienceYears);
      }
      const result = isRegister ? await authApi.register(payload) : await authApi.login(payload);
      if (isRegister) navigate(`/${role}/login`, { state: { message: 'Đăng ký thành công. Bạn có thể đăng nhập.' } });
      else { signIn(result.user); navigate(`/${role}/dashboard`); }
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  const field = (name, label, type = 'text', required = true) => <label>{label}<input name={name} type={type} value={form[name] || ''} onChange={update} required={required} /></label>;
  const accountTitle = role === 'teacher' ? 'a teacher' : `a ${title.toLowerCase()}`;
  return <main className="auth-shell"><aside className="brand-panel"><span className="brand-mark">IA</span><p className="eyebrow">IELTS Study Assistant</p><h1>Make progress<br /><i>visible.</i></h1><p>Focused tools for the next confident step in your English journey.</p><div className="orbit-label">{title} workspace</div></aside>
    <section className="auth-panel"><nav><Link to="/user/login">User</Link><Link to="/teacher/login">Teacher</Link><Link to="/admin/login">Admin</Link></nav>
      <form onSubmit={submit} className="auth-form"><span className="form-kicker">{isRegister ? 'Begin your progress' : `${title} workspace`}</span><h2>{isRegister ? `Create ${accountTitle} account` : `Welcome back, ${title}.`}</h2><p className="form-hint">{isRegister ? 'Add your details to get started.' : 'Sign in to continue your learning journey.'}</p>
        {isRegister && role === 'teacher' && <div className="form-grid">{field('fullName', 'Full name')}{field('phoneNumber', 'Phone number', 'tel')}</div>}
        {isRegister && role === 'user' && field('fullName', 'Full name', 'text', false)}
        {isRegister && field('email', 'Email', 'email')}{field('username', 'Username')}{field('password', 'Password', 'password')}
        {isRegister && field('confirmPassword', 'Confirm password', 'password')}
        {isRegister && role === 'teacher' && <><div className="form-grid">{field('avatar', 'Avatar URL', 'url')}{field('qualification', 'Qualification')}</div>{field('biography', 'Biography', 'text')}<div className="form-grid">{field('qualificationFileURL', 'Qualification file URL', 'url')}{field('specialization', 'Specialization')}</div><div className="form-grid">{field('ieltsBand', 'IELTS band', 'number')}{field('experienceYears', 'Experience (years)', 'number')}</div></>}
        {error && <p className="form-error" role="alert">{error}</p>}<button disabled={busy}>{busy ? 'Processing...' : isRegister ? `Create ${title} account` : `Sign in as ${title}`} <span>→</span></button>
        {role !== 'admin' && <p className="auth-switch">{isRegister ? 'Already have an account?' : "Don't have an account?"} <Link to={`/${role}/${isRegister ? 'login' : 'register'}`}>{isRegister ? 'Sign in' : `Register as ${title}`}</Link></p>}
      </form></section></main>;
}
