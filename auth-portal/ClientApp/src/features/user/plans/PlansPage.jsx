const plans = [
  { name: 'Bronze', price: 'Free', tone: 'bronze' },
  { name: 'Silver', price: '199,000 VND / month', tone: 'silver', featured: true },
  { name: 'Gold', price: '399,000 VND / month', tone: 'gold' },
];

const features = [
  ['Available quizzes', 'Unlimited', 'Unlimited', 'Unlimited'],
  ['AI quiz generation', '8 per month', '60 per month', '250 per month'],
  ['Level test', '1 per month', '4 per month', '12 per month'],
  ['Document upload', '5 MB', '20 MB', '50 MB'],
  ['Knowledge base', 'Basic', 'Full', 'Full'],
  ['AI result analysis', '✓', '✓', '✓'],
  ['AI speaking practice', '✗', '✓', '✓'],
  ['Teacher speaking feedback', '✗', '✗', '✓'],
  ['AI writing feedback', 'Limited', '✓', '✓'],
  ['Teacher writing feedback', '✗', '✗', '✓'],
];

function PlanCard({ plan }) {
  return (
    <article className={`plan-card ${plan.featured ? 'featured' : ''}`}>
      {plan.featured && <span className="plan-ribbon">Most popular</span>}
      <div className={`plan-icon ${plan.tone}`}>{plan.name[0]}</div>
      <h2>{plan.name}</h2>
      <p className="plan-price">{plan.price}</p>
      <button className={`plan-button ${plan.featured ? 'primary' : ''}`} type="button">
        {plan.featured ? 'Upgrade plan' : 'Current plan'}
      </button>
    </article>
  );
}

export function PlansPage() {
  return (
    <div className="plans-page">
      <header className="plans-heading">
        <span className="eyebrow">IELTS AI learning</span>
        <h1>Choose a plan that fits your goals</h1>
        <p>Focus on the tools that help you improve steadily every day.</p>
      </header>
      <div className="plan-cards" aria-label="Learning plans">
        {plans.map((plan) => <PlanCard plan={plan} key={plan.name} />)}
      </div>
      <section className="feature-table-wrap" aria-label="Plan comparisons">
        <div className="feature-table-head">
          <div>
            <span className="eyebrow">Compare benefits</span>
            <h2>Everything you need to prepare for IELTS</h2>
          </div>
          <span className="feature-count">10 benefits</span>
        </div>
        <div className="feature-table" role="table">
          <div className="feature-row feature-row-header" role="row">
            <span role="columnheader">Feature</span>
            {plans.map((plan) => <span role="columnheader" key={plan.name}>{plan.name}</span>)}
          </div>
          {features.map(([label, ...values]) => (
            <div className="feature-row" role="row" key={label}>
              <span className="feature-label" role="rowheader">{label}</span>
              {values.map((value, index) => (
                <span
                  className={`${value === '✓' ? 'feature-yes' : value === '✗' ? 'feature-no' : ''}`}
                  role="cell"
                  key={`${label}-${index}`}
                >
                  {value}
                </span>
              ))}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
