-- ============================================================
-- Test Database Connection and Query All Users
-- ============================================================

-- Test 1: Verify connection
PRINT '========================================';
PRINT 'Connection Test';
PRINT '========================================';
SELECT 'Connection Successful' AS Status;
GO

-- Test 2: Database Info 
PRINT '========================================';
PRINT 'Database Information';
PRINT '========================================';
SELECT DB_NAME() AS DatabaseName, @@VERSION AS ServerVersion;
GO

-- Test 3: Query All Users
PRINT '========================================';
PRINT 'All Users in Database';
PRINT '========================================';
SELECT 
    UserID,
    FullName,
    Username,
    Email,
    PhoneNumber,
    Role,
    Status,
    CurrentBand,
    TargetBand,
    LearningLevel,
    CreatedAt,
    UpdatedAt,
    LastLogin
FROM [User]
ORDER BY CreatedAt DESC;
GO

-- Test 4: User Statistics
PRINT '========================================';
PRINT 'User Statistics';
PRINT '========================================';
SELECT 
    COUNT(*) AS TotalUsers,
    COUNT(CASE WHEN Status = 'Active' THEN 1 END) AS ActiveUsers,
    COUNT(CASE WHEN Status = 'Inactive' THEN 1 END) AS InactiveUsers,
    COUNT(CASE WHEN Status = 'Banned' THEN 1 END) AS BannedUsers,
    COUNT(CASE WHEN EmailVerified = 1 THEN 1 END) AS EmailVerifiedCount,
    COUNT(CASE WHEN PhoneVerified = 1 THEN 1 END) AS PhoneVerifiedCount
FROM [User];
GO

-- Test 5: Users by Role
PRINT '========================================';
PRINT 'Users by Role';
PRINT '========================================';
SELECT 
    Role,
    COUNT(*) AS Count
FROM [User]
GROUP BY Role
ORDER BY Count DESC;
GO

-- Test 6: Users by Learning Level
PRINT '========================================';
PRINT 'Users by Learning Level';
PRINT '========================================';
SELECT 
    ISNULL(LearningLevel, 'Not Set') AS LearningLevel,
    COUNT(*) AS Count
FROM [User]
GROUP BY LearningLevel
ORDER BY Count DESC;
GO

PRINT '========================================';
PRINT 'Tests Completed';
PRINT '========================================';
