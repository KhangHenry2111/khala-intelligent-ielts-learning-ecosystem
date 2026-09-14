import { InfoList } from '../../../shared/ui/InfoList';
import { SectionHead } from '../../../shared/ui/SectionHead';
import { classList } from '../data';

export function ClassesPage() {
  return (
    <div className="dashboard-container">
      <section className="glass-card">
        <SectionHead title="Class management" actionLabel="+ Create class" />
        <InfoList
          items={classList.map((item) => ({
            name: item.name,
            subtitle: `${item.students} students · ${item.meet}`,
            badge: item.status,
            meta: item.nextLesson,
          }))}
        />
      </section>
    </div>
  );
}
