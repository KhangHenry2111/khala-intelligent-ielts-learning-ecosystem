export function SectionHead({ title, actionLabel, onAction }) {
  return (
    <div className="section-head">
      <h2>{title}</h2>
      {actionLabel ? (
        <button type="button" className="link-btn" onClick={onAction}>
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}
