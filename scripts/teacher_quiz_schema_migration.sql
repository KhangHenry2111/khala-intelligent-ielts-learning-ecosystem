/* Apply once to the existing Ielts database to align it with QuizController. */
USE [Ielts];
GO
IF COL_LENGTH('dbo.Material', 'QuizID') IS NULL
    ALTER TABLE dbo.Material ADD QuizID uniqueidentifier NULL;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_Material_Quiz'
)
    ALTER TABLE dbo.Material WITH CHECK
        ADD CONSTRAINT FK_Material_Quiz FOREIGN KEY (QuizID) REFERENCES dbo.Quiz(QuizID);
GO

IF COL_LENGTH('dbo.Question', 'QuestionType') IS NULL
    ALTER TABLE dbo.Question ADD QuestionType nvarchar(30) NULL;
GO

IF COL_LENGTH('dbo.Question', 'Difficulty') IS NULL
    ALTER TABLE dbo.Question ADD Difficulty nvarchar(20) NULL;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes WHERE name = 'IX_Material_Teacher_Quiz' AND object_id = OBJECT_ID('dbo.Material')
)
    CREATE INDEX IX_Material_Teacher_Quiz ON dbo.Material(TeacherID, QuizID);
GO
