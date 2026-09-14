import { StatGroup } from './StatGroup';

export function WorkspaceHero({ eyebrow, title, description, stats, className = '' }) {
  return (
    <div className={`dashboard-welcome glass-card ${className}`.trim()}>
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {stats ? <StatGroup items={stats} /> : null}
    </div>
  );
}
