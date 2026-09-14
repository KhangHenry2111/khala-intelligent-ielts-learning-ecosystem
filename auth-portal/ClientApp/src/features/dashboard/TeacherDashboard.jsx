import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../app/AuthContext';

const classList = [
  { name: 'IELTS Writing 6.5', students: 24, nextLesson: 'Today · 7:00 PM - 8:30 PM', meet: 'Google Meet', status: 'In progress' },
  { name: 'IELTS Speaking Masterclass', students: 15, nextLesson: 'Tomorrow · 6:00 PM', meet: 'Google Meet', status: 'Upcoming' },
  { name: 'General English Booster', students: 31, nextLesson: 'Thursday · 5:30 PM', meet: 'Google Meet', status: 'Scheduled' },
];

const lessonList = [
  { title: 'Lesson 04: Task 2 Structure', type: 'Writing', price: 'Free', updated: '2 hours ago' },
  { title: 'Speaking Part 3 Cue Cards', type: 'Speaking', price: 'Gold', updated: 'Yesterday' },
  { title: 'Vocabulary Booster Band 7.5+', type: 'Vocabulary', price: 'Paid', updated: '3 days ago' },
];

const gradingQueue = [
  { name: 'Nguyen Minh A', task: 'Writing Task 2', score: '7.0', status: 'Waiting for review' },
  { name: 'Le Hoang B', task: 'Speaking Part 2', score: '8.5', status: 'Feedback sent' },
  { name: 'Pham Thao C', task: 'Writing Task 1', score: '6.5', status: 'Needs review' },
];

const quickActions = [
  { title: 'Class management', description: 'Create classes, add students, schedule lessons, and share Google Meet links.', accent: 'primary-gradient' },
  { title: 'Lesson management', description: 'Upload materials, lessons, and configure free or paid access.', accent: 'secondary-gradient' },
  { title: 'Grading', description: 'Mark Speaking and Writing assignments for Gold-tier students and send feedback.', accent: 'dark-gradient' },
  { title: 'AI moderation', description: 'Review, edit, and approve AI-generated quiz content before publication.', accent: 'primary-gradient' },
];

const decisionMap = {
  Approved: { label: 'Approve', tone: 'approve' },
  PendingReview: { label: 'Under review', tone: 'review' },
  Rejected: { label: 'Reject', tone: 'reject' },
};

