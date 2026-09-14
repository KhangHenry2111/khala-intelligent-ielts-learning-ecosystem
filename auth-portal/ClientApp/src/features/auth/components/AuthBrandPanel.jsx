export function AuthBrandPanel({ title }) {
  return (
    <aside className="brand-panel">
      <span className="brand-mark">IA</span>
      <p className="eyebrow">IELTS Study Assistant</p>
      <h1>Make progress<br /><i>visible.</i></h1>
      <p>Focused tools for the next confident step in your English journey.</p>
      <div className="orbit-label">{title} workspace</div>
    </aside>
  );
}
