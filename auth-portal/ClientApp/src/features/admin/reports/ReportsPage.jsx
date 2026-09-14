import { InfoList } from '../../../shared/ui/InfoList';
import { SectionHead } from '../../../shared/ui/SectionHead';
import { accessRows } from '../data';

export function ReportsPage() {
  return (
    <div className="dashboard-container">
      <section className="glass-card">
        <SectionHead title="Access management" actionLabel="Approve" />
        <InfoList
          items={accessRows.map((item) => ({
            name: item.name,
            subtitle: item.role,
            badge: item.reason,
            badgeClass: 'warning-bg',
            meta: item.action,
          }))}
        />
      </section>
    </div>
  );
}
