import { useState } from 'react';
import { Link } from 'react-router-dom';
import { authApi } from '../../shared/api/authApi';
import { useAuth } from '../../shared/auth/AuthContext';
import { normalizeRole } from '../../shared/lib/roles';
import { useLanguage } from '../../shared/i18n/LanguageContext';

const getDetail = (details, key) => details?.[key] ?? details?.[key[0].toLowerCase() + key.slice(1)] ?? '';

export function ProfilePage() {
  const { t } = useLanguage();
  const { user, signIn } = useAuth();
  const role = normalizeRole(user.userType);
  const details = user.details || {};
  const canEdit = role === 'user';
  const [form, setForm] = useState({
    fullName: user.fullName || '',
    email: user.email || '',
    phoneNumber: getDetail(details, 'PhoneNumber'),
    dateOfBirth: getDetail(details, 'DateOfBirth')?.slice(0, 10) || '',
    gender: getDetail(details, 'Gender'),
    avatar: getDetail(details, 'Avatar'),
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [avatarFailed, setAvatarFailed] = useState(false);
  const displayName = form.fullName || user.username;
  const avatarLetter = displayName.trim().charAt(0).toUpperCase() || 'U';

  const updateField = (event) => {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
    if (event.target.name === 'avatar') setAvatarFailed(false);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    setError('');
    try {
      const result = await authApi.updateProfile({
        ...form,
        dateOfBirth: form.dateOfBirth || null,
      }, user.accessToken);
      signIn({
        ...user,
        ...result.user,
        details: { ...user.details, ...result.user.details },
      });
      setMessage(t('Profile updated successfully.'));
    } catch (requestError) {
      setError(requestError.message || t('Unable to update your profile.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="profile-page">
      <div className="profile-shell">
        <Link className="profile-back-link" to={`/${role}/dashboard`}>
          <span aria-hidden="true">←</span> {t('Back to dashboard')}
        </Link>

        <section className="profile-card" aria-labelledby="profile-title">
          <header className="profile-heading">
            <div className="profile-heading-copy">
              <span className="profile-eyebrow">{t('Your account')}</span>
              <h1 id="profile-title">{t('Personal profile')}</h1>
              <p>{t('Keep your personal details up to date.')}</p>
            </div>
            <span className="profile-badge">{t('Profile settings')}</span>
          </header>

          <div className="profile-summary">
            <div className="profile-avatar">
              {form.avatar && !avatarFailed
                ? <img src={form.avatar} alt={t('Profile photo')} onError={() => setAvatarFailed(true)} />
                : <span>{avatarLetter}</span>}
            </div>
            <div className="profile-summary-copy">
              <strong>{displayName}</strong>
              <span>{form.email}</span>
              <span className="profile-rank">{t('Rank')}: {getDetail(details, 'Rank') || 'Bronze'}</span>
              <span className="profile-rank-note">{t('Rank is managed by your membership or an administrator.')}</span>
            </div>
          </div>

          {!canEdit && (
            <div className="profile-notice" role="status">
              {t('Personal profile editing is available for learner accounts.')}
            </div>
          )}

          <form className="profile-form" onSubmit={handleSubmit}>
            <div className="profile-section-heading">
              <div>
                <h2>{t('Personal information')}</h2>
                <p>{t('Only the information below can be changed here.')}</p>
              </div>
            </div>

            <div className="profile-fields">
              <label className="profile-field profile-field-wide">
                <span>{t('Full name')}</span>
                <input name="fullName" value={form.fullName} onChange={updateField} maxLength="255" autoComplete="name" required disabled={!canEdit} />
              </label>

              <label className="profile-field">
                <span>{t('Email address')}</span>
                <input name="email" type="email" value={form.email} onChange={updateField} maxLength="255" autoComplete="email" required disabled={!canEdit} />
              </label>

              <label className="profile-field">
                <span>{t('Phone number')}</span>
                <input name="phoneNumber" type="tel" value={form.phoneNumber} onChange={updateField} maxLength="20" autoComplete="tel" disabled={!canEdit} />
              </label>

              <label className="profile-field">
                <span>{t('Date of birth')}</span>
                <input name="dateOfBirth" type="date" value={form.dateOfBirth} onChange={updateField} max={new Date().toISOString().slice(0, 10)} disabled={!canEdit} />
              </label>

              <label className="profile-field">
                <span>{t('Gender')}</span>
                <select name="gender" value={form.gender} onChange={updateField} disabled={!canEdit}>
                  <option value="">{t('Select gender')}</option>
                  <option value="Female">{t('Female')}</option>
                  <option value="Male">{t('Male')}</option>
                  <option value="Other">{t('Other')}</option>
                  <option value="Prefer not to say">{t('Prefer not to say')}</option>
                </select>
              </label>

              <label className="profile-field profile-field-wide">
                <span>{t('Profile photo URL')}</span>
                <input name="avatar" type="url" value={form.avatar} onChange={updateField} maxLength="500" placeholder="https://..." disabled={!canEdit} />
                <small>{t('Use a secure image URL to update your profile photo.')}</small>
              </label>

            </div>

            {error && <div className="profile-feedback profile-feedback-error" role="alert">{error}</div>}
            {message && <div className="profile-feedback profile-feedback-success" role="status">{message}</div>}

            {canEdit && (
              <div className="profile-actions">
                <Link className="profile-cancel-button" to={`/${role}/dashboard`}>{t('Cancel')}</Link>
                <button className="profile-save-button" type="submit" disabled={saving}>
                  {saving ? t('Saving...') : t('Save changes')}
                </button>
              </div>
            )}
          </form>
        </section>
      </div>
    </main>
  );
}
