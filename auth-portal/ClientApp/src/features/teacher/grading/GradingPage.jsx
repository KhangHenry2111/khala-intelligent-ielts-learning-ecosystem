import { SectionHead } from '../../../shared/ui/SectionHead';
import { gradingQueue } from '../data';

export function GradingPage() {
  return (
    <div className="dashboard-container">
      <section className="glass-card">
        <SectionHead title="Grading" actionLabel="View all" />
        <div className="queue-list">
          {gradingQueue.map((item) => (
            <div key={item.name + item.task} className="queue-item">
              <div>
                <h3>{item.name}</h3>
                <p>{item.task}</p>
              </div>
              <div className="queue-meta">
                <span className="score-pill">{item.score}</span>
                <small>{item.status}</small>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
