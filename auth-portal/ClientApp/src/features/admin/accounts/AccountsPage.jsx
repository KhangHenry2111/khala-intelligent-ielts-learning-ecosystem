import { useCallback, useEffect, useMemo, useState } from 'react';
import { adminAccountsApi } from '../../../shared/api';
import { useAuth } from '../../../shared/auth/AuthContext';
import { DataTable } from '../../../shared/ui/DataTable';
import { SectionHead } from '../../../shared/ui/SectionHead';

const statuses = ['Active', 'Pending', 'Suspended', 'Deleted'];

const commonFields = [
  { key: 'fullName', label: 'Full name', required: true, maxLength: 255 },
  { key: 'username', label: 'Username', required: true, maxLength: 100 },
  { key: 'email', label: 'Email', type: 'email', required: true, maxLength: 255 },
  { key: 'phoneNumber', label: 'Phone number', maxLength: 20 },
  { key: 'avatar', label: 'Avatar URL', maxLength: 500 },
  { key: 'role', label: 'Role', required: true, maxLength: 20 },
  { key: 'status', label: 'Account status', type: 'select', required: true, options: statuses },
  { key: 'newPassword', label: 'Set new password', type: 'password', minLength: 8, maxLength: 255, autoComplete: 'new-password', help: 'Leave blank to keep the current password.' },
];

const userFields = [
  { key: 'dateOfBirth', label: 'Date of birth', type: 'date' },
  { key: 'gender', label: 'Gender', maxLength: 20 },
  { key: 'emailVerified', label: 'Email verified', type: 'boolean' },
  { key: 'phoneVerified', label: 'Phone verified', type: 'boolean' },
  { key: 'currentBand', label: 'Current IELTS band', type: 'number', min: 0, max: 9, step: 0.5 },
  { key: 'targetBand', label: 'Target IELTS band', type: 'number', min: 0, max: 9, step: 0.5 },
  { key: 'speakingBand', label: 'Speaking band', type: 'number', min: 0, max: 9, step: 0.5 },
  { key: 'listeningBand', label: 'Listening band', type: 'number', min: 0, max: 9, step: 0.5 },
  { key: 'readingBand', label: 'Reading band', type: 'number', min: 0, max: 9, step: 0.5 },
  { key: 'writingBand', label: 'Writing band', type: 'number', min: 0, max: 9, step: 0.5 },
  { key: 'learningLevel', label: 'Learning level', maxLength: 20 },
  { key: 'rank', label: 'Rank', maxLength: 20 },
  { key: 'packageId', label: 'Package', type: 'package' },
];

const teacherFields = [
  { key: 'biography', label: 'Biography', type: 'textarea' },
  { key: 'qualification', label: 'Qualification', maxLength: 255 },
  { key: 'qualificationFileUrl', label: 'Qualification document URL', maxLength: 500 },
  { key: 'ieltsBand', label: 'IELTS band', type: 'number', min: 0, max: 9, step: 0.5 },
  { key: 'experienceYears', label: 'Years of experience', type: 'number', min: 0, step: 1 },
  { key: 'specialization', label: 'Specialization', maxLength: 255 },
  { key: 'verificationStatus', label: 'Verification status', type: 'select', options: ['Pending', 'Verified', 'Rejected'] },
];

const readOnlyFields = {
  User: [
    ['Account ID', 'id'],
    ['Package ID', 'packageId'],
    ['AI quizzes used this month', 'aiQuizUsedThisMonth'],
    ['Level tests used this month', 'levelTestUsedThisMonth'],
    ['Uploaded storage (MB)', 'uploadedStorageMb'],
    ['Total tests', 'totalTests'],
    ['Practice questions', 'totalPracticeQuestions'],
    ['Learning streak', 'learningStreak'],
    ['Created', 'createdAt'],
    ['Updated', 'updatedAt'],
    ['Last login', 'lastLogin'],
  ],
  Teacher: [
    ['Account ID', 'id'],
    ['Lessons', 'numberOfLessons'],
    ['Materials', 'totalMaterials'],
    ['Questions', 'totalQuestions'],
    ['Contribution', 'contribution'],
    ['Average rating', 'averageRating'],
    ['Students', 'totalStudents'],
    ['Created by admin ID', 'createdByAdminId'],
    ['Created', 'createdAt'],
    ['Updated', 'updatedAt'],
    ['Last login', 'lastLogin'],
  ],
};

function formatReadOnlyValue(value) {
  if (value == null || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'string' && value.includes('T')) return new Date(value).toLocaleString();
  return String(value);
}

