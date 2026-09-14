export function StatGroup({ items }) {
  return (
    <div className="mini-stat-group">
      {items.map((item) => (
        <div key={item.label} className="mini-stat-card">
          <span className="label">{item.label}</span>
          <strong className={item.tone === 'warning' ? 'warning' : item.tone === 'danger' ? 'danger' : ''}>
            {item.value}
          </strong>
        </div>
      ))}
    </div>
  );
}
