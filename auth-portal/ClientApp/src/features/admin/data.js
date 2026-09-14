export const adminStats = [
  { label: 'Users', value: '1,245', tone: 'default' },
  { label: 'Teachers', value: '48', tone: 'default' },
  { label: 'Feedback', value: '17', tone: 'warning' },
  { label: 'Blocked accounts', value: '06', tone: 'danger' },
];

export const accountRows = [
  { name: 'Nguyen Van A', role: 'User', status: 'Active', lastSeen: '2 minutes ago' },
  { name: 'Tran Thi B', role: 'Teacher', status: 'Pending', lastSeen: '35 minutes ago' },
  { name: 'Le Hoang C', role: 'Admin', status: 'Active', lastSeen: '1 hour ago' },
  { name: 'Pham Mai D', role: 'User', status: 'Suspended', lastSeen: 'Yesterday' },
];

export const feedbackRows = [
  { title: 'Login issue on mobile app', sender: 'Student #1024', priority: 'High', status: 'In progress' },
  { title: 'Feedback on Speaking lesson', sender: 'Student #4102', priority: 'Medium', status: 'New' },
  { title: 'Policy violation document', sender: 'Content complaint', priority: 'High', status: 'Needs review' },
];

export const contentRows = [
  { title: 'IELTS Writing Task 2 - Practice Set', type: 'Lesson', reason: 'Incorrect prompt content', status: 'Pending review' },
  { title: 'Vocabulary Booster PDF', type: 'Document', reason: 'Copyright issue', status: 'Removed' },
  { title: 'Speaking Lesson 08', type: 'Lesson', reason: 'Inappropriate content', status: 'Under review' },
];

export const accessRows = [
  { name: 'Nguyen Tien', role: 'Teacher', reason: 'Violation of class rules', action: 'Ban' },
  { name: 'Phan Huy', role: 'User', reason: 'Spam feedback', action: 'Temporarily suspend' },
  { name: 'Do Lan', role: 'Admin', reason: 'Permission adjustment request', action: 'Review' },
];

export const adminQuickActions = [
  { title: 'Account management', description: 'Add, edit, lock, or remove accounts for users, teachers, and admins.', accent: 'primary-gradient', to: '/admin/accounts' },
  { title: 'Feedback management', description: 'Track suggestions, bug reports, and issues raised by users.', accent: 'secondary-gradient', to: '/admin/feedback' },
  { title: 'Content management', description: 'Review and remove lessons or documents that violate policy.', accent: 'dark-gradient', to: '/admin/content' },
  { title: 'Access management', description: 'Suspend accounts after approval through the management workflow.', accent: 'primary-gradient', to: '/admin/reports' },
];
