import { useEffect, useState } from 'react';
import { useAuth } from '../../../shared/auth/AuthContext';
import { quizApi } from '../../../shared/api';
import { userRank } from '../../../shared/lib/roles';
import { useLanguage } from '../../../shared/i18n/LanguageContext';

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

const money = (value, language) => new Intl.NumberFormat(language === 'vi' ? 'vi-VN' : 'en-US', {
  style: 'currency',
  currency: 'VND',
  maximumFractionDigits: 0,
}).format(value || 0);

function planPrice(plan, t, language) {
  if (plan.price === 0) return t('Free');
  const duration = plan.durationMonths === 1 ? t('month') : `${plan.durationMonths} ${t('months')}`;
  return `${money(plan.price, language)} / ${duration}`;
}

function planTier(plan) {
  const apiTier = String(plan.tier || '').trim().toLowerCase();
  if (['bronze', 'silver', 'gold'].includes(apiTier)) return apiTier;
  const name = String(plan.name || '').trim().toLowerCase();
  if (name === 'bronze' || name === 'đồng') return 'bronze';
  if (name === 'silver' || name === 'bạc') return 'silver';
  if (name === 'gold' || name === 'vàng') return 'gold';
  if (plan.aiQuizLimit <= 8) return 'bronze';
  if (plan.aiQuizLimit <= 60) return 'silver';
  if (plan.aiQuizLimit > 60) return 'gold';
  return '';
}

function planName(plan) {
  return { bronze: 'Đồng', silver: 'Bạc', gold: 'Vàng' }[planTier(plan)] || plan.name;
}

function featureValue(plan, index, t) {
  switch (index) {
    case 0: return t('Unlimited');
    case 1: return `${plan.aiQuizLimit} ${t('per month')}`;
    case 2: return `${plan.levelTestLimit} ${t('per month')}`;
    case 3: return `${plan.uploadLimitMB} MB`;
    case 4: return t(plan.knowledgeBaseAccess);
    case 5: return '✓';
    case 6: return plan.hasSpeakingAI ? '✓' : '✗';
    case 7: return plan.hasSpeakingTeacher ? '✓' : '✗';
    case 8: return !plan.hasWritingAI ? '✗' : plan.writingAILimited ? t('Limited') : '✓';
    case 9: return plan.hasWritingTeacher ? '✓' : '✗';
    default: return '—';
  }
}

function PlanCard({ plan, isCurrent }) {
  const { t, language } = useLanguage();
  const tier = planTier(plan);
  const featured = tier === 'silver';
  return (
    <article className={`plan-card ${featured ? 'featured' : ''}`}>
      {featured && <span className="plan-ribbon">{t('Most popular')}</span>}
      <div className={`plan-icon ${tier}`}>{planName(plan)[0]}</div>
      <h2>{t(planName(plan))}</h2>
      <p className="plan-price">{planPrice(plan, t, language)}</p>
      <button className={`plan-button ${featured ? 'primary' : ''}`} type="button" disabled>
        {isCurrent ? t('Current plan') : t('Payment coming soon')}
      </button>
    </article>
  );
}

export function PlansPage() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    quizApi.packages()
      .then((result) => {
        if (!active) return;
        const uniquePlans = new Map();
        for (const plan of result.items || []) {
          const tier = planTier(plan);
          const key = tier || plan.packageId;
          if (!uniquePlans.has(key)) uniquePlans.set(key, plan);
        }
        setPlans([...uniquePlans.values()]);
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
        <span className="eyebrow">{t('IELTS AI learning')}</span>
        <h1>{t('Choose a plan that fits your goals')}</h1>
        <p>{t('Compare Bronze, Silver and Gold membership benefits. Lesson purchases and membership payments will be enabled later.')}</p>
      </header>
      {error && <p className="teacher-quiz-notice error" role="alert">{t(error)}</p>}
      {loading ? <p className="content-list-state" role="status">{t('Loading membership plans…')}</p> : plans.length === 0 ? (
        <p className="content-list-state" role="status">{t('No active membership plans are configured.')}</p>
      ) : <>
        <div className="plan-cards" aria-label={t('Learning plans')}>
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
              <span className="eyebrow">{t('Compare benefits')}</span>
              <h2>{t('Everything you need to prepare for IELTS')}</h2>
            </div>
            <span className="feature-count">{featureLabels.length} {t('benefits')}</span>
          </div>
          <div className="feature-table" role="table">
            <div className="feature-row feature-row-header" role="row">
              <span role="columnheader">{t('Feature')}</span>
              {plans.map((plan) => <span role="columnheader" key={plan.packageId}>{t(planName(plan))}</span>)}
            </div>
            {featureLabels.map((label, featureIndex) => (
              <div className="feature-row" role="row" key={label}>
                <span className="feature-label" role="rowheader">{t(label)}</span>
                {plans.map((plan) => {
                  const value = featureValue(plan, featureIndex, t);
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
