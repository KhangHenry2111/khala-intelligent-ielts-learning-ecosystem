/* ============================================================
   IELTS AI LEARNING PLATFORM - DATABASE SCHEMA
   Source: SQLCREATESCRIPTS.ipynb export
   Target: SQL Server
   ============================================================ */

IF DB_ID(N'Ielts') IS NULL
BEGIN
    CREATE DATABASE [Ielts]
    ON PRIMARY
    (
        NAME = N'Ielts',
        FILENAME = N'C:\Users\Admin\Ielts.mdf',
        SIZE = 8192KB,
        MAXSIZE = UNLIMITED,
        FILEGROWTH = 65536KB
    )
    LOG ON
    (
        NAME = N'Ielts_log',
        FILENAME = N'C:\Users\Admin\Ielts_log.ldf',
        SIZE = 8192KB,
        MAXSIZE = 2048GB,
        FILEGROWTH = 65536KB
    );
END
GO

USE [Ielts];
GO

SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

/* ============================================================
   1. USER / ADMIN / TEACHER
   ============================================================ */

CREATE TABLE [dbo].[User](
    [UserID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
    [FullName] NVARCHAR(255) NOT NULL,
    [Username] NVARCHAR(100) NOT NULL,
    [Password] NVARCHAR(255) NOT NULL,
    [Email] NVARCHAR(255) NOT NULL,
    [PhoneNumber] NVARCHAR(20) NULL,
    [Avatar] NVARCHAR(500) NULL,
    [DateOfBirth] DATE NULL,
    [Gender] NVARCHAR(20) NULL,
    [Role] NVARCHAR(20) NOT NULL DEFAULT 'USER',
    [Status] NVARCHAR(20) NOT NULL DEFAULT 'Active',
    [EmailVerified] BIT NOT NULL DEFAULT 0,
    [PhoneVerified] BIT NOT NULL DEFAULT 0,
    [CurrentBand] FLOAT NULL,
    [TargetBand] FLOAT NULL,
    [SpeakingBand] FLOAT NULL,
    [ListeningBand] FLOAT NULL,
    [ReadingBand] FLOAT NULL,
    [WritingBand] FLOAT NULL,
    [LearningLevel] NVARCHAR(20) NULL,
    [Rank] NVARCHAR(20) NULL,
    [PackageID] UNIQUEIDENTIFIER NULL,
    [AIQuizUsedThisMonth] INT NOT NULL DEFAULT 0,
    [LevelTestUsedThisMonth] INT NOT NULL DEFAULT 0,
    [UploadedStorageMB] FLOAT NOT NULL DEFAULT 0,
    [TotalTests] INT NOT NULL DEFAULT 0,
    [TotalPracticeQuestions] INT NOT NULL DEFAULT 0,
    [LearningStreak] INT NOT NULL DEFAULT 0,
    [CreatedAt] DATETIME NOT NULL DEFAULT GETDATE(),
    [UpdatedAt] DATETIME NOT NULL DEFAULT GETDATE(),
    [LastLogin] DATETIME NULL,
    CONSTRAINT [PK_User] PRIMARY KEY CLUSTERED ([UserID] ASC),
    CONSTRAINT [UQ_User_Username] UNIQUE NONCLUSTERED ([Username] ASC),
    CONSTRAINT [UQ_User_Email] UNIQUE NONCLUSTERED ([Email] ASC),
    CONSTRAINT [CK_User_Role] CHECK ([Role] = 'USER'),
    CONSTRAINT [CK_User_Status] CHECK ([Status] IN ('Active', 'Inactive', 'Banned')),
    CONSTRAINT [CK_User_LearningLevel] CHECK ([LearningLevel] IS NULL OR [LearningLevel] IN ('Beginner', 'Intermediate', 'Advanced')),
    CONSTRAINT [CK_User_Rank] CHECK ([Rank] IS NULL OR [Rank] IN ('Bronze', 'Silver', 'Gold'))
) ON [PRIMARY];
GO

CREATE TABLE [dbo].[Teacher](
    [TeacherID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
    [FullName] NVARCHAR(255) NOT NULL,
    [Username] NVARCHAR(100) NOT NULL,
    [Password] NVARCHAR(255) NOT NULL,
    [Email] NVARCHAR(255) NOT NULL,
    [PhoneNumber] NVARCHAR(20) NULL,
    [Avatar] NVARCHAR(500) NULL,
    [Biography] NVARCHAR(MAX) NULL,
    [Qualification] NVARCHAR(255) NULL,
    [QualificationFileURL] NVARCHAR(500) NULL,
    [IELTSBand] FLOAT NULL,
    [ExperienceYears] INT NULL,
    [Specialization] NVARCHAR(255) NULL,
    [Role] NVARCHAR(20) NOT NULL DEFAULT 'TEACHER',
    [Status] NVARCHAR(20) NOT NULL DEFAULT 'Active',
    [VerificationStatus] NVARCHAR(20) NOT NULL DEFAULT 'Pending',
    [NumberOfLessons] INT NOT NULL DEFAULT 0,
    [TotalMaterials] INT NOT NULL DEFAULT 0,
    [TotalQuestions] INT NOT NULL DEFAULT 0,
    [Contribution] INT NOT NULL DEFAULT 0,
    [AverageRating] FLOAT NULL,
    [TotalStudents] INT NOT NULL DEFAULT 0,
    [CreatedAt] DATETIME NOT NULL DEFAULT GETDATE(),
    [UpdatedAt] DATETIME NOT NULL DEFAULT GETDATE(),
    [LastLogin] DATETIME NULL,
    [CreatedByAdminID] UNIQUEIDENTIFIER NULL,
    CONSTRAINT [PK_Teacher] PRIMARY KEY CLUSTERED ([TeacherID] ASC),
    CONSTRAINT [UQ_Teacher_Username] UNIQUE NONCLUSTERED ([Username] ASC),
    CONSTRAINT [UQ_Teacher_Email] UNIQUE NONCLUSTERED ([Email] ASC),
    CONSTRAINT [CK_Teacher_Role] CHECK ([Role] = 'TEACHER'),
    CONSTRAINT [CK_Teacher_Status] CHECK ([Status] IN ('Active', 'Inactive', 'Suspended')),
    CONSTRAINT [CK_Teacher_VerificationStatus] CHECK ([VerificationStatus] IN ('Pending', 'Verified', 'Rejected'))
) ON [PRIMARY] TEXTIMAGE_ON [PRIMARY];
GO

CREATE TABLE [dbo].[Admin](
    [AdminID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
    [FullName] NVARCHAR(255) NOT NULL,
    [Username] NVARCHAR(100) NOT NULL,
    [Password] NVARCHAR(255) NOT NULL,
    [Email] NVARCHAR(255) NOT NULL,
    [PhoneNumber] NVARCHAR(20) NULL,
    [Avatar] NVARCHAR(500) NULL,
    [Role] NVARCHAR(20) NOT NULL DEFAULT 'ADMIN',
    [AdminLevel] NVARCHAR(20) NOT NULL DEFAULT 'ADMIN',
    [Status] NVARCHAR(20) NOT NULL DEFAULT 'Active',
    [IsITCenterIssued] BIT NOT NULL DEFAULT 1,
    [CreatedByAdminID] UNIQUEIDENTIFIER NULL,
    [CreatedAt] DATETIME NOT NULL DEFAULT GETDATE(),
    [UpdatedAt] DATETIME NOT NULL DEFAULT GETDATE(),
    [LastLogin] DATETIME NULL,
    CONSTRAINT [PK_Admin] PRIMARY KEY CLUSTERED ([AdminID] ASC),
    CONSTRAINT [UQ_Admin_Username] UNIQUE NONCLUSTERED ([Username] ASC),
    CONSTRAINT [UQ_Admin_Email] UNIQUE NONCLUSTERED ([Email] ASC),
    CONSTRAINT [CK_Admin_Role] CHECK ([Role] = 'ADMIN'),
    CONSTRAINT [CK_Admin_AdminLevel] CHECK ([AdminLevel] IN ('SUPER_ADMIN', 'ADMIN')),
    CONSTRAINT [CK_Admin_Status] CHECK ([Status] IN ('Active', 'Locked'))
) ON [PRIMARY];
GO

CREATE TABLE [dbo].[AdminActionLog](
    [LogID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
    [AdminID] UNIQUEIDENTIFIER NOT NULL,
    [ActionType] NVARCHAR(100) NOT NULL,
    [TargetType] NVARCHAR(50) NULL,
    [TargetID] UNIQUEIDENTIFIER NULL,
    [OldValue] NVARCHAR(MAX) NULL,
    [NewValue] NVARCHAR(MAX) NULL,
    [IPAddress] NVARCHAR(50) NULL,
    [Timestamp] DATETIME NOT NULL DEFAULT GETDATE(),
    CONSTRAINT [PK_AdminActionLog] PRIMARY KEY CLUSTERED ([LogID] ASC)
) ON [PRIMARY] TEXTIMAGE_ON [PRIMARY];
GO

/* ============================================================
   2. PACKAGE / SUBSCRIPTION / TRANSACTION
   ============================================================ */

CREATE TABLE [dbo].[Package](
    [PackageID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
    [PackageName] NVARCHAR(50) NOT NULL,
    [Price] DECIMAL(12,2) NOT NULL DEFAULT 0,
    [DurationMonths] INT NOT NULL DEFAULT 1,
    [AIQuizLimit] INT NOT NULL,
    [LevelTestLimit] INT NOT NULL,
    [UploadLimitMB] FLOAT NOT NULL,
    [KnowledgeBaseAccess] NVARCHAR(20) NOT NULL DEFAULT 'Basic',
    [HasSpeakingAI] BIT NOT NULL DEFAULT 0,
    [HasSpeakingTeacher] BIT NOT NULL DEFAULT 0,
    [HasWritingAI] BIT NOT NULL DEFAULT 0,
    [HasWritingTeacher] BIT NOT NULL DEFAULT 0,
    [WritingAILimited] BIT NOT NULL DEFAULT 0,
    [IsActive] BIT NOT NULL DEFAULT 1,
    [CreatedAt] DATETIME NOT NULL DEFAULT GETDATE(),
    [UpdatedAt] DATETIME NOT NULL DEFAULT GETDATE(),
    CONSTRAINT [PK_Package] PRIMARY KEY CLUSTERED ([PackageID] ASC),
    CONSTRAINT [CK_Package_KnowledgeBaseAccess] CHECK ([KnowledgeBaseAccess] IN ('Basic', 'Full'))
) ON [PRIMARY];
GO

CREATE TABLE [dbo].[Subscription](
    [SubscriptionID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
    [UserID] UNIQUEIDENTIFIER NOT NULL,
    [PackageID] UNIQUEIDENTIFIER NOT NULL,
    [StartDate] DATETIME NOT NULL DEFAULT GETDATE(),
    [EndDate] DATETIME NOT NULL,
    [Status] NVARCHAR(20) NOT NULL DEFAULT 'Active',
    [PaymentMethod] NVARCHAR(50) NULL,
    [Amount] DECIMAL(12,2) NOT NULL,
    [CreatedAt] DATETIME NOT NULL DEFAULT GETDATE(),
    CONSTRAINT [PK_Subscription] PRIMARY KEY CLUSTERED ([SubscriptionID] ASC),
    CONSTRAINT [CK_Subscription_Status] CHECK ([Status] IN ('Active', 'Expired', 'Cancelled'))
) ON [PRIMARY];
GO

CREATE TABLE [dbo].[Transaction](
    [TransactionID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
    [UserID] UNIQUEIDENTIFIER NOT NULL,
    [SubscriptionID] UNIQUEIDENTIFIER NULL,
    [Amount] DECIMAL(12,2) NOT NULL,
    [Method] NVARCHAR(50) NULL,
    [Status] NVARCHAR(20) NOT NULL DEFAULT 'Pending',
    [CreatedAt] DATETIME NOT NULL DEFAULT GETDATE(),
    CONSTRAINT [PK_Transaction] PRIMARY KEY CLUSTERED ([TransactionID] ASC),
    CONSTRAINT [CK_Transaction_Status] CHECK ([Status] IN ('Success', 'Failed', 'Pending'))
) ON [PRIMARY];
GO

/* ============================================================
   3. DOCUMENTS / KNOWLEDGE
   ============================================================ */

CREATE TABLE [dbo].[UserDocument](
    [DocumentID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
    [UserID] UNIQUEIDENTIFIER NOT NULL,
    [FileName] NVARCHAR(255) NOT NULL,
    [FileURL] NVARCHAR(500) NOT NULL,
    [FileType] NVARCHAR(20) NULL,
    [FileSizeMB] FLOAT NOT NULL,
    [ExtractedText] NVARCHAR(MAX) NULL,
    [ProcessingStatus] NVARCHAR(20) NOT NULL DEFAULT 'Pending',
    [CreatedAt] DATETIME NOT NULL DEFAULT GETDATE(),
    CONSTRAINT [PK_UserDocument] PRIMARY KEY CLUSTERED ([DocumentID] ASC),
    CONSTRAINT [CK_UserDocument_ProcessingStatus] CHECK ([ProcessingStatus] IN ('Pending', 'Processed', 'Failed'))
) ON [PRIMARY] TEXTIMAGE_ON [PRIMARY];
GO

CREATE TABLE [dbo].[KnowledgeDocument](
    [DocID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
    [Title] NVARCHAR(255) NOT NULL,
    [Category] NVARCHAR(100) NULL,
    [Content] NVARCHAR(MAX) NULL,
    [FileURL] NVARCHAR(500) NULL,
    [EmbeddingVector] VARBINARY(MAX) NULL,
    [Source] NVARCHAR(20) NOT NULL DEFAULT 'System',
    [UploadedBy] UNIQUEIDENTIFIER NULL,
    [CreatedAt] DATETIME NOT NULL DEFAULT GETDATE(),
    CONSTRAINT [PK_KnowledgeDocument] PRIMARY KEY CLUSTERED ([DocID] ASC),
    CONSTRAINT [CK_KnowledgeDocument_Source] CHECK ([Source] IN ('System', 'Teacher'))
) ON [PRIMARY] TEXTIMAGE_ON [PRIMARY];
GO

/* ============================================================
   4. QUIZ / QUESTION / PASSAGE / TEST
   ============================================================ */

CREATE TABLE [dbo].[QuestionTypeCatalog](
    [QuestionTypeID] INT IDENTITY(1,1) NOT NULL,
    [Code] NVARCHAR(50) NOT NULL,
    [NameVI] NVARCHAR(100) NOT NULL,
    [NameEN] NVARCHAR(100) NOT NULL,
    [Category] NVARCHAR(30) NOT NULL,
    [AnswerFormat] NVARCHAR(30) NOT NULL,
    [RequiresVisual] BIT NOT NULL DEFAULT 0,
    [HasWordLimit] BIT NOT NULL DEFAULT 0,
    [DefaultWordLimit] NVARCHAR(50) NULL,
    [FixedOptionValues] NVARCHAR(200) NULL,
    [Description] NVARCHAR(500) NULL,
    [ExampleEN] NVARCHAR(500) NULL,
    [DisplayOrder] INT NOT NULL DEFAULT 0,
    [IsActive] BIT NOT NULL DEFAULT 1,
    [CreatedAt] DATETIME NOT NULL DEFAULT GETDATE(),
    CONSTRAINT [PK_QuestionTypeCatalog] PRIMARY KEY CLUSTERED ([QuestionTypeID] ASC),
    CONSTRAINT [UQ_QuestionTypeCatalog_Code] UNIQUE NONCLUSTERED ([Code] ASC)
) ON [PRIMARY];
GO

CREATE TABLE [dbo].[ReadingPassage](
    [PassageID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
    [Title] NVARCHAR(255) NOT NULL,
    [Content] NVARCHAR(MAX) NOT NULL,
    [WordCount] INT NULL,
    [Topic] NVARCHAR(100) NULL,
    [Level] NVARCHAR(20) NULL,
    [Source] NVARCHAR(20) NOT NULL DEFAULT 'System',
    [CreatedBy] UNIQUEIDENTIFIER NULL,
    [CreatedByType] NVARCHAR(20) NULL,
    [SourceDocumentID] UNIQUEIDENTIFIER NULL,
    [SourceKnowledgeDocID] UNIQUEIDENTIFIER NULL,
    [ModerationStatus] NVARCHAR(20) NOT NULL DEFAULT 'Pending',
    [ModeratedBy] UNIQUEIDENTIFIER NULL,
    [ModeratedByType] NVARCHAR(20) NULL,
    [ModeratedAt] DATETIME NULL,
    [RejectionReason] NVARCHAR(500) NULL,
    [CreatedAt] DATETIME NOT NULL DEFAULT GETDATE(),
    [UpdatedAt] DATETIME NOT NULL DEFAULT GETDATE(),
    CONSTRAINT [PK_ReadingPassage] PRIMARY KEY CLUSTERED ([PassageID] ASC),
    CONSTRAINT [CK_ReadingPassage_Source] CHECK ([Source] IN ('System', 'AI', 'Teacher', 'User')),
    CONSTRAINT [CK_ReadingPassage_ModerationStatus] CHECK ([ModerationStatus] IN ('Pending', 'Approved', 'Rejected'))
) ON [PRIMARY] TEXTIMAGE_ON [PRIMARY];
GO

CREATE TABLE [dbo].[Quiz](
    [QuizID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
    [Title] NVARCHAR(255) NOT NULL,
    [Skill] NVARCHAR(30) NOT NULL,
    [Level] NVARCHAR(20) NULL,
    [Source] NVARCHAR(20) NOT NULL DEFAULT 'System',
    [CreatorID] UNIQUEIDENTIFIER NULL,
    [Status] NVARCHAR(20) NOT NULL DEFAULT 'Draft',
    [ApprovedBy] UNIQUEIDENTIFIER NULL,
    [ApprovedAt] DATETIME NULL,
    [CreatedAt] DATETIME NOT NULL DEFAULT GETDATE(),
    [PassageID] UNIQUEIDENTIFIER NULL,
    CONSTRAINT [PK_Quiz] PRIMARY KEY CLUSTERED ([QuizID] ASC),
    CONSTRAINT [CK_Quiz_Skill] CHECK ([Skill] IN ('Reading', 'Writing', 'Reading+Writing')),
    CONSTRAINT [CK_Quiz_Level] CHECK ([Level] IS NULL OR [Level] IN ('Beginner', 'Intermediate', 'Advanced')),
    CONSTRAINT [CK_Quiz_Source] CHECK ([Source] IN ('System', 'AI', 'Teacher')),
    CONSTRAINT [CK_Quiz_Status] CHECK ([Status] IN ('Draft', 'PendingReview', 'Approved', 'Rejected'))
) ON [PRIMARY];
GO

CREATE TABLE [dbo].[QuestionGroup](
    [GroupID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
    [QuizID] UNIQUEIDENTIFIER NOT NULL,
    [QuestionTypeID] INT NOT NULL,
    [Instruction] NVARCHAR(500) NULL,
    [SharedOptions] NVARCHAR(MAX) NULL,
    [WordLimit] NVARCHAR(50) NULL,
    [OrderIndex] INT NOT NULL DEFAULT 0,
    [CreatedAt] DATETIME NOT NULL DEFAULT GETDATE(),
    CONSTRAINT [PK_QuestionGroup] PRIMARY KEY CLUSTERED ([GroupID] ASC)
) ON [PRIMARY] TEXTIMAGE_ON [PRIMARY];
GO

CREATE TABLE [dbo].[Question](
    [QuestionID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
    [QuizID] UNIQUEIDENTIFIER NOT NULL,
    [QuestionType] NVARCHAR(30) NOT NULL DEFAULT 'MultipleChoice',
    [Content] NVARCHAR(MAX) NOT NULL,
    [Options] NVARCHAR(MAX) NULL,
    [CorrectAnswer] NVARCHAR(500) NULL,
    [Explanation] NVARCHAR(MAX) NULL,
    [OrderIndex] INT NOT NULL DEFAULT 0,
    [GroupID] UNIQUEIDENTIFIER NULL,
    [QuestionTypeID] INT NULL,
    CONSTRAINT [PK_Question] PRIMARY KEY CLUSTERED ([QuestionID] ASC)
) ON [PRIMARY] TEXTIMAGE_ON [PRIMARY];
GO

CREATE TABLE [dbo].[QuizAttempt](
    [AttemptID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
    [UserID] UNIQUEIDENTIFIER NOT NULL,
    [QuizID] UNIQUEIDENTIFIER NOT NULL,
    [Score] FLOAT NULL,
    [TimeTaken] INT NULL,
    [StartedAt] DATETIME NOT NULL DEFAULT GETDATE(),
    [SubmittedAt] DATETIME NULL,
    [Status] NVARCHAR(20) NOT NULL DEFAULT 'InProgress',
    CONSTRAINT [PK_QuizAttempt] PRIMARY KEY CLUSTERED ([AttemptID] ASC),
    CONSTRAINT [CK_QuizAttempt_Status] CHECK ([Status] IN ('InProgress', 'Completed'))
) ON [PRIMARY];
GO

CREATE TABLE [dbo].[AnswerRecord](
    [AnswerID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
    [AttemptID] UNIQUEIDENTIFIER NOT NULL,
    [QuestionID] UNIQUEIDENTIFIER NOT NULL,
    [UserAnswer] NVARCHAR(500) NULL,
    [IsCorrect] BIT NULL,
    [TimeSpent] INT NULL,
    CONSTRAINT [PK_AnswerRecord] PRIMARY KEY CLUSTERED ([AnswerID] ASC)
) ON [PRIMARY];
GO

CREATE TABLE [dbo].[QuizAIAnalysis](
    [AnalysisID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
    [AttemptID] UNIQUEIDENTIFIER NOT NULL,
    [WeaknessArea] NVARCHAR(MAX) NULL,
    [RecommendedActions] NVARCHAR(MAX) NULL,
    [CreatedAt] DATETIME NOT NULL DEFAULT GETDATE(),
    CONSTRAINT [PK_QuizAIAnalysis] PRIMARY KEY CLUSTERED ([AnalysisID] ASC)
) ON [PRIMARY] TEXTIMAGE_ON [PRIMARY];
GO

CREATE TABLE [dbo].[LevelTest](
    [LevelTestID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
    [UserID] UNIQUEIDENTIFIER NOT NULL,
    [TestType] NVARCHAR(20) NOT NULL DEFAULT 'Initial',
    [ReadingBand] FLOAT NULL,
    [ListeningBand] FLOAT NULL,
    [WritingBand] FLOAT NULL,
    [SpeakingBand] FLOAT NULL,
    [OverallBand] FLOAT NULL,
    [RecommendedLevel] NVARCHAR(20) NULL,
    [Status] NVARCHAR(20) NOT NULL DEFAULT 'Completed',
    [TestDate] DATETIME NOT NULL DEFAULT GETDATE(),
    CONSTRAINT [PK_LevelTest] PRIMARY KEY CLUSTERED ([LevelTestID] ASC),
    CONSTRAINT [CK_LevelTest_TestType] CHECK ([TestType] IN ('Initial', 'Retake')),
    CONSTRAINT [CK_LevelTest_RecommendedLevel] CHECK ([RecommendedLevel] IS NULL OR [RecommendedLevel] IN ('Beginner', 'Intermediate', 'Advanced')),
    CONSTRAINT [CK_LevelTest_Status] CHECK ([Status] IN ('InProgress', 'Completed'))
) ON [PRIMARY];
GO

CREATE TABLE [dbo].[AIQuizRequest](
    [RequestID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
    [UserID] UNIQUEIDENTIFIER NOT NULL,
    [Source] NVARCHAR(20) NOT NULL,
    [DocumentID] UNIQUEIDENTIFIER NULL,
    [Skill] NVARCHAR(30) NOT NULL,
    [Difficulty] NVARCHAR(20) NOT NULL,
    [NumberOfQuestions] INT NOT NULL DEFAULT 20,
    [QuizID] UNIQUEIDENTIFIER NULL,
    [Status] NVARCHAR(20) NOT NULL DEFAULT 'Processing',
    [CreatedAt] DATETIME NOT NULL DEFAULT GETDATE(),
    CONSTRAINT [PK_AIQuizRequest] PRIMARY KEY CLUSTERED ([RequestID] ASC),
    CONSTRAINT [CK_AIQuizRequest_Source] CHECK ([Source] IN ('MyDocuments', 'KnowledgeBase')),
    CONSTRAINT [CK_AIQuizRequest_Skill] CHECK ([Skill] IN ('Reading', 'Writing', 'Reading+Writing')),
    CONSTRAINT [CK_AIQuizRequest_Difficulty] CHECK ([Difficulty] IN ('Beginner', 'Intermediate', 'Advanced')),
    CONSTRAINT [CK_AIQuizRequest_Status] CHECK ([Status] IN ('Processing', 'Completed', 'Failed'))
) ON [PRIMARY];
GO

/* ============================================================
   5. SUBMISSION / WRITING / SPEAKING
   ============================================================ */

CREATE TABLE [dbo].[SpeakingSubmission](
    [SubmissionID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
    [UserID] UNIQUEIDENTIFIER NOT NULL,
    [TeacherID] UNIQUEIDENTIFIER NULL,
    [AudioFileURL] NVARCHAR(500) NOT NULL,
    [Question] NVARCHAR(MAX) NULL,
    [AIScore] FLOAT NULL,
    [AIFeedback] NVARCHAR(MAX) NULL,
    [FluencyScore] FLOAT NULL,
    [VocabularyScore] FLOAT NULL,
    [GrammarScore] FLOAT NULL,
    [PronunciationScore] FLOAT NULL,
    [TeacherScore] FLOAT NULL,
    [TeacherFeedback] NVARCHAR(MAX) NULL,
    [Status] NVARCHAR(20) NOT NULL DEFAULT 'Pending',
    [CreatedAt] DATETIME NOT NULL DEFAULT GETDATE(),
    [GradedAt] DATETIME NULL,
    CONSTRAINT [PK_SpeakingSubmission] PRIMARY KEY CLUSTERED ([SubmissionID] ASC),
    CONSTRAINT [CK_SpeakingSubmission_Status] CHECK ([Status] IN ('Pending', 'AIGraded', 'TeacherGraded'))
) ON [PRIMARY] TEXTIMAGE_ON [PRIMARY];
GO

CREATE TABLE [dbo].[WritingSubmission](
    [SubmissionID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
    [UserID] UNIQUEIDENTIFIER NOT NULL,
    [TeacherID] UNIQUEIDENTIFIER NULL,
    [Content] NVARCHAR(MAX) NOT NULL,
    [Question] NVARCHAR(MAX) NULL,
    [AIScore] FLOAT NULL,
    [AIFeedback] NVARCHAR(MAX) NULL,
    [TeacherScore] FLOAT NULL,
    [TeacherFeedback] NVARCHAR(MAX) NULL,
    [Status] NVARCHAR(20) NOT NULL DEFAULT 'Pending',
    [CreatedAt] DATETIME NOT NULL DEFAULT GETDATE(),
    [GradedAt] DATETIME NULL,
    CONSTRAINT [PK_WritingSubmission] PRIMARY KEY CLUSTERED ([SubmissionID] ASC),
    CONSTRAINT [CK_WritingSubmission_Status] CHECK ([Status] IN ('Pending', 'AIGraded', 'TeacherGraded'))
) ON [PRIMARY] TEXTIMAGE_ON [PRIMARY];
GO

/* ============================================================
   6. CLASSROOMS
   ============================================================ */

CREATE TABLE [dbo].[Classroom](
    [ClassID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
    [TeacherID] UNIQUEIDENTIFIER NOT NULL,
    [ClassName] NVARCHAR(255) NOT NULL,
    [Description] NVARCHAR(MAX) NULL,
    [MaxStudents] INT NOT NULL DEFAULT 30,
    [GoogleMeetLink] NVARCHAR(500) NULL,
    [Status] NVARCHAR(20) NOT NULL DEFAULT 'Active',
    [CreatedAt] DATETIME NOT NULL DEFAULT GETDATE(),
    CONSTRAINT [PK_Classroom] PRIMARY KEY CLUSTERED ([ClassID] ASC),
    CONSTRAINT [CK_Classroom_Status] CHECK ([Status] IN ('Active', 'Closed'))
) ON [PRIMARY] TEXTIMAGE_ON [PRIMARY];
GO

CREATE TABLE [dbo].[ClassEnrollment](
    [EnrollmentID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
    [ClassID] UNIQUEIDENTIFIER NOT NULL,
    [UserID] UNIQUEIDENTIFIER NOT NULL,
    [EnrolledAt] DATETIME NOT NULL DEFAULT GETDATE(),
    [Status] NVARCHAR(20) NOT NULL DEFAULT 'Active',
    CONSTRAINT [PK_ClassEnrollment] PRIMARY KEY CLUSTERED ([EnrollmentID] ASC),
    CONSTRAINT [UQ_ClassEnrollment] UNIQUE NONCLUSTERED ([ClassID] ASC, [UserID] ASC),
    CONSTRAINT [CK_ClassEnrollment_Status] CHECK ([Status] IN ('Active', 'Dropped'))
) ON [PRIMARY];
GO

CREATE TABLE [dbo].[ClassSession](
    [SessionID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
    [ClassID] UNIQUEIDENTIFIER NOT NULL,
    [SessionDate] DATE NOT NULL,
    [StartTime] TIME NOT NULL,
    [EndTime] TIME NOT NULL,
    [DayOfWeek] NVARCHAR(20) NULL,
    [MeetingLink] NVARCHAR(500) NULL,
    [RecordingURL] NVARCHAR(500) NULL,
    CONSTRAINT [PK_ClassSession] PRIMARY KEY CLUSTERED ([SessionID] ASC)
) ON [PRIMARY];
GO

/* ============================================================
   7. MATERIALS
   ============================================================ */

CREATE TABLE [dbo].[Material](
    [MaterialID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
    [TeacherID] UNIQUEIDENTIFIER NOT NULL,
    [Title] NVARCHAR(255) NOT NULL,
    [Description] NVARCHAR(MAX) NULL,
    [Skill] NVARCHAR(30) NULL,
    [Level] NVARCHAR(20) NULL,
    [FileURL] NVARCHAR(500) NULL,
    [FileType] NVARCHAR(20) NULL,
    [IsFree] BIT NOT NULL DEFAULT 1,
    [Price] DECIMAL(12,2) NOT NULL DEFAULT 0,
    [DownloadCount] INT NOT NULL DEFAULT 0,
    [Status] NVARCHAR(20) NOT NULL DEFAULT 'Pending',
    [CreatedAt] DATETIME NOT NULL DEFAULT GETDATE(),
    CONSTRAINT [PK_Material] PRIMARY KEY CLUSTERED ([MaterialID] ASC),
    CONSTRAINT [CK_Material_Skill] CHECK ([Skill] IS NULL OR [Skill] IN ('Reading', 'Listening', 'Writing', 'Speaking')),
    CONSTRAINT [CK_Material_Level] CHECK ([Level] IS NULL OR [Level] IN ('Beginner', 'Intermediate', 'Advanced')),
    CONSTRAINT [CK_Material_Status] CHECK ([Status] IN ('Pending', 'Approved', 'Rejected'))
) ON [PRIMARY] TEXTIMAGE_ON [PRIMARY];
GO

CREATE TABLE [dbo].[MaterialAccess](
    [AccessID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
    [MaterialID] UNIQUEIDENTIFIER NOT NULL,
    [UserID] UNIQUEIDENTIFIER NOT NULL,
    [PurchasedAt] DATETIME NOT NULL DEFAULT GETDATE(),
    [ExpiresAt] DATETIME NULL,
    CONSTRAINT [PK_MaterialAccess] PRIMARY KEY CLUSTERED ([AccessID] ASC)
) ON [PRIMARY];
GO

/* ============================================================
   8. FEEDBACK / REPORTS
   ============================================================ */

CREATE TABLE [dbo].[Feedback](
    [FeedbackID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
    [UserID] UNIQUEIDENTIFIER NOT NULL,
    [Type] NVARCHAR(30) NOT NULL,
    [Content] NVARCHAR(MAX) NOT NULL,
    [Status] NVARCHAR(20) NOT NULL DEFAULT 'New',
    [AssignedAdminID] UNIQUEIDENTIFIER NULL,
    [ResponseContent] NVARCHAR(MAX) NULL,
    [CreatedAt] DATETIME NOT NULL DEFAULT GETDATE(),
    [ResolvedAt] DATETIME NULL,
    CONSTRAINT [PK_Feedback] PRIMARY KEY CLUSTERED ([FeedbackID] ASC),
    CONSTRAINT [CK_Feedback_Type] CHECK ([Type] IN ('BugReport', 'Suggestion', 'Complaint', 'Website', 'Lesson', 'Account')),
    CONSTRAINT [CK_Feedback_Status] CHECK ([Status] IN ('New', 'InProgress', 'Reviewing', 'Resolved'))
) ON [PRIMARY] TEXTIMAGE_ON [PRIMARY];
GO

CREATE TABLE [dbo].[ContentReport](
    [ReportID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
    [ReporterID] UNIQUEIDENTIFIER NOT NULL,
    [ReporterType] NVARCHAR(20) NOT NULL,
    [TargetType] NVARCHAR(30) NOT NULL,
    [TargetID] UNIQUEIDENTIFIER NOT NULL,
    [Reason] NVARCHAR(MAX) NULL,
    [Status] NVARCHAR(20) NOT NULL DEFAULT 'Pending',
    [HandledBy] UNIQUEIDENTIFIER NULL,
    [CreatedAt] DATETIME NOT NULL DEFAULT GETDATE(),
    CONSTRAINT [PK_ContentReport] PRIMARY KEY CLUSTERED ([ReportID] ASC),
    CONSTRAINT [CK_ContentReport_ReporterType] CHECK ([ReporterType] IN ('User', 'Teacher')),
    CONSTRAINT [CK_ContentReport_TargetType] CHECK ([TargetType] IN ('Material', 'Quiz', 'Lesson', 'Comment')),
    CONSTRAINT [CK_ContentReport_Status] CHECK ([Status] IN ('Pending', 'Reviewing', 'Resolved', 'Dismissed'))
) ON [PRIMARY] TEXTIMAGE_ON [PRIMARY];
GO

/* ============================================================
   9. TRACKING / NOTIFICATION
   ============================================================ */

CREATE TABLE [dbo].[LearningActivity](
    [ActivityID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
    [UserID] UNIQUEIDENTIFIER NOT NULL,
    [ActivityDate] DATE NOT NULL,
    [ActivityType] NVARCHAR(50) NULL,
    [Duration] INT NULL,
    CONSTRAINT [PK_LearningActivity] PRIMARY KEY CLUSTERED ([ActivityID] ASC)
) ON [PRIMARY];
GO

CREATE TABLE [dbo].[Notification](
    [NotificationID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
    [UserID] UNIQUEIDENTIFIER NOT NULL,
    [Title] NVARCHAR(255) NOT NULL,
    [Content] NVARCHAR(MAX) NULL,
    [Type] NVARCHAR(50) NULL,
    [IsRead] BIT NOT NULL DEFAULT 0,
    [CreatedAt] DATETIME NOT NULL DEFAULT GETDATE(),
    CONSTRAINT [PK_Notification] PRIMARY KEY CLUSTERED ([NotificationID] ASC)
) ON [PRIMARY] TEXTIMAGE_ON [PRIMARY];
GO

/* ============================================================
   FOREIGN KEYS
   ============================================================ */

ALTER TABLE [dbo].[Admin] ADD CONSTRAINT [FK_Admin_CreatedByAdmin] FOREIGN KEY ([CreatedByAdminID]) REFERENCES [dbo].[Admin]([AdminID]);
GO

ALTER TABLE [dbo].[Teacher] ADD CONSTRAINT [FK_Teacher_CreatedByAdmin] FOREIGN KEY ([CreatedByAdminID]) REFERENCES [dbo].[Admin]([AdminID]);
GO

ALTER TABLE [dbo].[AdminActionLog] ADD CONSTRAINT [FK_AdminActionLog_Admin] FOREIGN KEY ([AdminID]) REFERENCES [dbo].[Admin]([AdminID]);
GO

ALTER TABLE [dbo].[User] ADD CONSTRAINT [FK_User_Package] FOREIGN KEY ([PackageID]) REFERENCES [dbo].[Package]([PackageID]);
GO

ALTER TABLE [dbo].[Subscription] ADD CONSTRAINT [FK_Subscription_User] FOREIGN KEY ([UserID]) REFERENCES [dbo].[User]([UserID]);
ALTER TABLE [dbo].[Subscription] ADD CONSTRAINT [FK_Subscription_Package] FOREIGN KEY ([PackageID]) REFERENCES [dbo].[Package]([PackageID]);
GO

ALTER TABLE [dbo].[Transaction] ADD CONSTRAINT [FK_Transaction_User] FOREIGN KEY ([UserID]) REFERENCES [dbo].[User]([UserID]);
ALTER TABLE [dbo].[Transaction] ADD CONSTRAINT [FK_Transaction_Subscription] FOREIGN KEY ([SubscriptionID]) REFERENCES [dbo].[Subscription]([SubscriptionID]);
GO

ALTER TABLE [dbo].[UserDocument] ADD CONSTRAINT [FK_UserDocument_User] FOREIGN KEY ([UserID]) REFERENCES [dbo].[User]([UserID]);
GO

ALTER TABLE [dbo].[KnowledgeDocument] ADD CONSTRAINT [FK_KnowledgeDocument_Teacher] FOREIGN KEY ([UploadedBy]) REFERENCES [dbo].[Teacher]([TeacherID]);
GO

ALTER TABLE [dbo].[Quiz] ADD CONSTRAINT [FK_Quiz_Passage] FOREIGN KEY ([PassageID]) REFERENCES [dbo].[ReadingPassage]([PassageID]);
GO

ALTER TABLE [dbo].[QuestionGroup] ADD CONSTRAINT [FK_QuestionGroup_Quiz] FOREIGN KEY ([QuizID]) REFERENCES [dbo].[Quiz]([QuizID]);
ALTER TABLE [dbo].[QuestionGroup] ADD CONSTRAINT [FK_QuestionGroup_QuestionTypeCatalog] FOREIGN KEY ([QuestionTypeID]) REFERENCES [dbo].[QuestionTypeCatalog]([QuestionTypeID]);
GO

ALTER TABLE [dbo].[Question] ADD CONSTRAINT [FK_Question_Quiz] FOREIGN KEY ([QuizID]) REFERENCES [dbo].[Quiz]([QuizID]);
ALTER TABLE [dbo].[Question] ADD CONSTRAINT [FK_Question_Group] FOREIGN KEY ([GroupID]) REFERENCES [dbo].[QuestionGroup]([GroupID]);
ALTER TABLE [dbo].[Question] ADD CONSTRAINT [FK_Question_QuestionTypeCatalog] FOREIGN KEY ([QuestionTypeID]) REFERENCES [dbo].[QuestionTypeCatalog]([QuestionTypeID]);
GO

ALTER TABLE [dbo].[AIQuizRequest] ADD CONSTRAINT [FK_AIQuizRequest_User] FOREIGN KEY ([UserID]) REFERENCES [dbo].[User]([UserID]);
ALTER TABLE [dbo].[AIQuizRequest] ADD CONSTRAINT [FK_AIQuizRequest_UserDocument] FOREIGN KEY ([DocumentID]) REFERENCES [dbo].[UserDocument]([DocumentID]);
ALTER TABLE [dbo].[AIQuizRequest] ADD CONSTRAINT [FK_AIQuizRequest_Quiz] FOREIGN KEY ([QuizID]) REFERENCES [dbo].[Quiz]([QuizID]);
GO

ALTER TABLE [dbo].[QuizAttempt] ADD CONSTRAINT [FK_QuizAttempt_User] FOREIGN KEY ([UserID]) REFERENCES [dbo].[User]([UserID]);
ALTER TABLE [dbo].[QuizAttempt] ADD CONSTRAINT [FK_QuizAttempt_Quiz] FOREIGN KEY ([QuizID]) REFERENCES [dbo].[Quiz]([QuizID]);
GO

ALTER TABLE [dbo].[AnswerRecord] ADD CONSTRAINT [FK_AnswerRecord_QuizAttempt] FOREIGN KEY ([AttemptID]) REFERENCES [dbo].[QuizAttempt]([AttemptID]);
ALTER TABLE [dbo].[AnswerRecord] ADD CONSTRAINT [FK_AnswerRecord_Question] FOREIGN KEY ([QuestionID]) REFERENCES [dbo].[Question]([QuestionID]);
GO

ALTER TABLE [dbo].[QuizAIAnalysis] ADD CONSTRAINT [FK_QuizAIAnalysis_QuizAttempt] FOREIGN KEY ([AttemptID]) REFERENCES [dbo].[QuizAttempt]([AttemptID]);
GO

ALTER TABLE [dbo].[LevelTest] ADD CONSTRAINT [FK_LevelTest_User] FOREIGN KEY ([UserID]) REFERENCES [dbo].[User]([UserID]);
GO

ALTER TABLE [dbo].[SpeakingSubmission] ADD CONSTRAINT [FK_SpeakingSubmission_User] FOREIGN KEY ([UserID]) REFERENCES [dbo].[User]([UserID]);
ALTER TABLE [dbo].[SpeakingSubmission] ADD CONSTRAINT [FK_SpeakingSubmission_Teacher] FOREIGN KEY ([TeacherID]) REFERENCES [dbo].[Teacher]([TeacherID]);
GO

ALTER TABLE [dbo].[WritingSubmission] ADD CONSTRAINT [FK_WritingSubmission_User] FOREIGN KEY ([UserID]) REFERENCES [dbo].[User]([UserID]);
ALTER TABLE [dbo].[WritingSubmission] ADD CONSTRAINT [FK_WritingSubmission_Teacher] FOREIGN KEY ([TeacherID]) REFERENCES [dbo].[Teacher]([TeacherID]);
GO

ALTER TABLE [dbo].[Classroom] ADD CONSTRAINT [FK_Classroom_Teacher] FOREIGN KEY ([TeacherID]) REFERENCES [dbo].[Teacher]([TeacherID]);
GO

ALTER TABLE [dbo].[ClassEnrollment] ADD CONSTRAINT [FK_ClassEnrollment_Classroom] FOREIGN KEY ([ClassID]) REFERENCES [dbo].[Classroom]([ClassID]);
ALTER TABLE [dbo].[ClassEnrollment] ADD CONSTRAINT [FK_ClassEnrollment_User] FOREIGN KEY ([UserID]) REFERENCES [dbo].[User]([UserID]);
GO

ALTER TABLE [dbo].[ClassSession] ADD CONSTRAINT [FK_ClassSession_Classroom] FOREIGN KEY ([ClassID]) REFERENCES [dbo].[Classroom]([ClassID]);
GO

ALTER TABLE [dbo].[Material] ADD CONSTRAINT [FK_Material_Teacher] FOREIGN KEY ([TeacherID]) REFERENCES [dbo].[Teacher]([TeacherID]);
GO

ALTER TABLE [dbo].[MaterialAccess] ADD CONSTRAINT [FK_MaterialAccess_Material] FOREIGN KEY ([MaterialID]) REFERENCES [dbo].[Material]([MaterialID]);
ALTER TABLE [dbo].[MaterialAccess] ADD CONSTRAINT [FK_MaterialAccess_User] FOREIGN KEY ([UserID]) REFERENCES [dbo].[User]([UserID]);
GO

ALTER TABLE [dbo].[Feedback] ADD CONSTRAINT [FK_Feedback_User] FOREIGN KEY ([UserID]) REFERENCES [dbo].[User]([UserID]);
ALTER TABLE [dbo].[Feedback] ADD CONSTRAINT [FK_Feedback_Admin] FOREIGN KEY ([AssignedAdminID]) REFERENCES [dbo].[Admin]([AdminID]);
GO

ALTER TABLE [dbo].[ContentReport] ADD CONSTRAINT [FK_ContentReport_Admin] FOREIGN KEY ([HandledBy]) REFERENCES [dbo].[Admin]([AdminID]);
GO

ALTER TABLE [dbo].[LearningActivity] ADD CONSTRAINT [FK_LearningActivity_User] FOREIGN KEY ([UserID]) REFERENCES [dbo].[User]([UserID]);
GO

ALTER TABLE [dbo].[Notification] ADD CONSTRAINT [FK_Notification_User] FOREIGN KEY ([UserID]) REFERENCES [dbo].[User]([UserID]);
GO

/* ============================================================
   INDEXES
   ============================================================ */

CREATE NONCLUSTERED INDEX [IX_AdminActionLog_AdminID_Timestamp] ON [dbo].[AdminActionLog]([AdminID] ASC, [Timestamp] ASC);
CREATE NONCLUSTERED INDEX [IX_AnswerRecord_AttemptID] ON [dbo].[AnswerRecord]([AttemptID] ASC);
CREATE NONCLUSTERED INDEX [IX_ClassEnrollment_UserID] ON [dbo].[ClassEnrollment]([UserID] ASC);
CREATE NONCLUSTERED INDEX [IX_Feedback_Status] ON [dbo].[Feedback]([Status] ASC);
CREATE NONCLUSTERED INDEX [IX_Material_TeacherID] ON [dbo].[Material]([TeacherID] ASC);
CREATE NONCLUSTERED INDEX [IX_Question_GroupID] ON [dbo].[Question]([GroupID] ASC);
CREATE NONCLUSTERED INDEX [IX_QuizAttempt_UserID] ON [dbo].[QuizAttempt]([UserID] ASC);
CREATE NONCLUSTERED INDEX [IX_ReadingPassage_CreatedBy] ON [dbo].[ReadingPassage]([CreatedBy] ASC);
CREATE NONCLUSTERED INDEX [IX_ReadingPassage_ModerationStatus] ON [dbo].[ReadingPassage]([ModerationStatus] ASC);
CREATE NONCLUSTERED INDEX [IX_Subscription_UserID_Status] ON [dbo].[Subscription]([UserID] ASC, [Status] ASC);
CREATE NONCLUSTERED INDEX [IX_UserDocument_UserID] ON [dbo].[UserDocument]([UserID] ASC);
CREATE UNIQUE NONCLUSTERED INDEX [UX_User_PhoneNumber]
    ON [dbo].[User]([PhoneNumber] ASC)
    WHERE [PhoneNumber] IS NOT NULL;
GO

/* ============================================================
   SEED DATA
   ============================================================ */

INSERT INTO [dbo].[Package]([PackageName], [Price], [DurationMonths], [AIQuizLimit], [LevelTestLimit], [UploadLimitMB],
    [KnowledgeBaseAccess], [HasSpeakingAI], [HasSpeakingTeacher], [HasWritingAI], [HasWritingTeacher], [WritingAILimited], [IsActive], [CreatedAt], [UpdatedAt])
VALUES
    (N'Đồng', 0, 1, 8, 1, 5, N'Basic', 0, 0, 0, 0, 1, 1, GETDATE(), GETDATE()),
    (N'Bạc', 199000, 1, 60, 4, 20, N'Full', 1, 0, 1, 0, 0, 1, GETDATE(), GETDATE()),
    (N'Vàng', 399000, 1, 250, 12, 50, N'Full', 1, 1, 1, 1, 0, 1, GETDATE(), GETDATE());
GO

INSERT INTO [dbo].[QuestionTypeCatalog]
    ([Code], [NameVI], [NameEN], [Category], [AnswerFormat], [RequiresVisual], [HasWordLimit], [DefaultWordLimit],
     [FixedOptionValues], [Description], [ExampleEN], [DisplayOrder], [IsActive], [CreatedAt])
VALUES
    (N'line_graph', N'Biểu đồ đường', N'Line graph', N'Academic Writing', N'Task 1', 1, 1, N'150', NULL,
     N'Biểu đồ đường mô tả sự thay đổi theo thời gian của một hoặc nhiều biến số.',
     N'The line graph shows the number of visitors to three cities from 2000 to 2020.', 1, 1, GETDATE()),
    (N'bar_chart', N'Biểu đồ cột', N'Bar chart', N'Academic Writing', N'Task 1', 1, 1, N'150', NULL,
     N'Biểu đồ cột so sánh giá trị giữa các nhóm hoặc đối tượng khác nhau.',
     N'The bar chart compares the average monthly income of students in different countries.', 2, 1, GETDATE()),
    (N'pie_chart', N'Biểu đồ tròn', N'Pie chart', N'Academic Writing', N'Task 1', 1, 1, N'150', NULL,
     N'Biểu đồ tròn minh họa tỷ lệ phần trăm của các thành phần trong tổng thể.',
     N'The pie chart illustrates the distribution of household expenditure.', 3, 1, GETDATE()),
    (N'table', N'Bảng số liệu', N'Table', N'Academic Writing', N'Task 1', 0, 1, N'150', NULL,
     N'Bảng dữ liệu yêu cầu tóm tắt và so sánh thông tin theo các tiêu chí.',
     N'The table shows changes in attendance and test scores over five years.', 4, 1, GETDATE()),
    (N'process_manufacturing', N'Quy trình sản xuất', N'Process manufacturing', N'Academic Writing', N'Task 1', 0, 1, N'150', NULL,
     N'Mô tả một quy trình công nghiệp theo từng bước.',
     N'The diagram shows how plastic bottles are recycled and turned into new products.', 5, 1, GETDATE()),
    (N'process_natural', N'Quy trình tự nhiên', N'Process natural', N'Academic Writing', N'Task 1', 0, 1, N'150', NULL,
     N'Mô tả một chu trình tự nhiên như vòng đời hoặc quá trình khí hậu.',
     N'The process illustrates how rainwater becomes groundwater and eventually flows into rivers.', 6, 1, GETDATE()),
    (N'map_change', N'Bản đồ thay đổi', N'Map change', N'Academic Writing', N'Task 1', 1, 1, N'150', NULL,
     N'Bản đồ thể hiện sự thay đổi về vị trí, cấu trúc hoặc chức năng qua thời gian.',
     N'The maps compare the city center in 1990 and 2020.', 7, 1, GETDATE()),
    (N'map_plan', N'Bản đồ quy hoạch', N'Map plan', N'Academic Writing', N'Task 1', 1, 1, N'150', NULL,
     N'Bản đồ đề xuất hoặc mô tả kế hoạch xây dựng và bố trí không gian.',
     N'The plan shows a proposed redesign of a university campus.', 8, 1, GETDATE()),
    (N'mixed_chart', N'Hỗn hợp biểu đồ', N'Mixed chart', N'Academic Writing', N'Task 1', 1, 1, N'150', NULL,
     N'Hình ảnh kết hợp nhiều dạng biểu đồ như cột, đường hoặc tròn cần phân tích đồng thời.',
     N'The charts compare sales, profit, and market share over a decade.', 9, 1, GETDATE()),

    (N'formal_letter', N'Thư formal', N'Formal letter', N'General Training', N'Task 1', 0, 1, N'150', NULL,
     N'Thư chính thức dành cho các tình huống công việc, học tập hoặc dịch vụ.',
     N'Dear Sir or Madam, I am writing to request information about the language course.', 10, 1, GETDATE()),
    (N'semi_formal_letter', N'Thư bán chính thức', N'Semi-formal letter', N'General Training', N'Task 1', 0, 1, N'150', NULL,
     N'Thư bán chính thức dùng cho môi trường không quá thân mật nhưng không quá trang trọng.',
     N'Dear Ms. Nguyen, I would like to express my concern about the recent service issue.', 11, 1, GETDATE()),
    (N'informal_letter', N'Thư không chính thức', N'Informal letter', N'General Training', N'Task 1', 0, 1, N'150', NULL,
     N'Thư thân mật gửi cho bạn bè, người thân hoặc đồng nghiệp quen biết.',
     N'Hi Emma, I hope you are doing well and enjoying your new job.', 12, 1, GETDATE()),

    (N'opinion_agree_disagree', N'Đồng ý/không đồng ý', N'Opinion: agree or disagree', N'Academic Writing', N'Task 2', 0, 1, N'250', NULL,
     N'Viết bài luận trình bày quan điểm về việc đồng tình hay phản đối một nhận định.',
     N'Some people believe that schools should ban smartphones, while others think they are useful tools.', 13, 1, GETDATE()),
    (N'opinion_to_what_extent', N'Mức độ đồng ý', N'Opinion: to what extent', N'Academic Writing', N'Task 2', 0, 1, N'250', NULL,
     N'Viết bài luận nêu mức độ đồng tình với một quan điểm và giải thích lý do.',
     N'To what extent do you agree that online learning is more effective than traditional classroom teaching?', 14, 1, GETDATE()),
    (N'discussion_both_views', N'Bàn luận cả hai mặt', N'Discussion: both views', N'Academic Writing', N'Task 2', 0, 1, N'250', NULL,
     N'Bài luận trình bày cả quan điểm ủng hộ và phản đối rồi đưa kết luận cá nhân.',
     N'Some people think that students should work part-time while studying, while others disagree.', 15, 1, GETDATE()),
    (N'advantages_disadvantages', N'Ưu điểm và nhược điểm', N'Advantages and disadvantages', N'Academic Writing', N'Task 2', 0, 1, N'250', NULL,
     N'Phân tích lợi ích và bất lợi của một xu hướng, hiện tượng hoặc chính sách.',
     N'What are the advantages and disadvantages of living in a large city?', 16, 1, GETDATE()),
    (N'advantages_outweigh', N'Ưu điểm vượt trội hơn', N'Advantages outweigh', N'Academic Writing', N'Task 2', 0, 1, N'250', NULL,
     N'Bài luận cho rằng lợi ích của một hành động hoặc phương án vượt trội hơn tác hại.',
     N'Do the advantages of using artificial intelligence outweigh the disadvantages?', 17, 1, GETDATE()),
    (N'problem_solution', N'Vấn đề và giải pháp', N'Problem solution', N'Academic Writing', N'Task 2', 0, 1, N'250', NULL,
     N'Vấn đề được nêu rõ và cần đưa ra giải pháp thực tế, phù hợp.',
     N'What are the causes of traffic congestion in big cities and how can it be reduced?', 18, 1, GETDATE()),
    (N'cause_effect', N'Nguyên nhân và hệ quả', N'Cause and effect', N'Academic Writing', N'Task 2', 0, 1, N'250', NULL,
     N'Phân tích nguyên nhân dẫn đến hiện tượng và hậu quả của nó.',
     N'Why do many people choose to work remotely, and what are the effects on society?', 19, 1, GETDATE()),
    (N'cause_solution', N'Nguyên nhân và giải pháp', N'Cause and solution', N'Academic Writing', N'Task 2', 0, 1, N'250', NULL,
     N'Đầu tiên phân tích nguyên nhân, sau đó đề xuất cách giải quyết hiệu quả.',
     N'Why is noise pollution becoming a serious problem in cities, and what can be done about it?', 20, 1, GETDATE()),
    (N'two_part_question', N'Câu hỏi hai phần', N'Two-part question', N'Academic Writing', N'Task 2', 0, 1, N'250', NULL,
     N'Bài luận trả lời hai phần câu hỏi riêng biệt nhưng liên kết với nhau.',
     N'Why do some people prefer to live in the countryside? What are the benefits of this lifestyle?', 21, 1, GETDATE()),
    (N'positive_negative_development', N'Phát triển tích cực và tiêu cực', N'Positive and negative development', N'Academic Writing', N'Task 2', 0, 1, N'250', NULL,
     N'Phân tích xu hướng phát triển, đồng thời nêu mặt tích cực và tiêu cực.',
     N'Some people believe that urban development has more positive effects than negative ones.', 22, 1, GETDATE());
GO

PRINT N'Database IELTS đã được tạo thành công với đầy đủ bảng.';
GO
