export const classList = [
  { name: 'IELTS Writing 6.5', students: 24, nextLesson: 'Today · 7:00 PM - 8:30 PM', meet: 'Google Meet', status: 'In progress' },
  { name: 'IELTS Speaking Masterclass', students: 15, nextLesson: 'Tomorrow · 6:00 PM', meet: 'Google Meet', status: 'Upcoming' },
  { name: 'General English Booster', students: 31, nextLesson: 'Thursday · 5:30 PM', meet: 'Google Meet', status: 'Scheduled' },
];

export const lessonList = [
  { title: 'Lesson 04: Task 2 Structure', type: 'Writing', price: 'Free', updated: '2 hours ago' },
  { title: 'Speaking Part 3 Cue Cards', type: 'Speaking', price: 'Gold', updated: 'Yesterday' },
  { title: 'Vocabulary Booster Band 7.5+', type: 'Vocabulary', price: 'Paid', updated: '3 days ago' },
];

export const gradingQueue = [
  { name: 'Nguyen Minh A', task: 'Writing Task 2', score: '7.0', status: 'Waiting for review' },
  { name: 'Le Hoang B', task: 'Speaking Part 2', score: '8.5', status: 'Feedback sent' },
  { name: 'Pham Thao C', task: 'Writing Task 1', score: '6.5', status: 'Needs review' },
];

export const teacherQuickActions = [
  { title: 'Upload IELTS quiz', description: 'Import questions from JSON or CSV, set answers and per-question difficulty, then save to the database.', accent: 'primary-gradient', to: '/teacher/upload-quiz' },
  { title: 'Class management', description: 'Create classes, add students, schedule lessons, and share Google Meet links.', accent: 'primary-gradient', to: '/teacher/classes' },
  { title: 'Lesson management', description: 'Upload materials, lessons, and configure free or paid access.', accent: 'secondary-gradient', to: '/teacher/lessons' },
  { title: 'Upload lesson', description: 'Share a new lesson file, notes, and learning materials with students.', accent: 'dark-gradient', to: '/teacher/upload-lesson' },
  { title: 'Grading', description: 'Mark Speaking and Writing assignments for Gold-tier students and send feedback.', accent: 'dark-gradient', to: '/teacher/grading' },
  { title: 'AI moderation', description: 'Review, edit, and approve AI-generated quiz content before publication.', accent: 'primary-gradient', to: '/teacher/ai-review' },
];