export function TeacherDashboard() {
  const { user } = useAuth();
  const name = user?.fullName || user?.username || 'Teacher';
  const [reviewQueue, setReviewQueue] = useState([]);
  const [loadingQueue, setLoadingQueue] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [expandedQuizId, setExpandedQuizId] = useState(null);

  useEffect(() => {
    let active = true;

    async function loadQueue() {
      try {
        const response = await fetch('/api/quiz/moderation-queue');
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.message || 'Unable to load review queue');
        if (active) setReviewQueue(payload.items || []);
      } catch (error) {
        if (active) setReviewQueue([]);
      } finally {
        if (active) setLoadingQueue(false);
      }
    }

    loadQueue();
    return () => { active = false; };
  }, []);

  const pendingCount = useMemo(() => reviewQueue.length, [reviewQueue]);

  const handleDecision = async (quizId, status) => {
    setSubmitting(true);
    try {
      const response = await fetch('/api/quiz/moderation-decision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quizId,
          status,
          teacherId: user?.id || user?.userId || user?.details?.Id || null,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.message || 'Unable to save decision');
      }

      setReviewQueue((current) => current.filter((item) => item.quizId !== quizId));
    } catch (error) {
      alert(error.message || 'Unable to update review status');
    } finally {
      setSubmitting(false);
    }
  };

  const summaryStats = [
    { label: 'Classes', value: '08', tone: 'default' },
    { label: 'Students', value: '286', tone: 'default' },
    { label: 'Assignments', value: '24', tone: 'warning' },
    { label: 'AI pending review', value: String(pendingCount), tone: 'danger' },
  ];

  return (
    <div className="dashboard-container teacher-dashboard">
      <div className="dashboard-welcome glass-card teacher-hero">
        <div>
          <span className="eyebrow">Teacher workspace</span>
          <h1>Welcome, {name}.</h1>
          <p>Manage your profile, classes, lessons, assignments, and AI quiz moderation from one place.</p>
        </div>
        <div className="mini-stat-group">
          {summaryStats.map((item) => (
            <div key={item.label} className="mini-stat-card">
              <span className="label">{item.label}</span>
              <strong className={item.tone === 'warning' ? 'warning' : item.tone === 'danger' ? 'danger' : ''}>{item.value}</strong>
            </div>
          ))}
        </div>
      </div>

      <div className="grid-2 teacher-quick-actions">
        {quickActions.map((action) => (
          <button key={action.title} type="button" className={`action-btn ${action.accent}`}>
            <span className="icon">✦</span>
            <div>
              <h3>{action.title}</h3>
              <p>{action.description}</p>
            </div>
          </button>
        ))}
      </div>

      <div className="content-grid teacher-main-grid">
        <section className="glass-card">
          <div className="section-head">
            <h2>Instructor profile</h2>
            <button type="button" className="link-btn">Edit</button>
          </div>

          <div className="teacher-profile-panel">
            <div className="teacher-avatar">{(name || 'T')[0].toUpperCase()}</div>
            <div className="teacher-profile-info">
              <h3>{name}</h3>
              <p>IELTS Instructor · Speaking & Writing Specialist</p>
              <div className="tag-row">
                <span className="tag">IELTS 8.5</span>
                <span className="tag">8+ years experience</span>
                <span className="tag">Cambridge Trainer</span>
              </div>
            </div>
          </div>

          <div className="teacher-bio-block">
            <p>
              Build personalized learning plans, design practical lesson content, and guide students through international IELTS scoring standards.
            </p>
          </div>

          <div className="teacher-certificates">
            <div>
              <span className="label">Certificates</span>
              <strong>CELTA · TESOL · IELTS Trainer</strong>
            </div>
            <div>
              <span className="label">Profile summary</span>
              <strong>Gold-tier students · 1:1 feedback · Speaking/Writing coach</strong>
            </div>
          </div>
        </section>

        <section className="glass-card">
          <div className="section-head">
            <h2>Monthly overview</h2>
            <button type="button" className="link-btn">View report</button>
          </div>

          <div className="metric-stack">
            <div className="metric-box">
              <span className="label">Sessions</span>
              <strong>32</strong>
            </div>
            <div className="metric-box">
              <span className="label">Satisfaction rate</span>
              <strong>96%</strong>
            </div>
            <div className="metric-box">
              <span className="label">New courses</span>
              <strong>5</strong>
            </div>
          </div>
        </section>
      </div>

      <div className="grid-2 mt-30">
        <section className="glass-card">
          <div className="section-head">
            <h2>Class management</h2>
            <button type="button" className="link-btn">+ Create class</button>
          </div>

          <div className="list-stack">
            {classList.map((item) => (
              <div key={item.name} className="info-list-item">
                <div>
                  <h3>{item.name}</h3>
                  <p>{item.students} students · {item.meet}</p>
                </div>
                <div className="list-meta">
                  <span className="status-badge">{item.status}</span>
                  <small>{item.nextLesson}</small>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="glass-card">
          <div className="section-head">
            <h2>Lesson management</h2>
            <button type="button" className="link-btn">Upload</button>
          </div>

          <div className="list-stack">
            {lessonList.map((lesson) => (
              <div key={lesson.title} className="info-list-item lesson-item">
                <div>
                  <h3>{lesson.title}</h3>
                  <p>{lesson.type}</p>
                </div>
                <div className="list-meta lesson-meta">
                  <span className="pricing-badge">{lesson.price}</span>
                  <small>{lesson.updated}</small>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="grid-2 mt-30">
        <section className="glass-card">
          <div className="section-head">
            <h2>Grading</h2>
            <button type="button" className="link-btn">View all</button>
          </div>

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

        <section className="glass-card">
          <div className="section-head">
            <h2>AI quiz moderation</h2>
            <button type="button" className="link-btn">Bulk review</button>
          </div>

          <div className="queue-list">
            {loadingQueue ? (
              <div className="queue-item empty-state">Loading review queue...</div>
            ) : reviewQueue.length === 0 ? (
              <div className="queue-item empty-state">No AI quiz sets are currently pending review.</div>
            ) : (
              reviewQueue.map((item) => {
                const isExpanded = expandedQuizId === item.quizId;
                return (
                  <div key={item.quizId} className="queue-item review-item">
                    <div className="review-main">
                      <div className="review-summary">
                        <h3>{item.title}</h3>
                        <p>{item.passageTitle || item.topic || 'IELTS Reading'} · {item.level || 'Intermediate'}</p>
                      </div>
                      <button
                        type="button"
                        className="detail-toggle"
                        onClick={() => setExpandedQuizId(isExpanded ? null : item.quizId)}
                      >
                        {isExpanded ? 'Hide details' : 'View details'}
                      </button>
                    </div>

                    <div className="queue-meta">
                      <span className={`review-pill ${item.status === 'Approved' ? 'ok' : 'warning'}`}>
                        {item.moderationStatus === 'Approved' ? 'Approved' : item.moderationStatus === 'Rejected' ? 'Rejected' : 'Pending'}
                      </span>
                      <div className="review-actions">
                        {Object.entries(decisionMap).map(([status, config]) => (
                          <button
                            key={status}
                            type="button"
                            className={`decision-btn ${config.tone}`}
                            disabled={submitting}
                            onClick={() => handleDecision(item.quizId, status)}
                          >
                            {config.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="review-detail-panel">
                        <div className="detail-grid">
                          <div><span>Skill</span><strong>{item.skill || 'Reading'}</strong></div>
                          <div><span>Level</span><strong>{item.level || 'Intermediate'}</strong></div>
                          <div><span>Source</span><strong>{item.source || 'AI'}</strong></div>
                          <div><span>Question count</span><strong>{item.questionCount ?? 0}</strong></div>
                          <div><span>Word count</span><strong>{item.wordCount ?? 0}</strong></div>
                          <div><span>Topic</span><strong>{item.topic || 'General'}</strong></div>
                        </div>
                        <div className="detail-section">
                          <span>Passage</span>
                          <p>{item.passageContent || 'No passage content available.'}</p>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
