import { FeatureShell, PlaceholderAction } from '../../../shared/ui/FeatureShell';

export function ResultsPage() {
  return (
    <FeatureShell
      icon="R"
      title="Results"
      description="Track your progress and receive AI-based analysis after each practice session."
      accessValue="AI result analysis"
    >
      <PlaceholderAction label="View analysis" />
    </FeatureShell>
  );
}
