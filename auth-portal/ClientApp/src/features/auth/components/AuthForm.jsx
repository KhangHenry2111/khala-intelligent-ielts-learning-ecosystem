import { Link } from 'react-router-dom';
import { useLanguage } from '../../../shared/i18n/LanguageContext';

const submitLabels = {
  user: { login: 'Sign in as a user', register: 'Create a user account' },
  teacher: { login: 'Sign in as a teacher', register: 'Create a teacher account' },
  admin: { login: 'Sign in as an admin', register: 'Create an admin account' },
};

function Field({ name, label, type = 'text', required = true, value, onChange }) {
  const { t } = useLanguage();
  return (
    <label>
      {t(label)}
      <input name={name} type={type} value={value || ''} onChange={onChange} required={required} />
    </label>
  );
}

export function AuthForm({
  role,
  title,
  isRegister,
  form,
  error,
  busy,
  onChange,
  onSubmit,
}) {
  const { t } = useLanguage();
  const accountLabel = role === 'teacher' ? 'teacher' : title.toLowerCase();
  const heading = isRegister
    ? t('Create an account for') + ` ${t(accountLabel)}`
    : `${t('Welcome back')}, ${t(title)}.`;
  const submitLabel = submitLabels[role]?.[isRegister ? 'register' : 'login'];

  return (
    <form onSubmit={onSubmit} className="auth-form">
      <span className="form-kicker">{isRegister ? t('Begin your progress') : `${t(title)} ${t('workspace')}`}</span>
      <h2>{heading}</h2>
      <p className="form-hint">{isRegister ? t('Add your details to get started.') : t('Sign in to continue your learning journey.')}</p>

      {isRegister && role === 'teacher' && (
        <div className="form-grid">
          <Field name="fullName" label="Full name" value={form.fullName} onChange={onChange} />
          <Field name="phoneNumber" label="Phone number" type="tel" value={form.phoneNumber} onChange={onChange} />
        </div>
      )}
      {isRegister && role === 'user' && (
        <Field name="fullName" label="Full name" required={false} value={form.fullName} onChange={onChange} />
      )}
      {isRegister && <Field name="email" label="Email" type="email" value={form.email} onChange={onChange} />}
      <Field name="username" label="Username" value={form.username} onChange={onChange} />
      <Field name="password" label="Password" type="password" value={form.password} onChange={onChange} />
      {isRegister && (
        <Field name="confirmPassword" label="Confirm password" type="password" value={form.confirmPassword} onChange={onChange} />
      )}
      {isRegister && role === 'teacher' && (
        <>
          <div className="form-grid">
            <Field name="avatar" label="Avatar URL" type="url" value={form.avatar} onChange={onChange} />
            <Field name="qualification" label="Qualification" value={form.qualification} onChange={onChange} />
          </div>
          <Field name="biography" label="Biography" value={form.biography} onChange={onChange} />
          <div className="form-grid">
            <Field name="qualificationFileURL" label="Qualification file URL" type="url" value={form.qualificationFileURL} onChange={onChange} />
            <Field name="specialization" label="Specialization" value={form.specialization} onChange={onChange} />
          </div>
          <div className="form-grid">
            <Field name="ieltsBand" label="IELTS band" type="number" value={form.ieltsBand} onChange={onChange} />
            <Field name="experienceYears" label="Experience (years)" type="number" value={form.experienceYears} onChange={onChange} />
          </div>
        </>
      )}
      {error && <p className="form-error" role="alert">{t(error)}</p>}
      <button disabled={busy}>
        {busy ? t('Processing...') : t(submitLabel)} <span>→</span>
      </button>
      {role !== 'admin' && (
        <p className="auth-switch">
          {isRegister ? t('Already have an account?') : t("Don't have an account?")}{' '}
          <Link to={`/${role}/${isRegister ? 'login' : 'register'}`}>
            {isRegister ? t('Sign in') : `${t('Register as')} ${t(accountLabel)}`}
          </Link>
        </p>
      )}
    </form>
  );
}
