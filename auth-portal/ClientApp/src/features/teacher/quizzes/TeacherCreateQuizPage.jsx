import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../shared/auth/AuthContext';
import { quizApi } from '../../../shared/api';
import { useLanguage } from '../../../shared/i18n/LanguageContext';
import { READING_QUESTION_TYPES } from '../lessons/questionTypes';

const skills = [
  { code: 'Reading', description: 'Read passages and build IELTS question sets.' },
  { code: 'Listening', description: 'Listening quiz creation is coming soon.', unavailable: true },
  { code: 'Writing', description: 'Create IELTS Task 1 and Task 2 writing prompts.' },
  { code: 'Speaking', description: 'Speaking quiz creation is coming soon.', unavailable: true },
];

const writingFormats = [
  ['TASK1_LINE_GRAPH', 'Task 1: Line graph'],
  ['TASK1_BAR_CHART', 'Task 1: Bar chart'],
  ['TASK1_PIE_CHART', 'Task 1: Pie chart'],
  ['TASK1_TABLE', 'Task 1: Table'],
  ['TASK1_MAP', 'Task 1: Map'],
  ['TASK1_PROCESS', 'Task 1: Process'],
  ['TASK2_OPINION', 'Task 2: Opinion essay'],
  ['TASK2_DISCUSSION', 'Task 2: Discussion essay'],
  ['TASK2_ADVANTAGES_DISADVANTAGES', 'Task 2: Advantages and disadvantages'],
  ['TASK2_PROBLEM_SOLUTION', 'Task 2: Problem and solution'],
  ['TASK2_TWO_PART_QUESTION', 'Task 2: Two-part question'],
].map(([code, label]) => ({ code, label, description: '' }));

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
  'TABLE_COMPLETION', 'FLOW_CHART_COMPLETION', 'DIAGRAM_LABEL_COMPLETION',
  'FORM_COMPLETION', 'SHORT_ANSWER',
]);
const matchingDefaults = 'i. A surprising discovery\nii. The first attempt\niii. A lasting impact\niv. An unexpected challenge';

const blankQuestion = () => ({
  content: '',
  options: ['', '', '', ''],
  correctAnswer: '',
  explanation: '',
  difficulty: 'Intermediate',
});

function createTypeGroup(questionCount = 5) {
  return {
    format: '',
    questions: Array.from({ length: questionCount }, blankQuestion),
    wordLimit: 'NO MORE THAN TWO WORDS',
    sharedOptions: matchingDefaults,
    visualReference: '',
    multiAnswerCount: 2,
    prompt: '',
    modelAnswer: '',
  };
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"' && quoted && text[index + 1] === '"') { field += '"'; index += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === ',' && !quoted) { row.push(field); field = ''; }
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[index + 1] === '\n') index += 1;
      row.push(field);
      field = '';
      if (row.some((cell) => cell.trim())) rows.push(row);
      row = [];
    } else field += char;
  }
  row.push(field);
  if (row.some((cell) => cell.trim())) rows.push(row);
  if (rows.length < 2) throw new Error('CSV needs a header row and at least one question.');
  const headers = rows.shift().map((header) => header.trim().replace(/^\uFEFF/, '').toLowerCase());
  return rows.map((cells) => Object.fromEntries(headers.map((header, index) => [header, (cells[index] || '').trim()])));
}

