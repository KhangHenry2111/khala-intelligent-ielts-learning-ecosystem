import { useAuth } from '../../../shared/auth/AuthContext';
import { displayName } from '../../../shared/lib/roles';
import { ActionGrid } from '../../../shared/ui/ActionGrid';
import { WorkspaceHero } from '../../../shared/ui/WorkspaceHero';
import { adminQuickActions, adminStats } from '../data';

export function AdminDashboardPage() {
  const { user } = useAuth();
  const name = displayName(user, 'Admin');

  return (
    <div className="dashboard-container admin-dashboard">
      <WorkspaceHero
        className="admin-hero"
        eyebrow="Admin workspace"
        title={`Welcome, ${name}.`}
        description="Manage the platform, monitor content quality, and review access approvals through the admin workflow."
        stats={adminStats}
      />
      <ActionGrid actions={adminQuickActions} className="admin-quick-actions" />
    </div>
  );
}
