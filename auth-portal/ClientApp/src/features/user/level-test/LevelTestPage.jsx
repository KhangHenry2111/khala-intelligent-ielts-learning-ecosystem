import { FeatureShell, PlaceholderAction } from '../../../shared/ui/FeatureShell';
import { rankLabel, userRank } from '../../../shared/lib/roles';
import { useAuth } from '../../../shared/auth/AuthContext';

const quotas = { bronze: '1 per month', silver: '4 per month', gold: '12 per month' };

export function LevelTestPage() {
  const { user } = useAuth();
  return (
    <FeatureShell
      icon="T"
      title="Level test"
      description="Assess your current skills and receive a suitable study plan."
      accessValue={quotas[userRank(user)]}
    >
      <PlaceholderAction label={`Start ${rankLabel(userRank(user))} level test`} />
    </FeatureShell>
  );
}
