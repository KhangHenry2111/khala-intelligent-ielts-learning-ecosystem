import { Link } from 'react-router-dom';

function Field({ name, label, type = 'text', required = true, value, onChange }) {
  return (
    <label>
      {label}
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
  const accountTitle = role === 'teacher' ? 'a teacher' : `a ${title.toLowerCase()}`;

  return (
    <form onSubmit={onSubmit} className="auth-form">
      <span className="form-kicker">{isRegister ? 'Begin your progress' : `${title} workspace`}</span>
      <h2>{isRegister ? `Create ${accountTitle} account` : `Welcome back, ${title}.`}</h2>
      <p className="form-hint">{isRegister ? 'Add your details to get started.' : 'Sign in to continue your learning journey.'}</p>

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
      {error && <p className="form-error" role="alert">{error}</p>}
      <button disabled={busy}>
        {busy ? 'Processing...' : isRegister ? `Create ${title} account` : `Sign in as ${title}`} <span>→</span>
      </button>
      {role !== 'admin' && (
        <p className="auth-switch">
          {isRegister ? 'Already have an account?' : "Don't have an account?"}{' '}
          <Link to={`/${role}/${isRegister ? 'login' : 'register'}`}>
            {isRegister ? 'Sign in' : `Register as ${title}`}
          </Link>
        </p>
      )}
    </form>
  );
}
