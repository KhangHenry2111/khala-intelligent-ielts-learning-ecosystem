import { FeatureShell, PlaceholderAction } from '../../../shared/ui/FeatureShell';
import { userRank } from '../../../shared/lib/roles';
import { useAuth } from '../../../shared/auth/AuthContext';

const quotas = { bronze: '5 MB', silver: '20 MB', gold: '50 MB' };

export function UploadDocumentPage() {
  const { user } = useAuth();
  return (
    <FeatureShell
      icon="U"
      title="Upload document"
      description="Add your own study materials to your personal learning space."
      accessValue={quotas[userRank(user)]}
    >
      <PlaceholderAction label="Upload file" />
    </FeatureShell>
  );
}
