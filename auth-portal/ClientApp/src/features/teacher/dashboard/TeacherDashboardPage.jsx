import { useEffect, useState } from 'react';
import { quizApi } from '../../../shared/api';
import { useAuth } from '../../../shared/auth/AuthContext';
import { displayName } from '../../../shared/lib/roles';
import { ActionGrid } from '../../../shared/ui/ActionGrid';
import { SectionHead } from '../../../shared/ui/SectionHead';
import { WorkspaceHero } from '../../../shared/ui/WorkspaceHero';
import { teacherQuickActions } from '../data';
import { useLanguage } from '../../../shared/i18n/LanguageContext';

export function TeacherDashboardPage() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const name = displayName(user, 'Teacher');
  const [pendingReviewCount, setPendingReviewCount] = useState(0);

  useEffect(() => {
    let active = true;
    quizApi.moderationQueue({}, user?.accessToken)
      .then((payload) => {
        if (active) setPendingReviewCount((payload.items || []).length);
      })
      .catch(() => {
        if (active) setPendingReviewCount(0);
      });
    return () => { active = false; };
  }, [user?.accessToken]);

  const stats = [
    { label: 'Classes', value: '08', tone: 'default' },
    { label: 'Students', value: '286', tone: 'default' },
    { label: 'Assignments', value: '24', tone: 'warning' },
    { label: 'AI pending review', value: String(pendingReviewCount), tone: 'danger' },
  ];

  return (
    <div className="dashboard-container teacher-dashboard">
      <WorkspaceHero
        className="teacher-hero"
        eyebrow="Teacher workspace"
        title={`Welcome, ${name}.`}
        description="Manage your profile, classes, lessons, assignments, and AI quiz moderation from one place."
        stats={stats}
      />
      <ActionGrid actions={teacherQuickActions} className="teacher-quick-actions" />
      <div className="content-grid teacher-main-grid">
        <section className="glass-card">
          <SectionHead title="Instructor profile" actionLabel="Edit" />
          <div className="teacher-profile-panel">
            <div className="teacher-avatar">{(name || 'T')[0].toUpperCase()}</div>
            <div className="teacher-profile-info">
              <h3>{name}</h3>
              <p>{t('IELTS Instructor · Speaking & Writing Specialist')}</p>
              <div className="tag-row">
                <span className="tag">IELTS 8.5</span>
                <span className="tag">8+ years experience</span>
                <span className="tag">{t('Cambridge Trainer')}</span>
              </div>
            </div>
          </div>
          <div className="teacher-bio-block">
            <p>
              {t('Build personalized learning plans, design practical lesson content, and guide students through international IELTS scoring standards.')}
            </p>
          </div>
          <div className="teacher-certificates">
            <div>
              <span className="label">Certificates</span>
              <strong>{t('CELTA · TESOL · IELTS Trainer')}</strong>
            </div>
            <div>
              <span className="label">Profile summary</span>
              <strong>{t('Gold-tier students · 1:1 feedback · Speaking/Writing coach')}</strong>
            </div>
          </div>
        </section>
        <section className="glass-card">
          <SectionHead title="Monthly overview" actionLabel="View report" />
          <div className="metric-stack">
            <div className="metric-box"><span className="label">Sessions</span><strong>32</strong></div>
            <div className="metric-box"><span className="label">Satisfaction rate</span><strong>96%</strong></div>
            <div className="metric-box"><span className="label">New courses</span><strong>5</strong></div>
          </div>
        </section>
      </div>
    </div>
  );
}
