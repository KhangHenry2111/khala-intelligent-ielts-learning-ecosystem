import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { authApi } from '../../shared/api';
import { useAuth } from '../../shared/auth/AuthContext';
import { LanguageSwitcher, useLanguage } from '../../shared/i18n/LanguageContext';
import { normalizeRole } from '../../shared/lib/roles';
import { AuthBrandPanel } from './components/AuthBrandPanel';
import { AuthForm } from './components/AuthForm';

const labels = { user: 'User', teacher: 'Teacher', admin: 'Admin' };

export function AuthPage({ mode, role: fixedRole }) {
  const { t } = useLanguage();
  const { role: routeRole } = useParams();
  const role = normalizeRole(fixedRole || routeRole || 'user');
  const title = labels[role] || 'Student';
  const isRegister = mode === 'register';
  const [form, setForm] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const { signIn } = useAuth();
  const navigate = useNavigate();

  function update(event) {
    setForm({ ...form, [event.target.name]: event.target.value });
  }

  async function submit(event) {
    event.preventDefault();
    setError('');
    if (isRegister && form.password !== form.confirmPassword) {
      setError(t('Passwords do not match.'));
      return;
    }
    setBusy(true);
    try {
      const payload = { ...form, userType: title };
      delete payload.confirmPassword;
      if (isRegister && role === 'teacher') {
        payload.ieltsBand = Number(payload.ieltsBand);
        payload.experienceYears = Number(payload.experienceYears);
      }
      const result = isRegister ? await authApi.register(payload) : await authApi.login(payload);
      if (isRegister) {
        navigate(`/${role}/login`, { state: { message: t('Registration successful. You can sign in now.') } });
      } else {
        signIn({ ...result.user, accessToken: result.token });
        navigate(`/${role}/dashboard`);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-shell">
      <AuthBrandPanel title={t(title)} />
      <section className="auth-panel">
        <nav className="auth-role-nav">
          <LanguageSwitcher />
          <Link to="/user/login">{t('User')}</Link>
          <Link to="/teacher/login">{t('Teacher')}</Link>
          <Link to="/admin/login">{t('Admin')}</Link>
        </nav>
        <AuthForm
          role={role}
          title={title}
          isRegister={isRegister}
          form={form}
          error={error}
          busy={busy}
          onChange={update}
          onSubmit={submit}
        />
      </section>
    </main>
  );
}
