import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../shared/auth/AuthContext';
import { quizApi } from '../../../shared/api';
import { SectionHead } from '../../../shared/ui/SectionHead';
import { lessonList as defaultLessons } from '../data';
import { LISTENING_QUESTION_TYPES, READING_QUESTION_TYPES } from './questionTypes';

const STORAGE_KEY = 'teacher.lesson.list';
const fixedAnswerOptions = {
  TRUE_FALSE_NOT_GIVEN: ['True', 'False', 'Not Given'],
  YES_NO_NOT_GIVEN: ['Yes', 'No', 'Not Given'],
};
const matchingTypes = new Set([
  'MATCHING_HEADINGS', 'MATCHING_INFORMATION', 'MATCHING_FEATURES',
  'MATCHING_SENTENCE_ENDINGS', 'MAP_PLAN_LABELING',
]);
const completionTypes = new Set([
  'SENTENCE_COMPLETION', 'SUMMARY_COMPLETION', 'NOTE_COMPLETION',
  'TABLE_COMPLETION', 'FLOW_CHART_COMPLETION', 'DIAGRAM_LABEL_COMPLETION', 'FORM_COMPLETION', 'SHORT_ANSWER',
]);

const readingFormats = READING_QUESTION_TYPES.map(({ code, label }) => [code, label]);
const listeningFormats = LISTENING_QUESTION_TYPES.map(({ code, label }) => [code, label]);

const blankQuestion = (difficulty = 'Intermediate') => ({
  content: '', options: ['', '', '', ''], correctAnswer: '', explanation: '', difficulty,
});

function readStoredLessons() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    return Array.isArray(stored) && stored.length ? stored : defaultLessons;
  } catch {
    return defaultLessons;
  }
}

