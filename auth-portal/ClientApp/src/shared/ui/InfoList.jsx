export function InfoList({ items, className = 'list-stack' }) {
  return (
    <div className={className}>
      {items.map((item) => (
        <div key={item.id || item.title || item.name} className="info-list-item">
          <div>
            <h3>{item.title || item.name}</h3>
            <p>{item.subtitle}</p>
          </div>
          <div className="list-meta">
            {item.badge ? <span className={`status-badge ${item.badgeClass || ''}`}>{item.badge}</span> : null}
            {item.meta ? <small>{item.meta}</small> : null}
          </div>
        </div>
      ))}
    </div>
  );
}
