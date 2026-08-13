/* ============================================================
   IELTS AI LEARNING PLATFORM - DATABASE SCHEMA
   Generated: 2026-08-10
   Target: SQL Server
   ============================================================ */

USE IELTS;
GO

/* ============================================================
   1. NHÓM TÀI KHOẢN & PHÂN QUYỀN
   ============================================================ */

CREATE TABLE [User] (
    UserID              UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    FullName            NVARCHAR(255) NOT NULL,
    Username            NVARCHAR(100) NOT NULL UNIQUE,
    Password            NVARCHAR(255) NOT NULL,
    Email               NVARCHAR(255) NOT NULL UNIQUE,
    PhoneNumber         NVARCHAR(20),
    Avatar              NVARCHAR(500),
    DateOfBirth         DATE,
    Gender              NVARCHAR(20),
    Role                NVARCHAR(20) NOT NULL DEFAULT 'USER' CHECK (Role = 'USER'),
    Status              NVARCHAR(20) NOT NULL DEFAULT 'Active' CHECK (Status IN ('Active','Inactive','Banned')),
    EmailVerified       BIT NOT NULL DEFAULT 0,
    PhoneVerified       BIT NOT NULL DEFAULT 0,

    CurrentBand         FLOAT,
    TargetBand          FLOAT,
    SpeakingBand        FLOAT NULL,
    ListeningBand       FLOAT NULL,
    ReadingBand         FLOAT NULL,
    WritingBand         FLOAT NULL,
    LearningLevel       NVARCHAR(20) CHECK (LearningLevel IN ('Beginner','Intermediate','Advanced')),
    Rank                NVARCHAR(20) CHECK (Rank IN ('Bronze','Silver','Gold')),

    PackageID           UNIQUEIDENTIFIER NULL,

    AIQuizUsedThisMonth     INT NOT NULL DEFAULT 0,
    LevelTestUsedThisMonth  INT NOT NULL DEFAULT 0,
    UploadedStorageMB       FLOAT NOT NULL DEFAULT 0,

    TotalTests          INT NOT NULL DEFAULT 0,
    TotalPracticeQuestions INT NOT NULL DEFAULT 0,
    LearningStreak      INT NOT NULL DEFAULT 0,

    CreatedAt           DATETIME NOT NULL DEFAULT GETDATE(),
    UpdatedAt           DATETIME NOT NULL DEFAULT GETDATE(),
    LastLogin           DATETIME NULL
);
GO

CREATE TABLE Teacher (
    TeacherID           UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    FullName            NVARCHAR(255) NOT NULL,
    Username            NVARCHAR(100) NOT NULL UNIQUE,
    Password            NVARCHAR(255) NOT NULL,
    Email               NVARCHAR(255) NOT NULL UNIQUE,
    PhoneNumber         NVARCHAR(20),
    Avatar              NVARCHAR(500),
    Biography           NVARCHAR(MAX),
    Qualification       NVARCHAR(255),
    QualificationFileURL NVARCHAR(500),
    IELTSBand           FLOAT,
    ExperienceYears     INT,
    Specialization       NVARCHAR(255),

    Role                NVARCHAR(20) NOT NULL DEFAULT 'TEACHER' CHECK (Role = 'TEACHER'),
    Status              NVARCHAR(20) NOT NULL DEFAULT 'Active' CHECK (Status IN ('Active','Inactive','Suspended')),
    VerificationStatus  NVARCHAR(20) NOT NULL DEFAULT 'Pending' CHECK (VerificationStatus IN ('Pending','Verified','Rejected')),

    NumberOfLessons     INT NOT NULL DEFAULT 0,
    TotalMaterials      INT NOT NULL DEFAULT 0,
    TotalQuestions      INT NOT NULL DEFAULT 0,
    Contribution         INT NOT NULL DEFAULT 0,
    AverageRating       FLOAT,
    TotalStudents       INT NOT NULL DEFAULT 0,

    CreatedAt           DATETIME NOT NULL DEFAULT GETDATE(),
    UpdatedAt           DATETIME NOT NULL DEFAULT GETDATE(),
    LastLogin           DATETIME NULL,

    CreatedByAdminID    UNIQUEIDENTIFIER NULL   -- admin nào tạo tài khoản này
);
GO

