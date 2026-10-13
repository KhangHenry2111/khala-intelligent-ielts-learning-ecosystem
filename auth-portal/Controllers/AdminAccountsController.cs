using System.Data;
using System.Security.Cryptography;
using AuthPortal.Models;
using AuthPortal.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;

namespace AuthPortal.Controllers;

[ApiController]
[Route("api/admin/accounts")]
public class AdminAccountsController : ControllerBase
{
    private readonly string? _connectionString;
    private readonly IAuthService _auth;

    public AdminAccountsController(IConfiguration config, IAuthService auth)
    {
        _connectionString = config.GetConnectionString("Default")
            ?? Environment.GetEnvironmentVariable("USER_DB_CONNECTION");
        _auth = auth;
    }

    private bool IsAdmin()
    {
        var token = Request.Headers.Authorization.ToString();
        if (token.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
            token = token[7..].Trim();
        var session = _auth.GetSession(token);
        return session != null && string.Equals(session.UserType, "Admin", StringComparison.OrdinalIgnoreCase);
    }

    private SqlConnection GetConnection()
    {
        if (string.IsNullOrWhiteSpace(_connectionString))
            throw new InvalidOperationException("Connection string 'Default' is not configured.");
        return new SqlConnection(_connectionString);
    }

    [HttpGet]
    public IActionResult GetAccounts()
    {
        if (!IsAdmin()) return Unauthorized(new { success = false, message = "Sign in as an admin to manage accounts." });

        try
        {
            using var conn = GetConnection();
            conn.Open();
            var items = new List<object>();

            const string usersSql = @"
                SELECT UserID, FullName, Username, Email, PhoneNumber, Avatar, DateOfBirth, Gender, Role, Status,
                       EmailVerified, PhoneVerified, CurrentBand, TargetBand, SpeakingBand, ListeningBand,
                       ReadingBand, WritingBand, LearningLevel, Rank, PackageID, AIQuizUsedThisMonth,
                       LevelTestUsedThisMonth, UploadedStorageMB, TotalTests, TotalPracticeQuestions,
                       LearningStreak, CreatedAt, UpdatedAt, LastLogin
                FROM [User]
                ORDER BY FullName, Username";
            using (var cmd = new SqlCommand(usersSql, conn))
            using (var reader = cmd.ExecuteReader())
            {
                while (reader.Read())
                {
                    items.Add(new
                    {
                        id = reader.GetGuid(0).ToString(),
                        accountType = "User",
                        fullName = reader.GetString(1),
                        username = reader.GetString(2),
                        email = reader.GetString(3),
                        phoneNumber = NullableString(reader, 4),
                        avatar = NullableString(reader, 5),
                        dateOfBirth = NullableDateTime(reader, 6),
                        gender = NullableString(reader, 7),
                        role = reader.GetString(8),
                        status = reader.GetString(9),
                        emailVerified = reader.GetBoolean(10),
                        phoneVerified = reader.GetBoolean(11),
                        currentBand = NullableDouble(reader, 12),
                        targetBand = NullableDouble(reader, 13),
                        speakingBand = NullableDouble(reader, 14),
                        listeningBand = NullableDouble(reader, 15),
                        readingBand = NullableDouble(reader, 16),
                        writingBand = NullableDouble(reader, 17),
                        learningLevel = NullableString(reader, 18),
                        rank = NullableString(reader, 19),
                        packageId = NullableGuid(reader, 20),
                        aiQuizUsedThisMonth = reader.GetInt32(21),
                        levelTestUsedThisMonth = reader.GetInt32(22),
                        uploadedStorageMb = reader.GetDouble(23),
                        totalTests = reader.GetInt32(24),
                        totalPracticeQuestions = reader.GetInt32(25),
                        learningStreak = reader.GetInt32(26),
                        createdAt = reader.GetDateTime(27),
                        updatedAt = reader.GetDateTime(28),
                        lastLogin = NullableDateTime(reader, 29)
                    });
                }
            }

            const string teachersSql = @"
                SELECT TeacherID, FullName, Username, Email, PhoneNumber, Avatar, Biography, Qualification,
                       QualificationFileURL, IELTSBand, ExperienceYears, Specialization, Role, Status,
                       VerificationStatus, NumberOfLessons, TotalMaterials, TotalQuestions, Contribution,
                       AverageRating, TotalStudents, CreatedAt, UpdatedAt, LastLogin, CreatedByAdminID
                FROM Teacher
                ORDER BY FullName, Username";
            using (var cmd = new SqlCommand(teachersSql, conn))
            using (var reader = cmd.ExecuteReader())
            {
                while (reader.Read())
                {
                    items.Add(new
                    {
                        id = reader.GetGuid(0).ToString(),
                        accountType = "Teacher",
                        fullName = reader.GetString(1),
                        username = reader.GetString(2),
                        email = reader.GetString(3),
                        phoneNumber = NullableString(reader, 4),
                        avatar = NullableString(reader, 5),
                        biography = NullableString(reader, 6),
                        qualification = NullableString(reader, 7),
                        qualificationFileUrl = NullableString(reader, 8),
                        ieltsBand = NullableDouble(reader, 9),
                        experienceYears = NullableInt32(reader, 10),
                        specialization = NullableString(reader, 11),
                        role = reader.GetString(12),
                        status = reader.GetString(13),
                        verificationStatus = reader.GetString(14),
                        numberOfLessons = reader.GetInt32(15),
                        totalMaterials = reader.GetInt32(16),
                        totalQuestions = reader.GetInt32(17),
                        contribution = reader.GetInt32(18),
                        averageRating = NullableDouble(reader, 19),
                        totalStudents = reader.GetInt32(20),
                        createdAt = reader.GetDateTime(21),
                        updatedAt = reader.GetDateTime(22),
                        lastLogin = NullableDateTime(reader, 23),
                        createdByAdminId = NullableGuid(reader, 24)
                    });
                }
            }

            var packages = new List<object>();
            using (var cmd = new SqlCommand(
                "SELECT PackageID, PackageName, IsActive FROM Package ORDER BY Price, PackageName", conn))
            using (var reader = cmd.ExecuteReader())
            {
                while (reader.Read())
                    packages.Add(new { id = reader.GetGuid(0).ToString(), name = reader.GetString(1), isActive = reader.GetBoolean(2) });
            }

            return Ok(new { success = true, items, packages });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { success = false, message = ex.Message });
        }
    }

