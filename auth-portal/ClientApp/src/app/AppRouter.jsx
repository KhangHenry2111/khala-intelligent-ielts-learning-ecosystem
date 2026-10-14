import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import { useAuth } from '../shared/auth/AuthContext';
import { MainLayout } from '../shared/layout/MainLayout';
import { normalizeRole } from '../shared/lib/roles';
import { AuthPage } from '../features/auth/AuthPage';
import { ProfilePage } from '../features/profile/ProfilePage';
import { PlansPage } from '../features/user/plans/PlansPage';
import { AvailableQuizPage } from '../features/user/available-quiz/AvailableQuizPage';
import { ClassesPage as UserClassesPage } from '../features/user/classes/ClassesPage';
import { AiQuizPage } from '../features/user/ai-quiz/AiQuizPage';
import { LevelTestPage } from '../features/user/level-test/LevelTestPage';
import { UploadDocumentPage } from '../features/user/upload/UploadDocumentPage';
import { KnowledgeBasePage } from '../features/user/knowledge/KnowledgeBasePage';
import { ResultsPage } from '../features/user/results/ResultsPage';
import { TeacherDashboardPage } from '../features/teacher/dashboard/TeacherDashboardPage';
import { ClassesPage } from '../features/teacher/classes/ClassesPage';
import { LessonsPage } from '../features/teacher/lessons/LessonsPage';
import { UploadLessonPage } from '../features/teacher/lessons/UploadLessonPage';
import { GradingPage } from '../features/teacher/grading/GradingPage';
import { AiReviewPage } from '../features/teacher/ai-review/AiReviewPage';
import { TeacherCreateQuizPage } from '../features/teacher/quizzes/TeacherCreateQuizPage';
import { AdminDashboardPage } from '../features/admin/dashboard/AdminDashboardPage';
import { AccountsPage } from '../features/admin/accounts/AccountsPage';
import { TeachersPage } from '../features/admin/teachers/TeachersPage';
import { ContentPage } from '../features/admin/content/ContentPage';
import { FeedbackPage } from '../features/admin/feedback/FeedbackPage';
import { ReportsPage } from '../features/admin/reports/ReportsPage';

function Protected({ children, role }) {
  const { user } = useAuth();
  const safeRole = normalizeRole(role);
  if (!user) return <Navigate to={`/${safeRole}/login`} replace />;
  if (safeRole && normalizeRole(user.userType) !== safeRole) return <Navigate to="/" replace />;
  return children;
}

function RoleRoute({ children }) {
  const { role } = useParams();
  return <Protected role={role}>{children}</Protected>;
}

function Home() {
  const { user } = useAuth();
  const targetRole = normalizeRole(user?.userType);
  return <Navigate to={user ? `/${targetRole}/dashboard` : '/user/login'} replace />;
}

function DashboardSwitch() {
  const { role } = useParams();
  const safeRole = normalizeRole(role);
  if (safeRole === 'teacher') return <TeacherDashboardPage />;
  if (safeRole === 'admin') return <AdminDashboardPage />;
  return <PlansPage />;
}

const userFeaturePages = {
  classes: UserClassesPage,
  'available-quiz': AvailableQuizPage,
  'ai-quiz': AiQuizPage,
  'level-test': LevelTestPage,
  upload: UploadDocumentPage,
  knowledge: KnowledgeBasePage,
  results: ResultsPage,
};

const teacherFeaturePages = {
  classes: ClassesPage,
  lessons: LessonsPage,
  'upload-lesson': UploadLessonPage,
  grading: GradingPage,
  'ai-review': AiReviewPage,
  'create-quiz': TeacherCreateQuizPage,
  'upload-quiz': TeacherCreateQuizPage,
};

const adminFeaturePages = {
  accounts: AccountsPage,
  teachers: TeachersPage,
  content: ContentPage,
  feedback: FeedbackPage,
  reports: ReportsPage,
};

function FeatureRedirect() {
  const { role, feature } = useParams();
  const safeRole = normalizeRole(role);
  return <Navigate to={`/${safeRole}/${feature}`} replace />;
}

function FeaturePage() {
  const { role, feature } = useParams();
  const safeRole = normalizeRole(role);
  const pages = safeRole === 'teacher'
    ? teacherFeaturePages
    : safeRole === 'admin'
      ? adminFeaturePages
      : userFeaturePages;
  const Page = pages[feature];
  if (!Page) return <Navigate to={`/${safeRole}/dashboard`} replace />;
  return <Page />;
}

function LayoutPage({ children }) {
  return <MainLayout>{children}</MainLayout>;
}

export function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/user/login" element={<AuthPage mode="login" role="user" />} />
      <Route path="/teacher/login" element={<AuthPage mode="login" role="teacher" />} />
      <Route path="/instructor/login" element={<AuthPage mode="login" role="teacher" />} />
      <Route path="/admin/login" element={<AuthPage mode="login" role="admin" />} />
      <Route path="/user/register" element={<AuthPage mode="register" role="user" />} />
      <Route path="/teacher/register" element={<AuthPage mode="register" role="teacher" />} />
      <Route path="/instructor/register" element={<AuthPage mode="register" role="teacher" />} />

      <Route path="/:role/dashboard" element={<RoleRoute><LayoutPage><DashboardSwitch /></LayoutPage></RoleRoute>} />
      <Route path="/:role/profile" element={<RoleRoute><LayoutPage><ProfilePage /></LayoutPage></RoleRoute>} />
      <Route path="/:role/feature/:feature" element={<RoleRoute><FeatureRedirect /></RoleRoute>} />
      <Route path="/:role/:feature" element={<RoleRoute><LayoutPage><FeaturePage /></LayoutPage></RoleRoute>} />
      <Route path="*" element={<Home />} />
    </Routes>
  );
}