CREATE TABLE Admin (
    AdminID             UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    FullName            NVARCHAR(255) NOT NULL,
    Username            NVARCHAR(100) NOT NULL UNIQUE,
    Password            NVARCHAR(255) NOT NULL,
    Email               NVARCHAR(255) NOT NULL UNIQUE,
    PhoneNumber         NVARCHAR(20),
    Avatar              NVARCHAR(500),
    Role                NVARCHAR(20) NOT NULL DEFAULT 'ADMIN' CHECK (Role = 'ADMIN'),
    AdminLevel          NVARCHAR(20) NOT NULL DEFAULT 'ADMIN' CHECK (AdminLevel IN ('SUPER_ADMIN','ADMIN')),
    Status              NVARCHAR(20) NOT NULL DEFAULT 'Active' CHECK (Status IN ('Active','Locked')),
    IsITCenterIssued    BIT NOT NULL DEFAULT 1,
    CreatedByAdminID    UNIQUEIDENTIFIER NULL,  -- self-reference, NULL cho super admin đầu tiên

    CreatedAt           DATETIME NOT NULL DEFAULT GETDATE(),
    UpdatedAt           DATETIME NOT NULL DEFAULT GETDATE(),
    LastLogin           DATETIME NULL,

    CONSTRAINT FK_Admin_CreatedBy FOREIGN KEY (CreatedByAdminID) REFERENCES Admin(AdminID)
);
GO

ALTER TABLE Teacher ADD CONSTRAINT FK_Teacher_CreatedByAdmin FOREIGN KEY (CreatedByAdminID) REFERENCES Admin(AdminID);
GO

CREATE TABLE AdminActionLog (
    LogID               UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    AdminID             UNIQUEIDENTIFIER NOT NULL,
    ActionType          NVARCHAR(100) NOT NULL,     -- LOCK_USER, DELETE_CONTENT, CREATE_TEACHER, SUSPEND_ADMIN...
    TargetType          NVARCHAR(50),                -- User, Teacher, Admin, Material, Quiz...
    TargetID            UNIQUEIDENTIFIER,
    OldValue            NVARCHAR(MAX),               -- JSON
    NewValue            NVARCHAR(MAX),               -- JSON
    IPAddress           NVARCHAR(50),
    Timestamp           DATETIME NOT NULL DEFAULT GETDATE(),

    CONSTRAINT FK_ActionLog_Admin FOREIGN KEY (AdminID) REFERENCES Admin(AdminID)
);
GO

/* ============================================================
   2. NHÓM GÓI & THANH TOÁN
   ============================================================ */

CREATE TABLE Package (
    PackageID           UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    PackageName         NVARCHAR(50) NOT NULL,   -- Đồng, Bạc, Vàng
    Price               DECIMAL(12,2) NOT NULL DEFAULT 0,
    DurationMonths      INT NOT NULL DEFAULT 1,

    AIQuizLimit         INT NOT NULL,
    LevelTestLimit      INT NOT NULL,
    UploadLimitMB       FLOAT NOT NULL,
    KnowledgeBaseAccess NVARCHAR(20) NOT NULL DEFAULT 'Basic' CHECK (KnowledgeBaseAccess IN ('Basic','Full')),

    HasSpeakingAI       BIT NOT NULL DEFAULT 0,
    HasSpeakingTeacher  BIT NOT NULL DEFAULT 0,
    HasWritingAI        BIT NOT NULL DEFAULT 0,
    HasWritingTeacher   BIT NOT NULL DEFAULT 0,
    WritingAILimited    BIT NOT NULL DEFAULT 0,

    IsActive            BIT NOT NULL DEFAULT 1,
    CreatedAt           DATETIME NOT NULL DEFAULT GETDATE(),
    UpdatedAt           DATETIME NOT NULL DEFAULT GETDATE()
);
GO

ALTER TABLE [User] ADD CONSTRAINT FK_User_Package FOREIGN KEY (PackageID) REFERENCES Package(PackageID);
GO

