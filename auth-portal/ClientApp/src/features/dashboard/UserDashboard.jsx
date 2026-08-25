import { useAuth } from '../../app/AuthContext';

export function UserDashboard() {
  const { user } = useAuth();
  const currentBand = user?.currentBand || 5.5;
  const targetBand = user?.targetBand || 7.0;

  return (
    <div className="dashboard-container">
      <div className="dashboard-welcome glass-card">
        <h1>Welcome back, {user?.fullName || user?.username}!</h1>
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
            <h3>Take AI Quiz</h3>
            <p>Generate personalized practice</p>
          </div>
        </button>
        <button className="action-btn secondary-gradient">
          <span className="icon">🎯</span>
          <div>
            <h3>Placement Test</h3>
            <p>Check your current level</p>
          </div>
        </button>
        <button className="action-btn dark-gradient">
          <span className="icon">📚</span>
          <div>
            <h3>Continue Lesson</h3>
            <p>Resume your recent study</p>
          </div>
        </button>
      </div>

      <div className="progress-section glass-card mt-30">
        <h2>Your Progress</h2>
        <div className="skill-bars">
          <div className="skill">
            <div className="skill-label"><span>Reading</span> <span>5.5</span></div>
            <div className="bar"><div className="fill" style={{width: '60%'}}></div></div>
          </div>
          <div className="skill">
            <div className="skill-label"><span>Listening</span> <span>5.0</span></div>
            <div className="bar"><div className="fill" style={{width: '50%'}}></div></div>
          </div>
          <div className="skill">
            <div className="skill-label"><span>Writing</span> <span>5.0</span></div>
            <div className="bar"><div className="fill" style={{width: '50%'}}></div></div>
          </div>
          <div className="skill">
            <div className="skill-label"><span>Speaking</span> <span>4.5</span></div>
            <div className="bar"><div className="fill" style={{width: '40%'}}></div></div>
          </div>
        </div>
      </div>
    </div>
  );
}
