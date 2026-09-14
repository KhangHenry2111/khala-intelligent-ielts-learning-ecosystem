import { Link } from 'react-router-dom';

export function ActionGrid({ actions, className = '' }) {
  return (
    <div className={`grid-2 ${className}`.trim()}>
      {actions.map((action) => {
        const content = (
          <>
            <span className="icon">✦</span>
            <div>
              <h3>{action.title}</h3>
              <p>{action.description}</p>
            </div>
          </>
        );
        if (action.to) {
          return (
            <Link key={action.title} to={action.to} className={`action-btn ${action.accent}`}>
              {content}
            </Link>
          );
        }
        return (
          <button key={action.title} type="button" className={`action-btn ${action.accent}`}>
            {content}
          </button>
        );
      })}
    </div>
  );
}
