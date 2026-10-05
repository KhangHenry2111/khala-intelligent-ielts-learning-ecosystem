namespace AuthPortal.Controllers;

using System;
using System.Collections.Generic;
using System.Data;
using AuthPortal.Models;
using AuthPortal.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;

[ApiController]
[Route("api/[controller]")]
public class QuizController : ControllerBase
{
    private readonly string? _connectionString;
    private readonly IAuthService? _authService;

    public QuizController(IConfiguration config)
    {
        _connectionString = config.GetConnectionString("Default") ?? Environment.GetEnvironmentVariable("USER_DB_CONNECTION");
    }

    public QuizController(IConfiguration config, IAuthService authService) : this(config)
    {
        _authService = authService;
    }

    private SqlConnection GetConnection()
    {
        if (string.IsNullOrWhiteSpace(_connectionString))
        {
            throw new InvalidOperationException("Connection string 'Default' is not configured.");
        }
        return new SqlConnection(_connectionString);
    }

    private static object NormalizeQuestionDifficulty(string? level)
    {
        return level?.Trim() switch
        {
            "Beginner" => "Beginner",
            "Intermediate" => "Intermediate",
            "Advanced" => "Advanced",
            _ => DBNull.Value
        };
    }

    [HttpGet("catalog")]
    public IActionResult GetCatalog()
    {
        try
        {
            using var conn = GetConnection();
            conn.Open();

            var list = new List<object>();
            using var cmd = new SqlCommand("SELECT QuestionTypeID, Code, NameVI, NameEN, Category FROM QuestionTypeCatalog WHERE IsActive = 1 ORDER BY DisplayOrder", conn);
            using var reader = cmd.ExecuteReader();
            while (reader.Read())
            {
                list.Add(new
                {
                    Id = reader.GetInt32(0),
                    Code = reader.GetString(1),
                    NameVI = reader.IsDBNull(2) ? null : reader.GetString(2),
                    NameEN = reader.IsDBNull(3) ? null : reader.GetString(3),
                    Category = reader.IsDBNull(4) ? null : reader.GetString(4)
                });
            }

            return Ok(new { success = true, items = list });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { success = false, message = ex.Message });
        }
    }

    [HttpGet("user-tier")]
    public IActionResult GetUserTier([FromQuery] string? userId, [FromQuery] string? username)
    {
        try
        {
            using var conn = GetConnection();
            conn.Open();

            string sql = @"
                SELECT TOP 1 
                    u.UserID, u.Username, u.FullName, u.Rank, u.AIQuizUsedThisMonth,
                    p.PackageID, p.PackageName, p.AIQuizLimit, p.HasSpeakingAI, p.HasWritingAI, p.HasSpeakingTeacher, p.HasWritingTeacher
                FROM [User] u
                LEFT JOIN Package p ON u.PackageID = p.PackageID
                WHERE (@UserID IS NOT NULL AND u.UserID = @UserID)
                   OR (@Username IS NOT NULL AND u.Username = @Username)";

            using var cmd = new SqlCommand(sql, conn);
            cmd.Parameters.Add(new SqlParameter("@UserID", SqlDbType.UniqueIdentifier) { Value = Guid.TryParse(userId, out var g) ? (object)g : DBNull.Value });
            cmd.Parameters.Add(new SqlParameter("@Username", SqlDbType.NVarChar, 100) { Value = (object?)username ?? DBNull.Value });

            using var reader = cmd.ExecuteReader();
            if (reader.Read())
            {
                var pkgName = reader.IsDBNull(reader.GetOrdinal("PackageName")) ? "Đồng" : reader.GetString(reader.GetOrdinal("PackageName"));
                var quizLimit = reader.IsDBNull(reader.GetOrdinal("AIQuizLimit")) ? 8 : reader.GetInt32(reader.GetOrdinal("AIQuizLimit"));
                var quizUsed = reader.IsDBNull(reader.GetOrdinal("AIQuizUsedThisMonth")) ? 0 : reader.GetInt32(reader.GetOrdinal("AIQuizUsedThisMonth"));
                var hasSpeaking = !reader.IsDBNull(reader.GetOrdinal("HasSpeakingAI")) && reader.GetBoolean(reader.GetOrdinal("HasSpeakingAI"));
                var hasWriting = !reader.IsDBNull(reader.GetOrdinal("HasWritingAI")) && reader.GetBoolean(reader.GetOrdinal("HasWritingAI"));

                return Ok(new
                {
                    success = true,
                    userId = reader.GetGuid(reader.GetOrdinal("UserID")),
                    username = reader.GetString(reader.GetOrdinal("Username")),
                    packageName = pkgName,
                    tier = pkgName,
                    quizLimit,
                    quizUsed,
                    hasSpeaking,
                    hasWriting
                });
            }

            // Default fallback for anonymous/guest user
            return Ok(new
            {
                success = true,
                userId = (string?)null,
                username = "guest",
                packageName = "Gold",
                tier = "Gold",
                quizLimit = 250,
                quizUsed = 0,
                hasSpeaking = true,
                hasWriting = true
            });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { success = false, message = ex.Message });
        }
    }

    [HttpPost("save")]
    public IActionResult SaveQuiz([FromBody] SaveQuizRequest req)
    {
        if (req == null)
        {
            return BadRequest(new { success = false, message = "Empty payload" });
        }

        try
        {
            using var conn = GetConnection();
            conn.Open();

            var isTeacherQuiz = string.Equals(req.Source, "Teacher", StringComparison.OrdinalIgnoreCase);
            if (isTeacherQuiz)
            {
                var token = Request.Headers.Authorization.ToString();
                if (token.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase)) token = token[7..].Trim();
                var sessionUser = _authService?.GetSession(token);
                if (sessionUser == null || !string.Equals(sessionUser.UserType, "Teacher", StringComparison.OrdinalIgnoreCase))
                {
                    return Unauthorized(new SaveQuizResponse { Success = false, Message = "Sign in as a teacher before creating a quiz." });
                }

                if (!Guid.TryParse(req.CreatorId, out var teacherId) || !Guid.TryParse(sessionUser.Id, out var sessionTeacherId) || teacherId != sessionTeacherId)
                {
                    return Forbid();
                }

                using var teacherCmd = new SqlCommand("SELECT CASE WHEN EXISTS (SELECT 1 FROM Teacher WHERE TeacherID = @TeacherID AND Status = 'Active') THEN 1 ELSE 0 END", conn);
                teacherCmd.Parameters.Add(new SqlParameter("@TeacherID", SqlDbType.UniqueIdentifier) { Value = teacherId });
                if (Convert.ToInt32(teacherCmd.ExecuteScalar()) != 1)
                {
                    return BadRequest(new SaveQuizResponse { Success = false, Message = "The teacher account was not found or is inactive." });
                }
            }

            using var tx = conn.BeginTransaction();

            Guid quizId = Guid.NewGuid();
            Guid? passageId = null;
            Guid? audioId = null;
            Guid? materialId = null;
            int questionsCount = 0;

            // 1. Normalize fields according to Database CHECK constraints
            string normalizedSource = isTeacherQuiz ? "Teacher" : "AI";
            string normalizedLevel = "Intermediate";
            if (!string.IsNullOrWhiteSpace(req.Level))
            {
                var lLower = req.Level.ToLowerInvariant();
                if (lLower.Contains("adv") || lLower.Contains("7") || lLower.Contains("8") || lLower.Contains("9"))
                    normalizedLevel = "Advanced";
                else if (lLower.Contains("beg") || lLower.Contains("4") || lLower.Contains("5"))
                    normalizedLevel = "Beginner";
                else
                    normalizedLevel = "Intermediate";
            }

            string normalizedSkill = "Reading";
            if (!string.IsNullOrWhiteSpace(req.Skill))
            {
                var sLower = req.Skill.ToLowerInvariant();
                if (sLower == "listening")
                    normalizedSkill = "Listening";
                else if (sLower.Contains("writing") && !sLower.Contains("reading"))
                    normalizedSkill = "Writing";
                else if (sLower.Contains("all") || sLower.Contains("toàn") || sLower.Contains("speaking") || sLower.Contains("listening") || (sLower.Contains("reading") && sLower.Contains("writing")))
                    normalizedSkill = "Reading+Writing";
                else
                    normalizedSkill = "Reading";
            }

            if (isTeacherQuiz && normalizedSkill is not ("Reading" or "Listening"))
            {
                return BadRequest(new SaveQuizResponse { Success = false, Message = "Teacher lesson quizzes currently support Reading and Listening." });
            }

            // 2. If passage is provided, save ReadingPassage with ModerationStatus = 'Pending'
            if (req.Passage != null && !string.IsNullOrWhiteSpace(req.Passage.Content))
            {
                passageId = Guid.NewGuid();
                string insertPassageSql = @"
                    INSERT INTO ReadingPassage (
                        PassageID, Title, Content, WordCount, Topic, Level, Source, CreatedBy,
                        CreatedByType, ModerationStatus, CreatedAt, UpdatedAt
                    ) VALUES (
                        @PassageID, @Title, @Content, @WordCount, @Topic, @Level, @Source, @CreatedBy,
                        @CreatedByType, @ModerationStatus, @CreatedAt, @UpdatedAt
                    )";

                using var cmdPassage = new SqlCommand(insertPassageSql, conn, tx);
                cmdPassage.Parameters.Add(new SqlParameter("@PassageID", SqlDbType.UniqueIdentifier) { Value = passageId.Value });
                cmdPassage.Parameters.Add(new SqlParameter("@Title", SqlDbType.NVarChar, 255) { Value = string.IsNullOrWhiteSpace(req.Passage.Title) ? req.Title : req.Passage.Title });
                cmdPassage.Parameters.Add(new SqlParameter("@Content", SqlDbType.NVarChar, -1) { Value = req.Passage.Content });
                cmdPassage.Parameters.Add(new SqlParameter("@WordCount", SqlDbType.Int) { Value = (object?)req.Passage.WordCount ?? req.Passage.Content.Split(new[] { ' ', '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries).Length });
                cmdPassage.Parameters.Add(new SqlParameter("@Topic", SqlDbType.NVarChar, 100) { Value = (object?)req.Passage.Topic ?? "General" });
                cmdPassage.Parameters.Add(new SqlParameter("@Level", SqlDbType.NVarChar, 20) { Value = normalizedLevel });
                cmdPassage.Parameters.Add(new SqlParameter("@Source", SqlDbType.NVarChar, 20) { Value = normalizedSource });
                cmdPassage.Parameters.Add(new SqlParameter("@CreatedBy", SqlDbType.UniqueIdentifier) { Value = isTeacherQuiz && Guid.TryParse(req.CreatorId, out var passageCreatorId) ? (object)passageCreatorId : DBNull.Value });
                cmdPassage.Parameters.Add(new SqlParameter("@CreatedByType", SqlDbType.NVarChar, 20) { Value = isTeacherQuiz ? "Teacher" : "AI" });
                cmdPassage.Parameters.Add(new SqlParameter("@ModerationStatus", SqlDbType.NVarChar, 20) { Value = "Pending" });
                cmdPassage.Parameters.Add(new SqlParameter("@CreatedAt", SqlDbType.DateTime) { Value = DateTime.UtcNow });
                cmdPassage.Parameters.Add(new SqlParameter("@UpdatedAt", SqlDbType.DateTime) { Value = DateTime.UtcNow });

                cmdPassage.ExecuteNonQuery();
            }

            if (normalizedSkill == "Listening" && req.Audio != null && !string.IsNullOrWhiteSpace(req.Audio.AudioURL))
            {
                audioId = Guid.NewGuid();
                var insertAudioSql = @"
                    INSERT INTO ListeningAudio (
                        AudioID, Title, AudioURL, Transcript, Topic, Level, Source, CreatedBy,
                        CreatedByType, ModerationStatus, CreatedAt, UpdatedAt
                    ) VALUES (
                        @AudioID, @Title, @AudioURL, @Transcript, @Topic, @Level, @Source, @CreatedBy,
                        @CreatedByType, @ModerationStatus, @CreatedAt, @UpdatedAt
                    )";
                using var cmdAudio = new SqlCommand(insertAudioSql, conn, tx);
                cmdAudio.Parameters.Add(new SqlParameter("@AudioID", SqlDbType.UniqueIdentifier) { Value = audioId.Value });
                cmdAudio.Parameters.Add(new SqlParameter("@Title", SqlDbType.NVarChar, 255) { Value = string.IsNullOrWhiteSpace(req.Title) ? "Listening lesson" : req.Title });
                cmdAudio.Parameters.Add(new SqlParameter("@AudioURL", SqlDbType.NVarChar, 500) { Value = req.Audio.AudioURL.Trim() });
                cmdAudio.Parameters.Add(new SqlParameter("@Transcript", SqlDbType.NVarChar, -1) { Value = (object?)req.Audio.Transcript ?? DBNull.Value });
                cmdAudio.Parameters.Add(new SqlParameter("@Topic", SqlDbType.NVarChar, 100) { Value = (object?)req.Audio.Topic ?? "General" });
                cmdAudio.Parameters.Add(new SqlParameter("@Level", SqlDbType.NVarChar, 20) { Value = normalizedLevel });
                cmdAudio.Parameters.Add(new SqlParameter("@Source", SqlDbType.NVarChar, 20) { Value = normalizedSource });
                cmdAudio.Parameters.Add(new SqlParameter("@CreatedBy", SqlDbType.UniqueIdentifier) { Value = isTeacherQuiz && Guid.TryParse(req.CreatorId, out var audioCreatorId) ? (object)audioCreatorId : DBNull.Value });
                cmdAudio.Parameters.Add(new SqlParameter("@CreatedByType", SqlDbType.NVarChar, 20) { Value = isTeacherQuiz ? "Teacher" : "AI" });
                cmdAudio.Parameters.Add(new SqlParameter("@ModerationStatus", SqlDbType.NVarChar, 20) { Value = "Pending" });
                cmdAudio.Parameters.Add(new SqlParameter("@CreatedAt", SqlDbType.DateTime) { Value = DateTime.UtcNow });
                cmdAudio.Parameters.Add(new SqlParameter("@UpdatedAt", SqlDbType.DateTime) { Value = DateTime.UtcNow });
                cmdAudio.ExecuteNonQuery();
            }
            else if (isTeacherQuiz && normalizedSkill == "Listening")
            {
                return BadRequest(new SaveQuizResponse { Success = false, Message = "Add an audio URL for a Listening lesson." });
            }

            // 3. Insert Quiz with Status = 'Draft'
            string insertQuizSql = @"
                INSERT INTO Quiz (
                    QuizID, Title, Skill, Level, Source, CreatorID, Status, CreatedAt, PassageID, AudioID
                ) VALUES (
                    @QuizID, @Title, @Skill, @Level, @Source, @CreatorID, @Status, @CreatedAt, @PassageID, @AudioID
                )";

            using (var cmdQuiz = new SqlCommand(insertQuizSql, conn, tx))
            {
                cmdQuiz.Parameters.Add(new SqlParameter("@QuizID", SqlDbType.UniqueIdentifier) { Value = quizId });
                cmdQuiz.Parameters.Add(new SqlParameter("@Title", SqlDbType.NVarChar, 255) { Value = string.IsNullOrWhiteSpace(req.Title) ? "AI Generated Quiz" : req.Title });
                cmdQuiz.Parameters.Add(new SqlParameter("@Skill", SqlDbType.NVarChar, 30) { Value = normalizedSkill });
                cmdQuiz.Parameters.Add(new SqlParameter("@Level", SqlDbType.NVarChar, 20) { Value = normalizedLevel });
                cmdQuiz.Parameters.Add(new SqlParameter("@Source", SqlDbType.NVarChar, 20) { Value = normalizedSource });
                cmdQuiz.Parameters.Add(new SqlParameter("@CreatorID", SqlDbType.UniqueIdentifier) { Value = Guid.TryParse(req.CreatorId, out var cid) ? (object)cid : DBNull.Value });
                cmdQuiz.Parameters.Add(new SqlParameter("@Status", SqlDbType.NVarChar, 20) { Value = "Draft" });
                cmdQuiz.Parameters.Add(new SqlParameter("@CreatedAt", SqlDbType.DateTime) { Value = DateTime.UtcNow });
                cmdQuiz.Parameters.Add(new SqlParameter("@PassageID", SqlDbType.UniqueIdentifier) { Value = passageId.HasValue ? (object)passageId.Value : DBNull.Value });
                cmdQuiz.Parameters.Add(new SqlParameter("@AudioID", SqlDbType.UniqueIdentifier) { Value = audioId.HasValue ? (object)audioId.Value : DBNull.Value });

                cmdQuiz.ExecuteNonQuery();
            }

            // Helper to resolve QuestionTypeID
            int ResolveTypeId(string? code, int? explicitId)
            {
                if (explicitId.HasValue && explicitId.Value > 0) return explicitId.Value;
                if (!string.IsNullOrWhiteSpace(code))
                {
                    using var typeCmd = new SqlCommand("SELECT TOP 1 QuestionTypeID FROM QuestionTypeCatalog WHERE Code = @Code", conn, tx);
                    typeCmd.Parameters.Add(new SqlParameter("@Code", SqlDbType.NVarChar, 50) { Value = code.Trim() });
                    var result = typeCmd.ExecuteScalar();
                    if (result != null && result != DBNull.Value)
                    {
                        return Convert.ToInt32(result);
                    }
                    if (isTeacherQuiz)
                    {
                        throw new InvalidOperationException($"Question format '{code}' is missing from QuestionTypeCatalog. Run scripts/teacher_quiz_question_types.sql against the IELTS database.");
                    }
                }
                return 1; // Default to MULTIPLE_CHOICE_SINGLE
            }

            // 4. Insert QuestionGroups and nested Questions
            if (req.QuestionGroups != null && req.QuestionGroups.Count > 0)
            {
                foreach (var group in req.QuestionGroups)
                {
                    Guid groupId = Guid.NewGuid();
                    int resolvedGroupId = ResolveTypeId(group.QuestionTypeCode, group.QuestionTypeID);

                    string insertGroupSql = @"
                        INSERT INTO QuestionGroup (
                            GroupID, QuizID, QuestionTypeID, Instruction, SharedOptions, WordLimit, OrderIndex, CreatedAt
                        ) VALUES (
                            @GroupID, @QuizID, @QuestionTypeID, @Instruction, @SharedOptions, @WordLimit, @OrderIndex, @CreatedAt
                        )";

                    using (var cmdGroup = new SqlCommand(insertGroupSql, conn, tx))
                    {
                        cmdGroup.Parameters.Add(new SqlParameter("@GroupID", SqlDbType.UniqueIdentifier) { Value = groupId });
                        cmdGroup.Parameters.Add(new SqlParameter("@QuizID", SqlDbType.UniqueIdentifier) { Value = quizId });
                        cmdGroup.Parameters.Add(new SqlParameter("@QuestionTypeID", SqlDbType.Int) { Value = resolvedGroupId });
                        cmdGroup.Parameters.Add(new SqlParameter("@Instruction", SqlDbType.NVarChar, 500) { Value = (object?)group.Instruction ?? DBNull.Value });
                        cmdGroup.Parameters.Add(new SqlParameter("@SharedOptions", SqlDbType.NVarChar, -1) { Value = (object?)group.SharedOptions ?? DBNull.Value });
                        cmdGroup.Parameters.Add(new SqlParameter("@WordLimit", SqlDbType.NVarChar, 50) { Value = (object?)group.WordLimit ?? DBNull.Value });
                        cmdGroup.Parameters.Add(new SqlParameter("@OrderIndex", SqlDbType.Int) { Value = group.OrderIndex });
                        cmdGroup.Parameters.Add(new SqlParameter("@CreatedAt", SqlDbType.DateTime) { Value = DateTime.UtcNow });

                        cmdGroup.ExecuteNonQuery();
                    }

                    if (group.Questions != null)
                    {
                        foreach (var q in group.Questions)
                        {
                            questionsCount++;
                            int qTypeId = ResolveTypeId(q.QuestionTypeCode ?? group.QuestionTypeCode, q.QuestionTypeID ?? resolvedGroupId);
                            string insertQSql = @"
                                INSERT INTO Question (
                                    QuestionID, QuizID, QuestionType, Content, Options, 
                                    CorrectAnswer, Explanation, Difficulty, OrderIndex, GroupID, QuestionTypeID
                                ) VALUES (
                                    @QuestionID, @QuizID, @QuestionType, @Content, @Options, 
                                    @CorrectAnswer, @Explanation, @Difficulty, @OrderIndex, @GroupID, @QuestionTypeID
                                )";

                            using var cmdQ = new SqlCommand(insertQSql, conn, tx);
                            cmdQ.Parameters.Add(new SqlParameter("@QuestionID", SqlDbType.UniqueIdentifier) { Value = Guid.NewGuid() });
                            cmdQ.Parameters.Add(new SqlParameter("@QuizID", SqlDbType.UniqueIdentifier) { Value = quizId });
                            cmdQ.Parameters.Add(new SqlParameter("@QuestionType", SqlDbType.NVarChar, 30) { Value = q.QuestionType ?? "MULTIPLE_CHOICE_SINGLE" });
                            cmdQ.Parameters.Add(new SqlParameter("@Content", SqlDbType.NVarChar, -1) { Value = q.Content ?? string.Empty });
                            cmdQ.Parameters.Add(new SqlParameter("@Options", SqlDbType.NVarChar, -1) { Value = (object?)q.Options ?? DBNull.Value });
                            cmdQ.Parameters.Add(new SqlParameter("@CorrectAnswer", SqlDbType.NVarChar, 500) { Value = (object?)q.CorrectAnswer ?? DBNull.Value });
                            cmdQ.Parameters.Add(new SqlParameter("@Explanation", SqlDbType.NVarChar, -1) { Value = (object?)q.Explanation ?? DBNull.Value });
                            cmdQ.Parameters.Add(new SqlParameter("@Difficulty", SqlDbType.NVarChar, 20) { Value = NormalizeQuestionDifficulty(q.Difficulty) });
                            cmdQ.Parameters.Add(new SqlParameter("@OrderIndex", SqlDbType.Int) { Value = q.OrderIndex > 0 ? q.OrderIndex : questionsCount });
                            cmdQ.Parameters.Add(new SqlParameter("@GroupID", SqlDbType.UniqueIdentifier) { Value = groupId });
                            cmdQ.Parameters.Add(new SqlParameter("@QuestionTypeID", SqlDbType.Int) { Value = qTypeId });

                            cmdQ.ExecuteNonQuery();
                        }
                    }
                }
            }

            // 5. Insert DirectQuestions if any
            if (req.DirectQuestions != null && req.DirectQuestions.Count > 0)
            {
                foreach (var q in req.DirectQuestions)
                {
                    questionsCount++;
                    int qTypeId = ResolveTypeId(q.QuestionTypeCode, q.QuestionTypeID);
                    string insertQSql = @"
                                INSERT INTO Question (
                                    QuestionID, QuizID, QuestionType, Content, Options, 
                                    CorrectAnswer, Explanation, Difficulty, OrderIndex, GroupID, QuestionTypeID
                                ) VALUES (
                                    @QuestionID, @QuizID, @QuestionType, @Content, @Options, 
                                    @CorrectAnswer, @Explanation, @Difficulty, @OrderIndex, NULL, @QuestionTypeID
                                )";

                    using var cmdQ = new SqlCommand(insertQSql, conn, tx);
                    cmdQ.Parameters.Add(new SqlParameter("@QuestionID", SqlDbType.UniqueIdentifier) { Value = Guid.NewGuid() });
                    cmdQ.Parameters.Add(new SqlParameter("@QuizID", SqlDbType.UniqueIdentifier) { Value = quizId });
                    cmdQ.Parameters.Add(new SqlParameter("@QuestionType", SqlDbType.NVarChar, 30) { Value = q.QuestionType ?? "MULTIPLE_CHOICE_SINGLE" });
                    cmdQ.Parameters.Add(new SqlParameter("@Content", SqlDbType.NVarChar, -1) { Value = q.Content ?? string.Empty });
                    cmdQ.Parameters.Add(new SqlParameter("@Options", SqlDbType.NVarChar, -1) { Value = (object?)q.Options ?? DBNull.Value });
                    cmdQ.Parameters.Add(new SqlParameter("@CorrectAnswer", SqlDbType.NVarChar, 500) { Value = (object?)q.CorrectAnswer ?? DBNull.Value });
                    cmdQ.Parameters.Add(new SqlParameter("@Explanation", SqlDbType.NVarChar, -1) { Value = (object?)q.Explanation ?? DBNull.Value });
                    cmdQ.Parameters.Add(new SqlParameter("@Difficulty", SqlDbType.NVarChar, 20) { Value = NormalizeQuestionDifficulty(q.Difficulty) });
                    cmdQ.Parameters.Add(new SqlParameter("@OrderIndex", SqlDbType.Int) { Value = q.OrderIndex > 0 ? q.OrderIndex : questionsCount });
                    cmdQ.Parameters.Add(new SqlParameter("@QuestionTypeID", SqlDbType.Int) { Value = qTypeId });

                    cmdQ.ExecuteNonQuery();
                }
            }

            if (isTeacherQuiz)
            {
                if (questionsCount == 0)
                {
                    return BadRequest(new SaveQuizResponse { Success = false, Message = "Add at least one question before uploading the lesson." });
                }
                if (req.Price < 0)
                {
                    return BadRequest(new SaveQuizResponse { Success = false, Message = "Lesson price cannot be negative." });
                }

                materialId = Guid.NewGuid();
                const string insertMaterialSql = @"
                    INSERT INTO Material (
                        MaterialID, TeacherID, Title, Description, Skill, Level, FileURL, FileType,
                        IsFree, Price, DownloadCount, Status, CreatedAt, QuizID
                    ) VALUES (
                        @MaterialID, @TeacherID, @Title, @Description, @Skill, @Level, @FileURL, @FileType,
                        @IsFree, @Price, 0, 'Pending', @CreatedAt, @QuizID
                    )";
                using var cmdMaterial = new SqlCommand(insertMaterialSql, conn, tx);
                cmdMaterial.Parameters.Add(new SqlParameter("@MaterialID", SqlDbType.UniqueIdentifier) { Value = materialId.Value });
                cmdMaterial.Parameters.Add(new SqlParameter("@TeacherID", SqlDbType.UniqueIdentifier) { Value = Guid.Parse(req.CreatorId!) });
                cmdMaterial.Parameters.Add(new SqlParameter("@Title", SqlDbType.NVarChar, 255) { Value = string.IsNullOrWhiteSpace(req.Title) ? "IELTS lesson quiz" : req.Title.Trim() });
                cmdMaterial.Parameters.Add(new SqlParameter("@Description", SqlDbType.NVarChar, -1) { Value = (object?)req.Description ?? DBNull.Value });
                cmdMaterial.Parameters.Add(new SqlParameter("@Skill", SqlDbType.NVarChar, 30) { Value = normalizedSkill });
                cmdMaterial.Parameters.Add(new SqlParameter("@Level", SqlDbType.NVarChar, 20) { Value = normalizedLevel });
                cmdMaterial.Parameters.Add(new SqlParameter("@FileURL", SqlDbType.NVarChar, 500) { Value = DBNull.Value });
                cmdMaterial.Parameters.Add(new SqlParameter("@FileType", SqlDbType.NVarChar, 20) { Value = "Quiz" });
                cmdMaterial.Parameters.Add(new SqlParameter("@IsFree", SqlDbType.Bit) { Value = req.IsFree });
                cmdMaterial.Parameters.Add(new SqlParameter("@Price", SqlDbType.Decimal) { Precision = 12, Scale = 2, Value = req.IsFree ? 0m : req.Price });
                cmdMaterial.Parameters.Add(new SqlParameter("@CreatedAt", SqlDbType.DateTime) { Value = DateTime.UtcNow });
                cmdMaterial.Parameters.Add(new SqlParameter("@QuizID", SqlDbType.UniqueIdentifier) { Value = quizId });
                cmdMaterial.ExecuteNonQuery();
            }

            tx.Commit();

            return Ok(new SaveQuizResponse
            {
                Success = true,
                Message = "Quiz successfully saved with unmoderated status (Draft / Pending).",
                QuizId = quizId.ToString(),
                PassageId = passageId?.ToString(),
                QuestionsCount = questionsCount,
                MaterialId = materialId?.ToString()
            });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new SaveQuizResponse
            {
                Success = false,
                Message = $"Failed to save quiz: {ex.Message}"
            });
        }
    }

    [HttpGet("teacher-lessons")]
    public IActionResult GetTeacherLessons()
    {
        var token = Request.Headers.Authorization.ToString();
        if (token.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase)) token = token[7..].Trim();
        var sessionUser = _authService?.GetSession(token);
        if (sessionUser == null || !string.Equals(sessionUser.UserType, "Teacher", StringComparison.OrdinalIgnoreCase)
            || !Guid.TryParse(sessionUser.Id, out var teacherId))
        {
            return Unauthorized(new { success = false, message = "Sign in as a teacher to view uploaded lessons." });
        }

        try
        {
            using var conn = GetConnection();
            conn.Open();
            const string sql = @"
                SELECT m.MaterialID, m.Title, m.Description, m.Skill, m.Level, m.IsFree, m.Price, m.Status, m.CreatedAt,
                       COUNT(q.QuestionID) AS QuestionCount
                FROM Material m
                LEFT JOIN Quiz quiz ON quiz.QuizID = m.QuizID
                LEFT JOIN Question q ON q.QuizID = quiz.QuizID
                WHERE m.TeacherID = @TeacherID AND m.QuizID IS NOT NULL
                GROUP BY m.MaterialID, m.Title, m.Description, m.Skill, m.Level, m.IsFree, m.Price, m.Status, m.CreatedAt
                ORDER BY m.CreatedAt DESC";
            using var cmd = new SqlCommand(sql, conn);
            cmd.Parameters.Add(new SqlParameter("@TeacherID", SqlDbType.UniqueIdentifier) { Value = teacherId });
            using var reader = cmd.ExecuteReader();
            var items = new List<object>();
            while (reader.Read())
            {
                items.Add(new
                {
                    materialId = reader.GetGuid(0).ToString(),
                    title = reader.GetString(1),
                    description = reader.IsDBNull(2) ? null : reader.GetString(2),
                    skill = reader.IsDBNull(3) ? null : reader.GetString(3),
                    level = reader.IsDBNull(4) ? null : reader.GetString(4),
                    isFree = reader.GetBoolean(5),
                    price = reader.GetDecimal(6),
                    status = reader.GetString(7),
                    createdAt = reader.GetDateTime(8),
                    questionCount = reader.GetInt32(9)
                });
            }
            return Ok(new { success = true, items });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { success = false, message = ex.Message });
        }
    }

    [HttpGet("moderation-queue")]
    public IActionResult GetModerationQueue()
    {
        try
        {
            using var conn = GetConnection();
            conn.Open();

            var queue = new List<QuizModerationItem>();
            string sql = @"
                SELECT q.QuizID, q.Title, q.Skill, q.Level, q.Source, q.Status, q.CreatedAt,
                       rp.PassageID, rp.Title AS PassageTitle, rp.Topic, rp.WordCount, rp.Content AS PassageContent, rp.ModerationStatus,
                       ISNULL(qc.QuestionCount, 0) AS QuestionCount
                FROM Quiz q
                LEFT JOIN ReadingPassage rp ON rp.PassageID = q.PassageID
                LEFT JOIN (
                    SELECT QuizID, COUNT(*) AS QuestionCount
                    FROM Question
                    GROUP BY QuizID
                ) qc ON qc.QuizID = q.QuizID
                WHERE q.Source = 'AI'
                  AND q.Skill IN ('Reading', 'Reading+Writing')
                  AND (
                        q.Status IN ('Draft', 'PendingReview')
                        OR rp.ModerationStatus IN ('Pending', 'Rejected')
                      )
                ORDER BY q.CreatedAt DESC";

            using var cmd = new SqlCommand(sql, conn);
            using var reader = cmd.ExecuteReader();
            while (reader.Read())
            {
                queue.Add(new QuizModerationItem
                {
                    QuizId = reader.GetGuid(reader.GetOrdinal("QuizID")).ToString(),
                    Title = reader.IsDBNull(reader.GetOrdinal("Title")) ? "AI Generated Quiz" : reader.GetString(reader.GetOrdinal("Title")),
                    Skill = reader.IsDBNull(reader.GetOrdinal("Skill")) ? "Reading" : reader.GetString(reader.GetOrdinal("Skill")),
                    Level = reader.IsDBNull(reader.GetOrdinal("Level")) ? "Intermediate" : reader.GetString(reader.GetOrdinal("Level")),
                    Source = reader.IsDBNull(reader.GetOrdinal("Source")) ? "AI" : reader.GetString(reader.GetOrdinal("Source")),
                    Status = reader.IsDBNull(reader.GetOrdinal("Status")) ? "PendingReview" : reader.GetString(reader.GetOrdinal("Status")),
                    PassageId = reader.IsDBNull(reader.GetOrdinal("PassageID")) ? null : reader.GetGuid(reader.GetOrdinal("PassageID")).ToString(),
                    PassageTitle = reader.IsDBNull(reader.GetOrdinal("PassageTitle")) ? null : reader.GetString(reader.GetOrdinal("PassageTitle")),
                    Topic = reader.IsDBNull(reader.GetOrdinal("Topic")) ? null : reader.GetString(reader.GetOrdinal("Topic")),
                    WordCount = reader.IsDBNull(reader.GetOrdinal("WordCount")) ? null : reader.GetInt32(reader.GetOrdinal("WordCount")),
                    PassageContent = reader.IsDBNull(reader.GetOrdinal("PassageContent")) ? null : reader.GetString(reader.GetOrdinal("PassageContent")),
                    QuestionCount = reader.IsDBNull(reader.GetOrdinal("QuestionCount")) ? 0 : reader.GetInt32(reader.GetOrdinal("QuestionCount")),
                    ModerationStatus = reader.IsDBNull(reader.GetOrdinal("ModerationStatus")) ? null : reader.GetString(reader.GetOrdinal("ModerationStatus")),
                    CreatedAt = reader.GetDateTime(reader.GetOrdinal("CreatedAt"))
                });
            }

            return Ok(new { success = true, items = queue });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { success = false, message = ex.Message });
        }
    }

    [HttpPost("moderation-decision")]
    public IActionResult UpdateModerationDecision([FromBody] ModerationDecisionRequest? req)
    {
        if (req == null)
        {
            return BadRequest(new { success = false, message = "Review payload is required." });
        }

        if (string.IsNullOrWhiteSpace(req.QuizId) || !Guid.TryParse(req.QuizId, out var quizId))
        {
            return BadRequest(new { success = false, message = "A valid quiz id is required." });
        }

        var normalizedDecision = req.Status?.Trim();
        var allowedStatuses = new[] { "Approved", "PendingReview", "Rejected", "Pending" };
        if (string.IsNullOrWhiteSpace(normalizedDecision) || !allowedStatuses.Contains(normalizedDecision, StringComparer.OrdinalIgnoreCase))
        {
            return BadRequest(new { success = false, message = "Decision must be Approved, PendingReview, Pending, or Rejected." });
        }

        var decisionStatus = normalizedDecision.Equals("Pending", StringComparison.OrdinalIgnoreCase) ? "PendingReview" : normalizedDecision;
        var passageStatus = decisionStatus.Equals("PendingReview", StringComparison.OrdinalIgnoreCase) ? "Pending" : decisionStatus;

        try
        {
            using var conn = GetConnection();
            conn.Open();

            string selectQuiz = "SELECT PassageID FROM Quiz WHERE QuizID = @QuizId";
            using (var cmd = new SqlCommand(selectQuiz, conn))
            {
                cmd.Parameters.Add(new SqlParameter("@QuizId", SqlDbType.UniqueIdentifier) { Value = quizId });
                var passageIdObj = cmd.ExecuteScalar();
                if (passageIdObj == null || passageIdObj == DBNull.Value)
                {
                    return NotFound(new { success = false, message = "Quiz not found." });
                }

                var passageIdString = passageIdObj?.ToString();
                if (string.IsNullOrWhiteSpace(passageIdString) || !Guid.TryParse(passageIdString, out var parsedPassageId))
                {
                    return BadRequest(new { success = false, message = "Quiz passage id is invalid." });
                }

                var passageId = parsedPassageId;
                var teacherId = Guid.TryParse(req.TeacherId, out var teacherGuid) ? teacherGuid : (Guid?)null;

                using var tx = conn.BeginTransaction();

                using (var updateQuiz = new SqlCommand(@"
                    UPDATE Quiz
                    SET Status = @Status,
                        ApprovedBy = @ApprovedBy,
                        ApprovedAt = @ApprovedAt
                    WHERE QuizID = @QuizId", conn, tx))
                {
                    updateQuiz.Parameters.Add(new SqlParameter("@Status", SqlDbType.NVarChar, 20) { Value = decisionStatus });
                    updateQuiz.Parameters.Add(new SqlParameter("@ApprovedBy", SqlDbType.UniqueIdentifier) { Value = teacherId.HasValue ? (object)teacherId.Value : DBNull.Value });
                    updateQuiz.Parameters.Add(new SqlParameter("@ApprovedAt", SqlDbType.DateTime) { Value = DateTime.UtcNow });
                    updateQuiz.Parameters.Add(new SqlParameter("@QuizId", SqlDbType.UniqueIdentifier) { Value = quizId });
                    updateQuiz.ExecuteNonQuery();
                }

                using (var updatePassage = new SqlCommand(@"
                    UPDATE ReadingPassage
                    SET ModerationStatus = @ModerationStatus,
                        ModeratedBy = @ModeratedBy,
                        ModeratedByType = @ModeratedByType,
                        ModeratedAt = @ModeratedAt,
                        RejectionReason = @RejectionReason,
                        UpdatedAt = @UpdatedAt
                    WHERE PassageID = @PassageId", conn, tx))
                {
                    updatePassage.Parameters.Add(new SqlParameter("@ModerationStatus", SqlDbType.NVarChar, 20) { Value = passageStatus });
                    updatePassage.Parameters.Add(new SqlParameter("@ModeratedBy", SqlDbType.UniqueIdentifier) { Value = teacherId.HasValue ? (object)teacherId.Value : DBNull.Value });
                    updatePassage.Parameters.Add(new SqlParameter("@ModeratedByType", SqlDbType.NVarChar, 20) { Value = teacherId.HasValue ? "Teacher" : DBNull.Value });
                    updatePassage.Parameters.Add(new SqlParameter("@ModeratedAt", SqlDbType.DateTime) { Value = DateTime.UtcNow });
                    updatePassage.Parameters.Add(new SqlParameter("@RejectionReason", SqlDbType.NVarChar, 500) { Value = string.IsNullOrWhiteSpace(req.RejectionReason) ? DBNull.Value : (object)req.RejectionReason.Trim() });
                    updatePassage.Parameters.Add(new SqlParameter("@UpdatedAt", SqlDbType.DateTime) { Value = DateTime.UtcNow });
                    updatePassage.Parameters.Add(new SqlParameter("@PassageId", SqlDbType.UniqueIdentifier) { Value = passageId });
                    updatePassage.ExecuteNonQuery();
                }

                tx.Commit();
            }

            return Ok(new
            {
                success = true,
                message = $"Quiz review saved as {decisionStatus}.",
                quizId = req.QuizId,
                status = decisionStatus
            });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { success = false, message = ex.Message });
        }
    }

    [HttpPost("knowledge")]
    public IActionResult SaveKnowledgeDocument([FromBody] SaveKnowledgeRequest req)
    {
        if (req == null || string.IsNullOrWhiteSpace(req.Title))
        {
            return BadRequest(new { success = false, message = "Title is required for knowledge document" });
        }

        try
        {
            using var conn = GetConnection();
            conn.Open();

            Guid docId = Guid.NewGuid();
            Guid? uploadedBy = null;
            if (!string.IsNullOrWhiteSpace(req.UploadedBy) && Guid.TryParse(req.UploadedBy, out var parsedUploadedBy))
            {
                using var teacherCheck = new SqlCommand(
                    "SELECT CASE WHEN EXISTS (SELECT 1 FROM dbo.Teacher WHERE TeacherID = @TeacherId) THEN 1 ELSE 0 END",
                    conn);
                teacherCheck.Parameters.Add(new SqlParameter("@TeacherId", SqlDbType.UniqueIdentifier) { Value = parsedUploadedBy });
                var teacherExists = Convert.ToInt32(teacherCheck.ExecuteScalar()) == 1;
                if (teacherExists)
                {
                    uploadedBy = parsedUploadedBy;
                }
            }

            var sourceValue = string.IsNullOrWhiteSpace(req.Source) ? "System" : req.Source;
            if (sourceValue != "System" && sourceValue != "Teacher")
            {
                sourceValue = "System";
            }

            string sql = @"
                INSERT INTO KnowledgeDocument (
                    DocID, Title, Category, Content, FileURL, Source, UploadedBy, CreatedAt
                ) VALUES (
                    @DocID, @Title, @Category, @Content, @FileURL, @Source, @UploadedBy, @CreatedAt
                )";

            using var cmd = new SqlCommand(sql, conn);
            cmd.Parameters.Add(new SqlParameter("@DocID", SqlDbType.UniqueIdentifier) { Value = docId });
            cmd.Parameters.Add(new SqlParameter("@Title", SqlDbType.NVarChar, 255) { Value = req.Title });
            cmd.Parameters.Add(new SqlParameter("@Category", SqlDbType.NVarChar, 100) { Value = (object?)req.Category ?? "AI_Export" });
            cmd.Parameters.Add(new SqlParameter("@Content", SqlDbType.NVarChar, -1) { Value = (object?)req.Content ?? DBNull.Value });
            cmd.Parameters.Add(new SqlParameter("@FileURL", SqlDbType.NVarChar, 500) { Value = (object?)req.FileURL ?? DBNull.Value });
            cmd.Parameters.Add(new SqlParameter("@Source", SqlDbType.NVarChar, 20) { Value = sourceValue });
            cmd.Parameters.Add(new SqlParameter("@UploadedBy", SqlDbType.UniqueIdentifier) { Value = uploadedBy.HasValue ? (object)uploadedBy.Value : DBNull.Value });
            cmd.Parameters.Add(new SqlParameter("@CreatedAt", SqlDbType.DateTime) { Value = DateTime.UtcNow });

            cmd.ExecuteNonQuery();

            return Ok(new
            {
                success = true,
                message = "Knowledge document saved successfully.",
                docId = docId.ToString()
            });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { success = false, message = ex.Message });
        }
    }

    [HttpPut("edit/{id}")]
    public IActionResult EditQuiz(string id, [FromBody] EditQuizRequest req)
    {
        if (string.IsNullOrWhiteSpace(id) || !Guid.TryParse(id, out var quizId))
        {
            return BadRequest(new { success = false, message = "A valid quiz id is required." });
        }

        if (req == null)
        {
            return BadRequest(new { success = false, message = "Edit payload is required." });
        }

        try
        {
            using var conn = GetConnection();
            conn.Open();
            using var tx = conn.BeginTransaction();

            // Check if quiz exists and get PassageID
            string selectQuiz = "SELECT PassageID FROM Quiz WHERE QuizID = @QuizId";
            object? passageIdObj;
            using (var cmd = new SqlCommand(selectQuiz, conn, tx))
            {
                cmd.Parameters.Add(new SqlParameter("@QuizId", SqlDbType.UniqueIdentifier) { Value = quizId });
                passageIdObj = cmd.ExecuteScalar();
            }

            if (passageIdObj == null)
            {
                return NotFound(new { success = false, message = "Quiz not found." });
            }

            // Update Quiz
            string updateQuiz = @"
                UPDATE Quiz 
                SET Title = COALESCE(@Title, Title),
                    Level = COALESCE(@Level, Level)
                WHERE QuizID = @QuizId";
            using (var cmd = new SqlCommand(updateQuiz, conn, tx))
            {
                cmd.Parameters.Add(new SqlParameter("@Title", SqlDbType.NVarChar, 255) { Value = (object?)req.Title ?? DBNull.Value });
                cmd.Parameters.Add(new SqlParameter("@Level", SqlDbType.NVarChar, 20) { Value = (object?)req.Level ?? DBNull.Value });
                cmd.Parameters.Add(new SqlParameter("@QuizId", SqlDbType.UniqueIdentifier) { Value = quizId });
                cmd.ExecuteNonQuery();
            }

            // Update ReadingPassage if exists
            if (passageIdObj != DBNull.Value && Guid.TryParse(passageIdObj.ToString(), out var passageId))
            {
                string updatePassage = @"
                    UPDATE ReadingPassage 
                    SET Title = COALESCE(@Title, Title),
                        Level = COALESCE(@Level, Level),
                        Topic = COALESCE(@Topic, Topic),
                        Content = COALESCE(@Content, Content),
                        UpdatedAt = @UpdatedAt
                    WHERE PassageID = @PassageId";
                using (var cmd = new SqlCommand(updatePassage, conn, tx))
                {
                    cmd.Parameters.Add(new SqlParameter("@Title", SqlDbType.NVarChar, 255) { Value = (object?)req.Title ?? DBNull.Value });
                    cmd.Parameters.Add(new SqlParameter("@Level", SqlDbType.NVarChar, 20) { Value = (object?)req.Level ?? DBNull.Value });
                    cmd.Parameters.Add(new SqlParameter("@Topic", SqlDbType.NVarChar, 100) { Value = (object?)req.Topic ?? DBNull.Value });
                    cmd.Parameters.Add(new SqlParameter("@Content", SqlDbType.NVarChar, -1) { Value = (object?)req.PassageContent ?? DBNull.Value });
                    cmd.Parameters.Add(new SqlParameter("@UpdatedAt", SqlDbType.DateTime) { Value = DateTime.UtcNow });
                    cmd.Parameters.Add(new SqlParameter("@PassageId", SqlDbType.UniqueIdentifier) { Value = passageId });
                    cmd.ExecuteNonQuery();
                }
            }

            tx.Commit();
            return Ok(new { success = true, message = "Quiz updated successfully." });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { success = false, message = ex.Message });
        }
    }

    [HttpDelete("delete/{id}")]
    public IActionResult DeleteQuiz(string id)
    {
        if (string.IsNullOrWhiteSpace(id) || !Guid.TryParse(id, out var quizId))
        {
            return BadRequest(new { success = false, message = "A valid quiz id is required." });
        }

        try
        {
            using var conn = GetConnection();
            conn.Open();
            using var tx = conn.BeginTransaction();

            // Get PassageID before deleting Quiz
            string selectQuiz = "SELECT PassageID FROM Quiz WHERE QuizID = @QuizId";
            object? passageIdObj;
            using (var cmd = new SqlCommand(selectQuiz, conn, tx))
            {
                cmd.Parameters.Add(new SqlParameter("@QuizId", SqlDbType.UniqueIdentifier) { Value = quizId });
                passageIdObj = cmd.ExecuteScalar();
            }

            if (passageIdObj == null)
            {
                return NotFound(new { success = false, message = "Quiz not found." });
            }

            // Delete AIQuizRequest
            using (var cmd = new SqlCommand("DELETE FROM AIQuizRequest WHERE QuizID = @QuizId", conn, tx))
            {
                cmd.Parameters.Add(new SqlParameter("@QuizId", SqlDbType.UniqueIdentifier) { Value = quizId });
                cmd.ExecuteNonQuery();
            }

            // Delete AnswerRecord
            using (var cmd = new SqlCommand("DELETE FROM AnswerRecord WHERE QuestionID IN (SELECT QuestionID FROM Question WHERE QuizID = @QuizId)", conn, tx))
            {
                cmd.Parameters.Add(new SqlParameter("@QuizId", SqlDbType.UniqueIdentifier) { Value = quizId });
                cmd.ExecuteNonQuery();
            }

            // Delete QuizAIAnalysis
            using (var cmd = new SqlCommand("DELETE FROM QuizAIAnalysis WHERE AttemptID IN (SELECT AttemptID FROM QuizAttempt WHERE QuizID = @QuizId)", conn, tx))
            {
                cmd.Parameters.Add(new SqlParameter("@QuizId", SqlDbType.UniqueIdentifier) { Value = quizId });
                cmd.ExecuteNonQuery();
            }

            // Delete QuizAttempt
            using (var cmd = new SqlCommand("DELETE FROM QuizAttempt WHERE QuizID = @QuizId", conn, tx))
            {
                cmd.Parameters.Add(new SqlParameter("@QuizId", SqlDbType.UniqueIdentifier) { Value = quizId });
                cmd.ExecuteNonQuery();
            }

            // Delete Question
            using (var cmd = new SqlCommand("DELETE FROM Question WHERE QuizID = @QuizId", conn, tx))
            {
                cmd.Parameters.Add(new SqlParameter("@QuizId", SqlDbType.UniqueIdentifier) { Value = quizId });
                cmd.ExecuteNonQuery();
            }

            // Delete QuestionGroup
            using (var cmd = new SqlCommand("DELETE FROM QuestionGroup WHERE QuizID = @QuizId", conn, tx))
            {
                cmd.Parameters.Add(new SqlParameter("@QuizId", SqlDbType.UniqueIdentifier) { Value = quizId });
                cmd.ExecuteNonQuery();
            }

            // Delete Quiz
            using (var cmd = new SqlCommand("DELETE FROM Quiz WHERE QuizID = @QuizId", conn, tx))
            {
                cmd.Parameters.Add(new SqlParameter("@QuizId", SqlDbType.UniqueIdentifier) { Value = quizId });
                cmd.ExecuteNonQuery();
            }

            // Delete ReadingPassage if exists
            if (passageIdObj != DBNull.Value && Guid.TryParse(passageIdObj.ToString(), out var passageId))
            {
                using (var cmd = new SqlCommand("DELETE FROM ReadingPassage WHERE PassageID = @PassageId", conn, tx))
                {
                    cmd.Parameters.Add(new SqlParameter("@PassageId", SqlDbType.UniqueIdentifier) { Value = passageId });
                    cmd.ExecuteNonQuery();
                }
            }

            tx.Commit();
            return Ok(new { success = true, message = "Quiz deleted successfully." });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { success = false, message = ex.Message });
        }
    }
}
