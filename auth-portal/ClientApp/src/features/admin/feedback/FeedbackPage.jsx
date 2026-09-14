import { InfoList } from '../../../shared/ui/InfoList';
import { SectionHead } from '../../../shared/ui/SectionHead';
import { feedbackRows } from '../data';

export function FeedbackPage() {
  return (
    <div className="dashboard-container">
      <section className="glass-card">
        <SectionHead title="Feedback management" actionLabel="View all" />
        <InfoList
          items={feedbackRows.map((item) => ({
            title: item.title,
            subtitle: item.sender,
            badge: item.priority,
            badgeClass: item.priority === 'High' ? 'danger-bg' : '',
            meta: item.status,
          }))}
        />
      </section>
    </div>
  );
}
