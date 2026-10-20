import { SectionHead } from '../../../shared/ui/SectionHead';
import { gradingQueue } from '../data';
import { useLanguage } from '../../../shared/i18n/LanguageContext';

export function GradingPage() {
  const { t } = useLanguage();
  return (
    <div className="dashboard-container">
      <section className="glass-card">
        <SectionHead title="Grading" actionLabel="View all" />
        <div className="queue-list">
          {gradingQueue.map((item) => (
            <div key={item.name + item.task} className="queue-item">
              <div>
                <h3>{item.name}</h3>
                <p>{t(item.task)}</p>
              </div>
              <div className="queue-meta">
                <span className="score-pill">{item.score}</span>
                <small>{t(item.status)}</small>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
