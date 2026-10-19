import { useEffect, useState } from 'react';
import { useAuth } from '../../../shared/auth/AuthContext';
import { quizApi } from '../../../shared/api';
import { userRank } from '../../../shared/lib/roles';

const featureLabels = [
  'Available quizzes',
  'AI quiz generation',
  'Level test',
  'Document upload',
  'Knowledge base',
  'AI result analysis',
  'AI speaking practice',
  'Teacher speaking feedback',
  'AI writing feedback',
  'Teacher writing feedback',
];

const money = (value) => new Intl.NumberFormat('vi-VN', {
  style: 'currency',
  currency: 'VND',
  maximumFractionDigits: 0,
}).format(value || 0);

function planPrice(plan) {
  if (plan.price === 0) return 'Free';
  const duration = plan.durationMonths === 1 ? 'month' : `${plan.durationMonths} months`;
  return `${money(plan.price)} / ${duration}`;
}

function planTier(plan) {
  const name = String(plan.name || '').trim().toLowerCase();
  if (name === 'bronze' || name === 'đồng') return 'bronze';
  if (name === 'silver' || name === 'bạc') return 'silver';
  if (name === 'gold' || name === 'vàng') return 'gold';
  return '';
}

function planName(plan) {
  return { bronze: 'Đồng', silver: 'Bạc', gold: 'Vàng' }[planTier(plan)] || plan.name;
}

function featureValue(plan, index) {
  switch (index) {
    case 0: return 'Unlimited';
    case 1: return `${plan.aiQuizLimit} per month`;
    case 2: return `${plan.levelTestLimit} per month`;
    case 3: return `${plan.uploadLimitMB} MB`;
    case 4: return plan.knowledgeBaseAccess;
    case 5: return '✓';
    case 6: return plan.hasSpeakingAI ? '✓' : '✗';
    case 7: return plan.hasSpeakingTeacher ? '✓' : '✗';
    case 8: return !plan.hasWritingAI ? '✗' : plan.writingAILimited ? 'Limited' : '✓';
    case 9: return plan.hasWritingTeacher ? '✓' : '✗';
    default: return '—';
  }
}

function PlanCard({ plan, isCurrent }) {
  const tier = planTier(plan);
  const featured = tier === 'silver';
  return (
    <article className={`plan-card ${featured ? 'featured' : ''}`}>
      {featured && <span className="plan-ribbon">Most popular</span>}
      <div className={`plan-icon ${tier}`}>{planName(plan)[0]}</div>
      <h2>{planName(plan)}</h2>
      <p className="plan-price">{planPrice(plan)}</p>
      <button className={`plan-button ${featured ? 'primary' : ''}`} type="button" disabled>
        {isCurrent ? 'Current plan' : 'Payment coming soon'}
      </button>
    </article>
  );
}

export function PlansPage() {
  const { user } = useAuth();
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    quizApi.packages()
      .then((result) => {
        if (active) setPlans(result.items || []);
      })
      .catch((cause) => {
        if (active) setError(cause.message || 'Could not load membership plans.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  const currentRank = userRank(user);

  return (
    <div className="plans-page">
      <header className="plans-heading">
        <span className="eyebrow">IELTS AI learning</span>
        <h1>Choose a plan that fits your goals</h1>
        <p>Compare Bronze, Silver and Gold membership benefits. Lesson purchases and membership payments will be enabled later.</p>
      </header>
      {error && <p className="teacher-quiz-notice error" role="alert">{error}</p>}
      {loading ? <p className="content-list-state" role="status">Loading membership plans…</p> : plans.length === 0 ? (
        <p className="content-list-state" role="status">No active membership plans are configured.</p>
      ) : <>
        <div className="plan-cards" aria-label="Learning plans">
          {plans.map((plan) => (
            <PlanCard
              plan={plan}
              isCurrent={planTier(plan) === currentRank}
              key={plan.packageId}
            />
          ))}
        </div>
        <section className="feature-table-wrap" aria-label="Plan comparisons">
          <div className="feature-table-head">
            <div>
              <span className="eyebrow">Compare benefits</span>
              <h2>Everything you need to prepare for IELTS</h2>
            </div>
            <span className="feature-count">{featureLabels.length} benefits</span>
          </div>
          <div className="feature-table" role="table">
            <div className="feature-row feature-row-header" role="row">
              <span role="columnheader">Feature</span>
              {plans.map((plan) => <span role="columnheader" key={plan.packageId}>{planName(plan)}</span>)}
            </div>
            {featureLabels.map((label, featureIndex) => (
              <div className="feature-row" role="row" key={label}>
                <span className="feature-label" role="rowheader">{label}</span>
                {plans.map((plan) => {
                  const value = featureValue(plan, featureIndex);
                  return (
                    <span
                      className={value === '✓' ? 'feature-yes' : value === '✗' ? 'feature-no' : ''}
                      role="cell"
                      key={plan.packageId}
                    >
                      {value}
                    </span>
                  );
                })}
              </div>
            ))}
          </div>
        </section>
      </>}
    </div>
  );
}
