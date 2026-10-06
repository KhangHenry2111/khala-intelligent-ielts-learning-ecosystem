export const READING_QUESTION_TYPES = [
  {
    code: 'MULTIPLE_CHOICE_SINGLE',
    label: 'Multiple choice: one answer',
    description: 'Choose the single option that best answers the question using evidence from the passage.',
  },
  {
    code: 'MULTIPLE_CHOICE_MULTI',
    label: 'Multiple choice: multiple answers',
    description: 'Choose exactly two correct options from four choices; each answer must be supported by the passage.',
  },
  {
    code: 'TRUE_FALSE_NOT_GIVEN',
    label: 'True / False / Not Given',
    description: 'Judge whether each statement agrees with the passage, contradicts it, or is not stated in the text.',
  },
  {
    code: 'YES_NO_NOT_GIVEN',
    label: 'Yes / No / Not Given',
    description: 'Identify whether each statement agrees with the writer’s views, contradicts them, or is not addressed.',
  },
  {
    code: 'MATCHING_HEADINGS',
    label: 'Matching headings',
    description: 'Match each paragraph with the heading that captures its central idea; include plausible unused headings.',
  },
  {
    code: 'MATCHING_INFORMATION',
    label: 'Matching information to paragraphs',
    description: 'Find which paragraph contains a specific fact, example, explanation, or detail.',
  },
  {
    code: 'MATCHING_FEATURES',
    label: 'Matching features',
    description: 'Match statements or findings to the correct people, places, dates, or theories in a shared option list.',
  },
  {
    code: 'MATCHING_SENTENCE_ENDINGS',
    label: 'Matching sentence endings',
    description: 'Match each sentence beginning to the ending that completes its meaning according to the passage.',
  },
  {
    code: 'SENTENCE_COMPLETION',
    label: 'Sentence completion',
    description: 'Complete each sentence with exact words from the passage and stay within the stated word limit.',
  },
  {
    code: 'SUMMARY_COMPLETION',
    label: 'Summary completion',
    description: 'Fill gaps in a concise summary using words from the passage or a clearly defined option list.',
  },
  {
    code: 'NOTE_COMPLETION',
    label: 'Note completion',
    description: 'Complete structured notes with key names, facts, dates, or phrases stated in the passage.',
  },
  {
    code: 'TABLE_COMPLETION',
    label: 'Table completion',
    description: 'Fill missing table cells with exact passage details that fit the row and column headings.',
  },
  {
    code: 'FLOW_CHART_COMPLETION',
    label: 'Flow-chart completion',
    description: 'Complete missing stages of a process in the order described by the passage.',
  },
  {
    code: 'DIAGRAM_LABEL_COMPLETION',
    label: 'Diagram labelling',
    description: 'Label diagram parts using names or short phrases explicitly supported by the passage.',
  },
  {
    code: 'SHORT_ANSWER',
    label: 'Short-answer questions',
    description: 'Answer a focused factual question briefly using words from the passage and obey the word limit.',
  },
];

export const LISTENING_QUESTION_TYPES = [
  READING_QUESTION_TYPES[0],
  READING_QUESTION_TYPES[1],
  {
    code: 'MATCHING_FEATURES',
    label: 'Matching',
    description: 'Match each speaker, place, or item to the correct option using details heard in the recording.',
  },
  {
    code: 'MAP_PLAN_LABELING',
    label: 'Map / plan labelling',
    description: 'Identify locations on a map or plan from spoken directions and match them to labelled options.',
  },
  {
    code: 'FORM_COMPLETION',
    label: 'Form completion',
    description: 'Complete form fields such as names, contact details, dates, and requirements with information heard.',
  },
  {
    code: 'NOTE_COMPLETION',
    label: 'Note completion',
    description: 'Complete structured notes with key details stated in the recording, respecting the word limit.',
  },
  {
    code: 'TABLE_COMPLETION',
    label: 'Table completion',
    description: 'Fill missing table entries with recording details that fit the given categories.',
  },
  {
    code: 'FLOW_CHART_COMPLETION',
    label: 'Flow-chart completion',
    description: 'Complete the steps of a process in the sequence described by the speaker or speakers.',
  },
  {
    code: 'SUMMARY_COMPLETION',
    label: 'Summary completion',
    description: 'Fill summary gaps with exact words or short phrases from the recording and obey the word limit.',
  },
  {
    code: 'SENTENCE_COMPLETION',
    label: 'Sentence completion',
    description: 'Complete each sentence using information heard in the recording and stay within the word limit.',
  },
  {
    code: 'SHORT_ANSWER',
    label: 'Short-answer questions',
    description: 'Answer concise factual questions with details explicitly stated in the recording.',
  },
];

export function getQuestionTypesForSkill(skill) {
  if (skill === 'Reading') return READING_QUESTION_TYPES;
  if (skill === 'Listening') return LISTENING_QUESTION_TYPES;
  return [];
}
