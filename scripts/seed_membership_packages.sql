/* Run against the IELTS database to add missing Bronze, Silver and Gold plans. */
MERGE dbo.Package AS target
USING (VALUES
    (N'Bronze', CAST(0 AS decimal(12, 2)), 1, 8, 1, 5.0, N'Basic', 0, 0, 1, 0, 1),
    (N'Silver', CAST(199000 AS decimal(12, 2)), 1, 60, 4, 20.0, N'Full', 1, 0, 1, 0, 0),
    (N'Gold', CAST(399000 AS decimal(12, 2)), 1, 250, 12, 50.0, N'Full', 1, 1, 1, 1, 0)
) AS source (
    PackageName, Price, DurationMonths, AIQuizLimit, LevelTestLimit, UploadLimitMB,
    KnowledgeBaseAccess, HasSpeakingAI, HasSpeakingTeacher, HasWritingAI,
    HasWritingTeacher, WritingAILimited
)
ON LOWER(target.PackageName) = LOWER(source.PackageName)
   OR (source.PackageName = N'Bronze' AND target.PackageName = N'Đồng')
   OR (source.PackageName = N'Silver' AND target.PackageName = N'Bạc')
   OR (source.PackageName = N'Gold' AND target.PackageName = N'Vàng')
WHEN NOT MATCHED BY TARGET THEN
    INSERT (
        PackageID, PackageName, Price, DurationMonths, AIQuizLimit, LevelTestLimit,
        UploadLimitMB, KnowledgeBaseAccess, HasSpeakingAI, HasSpeakingTeacher,
        HasWritingAI, HasWritingTeacher, WritingAILimited, IsActive, CreatedAt, UpdatedAt
    )
    VALUES (
        NEWID(), source.PackageName, source.Price, source.DurationMonths, source.AIQuizLimit,
        source.LevelTestLimit, source.UploadLimitMB, source.KnowledgeBaseAccess,
        source.HasSpeakingAI, source.HasSpeakingTeacher, source.HasWritingAI,
        source.HasWritingTeacher, source.WritingAILimited, 1, GETDATE(), GETDATE()
    );
GO