CREATE TABLE Subscription (
    SubscriptionID       UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    UserID               UNIQUEIDENTIFIER NOT NULL,
    PackageID            UNIQUEIDENTIFIER NOT NULL,
    StartDate            DATETIME NOT NULL DEFAULT GETDATE(),
    EndDate              DATETIME NOT NULL,
    Status               NVARCHAR(20) NOT NULL DEFAULT 'Active' CHECK (Status IN ('Active','Expired','Cancelled')),
    PaymentMethod        NVARCHAR(50),
    Amount               DECIMAL(12,2) NOT NULL,
    CreatedAt            DATETIME NOT NULL DEFAULT GETDATE(),

    CONSTRAINT FK_Subscription_User FOREIGN KEY (UserID) REFERENCES [User](UserID),
    CONSTRAINT FK_Subscription_Package FOREIGN KEY (PackageID) REFERENCES Package(PackageID)
);
GO

CREATE TABLE [Transaction] (
    TransactionID         UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    UserID                UNIQUEIDENTIFIER NOT NULL,
    SubscriptionID        UNIQUEIDENTIFIER NULL,
    Amount                DECIMAL(12,2) NOT NULL,
    Method                NVARCHAR(50),   -- Momo, VNPay, Banking
    Status                NVARCHAR(20) NOT NULL DEFAULT 'Pending' CHECK (Status IN ('Success','Failed','Pending')),
    CreatedAt             DATETIME NOT NULL DEFAULT GETDATE(),

    CONSTRAINT FK_Transaction_User FOREIGN KEY (UserID) REFERENCES [User](UserID),
    CONSTRAINT FK_Transaction_Subscription FOREIGN KEY (SubscriptionID) REFERENCES Subscription(SubscriptionID)
);
GO

/* ============================================================
   3. NHÓM TÀI LIỆU NGƯỜI DÙNG & KHO TRI THỨC
   ============================================================ */

CREATE TABLE UserDocument (
    DocumentID           UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    UserID               UNIQUEIDENTIFIER NOT NULL,
    FileName             NVARCHAR(255) NOT NULL,
    FileURL              NVARCHAR(500) NOT NULL,
    FileType             NVARCHAR(20),   -- image, text, pdf
    FileSizeMB           FLOAT NOT NULL,
    ExtractedText        NVARCHAR(MAX),
    ProcessingStatus     NVARCHAR(20) NOT NULL DEFAULT 'Pending' CHECK (ProcessingStatus IN ('Pending','Processed','Failed')),
    CreatedAt            DATETIME NOT NULL DEFAULT GETDATE(),

    CONSTRAINT FK_UserDocument_User FOREIGN KEY (UserID) REFERENCES [User](UserID)
);
GO

CREATE TABLE KnowledgeDocument (
    DocID                UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    Title                NVARCHAR(255) NOT NULL,
    Category             NVARCHAR(100),
    Content              NVARCHAR(MAX),
    FileURL              NVARCHAR(500),
    EmbeddingVector      VARBINARY(MAX),      -- hoặc lưu riêng trong FAISS, chỉ giữ reference ở đây
    Source               NVARCHAR(20) NOT NULL DEFAULT 'System' CHECK (Source IN ('System','Teacher')),
    UploadedBy           UNIQUEIDENTIFIER NULL,  -- FK Teacher nếu Source = Teacher
    CreatedAt            DATETIME NOT NULL DEFAULT GETDATE(),

    CONSTRAINT FK_KnowledgeDoc_Teacher FOREIGN KEY (UploadedBy) REFERENCES Teacher(TeacherID)
);
GO

/* ============================================================
   4. NHÓM QUIZ / TEST
   ============================================================ */

CREATE TABLE Quiz (
    QuizID               UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    Title                NVARCHAR(255) NOT NULL,
    Skill                NVARCHAR(30) NOT NULL CHECK (Skill IN ('Reading','Writing','Reading+Writing')),
    Level                NVARCHAR(20) CHECK (Level IN ('Beginner','Intermediate','Advanced')),
    Source               NVARCHAR(20) NOT NULL DEFAULT 'System' CHECK (Source IN ('System','AI','Teacher')),
    CreatorID            UNIQUEIDENTIFIER NULL,   -- UserID hoặc TeacherID tùy Source
    Status               NVARCHAR(20) NOT NULL DEFAULT 'Draft' CHECK (Status IN ('Draft','PendingReview','Approved','Rejected')),
    ApprovedBy           UNIQUEIDENTIFIER NULL,   -- FK Teacher hoặc Admin
    ApprovedAt           DATETIME NULL,
    CreatedAt            DATETIME NOT NULL DEFAULT GETDATE()
);
GO

