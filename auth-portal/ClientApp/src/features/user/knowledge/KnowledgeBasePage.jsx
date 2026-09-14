import { FeatureShell, PlaceholderAction } from '../../../shared/ui/FeatureShell';
import { userRank } from '../../../shared/lib/roles';
import { useAuth } from '../../../shared/auth/AuthContext';

const quotas = { bronze: 'Basic', silver: 'Full', gold: 'Full' };

export function KnowledgeBasePage() {
  const { user } = useAuth();
  return (
    <FeatureShell
      icon="K"
      title="Knowledge base"
      description="Explore IELTS resources and study content from one place."
      accessValue={quotas[userRank(user)]}
    >
      <PlaceholderAction label="Browse resources" />
    </FeatureShell>
  );
}
