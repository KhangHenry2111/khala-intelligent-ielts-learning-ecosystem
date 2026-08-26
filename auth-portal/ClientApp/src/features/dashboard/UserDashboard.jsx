import { useAuth } from '../../app/AuthContext';

export function UserDashboard() {
  const { user } = useAuth();
  const currentBand = Number(user?.currentBand || 5.5);
  const targetBand = Number(user?.targetBand || 7.0);
  const name = user?.fullName || user?.username || 'Student';

  return (
    <div className="dashboard-container">
      <div className="dashboard-welcome glass-card">
        <div>
          <span className="eyebrow">Learning momentum</span>
          <h1>Good to see you, {name}.</h1>
          <p>One focused session today brings your target band closer.</p>
        </div>
        <div className="band-info">
          <div>
            <span className="label">Current Band</span>
            <span className="value">{currentBand}</span>
          </div>
          <div>
            <span className="label">Target Band</span>
            <span className="value highlight">{targetBand}</span>
          </div>
        </div>
      </div>

      <div className="quick-actions grid-3">
        <button className="action-btn primary-gradient">
          <span className="icon">📝</span>
          <div>
            <h3>Practice today</h3>
            <p>Study with focused lessons.</p>
          </div>
        </button>
        <button className="action-btn secondary-gradient">
          <span className="icon">🎯</span>
          <div>
            <h3>Test your level</h3>
            <p>See where your English stands.</p>
          </div>
        </button>
        <button className="action-btn dark-gradient">
          <span className="icon">📚</span>
          <div>
            <h3>Documents</h3>
            <p>Review saved learning materials.</p>
          </div>
        </button>
      </div>

      <div className="content-grid">
        <section className="glass-card progress-section">
          <h2>Your Progress</h2>
          <div className="skill-bars">
            <div className="skill">
              <div className="skill-label"><span>Reading</span> <span>5.5</span></div>
              <div className="bar"><div className="fill" style={{ width: '60%' }}></div></div>
            </div>
            <div className="skill">
              <div className="skill-label"><span>Listening</span> <span>5.0</span></div>
              <div className="bar"><div className="fill" style={{ width: '50%' }}></div></div>
            </div>
            <div className="skill">
              <div className="skill-label"><span>Writing</span> <span>5.0</span></div>
              <div className="bar"><div className="fill" style={{ width: '50%' }}></div></div>
            </div>
            <div className="skill">
              <div className="skill-label"><span>Speaking</span> <span>4.5</span></div>
              <div className="bar"><div className="fill" style={{ width: '40%' }}></div></div>
            </div>
          </div>
        </section>

        <section className="glass-card recommendation-panel">
          <h2>Recommended</h2>
          <ul className="recommendation-list">
            <li>Practice inference questions in Reading</li>
            <li>Review Lesson #24 on paragraph structure</li>
            <li>Generate another AI quiz for speaking practice</li>
          </ul>
        </section>
      </div>
    </div>
  );
}