CREATE TABLE Question (
    QuestionID           UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    QuizID               UNIQUEIDENTIFIER NOT NULL,
    QuestionType         NVARCHAR(30) NOT NULL DEFAULT 'MultipleChoice',
    Content              NVARCHAR(MAX) NOT NULL,
    Options              NVARCHAR(MAX),    -- JSON: ["A. ...", "B. ...", ...]
    CorrectAnswer        NVARCHAR(500),
    Explanation          NVARCHAR(MAX),
    OrderIndex           INT NOT NULL DEFAULT 0,

    CONSTRAINT FK_Question_Quiz FOREIGN KEY (QuizID) REFERENCES Quiz(QuizID)
);
GO

CREATE TABLE AIQuizRequest (
    RequestID            UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    UserID               UNIQUEIDENTIFIER NOT NULL,
    Source               NVARCHAR(20) NOT NULL CHECK (Source IN ('MyDocuments','KnowledgeBase')),
    DocumentID            UNIQUEIDENTIFIER NULL,   -- FK UserDocument nếu Source = MyDocuments
    Skill                NVARCHAR(30) NOT NULL CHECK (Skill IN ('Reading','Writing','Reading+Writing')),
    Difficulty           NVARCHAR(20) NOT NULL CHECK (Difficulty IN ('Beginner','Intermediate','Advanced')),
    NumberOfQuestions    INT NOT NULL DEFAULT 20,
    QuizID               UNIQUEIDENTIFIER NULL,   -- FK Quiz - kết quả sinh ra
    Status                NVARCHAR(20) NOT NULL DEFAULT 'Processing' CHECK (Status IN ('Processing','Completed','Failed')),
    CreatedAt            DATETIME NOT NULL DEFAULT GETDATE(),

    CONSTRAINT FK_AIQuizRequest_User FOREIGN KEY (UserID) REFERENCES [User](UserID),
    CONSTRAINT FK_AIQuizRequest_Document FOREIGN KEY (DocumentID) REFERENCES UserDocument(DocumentID),
    CONSTRAINT FK_AIQuizRequest_Quiz FOREIGN KEY (QuizID) REFERENCES Quiz(QuizID)
);
GO

CREATE TABLE QuizAttempt (
    AttemptID             UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    UserID                UNIQUEIDENTIFIER NOT NULL,
    QuizID                UNIQUEIDENTIFIER NOT NULL,
    Score                 FLOAT,
    TimeTaken             INT,   -- giây
    StartedAt             DATETIME NOT NULL DEFAULT GETDATE(),
    SubmittedAt           DATETIME NULL,
    Status                NVARCHAR(20) NOT NULL DEFAULT 'InProgress' CHECK (Status IN ('InProgress','Completed')),

    CONSTRAINT FK_QuizAttempt_User FOREIGN KEY (UserID) REFERENCES [User](UserID),
    CONSTRAINT FK_QuizAttempt_Quiz FOREIGN KEY (QuizID) REFERENCES Quiz(QuizID)
);
GO

CREATE TABLE AnswerRecord (
    AnswerID              UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    AttemptID             UNIQUEIDENTIFIER NOT NULL,
    QuestionID            UNIQUEIDENTIFIER NOT NULL,
    UserAnswer            NVARCHAR(500),
    IsCorrect             BIT,
    TimeSpent             INT,  -- giây

    CONSTRAINT FK_AnswerRecord_Attempt FOREIGN KEY (AttemptID) REFERENCES QuizAttempt(AttemptID),
    CONSTRAINT FK_AnswerRecord_Question FOREIGN KEY (QuestionID) REFERENCES Question(QuestionID)
);
GO

