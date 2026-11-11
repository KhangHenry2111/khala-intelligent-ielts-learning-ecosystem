IF COL_LENGTH('dbo.KnowledgeDocument', 'UploadedByUserID') IS NULL
BEGIN
    ALTER TABLE dbo.KnowledgeDocument
        ADD UploadedByUserID uniqueidentifier NULL;
END
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.foreign_keys
    WHERE name = 'FK_KnowledgeDoc_User'
      AND parent_object_id = OBJECT_ID('dbo.KnowledgeDocument')
)
BEGIN
    ALTER TABLE dbo.KnowledgeDocument WITH CHECK
        ADD CONSTRAINT FK_KnowledgeDoc_User
        FOREIGN KEY (UploadedByUserID) REFERENCES dbo.[User](UserID);
END
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IX_KnowledgeDocument_UploadedByUserID'
      AND object_id = OBJECT_ID('dbo.KnowledgeDocument')
)
BEGIN
    CREATE NONCLUSTERED INDEX IX_KnowledgeDocument_UploadedByUserID
        ON dbo.KnowledgeDocument (UploadedByUserID, CreatedAt DESC)
        WHERE UploadedByUserID IS NOT NULL;
END
GO