function AccountEditor({ account, packages, saving, error, onClose, onSave }) {
  const [draft, setDraft] = useState(() => ({ ...account, newPassword: '' }));
  const fields = [...commonFields, ...(account.accountType === 'Teacher' ? teacherFields : userFields)];

  useEffect(() => {
    function closeOnEscape(event) {
      if (event.key === 'Escape' && !saving) onClose();
    }
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose, saving]);

  function updateField(field, value) {
    let nextValue = value;
    if (field.type === 'number') nextValue = value === '' ? null : Number(value);
    if (field.type === 'boolean') nextValue = value === '' ? null : value === 'true';
    if (field.type === 'package') nextValue = value || null;
    setDraft((current) => ({ ...current, [field.key]: nextValue }));
  }

  return (
    <div
      className="content-detail-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) onClose();
      }}
    >
      <section className="content-detail-dialog admin-account-dialog" role="dialog" aria-modal="true" aria-labelledby="account-editor-title">
        <header className="content-detail-header">
          <div>
            <span className="content-detail-eyebrow">Edit {account.accountType} account</span>
            <h2 id="account-editor-title">{account.fullName}</h2>
          </div>
          <button type="button" className="content-detail-close" onClick={onClose} disabled={saving} aria-label="Close account editor">×</button>
        </header>
        <form
          className="admin-account-form"
          onSubmit={(event) => {
            event.preventDefault();
            onSave(draft);
          }}
        >
          {error && <p className="teacher-quiz-notice error" role="alert">{error}</p>}
          <div className="teacher-form-grid admin-account-fields">
            {fields.map((field) => (
              <label key={field.key} className={field.type === 'textarea' ? 'admin-account-field-wide' : ''}>
                {field.label}
                {field.type === 'textarea' ? (
                  <textarea
                    rows="4"
                    value={draft[field.key] ?? ''}
                    maxLength={field.maxLength}
                    required={field.required}
                    onChange={(event) => updateField(field, event.target.value)}
                  />
                ) : field.type === 'select' ? (
                  <select
                    value={draft[field.key] ?? ''}
                    required={field.required}
                    onChange={(event) => updateField(field, event.target.value)}
                  >
                    {!field.required && <option value="">Not set</option>}
                    {field.options.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                    {draft[field.key] && !field.options.includes(draft[field.key]) && (
                      <option value={draft[field.key]}>{draft[field.key]}</option>
                    )}
                  </select>
                ) : field.type === 'boolean' ? (
                  <select
                    value={draft[field.key] == null ? '' : String(draft[field.key])}
                    onChange={(event) => updateField(field, event.target.value)}
                  >
                    <option value="">Not set</option>
                    <option value="true">Yes</option>
                    <option value="false">No</option>
                  </select>
                ) : field.type === 'package' ? (
                  <select
                    value={draft.packageId || ''}
                    onChange={(event) => updateField(field, event.target.value)}
                  >
                    <option value="">No package</option>
                    {packages.map((item) => <option key={item.id} value={item.id}>{item.name}{item.isActive ? '' : ' (inactive)'}</option>)}
                  </select>
                ) : (
                  <input
                    type={field.type || 'text'}
                    value={field.type === 'date' ? String(draft[field.key] || '').slice(0, 10) : draft[field.key] ?? ''}
                    required={field.required}
                    maxLength={field.maxLength}
                    min={field.min}
                    max={field.max}
                    step={field.step}
                    minLength={field.minLength}
                    autoComplete={field.autoComplete}
                    onChange={(event) => updateField(field, event.target.value)}
                  />
                )}
                {field.help && <small>{field.help}</small>}
              </label>
            ))}
          </div>

          <section className="admin-account-readonly">
            <h3>System fields (read-only)</h3>
            <div className="content-detail-meta">
              {readOnlyFields[account.accountType].map(([label, key]) => (
                <div key={key}><span>{label}</span><strong>{formatReadOnlyValue(account[key])}</strong></div>
              ))}
            </div>
          </section>

          <footer className="admin-account-form-actions">
            <button type="button" className="admin-content-view" onClick={onClose} disabled={saving}>Cancel</button>
            <button type="submit" className="admin-content-refresh" disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button>
          </footer>
        </form>
      </section>
    </div>
  );
}