CREATE TABLE QuizAIAnalysis (
    AnalysisID            UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    AttemptID             UNIQUEIDENTIFIER NOT NULL,
    WeaknessArea          NVARCHAR(MAX),
    RecommendedActions    NVARCHAR(MAX),   -- JSON hoặc text
    CreatedAt             DATETIME NOT NULL DEFAULT GETDATE(),

    CONSTRAINT FK_QuizAIAnalysis_Attempt FOREIGN KEY (AttemptID) REFERENCES QuizAttempt(AttemptID)
);
GO

CREATE TABLE LevelTest (
    LevelTestID           UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    UserID                UNIQUEIDENTIFIER NOT NULL,
    TestType              NVARCHAR(20) NOT NULL DEFAULT 'Initial' CHECK (TestType IN ('Initial','Retake')),
    ReadingBand           FLOAT,
    ListeningBand         FLOAT,
    WritingBand           FLOAT,
    SpeakingBand          FLOAT,
    OverallBand           FLOAT,
    RecommendedLevel      NVARCHAR(20) CHECK (RecommendedLevel IN ('Beginner','Intermediate','Advanced')),
    Status                NVARCHAR(20) NOT NULL DEFAULT 'Completed' CHECK (Status IN ('InProgress','Completed')),
    TestDate              DATETIME NOT NULL DEFAULT GETDATE(),

    CONSTRAINT FK_LevelTest_User FOREIGN KEY (UserID) REFERENCES [User](UserID)
);
GO

/* ============================================================
   5. NHÓM SPEAKING / WRITING CHẤM BÀI
   ============================================================ */

CREATE TABLE SpeakingSubmission (
    SubmissionID          UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    UserID                UNIQUEIDENTIFIER NOT NULL,
    TeacherID             UNIQUEIDENTIFIER NULL,
    AudioFileURL          NVARCHAR(500) NOT NULL,
    Question              NVARCHAR(MAX),

    AIScore               FLOAT,
    AIFeedback            NVARCHAR(MAX),

    FluencyScore          FLOAT,
    VocabularyScore       FLOAT,
    GrammarScore          FLOAT,
    PronunciationScore    FLOAT,
    TeacherScore          FLOAT,
    TeacherFeedback       NVARCHAR(MAX),

    Status                NVARCHAR(20) NOT NULL DEFAULT 'Pending' CHECK (Status IN ('Pending','AIGraded','TeacherGraded')),
    CreatedAt             DATETIME NOT NULL DEFAULT GETDATE(),
    GradedAt              DATETIME NULL,

    CONSTRAINT FK_SpeakingSubmission_User FOREIGN KEY (UserID) REFERENCES [User](UserID),
    CONSTRAINT FK_SpeakingSubmission_Teacher FOREIGN KEY (TeacherID) REFERENCES Teacher(TeacherID)
);
GO

CREATE TABLE WritingSubmission (
    SubmissionID          UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    UserID                UNIQUEIDENTIFIER NOT NULL,
    TeacherID             UNIQUEIDENTIFIER NULL,
    Content               NVARCHAR(MAX) NOT NULL,
    Question              NVARCHAR(MAX),

    AIScore               FLOAT,
    AIFeedback            NVARCHAR(MAX),
    TeacherScore          FLOAT,
    TeacherFeedback       NVARCHAR(MAX),

    Status                NVARCHAR(20) NOT NULL DEFAULT 'Pending' CHECK (Status IN ('Pending','AIGraded','TeacherGraded')),
    CreatedAt             DATETIME NOT NULL DEFAULT GETDATE(),
    GradedAt              DATETIME NULL,

    CONSTRAINT FK_WritingSubmission_User FOREIGN KEY (UserID) REFERENCES [User](UserID),
    CONSTRAINT FK_WritingSubmission_Teacher FOREIGN KEY (TeacherID) REFERENCES Teacher(TeacherID)
);
GO

/* ============================================================
   6. NHÓM LỚP HỌC
   ============================================================ */

CREATE TABLE Classroom (
    ClassID               UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    TeacherID             UNIQUEIDENTIFIER NOT NULL,
    ClassName             NVARCHAR(255) NOT NULL,
    Description           NVARCHAR(MAX),
    MaxStudents           INT NOT NULL DEFAULT 30,
    GoogleMeetLink        NVARCHAR(500),
    Status                NVARCHAR(20) NOT NULL DEFAULT 'Active' CHECK (Status IN ('Active','Closed')),
    CreatedAt             DATETIME NOT NULL DEFAULT GETDATE(),

    CONSTRAINT FK_Classroom_Teacher FOREIGN KEY (TeacherID) REFERENCES Teacher(TeacherID)
);
GO

