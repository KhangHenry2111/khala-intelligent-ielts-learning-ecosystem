export function SkillPicker({ value, onChange, options = ['Reading', 'Speaking', 'Writing', 'Listening', 'All'] }) {
  return (
    <div className="skill-picker" role="group" aria-label="Select skill">
      {options.map((option) => (
        <button
          className={value === option ? 'selected' : ''}
          key={option}
          type="button"
          onClick={() => onChange(option)}
        >
          {option}
        </button>
      ))}
    </div>
  );
}
