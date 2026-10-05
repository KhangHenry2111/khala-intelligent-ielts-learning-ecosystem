import { useMemo, useState } from 'react';
import { useAuth } from '../../../shared/auth/AuthContext';
import { quizApi } from '../../../shared/api';

const formats = [
  { code: 'MULTIPLE_CHOICE_SINGLE', name: 'Multiple choice', hint: 'Four options, one correct answer.' },
  { code: 'TRUE_FALSE_NOT_GIVEN', name: 'True / False / Not Given', hint: 'Use only information stated or implied by the passage.' },
  { code: 'SENTENCE_COMPLETION', name: 'Sentence completion', hint: 'Set an IELTS word limit and use exact wording from the passage.' },
  { code: 'MATCHING_HEADINGS', name: 'Matching headings', hint: 'Provide headings, then assign the best heading to each paragraph.' },
];

const blankQuestion = () => ({ content: '', options: ['', '', '', ''], correctAnswer: '', explanation: '' });

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
      row.push(field); field = '';
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
  const { user } = useAuth();
  const [title, setTitle] = useState('');
  const [topic, setTopic] = useState('');
  const [level, setLevel] = useState('Intermediate');
  const [passage, setPassage] = useState('');
  const [format, setFormat] = useState(formats[0].code);
  const [count, setCount] = useState(5);
  const [wordLimit, setWordLimit] = useState('NO MORE THAN TWO WORDS');
  const [headings, setHeadings] = useState('i. A surprising discovery\nii. The first attempt\niii. A lasting impact\niv. An unexpected challenge');
  const [questions, setQuestions] = useState(() => Array.from({ length: 5 }, blankQuestion));
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [notice, setNotice] = useState(null);
  const selectedFormat = useMemo(() => formats.find((item) => item.code === format), [format]);

  const changeCount = (value) => {
    const next = Math.min(40, Math.max(1, Number(value) || 1));
    setCount(next);
    setQuestions((current) => Array.from({ length: next }, (_, index) => current[index] || blankQuestion()));
  };

  const updateQuestion = (index, key, value) => {
    setQuestions((current) => current.map((question, itemIndex) => itemIndex === index
      ? { ...question, [key]: value }
      : question));
  };

  async function importQuestionFile(file) {
    if (!file) return;
    setNotice(null);
    setImporting(true);
    try {
      const content = await file.text();
      let imported;
      if (file.name.toLowerCase().endsWith('.csv')) {
        imported = parseCsv(content);
      } else {
        const data = JSON.parse(content);
        if (data.title) setTitle(data.title);
        if (data.topic) setTopic(data.topic);
        if (data.level) setLevel(data.level);
        if (data.passage) setPassage(data.passage);
        if (data.format && formats.some((item) => item.code === data.format)) setFormat(data.format);
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
      setQuestions(nextQuestions);
      setCount(nextQuestions.length);
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
    if (passage.trim().split(/\s+/).filter(Boolean).length < 40) {
      setNotice({ type: 'error', text: 'Đoạn đọc cần có ít nhất 40 từ để tạo câu hỏi Reading có ngữ cảnh.' });
      return;
    }
    const missing = questions.findIndex((question) => !question.content.trim() || !question.correctAnswer.trim());
    if (missing >= 0) {
      setNotice({ type: 'error', text: `Hãy điền nội dung và đáp án cho câu ${missing + 1}.` });
      return;
    }
    if (format === 'MULTIPLE_CHOICE_SINGLE' && questions.some((question) => question.options.some((option) => !option.trim()))) {
      setNotice({ type: 'error', text: 'Mỗi câu trắc nghiệm cần đủ bốn lựa chọn.' });
      return;
    }
    if (format === 'MATCHING_HEADINGS' && !headings.trim()) {
      setNotice({ type: 'error', text: 'Hãy nhập danh sách tiêu đề để ghép.' });
      return;
    }

    const sharedHeadings = headings.split('\n').map((line) => line.trim()).filter(Boolean);
    const questionGroup = {
      questionTypeCode: format,
      instruction: format === 'SENTENCE_COMPLETION'
        ? `Complete the sentences using words from the passage. ${wordLimit}.`
        : selectedFormat.hint,
      wordLimit: format === 'SENTENCE_COMPLETION' ? wordLimit : null,
      sharedOptions: format === 'MATCHING_HEADINGS' ? JSON.stringify(sharedHeadings) : null,
      orderIndex: 1,
      questions: questions.map((question, index) => ({
        questionType: format,
        questionTypeCode: format,
        content: question.content.trim(),
        options: format === 'MULTIPLE_CHOICE_SINGLE'
          ? JSON.stringify(Object.fromEntries(question.options.map((option, optionIndex) => [String.fromCharCode(65 + optionIndex), option.trim()])))
          : format === 'TRUE_FALSE_NOT_GIVEN' ? JSON.stringify(['True', 'False', 'Not Given']) : null,
        correctAnswer: question.correctAnswer.trim(),
        explanation: question.explanation.trim() || null,
        difficulty: question.difficulty || level,
        orderIndex: index + 1,
      })),
    };

    setSaving(true);
    try {
      const result = await quizApi.saveTeacherQuiz({
        title: title.trim(),
        skill: 'Reading',
        level,
        creatorId: teacherId,
        passage: {
          title: title.trim(),
          content: passage.trim(),
          topic: topic.trim() || 'General',
          level,
        },
        questionGroups: [questionGroup],
      }, user?.accessToken);
      setNotice({ type: 'success', text: `Đã lưu quiz ${result.quizId || ''} với ${result.questionsCount} câu ở trạng thái Draft.` });
    } catch (error) {
      setNotice({ type: 'error', text: error.message || 'Không thể lưu quiz.' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="dashboard-container teacher-quiz-page">
      <section className="glass-card teacher-quiz-intro">
        <span className="eyebrow">Teacher workspace</span>
        <h1>Upload an IELTS quiz</h1>
        <p>Import a question file or enter questions here. Set an answer key and difficulty for each question, review the quiz, then save it to the database.</p>
      </section>

      <form className="glass-card teacher-quiz-form" onSubmit={handleSubmit}>
        <div className="teacher-quiz-section">
          <h2>Import questions</h2>
          <label className="teacher-quiz-file-upload">Question file (JSON or CSV)
            <input type="file" accept=".json,.csv,application/json,text/csv" onChange={(event) => { importQuestionFile(event.target.files?.[0]); event.target.value = ''; }} />
            <small>{importing ? 'Reading file…' : 'JSON: { title, topic, level, passage, format, questions: [...] }. CSV headers: question, answer, difficulty, optionA–optionD, explanation.'}</small>
          </label>
          <p className="teacher-quiz-guidance">Imported questions remain editable below. You can also enter them manually.</p>
        </div>

        <div className="teacher-quiz-section">
          <h2>Quiz details</h2>
          <div className="teacher-quiz-fields">
            <label>Quiz title<input required maxLength={255} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Urban farming and future cities" /></label>
            <label>Topic<input value={topic} onChange={(event) => setTopic(event.target.value)} placeholder="Environment, science, history..." /></label>
            <label>IELTS level<select value={level} onChange={(event) => setLevel(event.target.value)}><option>Beginner</option><option>Intermediate</option><option>Advanced</option></select></label>
          </div>
          <label className="teacher-quiz-wide-field">Reading passage<textarea required rows={8} value={passage} onChange={(event) => setPassage(event.target.value)} placeholder="Paste the reading passage here (at least 40 words)..." /><small>{passage.trim().split(/\s+/).filter(Boolean).length} words · Use original or properly licensed material.</small></label>
        </div>

        <div className="teacher-quiz-section">
          <h2>Question format</h2>
          <div className="teacher-format-grid">
            {formats.map((item) => (
              <label key={item.code} className={`teacher-format-option ${format === item.code ? 'selected' : ''}`}>
                <input type="radio" name="question-format" value={item.code} checked={format === item.code} onChange={() => setFormat(item.code)} />
                <strong>{item.name}</strong><span>{item.hint}</span>
              </label>
            ))}
          </div>
          <div className="teacher-quiz-fields teacher-quiz-settings">
            <label>Number of questions<input type="number" min="1" max="40" value={count} onChange={(event) => changeCount(event.target.value)} /></label>
            {format === 'SENTENCE_COMPLETION' && <label>IELTS word limit<select value={wordLimit} onChange={(event) => setWordLimit(event.target.value)}><option>NO MORE THAN ONE WORD</option><option>NO MORE THAN TWO WORDS</option><option>NO MORE THAN THREE WORDS</option><option>ONE WORD AND/OR A NUMBER</option></select></label>}
          </div>
          {format === 'MATCHING_HEADINGS' && <label className="teacher-quiz-wide-field">Headings (one per line)<textarea rows={5} value={headings} onChange={(event) => setHeadings(event.target.value)} /><small>Write each option with a unique label, for example “i. A new approach”.</small></label>}
        </div>

        <div className="teacher-quiz-section">
          <h2>Questions and answer key</h2>
          <p className="teacher-quiz-guidance">Keep each question answerable from the passage. Add a short explanation to support review and student learning.</p>
          {questions.map((question, index) => (
            <fieldset className="teacher-question-card" key={index}>
              <legend>Question {index + 1}</legend>
              <label>Question or statement<textarea required rows={2} value={question.content} onChange={(event) => updateQuestion(index, 'content', event.target.value)} placeholder={format === 'MATCHING_HEADINGS' ? 'Paragraph A' : 'Write a clear question or statement...'} /></label>
              {format === 'MULTIPLE_CHOICE_SINGLE' && <div className="teacher-option-fields">{question.options.map((option, optionIndex) => <label key={optionIndex}>Option {String.fromCharCode(65 + optionIndex)}<input required value={option} onChange={(event) => updateQuestion(index, 'options', question.options.map((entry, itemIndex) => itemIndex === optionIndex ? event.target.value : entry))} /></label>)}</div>}
              <div className="teacher-quiz-fields teacher-answer-fields">
                <label>Correct answer{format === 'MULTIPLE_CHOICE_SINGLE' ? <select required value={question.correctAnswer} onChange={(event) => updateQuestion(index, 'correctAnswer', event.target.value)}><option value="">Choose answer</option>{['A', 'B', 'C', 'D'].map((answer) => <option key={answer}>{answer}</option>)}</select> : format === 'TRUE_FALSE_NOT_GIVEN' ? <select required value={question.correctAnswer} onChange={(event) => updateQuestion(index, 'correctAnswer', event.target.value)}><option value="">Choose answer</option>{['True', 'False', 'Not Given'].map((answer) => <option key={answer}>{answer}</option>)}</select> : format === 'MATCHING_HEADINGS' ? <select required value={question.correctAnswer} onChange={(event) => updateQuestion(index, 'correctAnswer', event.target.value)}><option value="">Choose heading</option>{headings.split('\n').map((line) => line.trim()).filter(Boolean).map((line) => <option key={line}>{line.split(/[.\s]/)[0]}</option>)}</select> : <input required value={question.correctAnswer} onChange={(event) => updateQuestion(index, 'correctAnswer', event.target.value)} placeholder="Exact answer from the passage" />}</label>
                <label>Question difficulty<select value={question.difficulty || level} onChange={(event) => updateQuestion(index, 'difficulty', event.target.value)}><option>Beginner</option><option>Intermediate</option><option>Advanced</option></select></label>
                <label>Explanation<input value={question.explanation} onChange={(event) => updateQuestion(index, 'explanation', event.target.value)} placeholder="Why this answer is correct" /></label>
              </div>
            </fieldset>
          ))}
        </div>

        {notice && <p className={`teacher-quiz-notice ${notice.type}`} role="status">{notice.text}</p>}
        <div className="teacher-quiz-submit"><span>Saved as a teacher-created Draft quiz in the configured SQL database.</span><button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save quiz'}</button></div>
      </form>
    </div>
  );
}
