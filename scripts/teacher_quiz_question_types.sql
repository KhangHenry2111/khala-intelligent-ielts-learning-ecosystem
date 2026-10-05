/* Run once against the existing IELTS database to add teacher Reading formats. */
IF COL_LENGTH(N'dbo.Question', N'Difficulty') IS NULL
    ALTER TABLE dbo.Question ADD Difficulty nvarchar(20) NULL;
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_Question_Difficulty')
    ALTER TABLE dbo.Question WITH CHECK ADD CONSTRAINT CK_Question_Difficulty
    CHECK (Difficulty IS NULL OR Difficulty IN (N'Beginner', N'Intermediate', N'Advanced'));
IF COL_LENGTH(N'dbo.Material', N'QuizID') IS NULL
    ALTER TABLE dbo.Material ADD QuizID uniqueidentifier NULL;
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_Material_Quiz')
    ALTER TABLE dbo.Material WITH CHECK ADD CONSTRAINT FK_Material_Quiz FOREIGN KEY (QuizID) REFERENCES dbo.Quiz(QuizID);

IF NOT EXISTS (SELECT 1 FROM dbo.QuestionTypeCatalog WHERE Code = N'MULTIPLE_CHOICE_SINGLE')
    INSERT dbo.QuestionTypeCatalog (Code, NameVI, NameEN, Category, AnswerFormat, RequiresVisual, HasWordLimit, DefaultWordLimit, FixedOptionValues, Description, ExampleEN, DisplayOrder, IsActive, CreatedAt)
    VALUES (N'MULTIPLE_CHOICE_SINGLE', N'Multiple choice', N'Multiple choice (single answer)', N'MultipleChoice', N'SingleChoice', 0, 0, NULL, N'A,B,C,D', N'Choose one correct answer.', N'Which statement best describes the author view?', 1, 1, GETDATE());
IF NOT EXISTS (SELECT 1 FROM dbo.QuestionTypeCatalog WHERE Code = N'TRUE_FALSE_NOT_GIVEN')
    INSERT dbo.QuestionTypeCatalog (Code, NameVI, NameEN, Category, AnswerFormat, RequiresVisual, HasWordLimit, DefaultWordLimit, FixedOptionValues, Description, ExampleEN, DisplayOrder, IsActive, CreatedAt)
    VALUES (N'TRUE_FALSE_NOT_GIVEN', N'True False Not Given', N'True / False / Not Given', N'TrueFalseType', N'FixedOptions', 0, 0, NULL, N'True,False,Not Given', N'Compare each statement with the passage.', N'The project began in 2018.', 2, 1, GETDATE());
IF NOT EXISTS (SELECT 1 FROM dbo.QuestionTypeCatalog WHERE Code = N'SENTENCE_COMPLETION')
    INSERT dbo.QuestionTypeCatalog (Code, NameVI, NameEN, Category, AnswerFormat, RequiresVisual, HasWordLimit, DefaultWordLimit, FixedOptionValues, Description, ExampleEN, DisplayOrder, IsActive, CreatedAt)
    VALUES (N'SENTENCE_COMPLETION', N'Sentence completion', N'Sentence completion', N'Completion', N'FillBlank', 0, 1, N'NO MORE THAN TWO WORDS', NULL, N'Complete with words from the passage.', N'The research was funded by ______.', 3, 1, GETDATE());
IF NOT EXISTS (SELECT 1 FROM dbo.QuestionTypeCatalog WHERE Code = N'MATCHING_HEADINGS')
    INSERT dbo.QuestionTypeCatalog (Code, NameVI, NameEN, Category, AnswerFormat, RequiresVisual, HasWordLimit, DefaultWordLimit, FixedOptionValues, Description, ExampleEN, DisplayOrder, IsActive, CreatedAt)
    VALUES (N'MATCHING_HEADINGS', N'Matching headings', N'Matching headings', N'Matching', N'PairMatching', 0, 0, NULL, NULL, N'Match each paragraph with the most suitable heading.', N'Paragraph A - ii', 4, 1, GETDATE());