export function TeacherCreateQuizPage() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [skill, setSkill] = useState('');
  const [typeCount, setTypeCount] = useState(0);
  const [groups, setGroups] = useState([]);
  const [title, setTitle] = useState('');
  const [topic, setTopic] = useState('');
  const [level, setLevel] = useState('Intermediate');
  const [passage, setPassage] = useState('');
  const [isFree, setIsFree] = useState(true);
  const [price, setPrice] = useState('0');
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [notice, setNotice] = useState(null);

  const availableFormats = skill === 'Writing'
    ? writingFormats
    : skill === 'Reading'
      ? READING_QUESTION_TYPES
      : [];
  const questionCount = groups.reduce((total, group) => total + group.questions.length, 0);

  function changeSkill(nextSkill) {
    setSkill(nextSkill);
    setTypeCount(0);
    setGroups([]);
    setNotice(null);
  }

  function changeTypeCount(value) {
    const nextCount = Number(value) || 0;
    setTypeCount(nextCount);
    setGroups((current) => Array.from({ length: nextCount }, (_, index) =>
      current[index] || createTypeGroup(Math.max(1, Math.min(5, Math.floor(40 / nextCount))))));
  }

  function updateGroup(index, changes) {
    setGroups((current) => current.map((group, groupIndex) => groupIndex === index
      ? { ...group, ...changes }
      : group));
  }

  function changeQuestionCount(groupIndex, value) {
    const otherQuestions = questionCount - groups[groupIndex].questions.length;
    const maximum = Math.max(1, Math.min(40 - otherQuestions, Number(value) || 1));
    updateGroup(groupIndex, {
      questions: Array.from({ length: maximum }, (_, index) => groups[groupIndex].questions[index] || blankQuestion()),
    });
  }

  function updateQuestion(groupIndex, questionIndex, key, value) {
    setGroups((current) => current.map((group, index) => index !== groupIndex ? group : {
      ...group,
      questions: group.questions.map((question, itemIndex) => itemIndex === questionIndex
        ? { ...question, [key]: value }
        : question),
    }));
  }

  function addQuestion(groupIndex) {
    if (questionCount >= 40) return;
    updateGroup(groupIndex, { questions: [...groups[groupIndex].questions, blankQuestion()] });
  }

  function removeQuestion(groupIndex, questionIndex) {
    const currentGroup = groups[groupIndex];
    if (currentGroup.questions.length <= 1) return;
    updateGroup(groupIndex, {
      questions: currentGroup.questions.filter((_, index) => index !== questionIndex),
    });
  }

  async function importQuestionFile(file) {
    if (!file) return;
    setNotice(null);
    setImporting(true);
    try {
      const content = await file.text();
      let imported;
      let data = null;
      if (file.name.toLowerCase().endsWith('.csv')) {
        imported = parseCsv(content);
      } else {
        data = JSON.parse(content);
        if (data.title) setTitle(data.title);
        if (data.topic) setTopic(data.topic);
        if (data.level) setLevel(data.level);
        if (data.passage) setPassage(data.passage);
        imported = Array.isArray(data) ? data : data.questions;
      }
      if (!Array.isArray(imported) || imported.length === 0) throw new Error('The file does not contain any questions.');
      if (imported.length > 40) throw new Error('A quiz can contain up to 40 questions.');
      const nextQuestions = imported.map((item) => {
        const choices = item.options || {};
        const options = Array.isArray(choices)
          ? choices
          : ['A', 'B', 'C', 'D'].map((letter) => choices[letter] ?? item[`option${letter}`] ?? item[letter] ?? '');
        return {
          ...blankQuestion(),
          content: String(item.content ?? item.question ?? item.prompt ?? ''),
          options: ['0', '1', '2', '3'].map((index) => options[Number(index)] ?? ''),
          correctAnswer: String(item.correctAnswer ?? item.answer ?? item.key ?? ''),
          explanation: String(item.explanation ?? ''),
          difficulty: item.difficulty ?? item.level ?? level,
        };
      });
      if (data?.format && availableFormats.some((format) => format.code === data.format)) {
        updateGroup(0, { format: data.format });
      }
      if (nextQuestions.length + questionCount - groups[0].questions.length > 40) {
        throw new Error('A quiz can contain up to 40 questions in total.');
      }
      updateGroup(0, { questions: nextQuestions });
      setNotice({ type: 'success', text: `Imported ${nextQuestions.length} questions. Review the answer keys and difficulty before saving.` });
    } catch (error) {
      setNotice({ type: 'error', text: error.message || 'Could not read the question file.' });
    } finally {
      setImporting(false);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setNotice(null);
    const teacherId = user?.id || user?.userId || user?.details?.TeacherID || user?.details?.teacherId;
    if (!teacherId) {
      setNotice({ type: 'error', text: 'Không tìm thấy ID giáo viên trong phiên đăng nhập. Vui lòng đăng xuất và đăng nhập lại.' });
      return;
    }
    const parsedPrice = Number(price);
    if (!isFree && (!Number.isFinite(parsedPrice) || parsedPrice <= 0 || parsedPrice > 9_999_999_999.99)) {
      setNotice({ type: 'error', text: 'Nhập giá lesson lớn hơn 0 và không vượt quá 9.999.999.999,99 VND.' });
      return;
    }
    if (typeCount < 1 || groups.length !== typeCount || groups.some((group) => !group.format)) {
      setNotice({ type: 'error', text: 'Choose a question type for every selected type slot.' });
      return;
    }

    let payload;
    if (skill === 'Reading') {
      if (passage.trim().split(/\s+/).filter(Boolean).length < 40) {
        setNotice({ type: 'error', text: 'Đoạn đọc cần có ít nhất 40 từ để tạo câu hỏi Reading có ngữ cảnh.' });
        return;
      }
      const missingGroup = groups.findIndex((group) =>
        group.questions.some((question) => !question.content.trim() || !question.correctAnswer.trim()));
      if (missingGroup >= 0) {
        setNotice({ type: 'error', text: `Complete the question and answer key for every question in type ${missingGroup + 1}.` });
        return;
      }
      const invalidMultipleChoice = groups.findIndex((group) =>
        group.format.startsWith('MULTIPLE_CHOICE')
        && group.questions.some((question) => question.options.some((option) => !option.trim())));
      if (invalidMultipleChoice >= 0) {
        setNotice({ type: 'error', text: 'Each multiple-choice question needs four options.' });
        return;
      }
      const invalidMultiAnswer = groups.findIndex((group) =>
        group.format === 'MULTIPLE_CHOICE_MULTI'
        && group.questions.some((question) => question.correctAnswer.split(',').filter(Boolean).length !== group.multiAnswerCount));
      if (invalidMultiAnswer >= 0) {
        setNotice({ type: 'error', text: `Select exactly ${groups[invalidMultiAnswer].multiAnswerCount} correct options for every multiple-choice question.` });
        return;
      }
      const invalidMatching = groups.findIndex((group) =>
        matchingTypes.has(group.format) && !group.sharedOptions.trim());
      if (invalidMatching >= 0) {
        setNotice({ type: 'error', text: 'Add the list of headings, labels, or features for every matching type.' });
        return;
      }

      payload = {
        skill,
        passage: {
          title: title.trim(),
          content: passage.trim(),
          topic: topic.trim() || 'General',
          level,
        },
        questionGroups: groups.map((group, groupIndex) => {
          const sharedOptions = group.sharedOptions.split('\n').map((option) => option.trim()).filter(Boolean);
          const fixedOptions = fixedAnswerOptions[group.format];
          return {
            questionTypeCode: group.format,
            instruction: group.format === 'MULTIPLE_CHOICE_MULTI'
              ? `Choose exactly ${group.multiAnswerCount} answers.`
              : group.format === 'SENTENCE_COMPLETION'
                ? `Complete the sentences using words from the passage. ${group.wordLimit}.`
                : availableFormats.find((format) => format.code === group.format)?.description || 'Answer using evidence from the passage.',
            wordLimit: completionTypes.has(group.format) ? group.wordLimit : null,
            sharedOptions: matchingTypes.has(group.format)
              ? group.format === 'MAP_PLAN_LABELING'
                ? JSON.stringify({ options: sharedOptions, referenceUrl: group.visualReference.trim() })
                : JSON.stringify(sharedOptions)
              : group.format === 'DIAGRAM_LABEL_COMPLETION' ? group.visualReference.trim() : null,
            orderIndex: groupIndex + 1,
            questions: group.questions.map((question, index) => ({
              questionType: group.format,
              questionTypeCode: group.format,
              content: question.content.trim(),
              options: group.format.startsWith('MULTIPLE_CHOICE')
                ? JSON.stringify(Object.fromEntries(question.options.map((option, optionIndex) => [String.fromCharCode(65 + optionIndex), option.trim()])))
                : fixedOptions ? JSON.stringify(fixedOptions) : null,
              correctAnswer: question.correctAnswer.trim(),
              explanation: question.explanation.trim() || null,
              difficulty: question.difficulty || level,
              orderIndex: index + 1,
            })),
          };
        }),
      };
    } else {
      const missingPrompt = groups.findIndex((group) => !group.prompt.trim());
      if (missingPrompt >= 0) {
        setNotice({ type: 'error', text: `Enter the Writing task prompt for type ${missingPrompt + 1}.` });
        return;
      }
      payload = {
        skill,
        description: topic.trim(),
        sections: groups.map((group, index) => ({
          sectionType: group.format,
          title: availableFormats.find((format) => format.code === group.format)?.label,
          prompt: group.prompt.trim(),
          modelAnswer: group.modelAnswer.trim() || null,
          orderIndex: index + 1,
        })),
      };
    }

    setSaving(true);
    try {
      await quizApi.saveTeacherQuiz({
        title: title.trim(),
        ...payload,
        level,
        creatorId: teacherId,
        isFree,
        price: isFree ? 0 : parsedPrice,
      }, user?.accessToken);
      navigate('/teacher/lessons');
    } catch (error) {
      setNotice({ type: 'error', text: error.message || 'Không thể lưu quiz.' });
    } finally {
      setSaving(false);
    }
  }

  function renderReadingGroup(group, groupIndex) {
    const format = availableFormats.find((item) => item.code === group.format);
    const fixedOptions = fixedAnswerOptions[group.format];
    const canAddQuestion = questionCount < 40;
    const otherCount = questionCount - group.questions.length;
    return (
      <div className="teacher-question-type-card" key={`reading-${groupIndex}`}>
        <h3>{t('Question type')} {groupIndex + 1}: {t(format?.label || '')}</h3>
        <div className="teacher-quiz-fields teacher-quiz-settings">
          <label>{t('Number of questions')}
            <input type="number" min="1" max={Math.max(1, 40 - otherCount)} value={group.questions.length} onChange={(event) => changeQuestionCount(groupIndex, event.target.value)} />
          </label>
          {completionTypes.has(group.format) && <label>{t('IELTS answer word limit')}
            <select value={group.wordLimit} onChange={(event) => updateGroup(groupIndex, { wordLimit: event.target.value })}>
              <option>NO MORE THAN ONE WORD</option><option>NO MORE THAN TWO WORDS</option>
              <option>NO MORE THAN THREE WORDS</option><option>ONE WORD AND/OR A NUMBER</option>
            </select>
          </label>}
          {group.format === 'MULTIPLE_CHOICE_MULTI' && <label>{t('Correct answers per question')}
            <select value={group.multiAnswerCount} onChange={(event) => updateGroup(groupIndex, { multiAnswerCount: Number(event.target.value) })}>
              <option value={2}>{t('Choose TWO answers')}</option><option value={3}>{t('Choose THREE answers')}</option>
            </select>
          </label>}
        </div>
        {matchingTypes.has(group.format) && <label className="teacher-quiz-wide-field">{t('Shared headings / features / labels (one per line)')}
          <textarea rows={5} value={group.sharedOptions} onChange={(event) => updateGroup(groupIndex, { sharedOptions: event.target.value })} />
          <small>{t('Use a unique label at the start of every line, such as “i. A new approach”.')}</small>
        </label>}
        {(group.format === 'DIAGRAM_LABEL_COMPLETION' || group.format === 'MAP_PLAN_LABELING') && <label className="teacher-quiz-wide-field">
          {t(group.format === 'MAP_PLAN_LABELING' ? 'Map / plan image URL' : 'Diagram reference URL')} ({t('optional')})
          <input type="url" value={group.visualReference} onChange={(event) => updateGroup(groupIndex, { visualReference: event.target.value })} placeholder="https://..." />
        </label>}
        {group.questions.map((question, questionIndex) => (
          <fieldset className="teacher-question-card" key={questionIndex}>
            <legend>{t('Question')} {questionIndex + 1}
              <button type="button" className="teacher-question-remove" disabled={group.questions.length <= 1} onClick={() => removeQuestion(groupIndex, questionIndex)}>{t('Remove')}</button>
            </legend>
            <label>{t(matchingTypes.has(group.format) ? 'Prompt / paragraph label' : 'Question or statement')}
              <textarea required rows={2} value={question.content} onChange={(event) => updateQuestion(groupIndex, questionIndex, 'content', event.target.value)} placeholder={t(group.format === 'MATCHING_HEADINGS' ? 'Paragraph A' : 'Write a clear question or statement...')} />
            </label>
            {group.format.startsWith('MULTIPLE_CHOICE') && <div className="teacher-option-fields">
              {question.options.map((option, optionIndex) => <label key={optionIndex}>Option {String.fromCharCode(65 + optionIndex)}
                <input required value={option} onChange={(event) => updateQuestion(groupIndex, questionIndex, 'options', question.options.map((entry, index) => index === optionIndex ? event.target.value : entry))} />
              </label>)}
            </div>}
            <div className="teacher-quiz-fields teacher-answer-fields">
              <label>{t('Correct answer')}
                {fixedOptions ? <select required value={question.correctAnswer} onChange={(event) => updateQuestion(groupIndex, questionIndex, 'correctAnswer', event.target.value)}>
                  <option value="">{t('Choose answer')}</option>{fixedOptions.map((answer) => <option key={answer} value={answer}>{t(answer)}</option>)}
                </select> : group.format.startsWith('MULTIPLE_CHOICE') ? <select required multiple={group.format === 'MULTIPLE_CHOICE_MULTI'} size={group.format === 'MULTIPLE_CHOICE_MULTI' ? 4 : undefined} value={group.format === 'MULTIPLE_CHOICE_MULTI' ? (question.correctAnswer ? question.correctAnswer.split(',') : []) : question.correctAnswer} onChange={(event) => updateQuestion(groupIndex, questionIndex, 'correctAnswer', Array.from(event.target.selectedOptions, (option) => option.value).join(','))}>
                  <option value="">{t('Choose answer')}</option>{['A', 'B', 'C', 'D'].map((answer) => <option key={answer} value={answer}>{answer}</option>)}
                </select> : matchingTypes.has(group.format) ? <select required value={question.correctAnswer} onChange={(event) => updateQuestion(groupIndex, questionIndex, 'correctAnswer', event.target.value)}>
                  <option value="">{t('Choose a match')}</option>{group.sharedOptions.split('\n').map((option) => option.trim()).filter(Boolean).map((option) => <option key={option} value={option.split(/[.\s]/)[0]}>{option}</option>)}
                </select> : <input required value={question.correctAnswer} onChange={(event) => updateQuestion(groupIndex, questionIndex, 'correctAnswer', event.target.value)} placeholder={t('Exact answer from the passage')} />}
              </label>
              <label>{t('Question difficulty')}
                <select value={question.difficulty || level} onChange={(event) => updateQuestion(groupIndex, questionIndex, 'difficulty', event.target.value)}>
                  <option value="Beginner">{t('Beginner')}</option><option value="Intermediate">{t('Intermediate')}</option><option value="Advanced">{t('Advanced')}</option>
                </select>
              </label>
              <label>{t('Explanation')}<input value={question.explanation} onChange={(event) => updateQuestion(groupIndex, questionIndex, 'explanation', event.target.value)} placeholder={t('Why this answer is correct')} /></label>
            </div>
          </fieldset>
        ))}
        <button type="button" className="teacher-question-add" disabled={!canAddQuestion} onClick={() => addQuestion(groupIndex)}>+ {t('Add question')}</button>
      </div>
    );
  }

  return (
    <div className="dashboard-container teacher-quiz-page">
      <section className="glass-card teacher-quiz-intro">
        <span className="eyebrow">{t('Teacher workspace')}</span>
        <h1>{t('Upload an IELTS quiz')}</h1>
        <p>{t('Choose a skill, select the IELTS question types, then enter the full quiz content before saving.')}</p>
      </section>

      <form className="glass-card teacher-quiz-form" onSubmit={handleSubmit}>
        <div className="teacher-quiz-section">
          <h2>{t('Choose IELTS skill')}</h2>
          <div className="teacher-skill-grid">
            {skills.map((item) => (
              <button
                type="button"
                key={item.code}
                className={`teacher-skill-option ${skill === item.code ? 'selected' : ''} ${item.unavailable ? 'unavailable' : ''}`}
                disabled={item.unavailable}
                aria-pressed={skill === item.code}
                onClick={() => changeSkill(item.code)}
              >
                <strong>{t(item.code)}</strong>
                <span>{t(item.description)}</span>
                {item.unavailable && <small>{t('Coming soon')}</small>}
              </button>
            ))}
          </div>
        </div>

        {skill && <>
          {skill === 'Reading' && typeCount > 0 && groups[0]?.format && <div className="teacher-quiz-section">
            <h2>{t('Import questions')}</h2>
            <label className="teacher-quiz-file-upload">{t('Question file (JSON or CSV)')}
              <input type="file" accept=".json,.csv,application/json,text/csv" onChange={(event) => { importQuestionFile(event.target.files?.[0]); event.target.value = ''; }} />
              <small>{importing ? t('Reading file…') : t('JSON: { title, topic, level, passage, format, questions: [...] }. CSV headers: question, answer, difficulty, optionA–optionD, explanation.')}</small>
            </label>
            <a className="teacher-quiz-sample-link" href="/mock-ielts-quiz.json" download>{t('Download mock quiz JSON')}</a>
            <p className="teacher-quiz-guidance">{t('Imported questions fill the first selected type and remain editable.')}</p>
          </div>}

          <div className="teacher-quiz-section">
            <h2>{t('Quiz details')}</h2>
            <div className="teacher-quiz-fields">
              <label>{t('Quiz title')}<input required maxLength={255} value={title} onChange={(event) => setTitle(event.target.value)} placeholder={t('e.g. Urban farming and future cities')} /></label>
              <label>{t('Topic')}<input value={topic} onChange={(event) => setTopic(event.target.value)} placeholder={t('Environment, science, history...')} /></label>
              <label>{t('IELTS level')}<select value={level} onChange={(event) => setLevel(event.target.value)}><option value="Beginner">{t('Beginner')}</option><option value="Intermediate">{t('Intermediate')}</option><option value="Advanced">{t('Advanced')}</option></select></label>
            </div>
            {skill === 'Reading' && <label className="teacher-quiz-wide-field">{t('Reading passage')}
              <textarea required rows={8} value={passage} onChange={(event) => setPassage(event.target.value)} placeholder={t('Paste the reading passage here (at least 40 words)...')} />
              <small>{passage.trim().split(/\s+/).filter(Boolean).length} {t('words')} · {t('Use original or properly licensed material.')}</small>
            </label>}
          </div>

          <div className="teacher-quiz-section">
            <h2>{t('Lesson pricing')}</h2>
            <div className="teacher-quiz-fields">
              <label>{t('Access type')}
                <select value={isFree ? 'Free' : 'Paid'} onChange={(event) => setIsFree(event.target.value === 'Free')}>
                  <option value="Free">{t('Free')}</option><option value="Paid">{t('Paid — individual purchase')}</option>
                </select>
              </label>
              {!isFree && <label>{t('Price (VND)')}
                <input type="number" min="1" max="9999999999.99" step="1" required value={price} onChange={(event) => setPrice(event.target.value)} />
                <small>{t('Payment and paid access activation will be added later.')}</small>
              </label>}
            </div>
          </div>

          <div className="teacher-quiz-section">
            <h2>{t('Question format')}</h2>
            <label className="teacher-format-count">{t('Number of question types')}
              <select value={typeCount || ''} onChange={(event) => changeTypeCount(event.target.value)} required>
                <option value="">{t('Choose the number of question types')}</option>
                {Array.from({ length: availableFormats.length }, (_, index) => index + 1).map((count) => <option key={count} value={count}>{count}</option>)}
              </select>
              <small>{t('Choose how many different IELTS formats to include. The full fields appear after selecting each format.')}</small>
            </label>
          </div>

          {groups.length > 0 && <div className="teacher-quiz-section">
            <h2>{t('Choose question types')}</h2>
            {groups.map((group, groupIndex) => {
              const selectedCodes = groups.map((item) => item.format).filter(Boolean);
              return <div className="teacher-type-slot" key={`slot-${groupIndex}`}>
                <label>{t('Question type')} {groupIndex + 1}
                  <select value={group.format} onChange={(event) => updateGroup(groupIndex, { format: event.target.value })} required>
                    <option value="">{t('Choose a question type')}</option>
                    {availableFormats.filter((format) => format.code === group.format || !selectedCodes.includes(format.code)).map((format) => <option key={format.code} value={format.code}>{t(format.label)}</option>)}
                  </select>
                </label>
                {group.format && (skill === 'Writing' ? (
                  <div className="teacher-writing-task-fields">
                    <label>{t('Writing task prompt')}<textarea required rows={5} value={group.prompt} onChange={(event) => updateGroup(groupIndex, { prompt: event.target.value })} placeholder={t('Enter the task instructions shown to the learner...')} /></label>
                    <label>{t('Model answer')} ({t('optional')})<textarea rows={6} value={group.modelAnswer} onChange={(event) => updateGroup(groupIndex, { modelAnswer: event.target.value })} placeholder={t('Add a sample response for teacher reference...')} /></label>
                  </div>
                ) : renderReadingGroup(group, groupIndex))}
              </div>;
            })}
          </div>}

          {skill === 'Reading' && questionCount > 0 && <p className="teacher-quiz-guidance">{questionCount} {t('questions')} · {t('Maximum 40 questions per quiz.')}</p>}
          {notice && <p className={`teacher-quiz-notice ${notice.type}`} role="status">{t(notice.text)}</p>}
          <div className="teacher-quiz-submit"><span>{t('Saved as a teacher-created Draft quiz in the configured SQL database.')}</span><button type="submit" disabled={saving || importing}>{saving ? t('Saving…') : t('Save quiz')}</button></div>
        </>}
        {!skill && notice && <p className={`teacher-quiz-notice ${notice.type}`} role="status">{t(notice.text)}</p>}
      </form>
    </div>
  );
}
