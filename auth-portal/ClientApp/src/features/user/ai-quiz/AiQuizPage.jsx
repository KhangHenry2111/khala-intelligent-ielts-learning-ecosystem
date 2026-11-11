import { useState } from 'react';
import { aiQuizApi } from '../../../shared/api';
import { useAuth } from '../../../shared/auth/AuthContext';
import { userRank } from '../../../shared/lib/roles';
import { FeatureShell } from '../../../shared/ui/FeatureShell';
import { QuizGeneratorForm } from './components/QuizGeneratorForm';
import { QuizPreview } from './components/QuizPreview';

const quotas = { bronze: '8 per month', silver: '60 per month', gold: '250 per month' };

export function AiQuizPage() {
  const { user } = useAuth();
  const [skill, setSkill] = useState('Reading');
  const [generationMode, setGenerationMode] = useState('topic');
  const [difficulty, setDifficulty] = useState('Intermediate');
  const [content, setContent] = useState('');
  const [file, setFile] = useState(null);
  const [quiz, setQuiz] = useState(null);
  const [status, setStatus] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  function handleSkillChange(nextSkill) {
    setSkill(nextSkill);
  }

  async function submitQuiz(event) {
    event.preventDefault();
    setIsGenerating(true);
    setStatus('Đang tiếp nhận yêu cầu tạo quiz…');
    setQuiz(null);
    try {
      const payload = {
        document: file
          ? `data:${file.fileType};base64,${file.contentBase64}`
          : content,
        input_type: file ? 'image' : 'text',
        skill,
        generation_mode: file ? 'source' : generationMode,
        question_count: 40,
        tier: user?.rank || user?.details?.Rank || 'Bronze',
        user_id: user?.id || null,
      };
      const result = await aiQuizApi.generate(payload, user, setStatus);
      if (result.success) {
        setQuiz(result.data?.quiz_preview || result.quiz || result.data);
      }
      setStatus(result.message || 'Quiz generated and awaiting review.');
    } catch (error) {
      setStatus(error.message);
    } finally {
      setIsGenerating(false);
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
    if (!selected.type.startsWith('image/')) {
      reader.onload = () => {
        setContent(String(reader.result || ''));
        setFile(null);
      };
      reader.readAsText(selected);
      return;
    }
    reader.onload = () => setFile({
      fileName: selected.name,
      fileType: selected.type || 'text/plain',
      contentBase64: String(reader.result).split(',').pop(),
    });
    reader.readAsDataURL(selected);
  }

  function handleGenerationModeChange(nextMode) {
    setGenerationMode(nextMode);
    setFile(null);
  }

  return (
    <FeatureShell
      icon="AI"
      title="AI quiz generator"
      description="Create personalized question sets based on your learning goals."
      accessValue={quotas[userRank(user)]}
    >
      {quiz ? (
        <QuizPreview
          quiz={quiz}
          onClose={() => setQuiz(null)}
          onExport={downloadQuiz}
        />
      ) : (
        <QuizGeneratorForm
          skill={skill}
          generationMode={generationMode}
          difficulty={difficulty}
          content={content}
          status={status}
          isGenerating={isGenerating}
          file={file}
          onSkillChange={handleSkillChange}
          onGenerationModeChange={handleGenerationModeChange}
          onDifficultyChange={setDifficulty}
          onContentChange={setContent}
          onFileChange={handleFileChange}
          onSubmit={submitQuiz}
        />
      )}
    </FeatureShell>
  );
}