export function UploadLessonPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [title, setTitle] = useState('');
  const [skill, setSkill] = useState('Writing');
  const [format, setFormat] = useState(readingFormats[0][0]);
  const [level, setLevel] = useState('Intermediate');
  const [description, setDescription] = useState('');
  const [topic, setTopic] = useState('');
  const [isFree, setIsFree] = useState(true);
  const [price, setPrice] = useState('0');
  const [passage, setPassage] = useState('');
  const [audioUrl, setAudioUrl] = useState('');
  const [transcript, setTranscript] = useState('');
  const [sharedOptions, setSharedOptions] = useState('i. A new approach\nii. An unexpected difficulty\niii. A lasting result\niv. A change in direction');
  const [visualReference, setVisualReference] = useState('');
  const [multiAnswerCount, setMultiAnswerCount] = useState(2);
  const [wordLimit, setWordLimit] = useState('NO MORE THAN TWO WORDS');
  const [questionCount, setQuestionCount] = useState(5);
  const [questions, setQuestions] = useState(() => Array.from({ length: 5 }, () => blankQuestion()));
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);

  const formats = skill === 'Reading' ? readingFormats : listeningFormats;
  const selectedFormat = formats.some(([code]) => code === format) ? format : formats[0][0];

  function changeSkill(nextSkill) {
    setSkill(nextSkill);
    const nextFormats = nextSkill === 'Reading' ? readingFormats : listeningFormats;
    setFormat(nextFormats[0][0]);
  }

  function changeQuestionCount(value) {
    const nextCount = Math.max(1, Math.min(40, Number(value) || 1));
    setQuestionCount(nextCount);
    setQuestions((current) => Array.from({ length: nextCount }, (_, index) => current[index] || blankQuestion(level)));
  }

  function updateQuestion(index, key, value) {
    setQuestions((current) => current.map((question, i) => i === index ? { ...question, [key]: value } : question));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setNotice(null);
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;

    if (skill !== 'Reading' && skill !== 'Listening') {
      const nextLesson = { title: trimmedTitle, type: skill, price: isFree ? 'Free' : price, updated: 'Just now', description: description.trim() || 'New lesson uploaded by teacher' };
      localStorage.setItem(STORAGE_KEY, JSON.stringify([nextLesson, ...readStoredLessons()]));
      navigate('/teacher/lessons');
      return;
    }

    const teacherId = user?.id || user?.userId || user?.details?.TeacherID || user?.details?.teacherId;
    if (!teacherId || !user?.accessToken) {
      setNotice({ type: 'error', text: 'Teacher session is missing. Sign in again, then retry.' });
      return;
    }
    if (skill === 'Reading' && !passage.trim()) {
      setNotice({ type: 'error', text: 'Add the reading passage before saving this lesson.' });
      return;
    }
    if (skill === 'Listening' && !audioUrl.trim()) {
      setNotice({ type: 'error', text: 'Add a URL for the listening audio before saving this lesson.' });
      return;
    }
    if (!isFree && Number(price) <= 0) {
      setNotice({ type: 'error', text: 'Enter a price greater than zero for a paid lesson.' });
      return;
    }
    const missingIndex = questions.findIndex((question) => !question.content.trim() || !question.correctAnswer.trim());
    if (missingIndex >= 0) {
      setNotice({ type: 'error', text: `Complete the question and answer key for question ${missingIndex + 1}.` });
      return;
    }
    if ((selectedFormat === 'MULTIPLE_CHOICE_SINGLE' || selectedFormat === 'MULTIPLE_CHOICE_MULTI')
      && questions.some((question) => question.options.some((option) => !option.trim()))) {
      setNotice({ type: 'error', text: 'Each multiple-choice question needs four options.' });
      return;
    }
    if (selectedFormat === 'MULTIPLE_CHOICE_MULTI'
      && questions.some((question) => question.correctAnswer.split(',').filter(Boolean).length !== multiAnswerCount)) {
      setNotice({ type: 'error', text: `Select exactly ${multiAnswerCount} correct options for every question.` });
      return;
    }
    if (matchingTypes.has(selectedFormat) && !sharedOptions.trim()) {
      setNotice({ type: 'error', text: 'Add the list of headings, labels, or features to match.' });
      return;
    }

    const matchingChoices = sharedOptions.split('\n').map((option) => option.trim()).filter(Boolean);
    const fixedChoices = fixedAnswerOptions[selectedFormat];
    const answerInstruction = selectedFormat === 'MULTIPLE_CHOICE_MULTI'
      ? `Choose exactly ${multiAnswerCount} answers. Separate answer letters with commas.`
      : selectedFormat === 'MULTIPLE_CHOICE_SINGLE'
        ? 'Choose one answer: A, B, C or D.'
        : fixedChoices
        ? 'Select the answer supported by the passage or recording.'
        : matchingTypes.has(selectedFormat)
          ? 'Match each prompt with the correct labelled option.'
          : completionTypes.has(selectedFormat)
            ? `Complete the answer using the ${skill === 'Reading' ? 'passage' : 'recording'}. ${wordLimit}.`
            : 'Answer using information from the passage or recording.';
    const questionGroup = {
      questionTypeCode: selectedFormat,
      instruction: answerInstruction,
      sharedOptions: matchingTypes.has(selectedFormat)
        ? selectedFormat === 'MAP_PLAN_LABELING' ? JSON.stringify({ options: matchingChoices, referenceUrl: visualReference.trim() }) : JSON.stringify(matchingChoices)
        : selectedFormat === 'DIAGRAM_LABEL_COMPLETION' ? visualReference.trim() : null,
      wordLimit: completionTypes.has(selectedFormat) ? wordLimit : null,
      orderIndex: 1,
      questions: questions.map((question, index) => ({
        questionType: selectedFormat,
        questionTypeCode: selectedFormat,
        content: question.content.trim(),
        options: selectedFormat.startsWith('MULTIPLE_CHOICE')
          ? JSON.stringify(Object.fromEntries(question.options.map((option, optionIndex) => [String.fromCharCode(65 + optionIndex), option.trim()])))
          : fixedChoices ? JSON.stringify(fixedChoices) : null,
        correctAnswer: question.correctAnswer.trim(),
        explanation: question.explanation.trim() || null,
        difficulty: question.difficulty,
        orderIndex: index + 1,
      })),
    };

    setBusy(true);
    try {
      const result = await quizApi.saveTeacherQuiz({
        title: trimmedTitle,
        description: description.trim(),
        skill,
        level,
        creatorId: teacherId,
        isFree,
        price: Number(price) || 0,
        passage: skill === 'Reading' ? { title: trimmedTitle, content: passage.trim(), topic: topic.trim() || 'General', level } : null,
        audio: skill === 'Listening' ? { audioURL: audioUrl.trim(), transcript: transcript.trim(), topic: topic.trim() || 'General' } : null,
        questionGroups: [questionGroup],
      }, user.accessToken);
      setNotice({ type: 'success', text: `Saved to SQL. Lesson ID: ${result.materialId}; ${result.questionsCount} questions.` });
    } catch (error) {
      setNotice({ type: 'error', text: error.message || 'Could not save this lesson to the database.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dashboard-container">
      <section className="glass-card upload-lesson-card">
        <SectionHead title="Upload lesson" actionLabel="Back to lessons" onAction={() => navigate('/teacher/lessons')} />
        <p className="upload-lesson-intro">Reading and Listening lessons use IELTS question sets. Choose a question type, add each prompt and answer key, then save the lesson and quiz together to SQL.</p>

        <form className="upload-lesson-form" onSubmit={handleSubmit}>
          <div className="upload-field-group">
            <label htmlFor="lesson-title">Lesson title</label>
            <input id="lesson-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="IELTS Reading: Urban farming" required />
          </div>

          <div className="upload-grid">
            <div className="upload-field-group">
              <label htmlFor="lesson-type">Lesson skill</label>
              <select id="lesson-type" value={skill} onChange={(event) => changeSkill(event.target.value)}>
                <option>Writing</option><option>Speaking</option><option>Listening</option><option>Reading</option><option>Vocabulary</option>
              </select>
            </div>
            <div className="upload-field-group">
              <label htmlFor="lesson-level">IELTS difficulty</label>
              <select id="lesson-level" value={level} onChange={(event) => setLevel(event.target.value)}>
                <option>Beginner</option><option>Intermediate</option><option>Advanced</option>
              </select>
            </div>
          </div>

          <div className="upload-field-group">
            <label htmlFor="lesson-description">Description / learning objective</label>
            <textarea id="lesson-description" rows="3" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Describe the target skills and learning objectives..." />
          </div>

          <div className="upload-grid">
            <div className="upload-field-group">
              <label htmlFor="lesson-topic">Topic</label>
              <input id="lesson-topic" value={topic} onChange={(event) => setTopic(event.target.value)} placeholder="Environment, science, education..." />
            </div>
            <div className="upload-field-group">
              <label htmlFor="lesson-access">Access</label>
              <select id="lesson-access" value={isFree ? 'Free' : 'Paid'} onChange={(event) => setIsFree(event.target.value === 'Free')}>
                <option>Free</option><option>Paid</option>
              </select>
            </div>
          </div>
          {!isFree && <div className="upload-field-group"><label htmlFor="lesson-price">Price</label><input id="lesson-price" type="number" min="0" step="1000" value={price} onChange={(event) => setPrice(event.target.value)} /></div>}

          {(skill === 'Reading' || skill === 'Listening') && <>
            <div className="upload-field-group">
              <label htmlFor="question-format">IELTS question type</label>
              <select id="question-format" value={selectedFormat} onChange={(event) => setFormat(event.target.value)}>
                {formats.map(([code, label]) => <option value={code} key={code}>{label}</option>)}
              </select>
            </div>

            {skill === 'Reading' ? (
              <div className="upload-field-group">
                <label htmlFor="reading-passage">Reading passage</label>
                <textarea id="reading-passage" rows="8" value={passage} onChange={(event) => setPassage(event.target.value)} placeholder="Paste the passage students will read..." required />
              </div>
            ) : <>
              <div className="upload-field-group">
                <label htmlFor="listening-audio-url">Listening audio URL</label>
                <input id="listening-audio-url" type="url" value={audioUrl} onChange={(event) => setAudioUrl(event.target.value)} placeholder="https://..." required />
                <small>Audio is stored as a URL; the audio file itself should be hosted at this address.</small>
              </div>
              <div className="upload-field-group">
                <label htmlFor="listening-transcript">Transcript (optional)</label>
                <textarea id="listening-transcript" rows="5" value={transcript} onChange={(event) => setTranscript(event.target.value)} placeholder="Paste the listening transcript for teacher reference..." />
              </div>
            </>}

            {matchingTypes.has(selectedFormat) && <div className="upload-field-group">
              <label htmlFor="matching-options">Shared headings / features / labels (one per line)</label>
              <textarea id="matching-options" rows="5" value={sharedOptions} onChange={(event) => setSharedOptions(event.target.value)} />
              <small>Use a unique label at the start of every line, such as “i. A new approach”.</small>
            </div>}

            {(selectedFormat === 'DIAGRAM_LABEL_COMPLETION' || selectedFormat === 'MAP_PLAN_LABELING') && <div className="upload-field-group">
              <label htmlFor="diagram-reference">{selectedFormat === 'MAP_PLAN_LABELING' ? 'Map / plan image URL' : 'Diagram reference URL'} (optional)</label>
              <input id="diagram-reference" type="url" value={visualReference} onChange={(event) => setVisualReference(event.target.value)} placeholder="https://..." />
              <small>Add the visual reference here and the label or location in each question prompt.</small>
            </div>}

            {selectedFormat === 'MULTIPLE_CHOICE_MULTI' && <div className="upload-field-group">
              <label htmlFor="multi-answer-count">Correct answers per question</label>
              <select id="multi-answer-count" value={multiAnswerCount} onChange={(event) => setMultiAnswerCount(Number(event.target.value))}><option value={2}>Choose TWO answers</option><option value={3}>Choose THREE answers</option></select>
            </div>}

            {completionTypes.has(selectedFormat) && <div className="upload-field-group">
              <label htmlFor="lesson-word-limit">IELTS answer word limit</label>
              <select id="lesson-word-limit" value={wordLimit} onChange={(event) => setWordLimit(event.target.value)}>
                <option>NO MORE THAN ONE WORD</option><option>NO MORE THAN TWO WORDS</option><option>NO MORE THAN THREE WORDS</option><option>ONE WORD AND/OR A NUMBER</option>
              </select>
            </div>}

            <div className="upload-field-group">
              <label htmlFor="lesson-question-count">Number of questions</label>
              <input id="lesson-question-count" type="number" min="1" max="40" value={questionCount} onChange={(event) => changeQuestionCount(event.target.value)} />
            </div>

            <div className="upload-question-list">
              {questions.map((question, index) => <fieldset className="upload-question-card" key={index}>
                <legend>Question {index + 1}</legend>
                <div className="upload-field-group">
                  <label htmlFor={`q-content-${index}`}>{matchingTypes.has(selectedFormat) ? 'Prompt / paragraph label' : 'Question'}</label>
                  <textarea id={`q-content-${index}`} rows="2" value={question.content} onChange={(event) => updateQuestion(index, 'content', event.target.value)} required placeholder={selectedFormat === 'MATCHING_HEADINGS' ? 'Paragraph A' : 'Enter a clear IELTS-style question...'} />
                </div>

                {selectedFormat.startsWith('MULTIPLE_CHOICE') && <div className="upload-grid upload-option-grid">
                  {question.options.map((option, optionIndex) => <div className="upload-field-group" key={optionIndex}>
                    <label htmlFor={`q-${index}-option-${optionIndex}`}>Option {String.fromCharCode(65 + optionIndex)}</label>
                    <input id={`q-${index}-option-${optionIndex}`} value={option} onChange={(event) => updateQuestion(index, 'options', question.options.map((item, i) => i === optionIndex ? event.target.value : item))} required />
                  </div>)}
                </div>}

                <div className="upload-grid">
                  <div className="upload-field-group">
                    <label htmlFor={`q-answer-${index}`}>Correct answer</label>
                    {fixedAnswerOptions[selectedFormat] ? <select id={`q-answer-${index}`} value={question.correctAnswer} onChange={(event) => updateQuestion(index, 'correctAnswer', event.target.value)} required>
                      <option value="">Choose answer</option>{fixedAnswerOptions[selectedFormat].map((item) => <option key={item}>{item}</option>)}
                    </select> : selectedFormat.startsWith('MULTIPLE_CHOICE') ? <select id={`q-answer-${index}`} multiple={selectedFormat === 'MULTIPLE_CHOICE_MULTI'} size={selectedFormat === 'MULTIPLE_CHOICE_MULTI' ? 4 : undefined} value={selectedFormat === 'MULTIPLE_CHOICE_MULTI' ? (question.correctAnswer ? question.correctAnswer.split(',') : []) : question.correctAnswer} onChange={(event) => updateQuestion(index, 'correctAnswer', Array.from(event.target.selectedOptions, (item) => item.value).join(','))} required>
                      {['A', 'B', 'C', 'D'].map((item) => <option key={item} value={item}>{item}{selectedFormat === 'MULTIPLE_CHOICE_MULTI' ? ' (select all that apply)' : ''}</option>)}
                    </select> : matchingTypes.has(selectedFormat) ? <select id={`q-answer-${index}`} value={question.correctAnswer} onChange={(event) => updateQuestion(index, 'correctAnswer', event.target.value)} required>
                      <option value="">Choose a match</option>{sharedOptions.split('\n').map((item) => item.trim()).filter(Boolean).map((item) => <option key={item} value={item.split(/[.\s-]/)[0]}>{item}</option>)}
                    </select> : <input id={`q-answer-${index}`} value={question.correctAnswer} onChange={(event) => updateQuestion(index, 'correctAnswer', event.target.value)} placeholder="Exact answer" required />}
                  </div>
                  <div className="upload-field-group">
                    <label htmlFor={`q-difficulty-${index}`}>Question difficulty</label>
                    <select id={`q-difficulty-${index}`} value={question.difficulty} onChange={(event) => updateQuestion(index, 'difficulty', event.target.value)}>
                      <option>Beginner</option><option>Intermediate</option><option>Advanced</option>
                    </select>
                  </div>
                </div>
                <div className="upload-field-group">
                  <label htmlFor={`q-explanation-${index}`}>Answer explanation</label>
                  <textarea id={`q-explanation-${index}`} rows="2" value={question.explanation} onChange={(event) => updateQuestion(index, 'explanation', event.target.value)} placeholder="Explain why the answer is correct (optional)" />
                </div>
              </fieldset>)}
            </div>
          </>}

          {notice && <p className={`teacher-quiz-notice ${notice.type}`} role="status">{notice.text}</p>}
          <div className="upload-actions">
            <button type="button" className="secondary-btn" onClick={() => navigate('/teacher/lessons')}>Cancel</button>
            <button type="submit" className="feature-action upload-submit" disabled={busy}>
              {busy ? 'Saving to database…' : skill === 'Reading' || skill === 'Listening' ? 'Save lesson and quiz' : 'Upload lesson'} <span>→</span>
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
