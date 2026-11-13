import { useState } from 'react';
import { useLanguage } from '../../../shared/i18n/LanguageContext';
import { authApi } from '../../../shared/api';

const userTypes = { user: 'User', teacher: 'Teacher' };

export function PasswordResetForm({ role, onBack, onComplete }) {
  const { t } = useLanguage();
  const [step, setStep] = useState('request');
  const [form, setForm] = useState({ username: '', method: 'email', destination: '', code: '', newPassword: '', confirmPassword: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function update(event) {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
    setError('');
  }

  async function submit(event) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const payload = {
        username: form.username,
        userType: userTypes[role],
        method: form.method,
        destination: form.destination,
      };
      if (step === 'request') {
        await authApi.requestPasswordReset(payload);
        setStep('verify');
      } else {
        if (form.newPassword !== form.confirmPassword) {
          setError(t('Passwords do not match.'));
          return;
        }
        await authApi.resetPassword({ ...payload, code: form.code, newPassword: form.newPassword });
        setStep('complete');
      }
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  if (step === 'complete') {
    return (
      <div className="auth-form">
        <span className="form-kicker">{t('Password reset')}</span>
        <h2>{t('Password updated')}</h2>
        <p className="auth-success" role="status">{t('Your password has been updated. You can sign in now.')}</p>
        <button type="button" onClick={onComplete}>{t('Back to sign in')}</button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="auth-form">
      <span className="form-kicker">{t('Account recovery')}</span>
      <h2>{t('Forgot password?')}</h2>
      <p className="form-hint">
        {step === 'request'
          ? t('Choose where to receive your verification code.')
          : t('If the account details match, a verification code was sent.')}
      </p>

      {step === 'request' ? (
        <>
          <label>
            {t('Username')}
            <input name="username" autoComplete="username" value={form.username} onChange={update} required />
          </label>
          <label>
            {t('Verification method')}
            <select name="method" value={form.method} onChange={update}>
              <option value="email">{t('Email')}</option>
              <option value="phone">{t('Phone number')}</option>
            </select>
          </label>
          <label>
            {form.method === 'email' ? t('Email address') : t('Phone number')}
            <input
              name="destination"
              type={form.method === 'email' ? 'email' : 'tel'}
              autoComplete={form.method === 'email' ? 'email' : 'tel'}
              value={form.destination}
              onChange={update}
              required
            />
          </label>
        </>
      ) : (
        <>
          <label>
            {t('Verification code')}
            <input
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{8}"
              maxLength={8}
              value={form.code}
              onChange={update}
              required
            />
          </label>
          <label>
            {t('New password')}
            <input name="newPassword" type="password" autoComplete="new-password" minLength={8} value={form.newPassword} onChange={update} required />
          </label>
          <label>
            {t('Confirm password')}
            <input name="confirmPassword" type="password" autoComplete="new-password" minLength={8} value={form.confirmPassword} onChange={update} required />
          </label>
        </>
      )}

      {error && <p className="form-error" role="alert">{t(error)}</p>}
      <button disabled={busy}>
        {busy
          ? t('Processing...')
          : t(step === 'request' ? 'Send verification code' : 'Reset password')}
      </button>
      <p className="auth-switch">
        <button type="button" className="auth-inline-button" onClick={onBack}>{t('Back to sign in')}</button>
      </p>
    </form>
  );
}