CREATE TABLE ClassEnrollment (
    EnrollmentID          UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    ClassID               UNIQUEIDENTIFIER NOT NULL,
    UserID                UNIQUEIDENTIFIER NOT NULL,
    EnrolledAt            DATETIME NOT NULL DEFAULT GETDATE(),
    Status                NVARCHAR(20) NOT NULL DEFAULT 'Active' CHECK (Status IN ('Active','Dropped')),

    CONSTRAINT FK_Enrollment_Class FOREIGN KEY (ClassID) REFERENCES Classroom(ClassID),
    CONSTRAINT FK_Enrollment_User FOREIGN KEY (UserID) REFERENCES [User](UserID),
    CONSTRAINT UQ_Enrollment UNIQUE (ClassID, UserID)
);
GO

CREATE TABLE ClassSession (
    SessionID             UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    ClassID               UNIQUEIDENTIFIER NOT NULL,
    SessionDate           DATE NOT NULL,
    StartTime             TIME NOT NULL,
    EndTime               TIME NOT NULL,
    DayOfWeek             NVARCHAR(20),          -- nếu lặp lại hàng tuần
    MeetingLink           NVARCHAR(500),
    RecordingURL          NVARCHAR(500),

    CONSTRAINT FK_Session_Class FOREIGN KEY (ClassID) REFERENCES Classroom(ClassID)
);
GO

/* ============================================================
   7. NHÓM TÀI LIỆU / BÀI GIẢNG
   ============================================================ */

CREATE TABLE Material (
    MaterialID            UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    TeacherID             UNIQUEIDENTIFIER NOT NULL,
    Title                 NVARCHAR(255) NOT NULL,
    Description           NVARCHAR(MAX),
    Skill                 NVARCHAR(30) CHECK (Skill IN ('Reading','Listening','Writing','Speaking')),
    Level                 NVARCHAR(20) CHECK (Level IN ('Beginner','Intermediate','Advanced')),
    FileURL               NVARCHAR(500),
    FileType              NVARCHAR(20),
    IsFree                BIT NOT NULL DEFAULT 1,
    Price                 DECIMAL(12,2) NOT NULL DEFAULT 0,
    DownloadCount         INT NOT NULL DEFAULT 0,
    Status                NVARCHAR(20) NOT NULL DEFAULT 'Pending' CHECK (Status IN ('Pending','Approved','Rejected')),
    CreatedAt             DATETIME NOT NULL DEFAULT GETDATE(),

    CONSTRAINT FK_Material_Teacher FOREIGN KEY (TeacherID) REFERENCES Teacher(TeacherID)
);
GO

CREATE TABLE MaterialAccess (
    AccessID              UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    MaterialID            UNIQUEIDENTIFIER NOT NULL,
    UserID                UNIQUEIDENTIFIER NOT NULL,
    PurchasedAt           DATETIME NOT NULL DEFAULT GETDATE(),
    ExpiresAt             DATETIME NULL,

    CONSTRAINT FK_MaterialAccess_Material FOREIGN KEY (MaterialID) REFERENCES Material(MaterialID),
    CONSTRAINT FK_MaterialAccess_User FOREIGN KEY (UserID) REFERENCES [User](UserID)
);
GO

/* ============================================================
   8. NHÓM FEEDBACK & REPORT
   ============================================================ */

CREATE TABLE Feedback (
    FeedbackID            UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    UserID                UNIQUEIDENTIFIER NOT NULL,
    Type                  NVARCHAR(30) NOT NULL CHECK (Type IN ('BugReport','Suggestion','Complaint','Website','Lesson','Account')),
    Content               NVARCHAR(MAX) NOT NULL,
    Status                NVARCHAR(20) NOT NULL DEFAULT 'New' CHECK (Status IN ('New','InProgress','Reviewing','Resolved')),
    AssignedAdminID       UNIQUEIDENTIFIER NULL,
    ResponseContent       NVARCHAR(MAX),
    CreatedAt             DATETIME NOT NULL DEFAULT GETDATE(),
    ResolvedAt            DATETIME NULL,

    CONSTRAINT FK_Feedback_User FOREIGN KEY (UserID) REFERENCES [User](UserID),
    CONSTRAINT FK_Feedback_Admin FOREIGN KEY (AssignedAdminID) REFERENCES Admin(AdminID)
);
GO

