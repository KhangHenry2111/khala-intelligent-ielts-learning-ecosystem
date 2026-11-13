IF OBJECT_ID(N'dbo.PasswordResetCode', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.PasswordResetCode
    (
        PasswordResetCodeID uniqueidentifier NOT NULL PRIMARY KEY,
        AccountID uniqueidentifier NOT NULL,
        UserType nvarchar(10) NOT NULL,
        Method nvarchar(10) NOT NULL,
        CodeSalt varbinary(16) NOT NULL,
        CodeHash varbinary(32) NOT NULL,
        CreatedAt datetime2 NOT NULL,
        ExpiresAt datetime2 NOT NULL,
        Attempts int NOT NULL CONSTRAINT DF_PasswordResetCode_Attempts DEFAULT (0),
        IsUsed bit NOT NULL CONSTRAINT DF_PasswordResetCode_IsUsed DEFAULT (0),
        CONSTRAINT CK_PasswordResetCode_UserType CHECK (UserType IN (N'User', N'Teacher')),
        CONSTRAINT CK_PasswordResetCode_Method CHECK (Method IN (N'email', N'phone'))
    );
END;
GO

IF NOT EXISTS
(
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID(N'dbo.PasswordResetCode')
        AND name = N'IX_PasswordResetCode_Account'
)
BEGIN
    CREATE INDEX IX_PasswordResetCode_Account
        ON dbo.PasswordResetCode (AccountID, UserType, Method, CreatedAt DESC);
END;
GO
