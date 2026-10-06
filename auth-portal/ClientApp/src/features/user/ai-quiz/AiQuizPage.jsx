import { useState } from 'react';
import { aiQuizApi } from '../../../shared/api';
import { useAuth } from '../../../shared/auth/AuthContext';
import { userRank } from '../../../shared/lib/roles';
import { FeatureShell } from '../../../shared/ui/FeatureShell';
import { getQuestionTypesForSkill } from '../../teacher/lessons/questionTypes';
import { QuizGeneratorForm } from './components/QuizGeneratorForm';
import { QuizPreview } from './components/QuizPreview';

const quotas = { bronze: '8 per month', silver: '60 per month', gold: '250 per month' };

export function AiQuizPage() {
  const { user } = useAuth();
  const [skill, setSkill] = useState('Reading');
  const [questionType, setQuestionType] = useState('MULTIPLE_CHOICE_SINGLE');
  const [difficulty, setDifficulty] = useState('Intermediate');
  const [content, setContent] = useState('');
  const [file, setFile] = useState(null);
  const [quiz, setQuiz] = useState(null);
  const [status, setStatus] = useState('');

  function handleSkillChange(nextSkill) {
    setSkill(nextSkill);
    setQuestionType(getQuestionTypesForSkill(nextSkill)[0]?.code || '');
  }

  async function submitQuiz(event) {
    event.preventDefault();
    setStatus('Checking the document and generating a quiz...');
    setQuiz(null);
    try {
      const payload = file
        ? {
            document: `data:${file.fileType};base64,${file.contentBase64}`,
            input_type: 'image',
            skill: skill === 'All' ? 'All' : skill,
            question_type: questionType || null,
            tier: user?.rank || user?.details?.Rank || 'Bronze',
            user_id: user?.id || null,
          }
        : {
            document: content,
            input_type: 'text',
            skill: skill === 'All' ? 'All' : skill,
            question_type: questionType || null,
            tier: user?.rank || user?.details?.Rank || 'Bronze',
            user_id: user?.id || null,
          };
      const result = await aiQuizApi.generate(payload, user);
      setQuiz(result.data?.quiz_preview || result.quiz || result.data);
      setStatus(result.message || 'Quiz generated and awaiting review.');
    } catch (error) {
      setStatus(error.message);
    }
  }

  async function downloadQuiz(extension) {
    const response = await aiQuizApi.export(quiz, extension);
    if (!response.ok) {
      setStatus('Unable to export the file.');
      return;
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ielts-ai-quiz.${extension}`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function handleFileChange(event) {
    const selected = event.target.files?.[0];
    if (!selected) return;
    const reader = new FileReader();
    reader.onload = () => setFile({
      fileName: selected.name,
      fileType: selected.type || 'text/plain',
      contentBase64: String(reader.result).split(',').pop(),
    });
    reader.readAsDataURL(selected);
  }

  return (
    <FeatureShell
      icon="AI"
      title="AI quiz generator"
      description="Create personalized question sets based on your learning goals."
      accessValue={quotas[userRank(user)]}
    >
      <QuizGeneratorForm
        skill={skill}
        questionType={questionType}
        difficulty={difficulty}
        content={content}
        status={status}
        file={file}
        onSkillChange={handleSkillChange}
        onQuestionTypeChange={setQuestionType}
        onDifficultyChange={setDifficulty}
        onContentChange={setContent}
        onFileChange={handleFileChange}
        onSubmit={submitQuiz}
      />
      <QuizPreview quiz={quiz} onExport={downloadQuiz} />
    </FeatureShell>
  );
}
