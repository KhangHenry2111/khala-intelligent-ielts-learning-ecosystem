import { FeatureShell, PlaceholderAction } from '../../../shared/ui/FeatureShell';

export function AvailableQuizPage() {
  return (
    <FeatureShell
      icon="Q"
      title="Available quizzes"
      description="Practice with a curated library of IELTS question sets."
      accessValue="Unlimited"
    >
      <PlaceholderAction />
    </FeatureShell>
  );
}
