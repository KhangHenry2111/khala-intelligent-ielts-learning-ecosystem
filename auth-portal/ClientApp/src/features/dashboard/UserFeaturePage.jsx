import { useParams } from 'react-router-dom';
import { useAuth } from '../../app/AuthContext';
import { AiQuizGenerator } from '../ai-quiz/AiQuizGenerator';

const featureConfig = {
  'available-quiz': { title: 'Available quizzes', description: 'Practice with a curated library of IELTS question sets.', icon: 'Q', access: 'all', value: 'Unlimited' },
  'ai-quiz': { title: 'AI quiz generator', description: 'Create personalized question sets based on your learning goals.', icon: 'AI', access: 'all', values: { bronze: '8 per month', silver: '60 per month', gold: '250 per month' } },
  'level-test': { title: 'Level test', description: 'Assess your current skills and receive a suitable study plan.', icon: 'T', access: 'all', values: { bronze: '1 per month', silver: '4 per month', gold: '12 per month' } },
  upload: { title: 'Upload document', description: 'Add your own study materials to your personal learning space.', icon: 'U', access: 'all', values: { bronze: '5 MB', silver: '20 MB', gold: '50 MB' } },
  knowledge: { title: 'Knowledge base', description: 'Explore IELTS resources and study content from one place.', icon: 'K', access: 'all', values: { bronze: 'Basic', silver: 'Full', gold: 'Full' } },
  results: { title: 'Results', description: 'Track your progress and receive AI-based analysis after each practice session.', icon: 'R', access: 'all', value: 'AI result analysis' },
};

function normalizeRank(value) {
  const rank = String(value || '').trim().toLowerCase();
  if (rank === 'gold' || rank === 'vàng') return 'gold';
  if (rank === 'silver' || rank === 'bạc') return 'silver';
  return 'bronze';
}

export function UserFeaturePage() {
  const { feature } = useParams();
  const { user } = useAuth();
  const config = featureConfig[feature] || featureConfig['available-quiz'];
  const rank = normalizeRank(user?.rank || user?.details?.Rank || user?.details?.rank);
  const value = config.values ? config.values[rank] : config.value;

  return (
    <div className="user-feature-page">
      <header className="feature-hero glass-card">
        <div className="feature-hero-icon">{config.icon}</div>
        <div>
          <span className="eyebrow">{rank === 'gold' ? 'Gold plan' : rank === 'silver' ? 'Silver plan' : 'Bronze plan'}</span>
          <h1>{config.title}</h1>
          <p>{config.description}</p>
        </div>
      </header>
      <section className="feature-workspace glass-card">
        <div>
          <span className="eyebrow">Current access</span>
          <h2>{value}</h2>
          <p>You are currently using benefits from the {rank === 'gold' ? 'Gold' : rank === 'silver' ? 'Silver' : 'Bronze'} plan.</p>
        </div>
        {feature === 'ai-quiz' ? <AiQuizGenerator user={user} /> : <button className="feature-action" type="button">Get started <span>→</span></button>}
      </section>
    </div>
  );
}