MERGE dbo.QuestionTypeCatalog AS target
USING (VALUES
    (N'MULTIPLE_CHOICE_MULTI', N'Multiple answer', N'Multiple choice (multiple answers)', N'MultipleChoice', N'MultiChoice', 0, 0, NULL, N'A,B,C,D', N'Choose all correct answers.', N'Which TWO statements are correct?', 5, 1),
    (N'YES_NO_NOT_GIVEN', N'Yes / No / Not Given', N'Yes / No / Not Given', N'TrueFalseType', N'FixedOptions', 0, 0, NULL, N'Yes,No,Not Given', N'Identify the writer opinion.', N'The writer supports the proposal.', 6, 1),
    (N'MATCHING_INFORMATION', N'Matching information', N'Matching information', N'Matching', N'PairMatching', 0, 0, NULL, NULL, N'Match information to paragraph labels.', N'Which paragraph contains the example?', 7, 1),
    (N'MATCHING_FEATURES', N'Matching features', N'Matching features', N'Matching', N'PairMatching', 0, 0, NULL, NULL, N'Match statements to people, places or theories.', N'Who proposed the model?', 8, 1),
    (N'MATCHING_SENTENCE_ENDINGS', N'Matching sentence endings', N'Matching sentence endings', N'Matching', N'PairMatching', 0, 0, NULL, NULL, N'Match each sentence beginning to its ending.', N'The experiment succeeded because...', 9, 1),
    (N'SUMMARY_COMPLETION', N'Summary completion', N'Summary completion', N'Completion', N'FillBlank', 0, 1, N'NO MORE THAN TWO WORDS', NULL, N'Complete a summary with words from the passage or options.', N'The process requires ______.', 10, 1),
    (N'NOTE_COMPLETION', N'Note completion', N'Note completion', N'Completion', N'FillBlank', 0, 1, N'NO MORE THAN TWO WORDS', NULL, N'Complete notes with information from the passage or recording.', N'Location: ______', 11, 1),
    (N'TABLE_COMPLETION', N'Table completion', N'Table completion', N'Completion', N'FillBlank', 0, 1, N'NO MORE THAN TWO WORDS', NULL, N'Complete missing cells in a table.', N'Year: ______', 12, 1),
    (N'FLOW_CHART_COMPLETION', N'Flow chart completion', N'Flow chart completion', N'Completion', N'FillBlank', 0, 1, N'NO MORE THAN TWO WORDS', NULL, N'Complete steps in a process flow chart.', N'Step 2: ______', 13, 1),
    (N'DIAGRAM_LABEL_COMPLETION', N'Diagram labelling', N'Diagram labelling', N'Completion', N'FillBlank', 1, 1, N'NO MORE THAN TWO WORDS', NULL, N'Label parts of a diagram using the passage or recording.', N'Label 1: ______', 14, 1),
    (N'SHORT_ANSWER', N'Short-answer questions', N'Short-answer questions', N'ShortAnswer', N'FreeText', 0, 1, N'NO MORE THAN THREE WORDS', NULL, N'Answer briefly using information from the passage or recording.', N'What year did it begin?', 15, 1),
    (N'FORM_COMPLETION', N'Form completion', N'Form completion', N'Completion', N'FillBlank', 0, 1, N'NO MORE THAN TWO WORDS', NULL, N'Complete missing details in a form.', N'Name: ______', 16, 1),
    (N'MAP_PLAN_LABELING', N'Map / plan labelling', N'Map / plan labelling', N'Matching', N'PairMatching', 1, 0, NULL, NULL, N'Label locations on a map or plan using options.', N'Location A - iii', 17, 1)
) AS source (Code, NameVI, NameEN, Category, AnswerFormat, RequiresVisual, HasWordLimit, DefaultWordLimit, FixedOptionValues, Description, ExampleEN, DisplayOrder, IsActive)
ON target.Code = source.Code
WHEN NOT MATCHED THEN INSERT (Code, NameVI, NameEN, Category, AnswerFormat, RequiresVisual, HasWordLimit, DefaultWordLimit, FixedOptionValues, Description, ExampleEN, DisplayOrder, IsActive, CreatedAt)
VALUES (source.Code, source.NameVI, source.NameEN, source.Category, source.AnswerFormat, source.RequiresVisual, source.HasWordLimit, source.DefaultWordLimit, source.FixedOptionValues, source.Description, source.ExampleEN, source.DisplayOrder, source.IsActive, GETDATE());
GO
