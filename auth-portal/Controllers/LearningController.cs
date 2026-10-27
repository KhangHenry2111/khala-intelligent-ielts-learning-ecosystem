using System.Data;
using AuthPortal.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;

namespace AuthPortal.Controllers;

[ApiController]
[Route("api/learning")]
public class LearningController : ControllerBase
{
    private readonly string? _connectionString;
    private readonly IAuthService _auth;

    public LearningController(IConfiguration config, IAuthService auth)
    {
        _connectionString = config.GetConnectionString("Default") ?? Environment.GetEnvironmentVariable("USER_DB_CONNECTION");
        _auth = auth;
    }

    private SqlConnection GetConnection()
    {
        if (string.IsNullOrWhiteSpace(_connectionString)) throw new InvalidOperationException("Connection string 'Default' is not configured.");
        return new SqlConnection(_connectionString);
    }

    private AuthPortal.Models.UserInfo? CurrentSession()
    {
        var token = Request.Headers.Authorization.ToString();
        if (token.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase)) token = token[7..].Trim();
        return string.IsNullOrWhiteSpace(token) ? null : _auth.GetSession(token);
    }

    [HttpGet("teachers")]
    public IActionResult GetTeachers()
    {
        try
        {
            using var conn = GetConnection(); conn.Open();
            using var cmd = new SqlCommand(@"
                SELECT t.TeacherID, t.FullName, t.Avatar, t.Biography, t.Qualification, t.IELTSBand,
                       t.ExperienceYears, t.Specialization, t.AverageRating, COUNT(DISTINCT m.MaterialID) AS ClassCount
                FROM Teacher t
                LEFT JOIN Material m ON m.TeacherID = t.TeacherID AND m.Status = 'Approved'
                WHERE t.Status = 'Active'
                GROUP BY t.TeacherID, t.FullName, t.Avatar, t.Biography, t.Qualification,
                         t.IELTSBand, t.ExperienceYears, t.Specialization, t.AverageRating
                ORDER BY t.FullName", conn);
            using var reader = cmd.ExecuteReader(); var items = new List<object>();
            while (reader.Read()) items.Add(new {
                teacherId = reader.GetGuid(0).ToString(), name = reader.GetString(1), avatar = reader.IsDBNull(2) ? null : reader.GetString(2),
                biography = reader.IsDBNull(3) ? null : reader.GetString(3), qualification = reader.IsDBNull(4) ? null : reader.GetString(4),
                ieltsBand = reader.IsDBNull(5) ? (double?)null : reader.GetDouble(5), experienceYears = reader.IsDBNull(6) ? (int?)null : reader.GetInt32(6),
                specialization = reader.IsDBNull(7) ? null : reader.GetString(7), rating = reader.IsDBNull(8) ? (double?)null : reader.GetDouble(8),
                classCount = reader.GetInt32(9)
            });
            return Ok(new { success = true, items });
        }
        catch (Exception ex) { return StatusCode(500, new { success = false, message = ex.Message }); }
    }

    [HttpGet("teachers/{teacherId:guid}")]
    public IActionResult GetTeacher(Guid teacherId)
    {
        try
        {
            using var conn = GetConnection(); conn.Open();
            using var teacherCmd = new SqlCommand(@"SELECT FullName, Avatar, Biography, Qualification, IELTSBand, ExperienceYears,
                Specialization, AverageRating, TotalStudents, Email FROM Teacher WHERE TeacherID = @Id AND Status = 'Active'", conn);
            teacherCmd.Parameters.Add(new SqlParameter("@Id", SqlDbType.UniqueIdentifier) { Value = teacherId });
            using var teacher = teacherCmd.ExecuteReader();
            if (!teacher.Read()) return NotFound(new { success = false, message = "Teacher not found." });
            var profile = new {
                teacherId = teacherId.ToString(), name = teacher.GetString(0), avatar = teacher.IsDBNull(1) ? null : teacher.GetString(1),
                biography = teacher.IsDBNull(2) ? null : teacher.GetString(2), qualification = teacher.IsDBNull(3) ? null : teacher.GetString(3),
                ieltsBand = teacher.IsDBNull(4) ? (double?)null : teacher.GetDouble(4), experienceYears = teacher.IsDBNull(5) ? (int?)null : teacher.GetInt32(5),
                specialization = teacher.IsDBNull(6) ? null : teacher.GetString(6), rating = teacher.IsDBNull(7) ? (double?)null : teacher.GetDouble(7),
                totalStudents = teacher.GetInt32(8), email = teacher.GetString(9)
            };
            teacher.Close();
            using var lessonCmd = new SqlCommand(@"SELECT m.MaterialID, m.Title, m.Description, m.Skill, m.Level, m.IsFree,
                m.Price, m.CreatedAt, m.QuizID, COUNT(q.QuestionID) AS QuestionCount
                FROM Material m LEFT JOIN Quiz quiz ON quiz.QuizID = m.QuizID
                LEFT JOIN Question q ON q.QuizID = quiz.QuizID
                WHERE m.TeacherID = @Id AND m.Status = 'Approved'
                GROUP BY m.MaterialID, m.Title, m.Description, m.Skill, m.Level, m.IsFree, m.Price, m.CreatedAt, m.QuizID
                ORDER BY m.CreatedAt DESC", conn);
            lessonCmd.Parameters.Add(new SqlParameter("@Id", SqlDbType.UniqueIdentifier) { Value = teacherId });
            using var reader = lessonCmd.ExecuteReader(); var lessons = new List<object>();
            while (reader.Read()) lessons.Add(new {
                materialId = reader.GetGuid(0).ToString(), title = reader.GetString(1), description = reader.IsDBNull(2) ? null : reader.GetString(2),
                skill = reader.IsDBNull(3) ? null : reader.GetString(3), level = reader.IsDBNull(4) ? null : reader.GetString(4),
                isFree = reader.GetBoolean(5), price = reader.GetDecimal(6), createdAt = reader.GetDateTime(7),
                quizId = reader.IsDBNull(8) ? null : reader.GetGuid(8).ToString(), questionCount = reader.GetInt32(9)
            });
            return Ok(new { success = true, teacher = profile, lessons });
        }
        catch (Exception ex) { return StatusCode(500, new { success = false, message = ex.Message }); }
    }

    [HttpPost("lessons/{materialId:guid}/enroll")]
    public IActionResult Enroll(Guid materialId)
    {
        var session = CurrentSession();
        if (session == null || !string.Equals(session.UserType, "User", StringComparison.OrdinalIgnoreCase))
            return Unauthorized(new { success = false, message = "Sign in as a learner to register for a lesson." });
        if (!Guid.TryParse(session.Id, out var userId)) return Unauthorized(new { success = false, message = "Your learner session is invalid." });
        try
        {
            using var conn = GetConnection(); conn.Open();
            using var cmd = new SqlCommand(@"
                IF NOT EXISTS (SELECT 1 FROM Material WHERE MaterialID = @MaterialID AND Status = 'Approved' AND QuizID IS NOT NULL)
                    SELECT 'Missing';
                ELSE IF EXISTS (SELECT 1 FROM Material WHERE MaterialID = @MaterialID AND IsFree = 0)
                    SELECT 'Paid';
                ELSE IF EXISTS (SELECT 1 FROM MaterialAccess WHERE MaterialID = @MaterialID AND UserID = @UserID)
                    SELECT 'Existing';
                ELSE
                BEGIN
                    INSERT INTO MaterialAccess (AccessID, MaterialID, UserID, PurchasedAt, ExpiresAt)
                    VALUES (NEWID(), @MaterialID, @UserID, GETDATE(), NULL);
                    SELECT 'Enrolled';
                END", conn);
            cmd.Parameters.Add(new SqlParameter("@MaterialID", SqlDbType.UniqueIdentifier) { Value = materialId });
            cmd.Parameters.Add(new SqlParameter("@UserID", SqlDbType.UniqueIdentifier) { Value = userId });
            var result = Convert.ToString(cmd.ExecuteScalar());
            if (result == "Missing") return NotFound(new { success = false, message = "This approved lesson is no longer available." });
            if (result == "Paid") return Conflict(new { success = false, requiresPayment = true, message = "This lesson is paid. Complete payment before registering." });
            return Ok(new { success = true, alreadyEnrolled = result == "Existing", message = result == "Existing" ? "You are already registered for this lesson." : "You are registered for this lesson." });
        }
        catch (Exception ex) { return StatusCode(500, new { success = false, message = ex.Message }); }
    }

}