    [HttpPut("{accountType}/{id}")]
    public IActionResult UpdateAccount(string accountType, string id, [FromBody] AdminAccountUpdateRequest? req)
    {
        if (!IsAdmin()) return Unauthorized(new { success = false, message = "Sign in as an admin to manage accounts." });
        if (!Guid.TryParse(id, out var accountId) || req == null)
            return BadRequest(new { success = false, message = "A valid account id and account details are required." });
        if (!string.Equals(accountType, "user", StringComparison.OrdinalIgnoreCase)
            && !string.Equals(accountType, "teacher", StringComparison.OrdinalIgnoreCase))
            return BadRequest(new { success = false, message = "Only user and teacher accounts can be edited here." });
        if (string.IsNullOrWhiteSpace(req.FullName) || req.FullName.Length > 255
            || string.IsNullOrWhiteSpace(req.Username) || req.Username.Length > 100
            || string.IsNullOrWhiteSpace(req.Email) || req.Email.Length > 255
            || string.IsNullOrWhiteSpace(req.Role) || req.Role.Length > 20
            || string.IsNullOrWhiteSpace(req.Status) || req.Status.Length > 20)
            return BadRequest(new { success = false, message = "Name, username, email, role, and status are required and must fit the database fields." });
        if (req.NewPassword is { Length: > 0 } && req.NewPassword.Length < 8)
            return BadRequest(new { success = false, message = "A new password must contain at least 8 characters." });
        if (req.PhoneNumber?.Length > 20 || req.Avatar?.Length > 500)
            return BadRequest(new { success = false, message = "Phone number or avatar URL exceeds the allowed length." });

        var isTeacher = string.Equals(accountType, "teacher", StringComparison.OrdinalIgnoreCase);
        if (!isTeacher && (req.Gender?.Length > 20 || req.LearningLevel?.Length > 20 || req.Rank?.Length > 20))
            return BadRequest(new { success = false, message = "Gender, learning level, or rank exceeds the allowed length." });
        if (isTeacher && (req.Qualification?.Length > 255 || req.QualificationFileUrl?.Length > 500
            || req.Specialization?.Length > 255 || req.VerificationStatus?.Length > 20))
            return BadRequest(new { success = false, message = "Teacher profile details exceed the allowed field lengths." });
        if (req.CurrentBand is < 0 or > 9 || req.TargetBand is < 0 or > 9
            || req.SpeakingBand is < 0 or > 9 || req.ListeningBand is < 0 or > 9
            || req.ReadingBand is < 0 or > 9 || req.WritingBand is < 0 or > 9
            || req.IeltsBand is < 0 or > 9 || req.ExperienceYears is < 0)
            return BadRequest(new { success = false, message = "Band scores must be between 0 and 9, and experience cannot be negative." });

        try
        {
            using var conn = GetConnection();
            conn.Open();
            var passwordAssignment = string.IsNullOrEmpty(req.NewPassword) ? string.Empty : "Password=@Password, ";
            var sql = isTeacher
                ? $@"UPDATE Teacher SET {passwordAssignment}FullName=@FullName, Username=@Username, Email=@Email, PhoneNumber=@PhoneNumber,
                    Avatar=@Avatar, Biography=@Biography, Qualification=@Qualification, QualificationFileURL=@QualificationFileURL,
                    IELTSBand=@IELTSBand, ExperienceYears=@ExperienceYears, Specialization=@Specialization, Role=@Role,
                    Status=@Status, VerificationStatus=@VerificationStatus, UpdatedAt=GETDATE()
                    WHERE TeacherID=@Id"
                : $@"UPDATE [User] SET {passwordAssignment}FullName=@FullName, Username=@Username, Email=@Email, PhoneNumber=@PhoneNumber,
                    Avatar=@Avatar, DateOfBirth=@DateOfBirth, Gender=@Gender, Role=@Role, Status=@Status,
                    EmailVerified=@EmailVerified, PhoneVerified=@PhoneVerified, CurrentBand=@CurrentBand,
                    TargetBand=@TargetBand, SpeakingBand=@SpeakingBand, ListeningBand=@ListeningBand,
                    ReadingBand=@ReadingBand, WritingBand=@WritingBand, LearningLevel=@LearningLevel, Rank=@Rank,
                    PackageID=@PackageID, UpdatedAt=GETDATE()
                    WHERE UserID=@Id";
            using var cmd = new SqlCommand(sql, conn);
            AddString(cmd, "@FullName", req.FullName.Trim(), 255);
            AddString(cmd, "@Username", req.Username.Trim(), 100);
            AddString(cmd, "@Email", req.Email.Trim(), 255);
            AddString(cmd, "@PhoneNumber", req.PhoneNumber, 20);
            AddString(cmd, "@Avatar", req.Avatar, 500);
            AddString(cmd, "@Role", req.Role.Trim(), 20);
            AddString(cmd, "@Status", req.Status.Trim(), 20);
            cmd.Parameters.Add(new SqlParameter("@Id", SqlDbType.UniqueIdentifier) { Value = accountId });

            if (isTeacher)
            {
                AddString(cmd, "@Biography", req.Biography, -1);
                AddString(cmd, "@Qualification", req.Qualification, 255);
                AddString(cmd, "@QualificationFileURL", req.QualificationFileUrl, 500);
                AddNullable(cmd, "@IELTSBand", SqlDbType.Float, req.IeltsBand);
                AddNullable(cmd, "@ExperienceYears", SqlDbType.Int, req.ExperienceYears);
                AddString(cmd, "@Specialization", req.Specialization, 255);
                AddString(cmd, "@VerificationStatus", req.VerificationStatus ?? "Pending", 20);
            }
            else
            {
                AddNullable(cmd, "@DateOfBirth", SqlDbType.Date, req.DateOfBirth);
                AddString(cmd, "@Gender", req.Gender, 20);
                AddNullable(cmd, "@EmailVerified", SqlDbType.Bit, req.EmailVerified);
                AddNullable(cmd, "@PhoneVerified", SqlDbType.Bit, req.PhoneVerified);
                AddNullable(cmd, "@CurrentBand", SqlDbType.Float, req.CurrentBand);
                AddNullable(cmd, "@TargetBand", SqlDbType.Float, req.TargetBand);
                AddNullable(cmd, "@SpeakingBand", SqlDbType.Float, req.SpeakingBand);
                AddNullable(cmd, "@ListeningBand", SqlDbType.Float, req.ListeningBand);
                AddNullable(cmd, "@ReadingBand", SqlDbType.Float, req.ReadingBand);
                AddNullable(cmd, "@WritingBand", SqlDbType.Float, req.WritingBand);
                AddString(cmd, "@LearningLevel", req.LearningLevel, 20);
                AddString(cmd, "@Rank", req.Rank, 20);
                AddNullable(cmd, "@PackageID", SqlDbType.UniqueIdentifier, req.PackageId);
            }

            if (!string.IsNullOrEmpty(req.NewPassword))
            {
                cmd.Parameters.Add(new SqlParameter("@Password", SqlDbType.NVarChar, 255)
                {
                    Value = HashPassword(req.NewPassword)
                });
            }

            if (cmd.ExecuteNonQuery() == 0)
                return NotFound(new { success = false, message = "Account not found." });
            if (!string.Equals(req.Status, "Active", StringComparison.OrdinalIgnoreCase)
                || !string.IsNullOrEmpty(req.NewPassword))
                _auth.RevokeSessions(accountId.ToString(), isTeacher ? "Teacher" : "User");
            return Ok(new { success = true, message = "Account updated." });
        }
        catch (SqlException ex) when (ex.Number is 2601 or 2627)
        {
            return Conflict(new { success = false, message = "Username or email is already used by another account of this type." });
        }
        catch (SqlException ex) when (ex.Number == 547)
        {
            return BadRequest(new { success = false, message = "The selected package does not exist." });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { success = false, message = ex.Message });
        }
    }

    [HttpDelete("{accountType}/{id}")]
    public IActionResult DeleteAccount(string accountType, string id)
    {
        if (!IsAdmin()) return Unauthorized(new { success = false, message = "Sign in as an admin to manage accounts." });
        if (!Guid.TryParse(id, out var accountId))
            return BadRequest(new { success = false, message = "A valid account id is required." });

        var table = accountType.ToLowerInvariant() switch
        {
            "user" => "[User]",
            "teacher" => "Teacher",
            _ => null
        };
        if (table == null)
            return BadRequest(new { success = false, message = "Only user and teacher accounts can be deleted here." });

        try
        {
            using var conn = GetConnection();
            conn.Open();
            using var cmd = new SqlCommand($"UPDATE {table} SET Status='Deleted', UpdatedAt=GETDATE() WHERE {(table == "[User]" ? "UserID" : "TeacherID")}=@Id", conn);
            cmd.Parameters.Add(new SqlParameter("@Id", SqlDbType.UniqueIdentifier) { Value = accountId });
            if (cmd.ExecuteNonQuery() == 0)
                return NotFound(new { success = false, message = "Account not found." });
            _auth.RevokeSessions(accountId.ToString(), table == "[User]" ? "User" : "Teacher");
            return Ok(new { success = true, message = "Account deactivated. Learning history and related records were preserved." });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { success = false, message = ex.Message });
        }
    }

    private static string? NullableString(SqlDataReader reader, int ordinal) =>
        reader.IsDBNull(ordinal) ? null : reader.GetString(ordinal);

    private static DateTime? NullableDateTime(SqlDataReader reader, int ordinal) =>
        reader.IsDBNull(ordinal) ? null : reader.GetDateTime(ordinal);

    private static double? NullableDouble(SqlDataReader reader, int ordinal) =>
        reader.IsDBNull(ordinal) ? null : reader.GetDouble(ordinal);

    private static int? NullableInt32(SqlDataReader reader, int ordinal) =>
        reader.IsDBNull(ordinal) ? null : reader.GetInt32(ordinal);

    private static Guid? NullableGuid(SqlDataReader reader, int ordinal) =>
        reader.IsDBNull(ordinal) ? null : reader.GetGuid(ordinal);

    private static void AddString(SqlCommand cmd, string name, string? value, int size)
    {
        cmd.Parameters.Add(new SqlParameter(name, SqlDbType.NVarChar, size)
        {
            Value = string.IsNullOrWhiteSpace(value) ? DBNull.Value : value.Trim()
        });
    }

    private static void AddNullable(SqlCommand cmd, string name, SqlDbType type, object? value)
    {
        cmd.Parameters.Add(new SqlParameter(name, type) { Value = value ?? DBNull.Value });
    }

    private static string HashPassword(string password)
    {
        const int iterations = 120_000;
        var salt = RandomNumberGenerator.GetBytes(16);
        var hash = Rfc2898DeriveBytes.Pbkdf2(password, salt, iterations, HashAlgorithmName.SHA256, 32);
        return $"PBKDF2${iterations}${Convert.ToBase64String(salt)}${Convert.ToBase64String(hash)}";
    }
}