export function AccountsPage() {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState([]);
  const [packages, setPackages] = useState([]);
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [filter, setFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadAccounts = useCallback(async () => {
    if (!user?.accessToken) return;
    setLoading(true);
    setError('');
    try {
      const payload = await adminAccountsApi.list(user.accessToken);
      setAccounts(payload.items || []);
      setPackages(payload.packages || []);
    } catch (loadError) {
      setError(loadError.message || 'Could not load accounts.');
    } finally {
      setLoading(false);
    }
  }, [user?.accessToken]);

  useEffect(() => { loadAccounts(); }, [loadAccounts]);

  const visibleAccounts = useMemo(() => accounts.filter((account) => {
    const matchesType = filter === 'All' || account.accountType === filter;
    const query = search.trim().toLowerCase();
    const matchesSearch = !query || [account.fullName, account.username, account.email]
      .some((value) => value?.toLowerCase().includes(query));
    return matchesType && matchesSearch;
  }), [accounts, filter, search]);

  async function saveAccount(draft) {
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const payload = { ...draft };
      delete payload.id;
      delete payload.accountType;
      await adminAccountsApi.update(selectedAccount, payload, user.accessToken);
      setSelectedAccount(null);
      setNotice(`${selectedAccount.accountType} account updated.`);
      await loadAccounts();
    } catch (saveError) {
      setError(saveError.message || 'Could not save account changes.');
    } finally {
      setSaving(false);
    }
  }

  async function deleteAccount(account) {
    const confirmed = window.confirm(
      `Deactivate ${account.accountType.toLowerCase()} "${account.fullName}"? They will no longer be able to sign in. Learning history and related records will be kept.`,
    );
    if (!confirmed) return;

    setBusyId(account.id);
    setError('');
    setNotice('');
    try {
      await adminAccountsApi.remove(account, user.accessToken);
      setNotice(`${account.accountType} account deactivated. Related records were preserved.`);
      await loadAccounts();
    } catch (deleteError) {
      setError(deleteError.message || 'Could not deactivate account.');
    } finally {
      setBusyId('');
    }
  }

  const columns = [
    {
      key: 'fullName',
      label: 'Account',
      render: (account) => <><strong>{account.fullName}</strong><small className="admin-account-subline">{account.username} · {account.email}</small></>,
    },
    { key: 'accountType', label: 'Type' },
    {
      key: 'status',
      label: 'Status',
      render: (account) => (
        <span className={`status-pill ${account.status === 'Deleted' || account.status === 'Suspended' ? 'danger' : account.status === 'Pending' ? 'warning' : ''}`}>
          {account.status}
        </span>
      ),
    },
    {
      key: 'lastLogin',
      label: 'Last login',
      render: (account) => account.lastLogin ? new Date(account.lastLogin).toLocaleString() : '—',
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (account) => (
        <div className="admin-account-actions">
          <button type="button" className="admin-content-view" onClick={() => { setError(''); setSelectedAccount(account); }}>Edit</button>
          <button
            type="button"
            className="button-danger"
            disabled={account.status === 'Deleted' || busyId === account.id}
            onClick={() => deleteAccount(account)}
          >
            {busyId === account.id ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="dashboard-container">
      <section className="glass-card admin-accounts-card">
        <SectionHead title="Account management" />
        <p className="admin-account-description">Manage user and teacher profiles. Delete deactivates sign-in while preserving account history.</p>
        <div className="admin-accounts-toolbar">
          <input
            type="search"
            aria-label="Search accounts"
            placeholder="Search name, username, or email"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <select aria-label="Filter account type" value={filter} onChange={(event) => setFilter(event.target.value)}>
            {['All', 'User', 'Teacher'].map((type) => <option key={type}>{type}</option>)}
          </select>
          <button type="button" className="admin-content-refresh" onClick={loadAccounts} disabled={loading}>
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
        {error && <p className="teacher-quiz-notice error" role="alert">{error}</p>}
        {notice && <p className="teacher-quiz-notice success" role="status">{notice}</p>}
        {loading ? (
          <p className="content-list-state" role="status">Loading accounts…</p>
        ) : error && !accounts.length ? null : visibleAccounts.length ? (
          <DataTable columns={columns} rows={visibleAccounts} />
        ) : (
          <p className="content-list-state">{accounts.length ? 'No accounts match these filters.' : 'No user or teacher accounts found.'}</p>
        )}
      </section>

      {selectedAccount && (
        <AccountEditor
          key={selectedAccount.id}
          account={selectedAccount}
          packages={packages}
          saving={saving}
          error={error}
          onClose={() => setSelectedAccount(null)}
          onSave={saveAccount}
        />
      )}
    </div>
  );
}
