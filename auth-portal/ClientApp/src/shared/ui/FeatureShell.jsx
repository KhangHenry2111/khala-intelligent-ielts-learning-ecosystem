import { useAuth } from '../auth/AuthContext';
import { rankLabel, userRank } from '../lib/roles';

export function FeatureShell({ icon, title, description, accessValue, children }) {
  const { user } = useAuth();
  const rank = userRank(user);
  const planName = rankLabel(rank);

  return (
    <div className="user-feature-page">
      <header className="feature-hero glass-card">
        <div className="feature-hero-icon">{icon}</div>
        <div>
          <span className="eyebrow">{planName} plan</span>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
      </header>
      <section className="feature-workspace glass-card">
        <div>
          <span className="eyebrow">Current access</span>
          <h2>{accessValue}</h2>
          <p>You are currently using benefits from the {planName} plan.</p>
        </div>
        {children}
      </section>
    </div>
  );
}

export function PlaceholderAction({ label = 'Get started' }) {
  return (
    <button className="feature-action" type="button">
      {label} <span>→</span>
    </button>
  );
}