CREATE TABLE ContentReport (
    ReportID              UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    ReporterID            UNIQUEIDENTIFIER NOT NULL,   -- UserID hoặc TeacherID
    ReporterType          NVARCHAR(20) NOT NULL CHECK (ReporterType IN ('User','Teacher')),
    TargetType            NVARCHAR(30) NOT NULL CHECK (TargetType IN ('Material','Quiz','Lesson','Comment')),
    TargetID              UNIQUEIDENTIFIER NOT NULL,
    Reason                NVARCHAR(MAX),
    Status                NVARCHAR(20) NOT NULL DEFAULT 'Pending' CHECK (Status IN ('Pending','Reviewing','Resolved','Dismissed')),
    HandledBy             UNIQUEIDENTIFIER NULL,
    CreatedAt             DATETIME NOT NULL DEFAULT GETDATE(),

    CONSTRAINT FK_ContentReport_Admin FOREIGN KEY (HandledBy) REFERENCES Admin(AdminID)
);
GO

/* ============================================================
   9. NHÓM TRACKING & NOTIFICATION
   ============================================================ */

CREATE TABLE LearningActivity (
    ActivityID            UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    UserID                UNIQUEIDENTIFIER NOT NULL,
    ActivityDate          DATE NOT NULL,
    ActivityType          NVARCHAR(50),   -- Quiz, Test, Lesson, AIQuiz...
    Duration              INT,  -- phút

    CONSTRAINT FK_Activity_User FOREIGN KEY (UserID) REFERENCES [User](UserID)
);
GO

CREATE TABLE Notification (
    NotificationID        UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    UserID                UNIQUEIDENTIFIER NOT NULL,
    Title                 NVARCHAR(255) NOT NULL,
    Content               NVARCHAR(MAX),
    Type                  NVARCHAR(50),
    IsRead                BIT NOT NULL DEFAULT 0,
    CreatedAt             DATETIME NOT NULL DEFAULT GETDATE(),

    CONSTRAINT FK_Notification_User FOREIGN KEY (UserID) REFERENCES [User](UserID)
);
GO

/* ============================================================
   INDEXES QUAN TRỌNG (tăng tốc query thường dùng)
   ============================================================ */

CREATE INDEX IX_QuizAttempt_UserID ON QuizAttempt(UserID);
CREATE INDEX IX_AnswerRecord_AttemptID ON AnswerRecord(AttemptID);
CREATE INDEX IX_Subscription_UserID_Status ON Subscription(UserID, Status);
CREATE INDEX IX_AdminActionLog_AdminID_Timestamp ON AdminActionLog(AdminID, Timestamp);
CREATE INDEX IX_Material_TeacherID ON Material(TeacherID);
CREATE INDEX IX_ClassEnrollment_UserID ON ClassEnrollment(UserID);
CREATE INDEX IX_Feedback_Status ON Feedback(Status);
CREATE INDEX IX_UserDocument_UserID ON UserDocument(UserID);
GO

/* ============================================================
   SEED DATA MẪU: 3 GÓI Đồng / Bạc / Vàng
   ============================================================ */

INSERT INTO Package (PackageName, Price, DurationMonths, AIQuizLimit, LevelTestLimit, UploadLimitMB,
    KnowledgeBaseAccess, HasSpeakingAI, HasSpeakingTeacher, HasWritingAI, HasWritingTeacher, WritingAILimited)
VALUES
('Đồng', 0,      1, 8,   1,  5,  'Basic', 0, 0, 0, 0, 1),
('Bạc',  199000, 1, 60,  4,  20, 'Full',  1, 0, 1, 0, 0),
('Vàng', 399000, 1, 250, 12, 50, 'Full',  1, 1, 1, 1, 0);
GO

PRINT 'Database IELTS đã được tạo thành công với đầy đủ bảng.';