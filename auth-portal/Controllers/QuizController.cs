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

    public QuizController(IConfiguration config)
    {
        _connectionString = config.GetConnectionString("Default") ?? Environment.GetEnvironmentVariable("USER_DB_CONNECTION");
    }

    private IAuthService? AuthService => HttpContext?.RequestServices.GetService(typeof(IAuthService)) as IAuthService;

    private SqlConnection GetConnection()
    {
        if (string.IsNullOrWhiteSpace(_connectionString))
        {
            throw new InvalidOperationException("Connection string 'Default' is not configured.");
        }
        return new SqlConnection(_connectionString);
    }

    private Guid? GetCurrentTeacherId()
    {
        var token = Request.Headers.Authorization.ToString();
        if (token.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase)) token = token[7..].Trim();
        var session = AuthService?.GetSession(token);
        // AuthService currently labels teacher login sessions as "Instructor".
        // Accept both values so existing sessions and teacher registrations can
        // access moderation endpoints consistently.
        return session != null
            && (string.Equals(session.UserType, "Teacher", StringComparison.OrdinalIgnoreCase)
                || string.Equals(session.UserType, "Instructor", StringComparison.OrdinalIgnoreCase))
            && Guid.TryParse(session.Id, out var teacherId) ? teacherId : null;
    }

    private static bool TeacherOwnsQuiz(SqlConnection conn, Guid quizId, Guid teacherId, SqlTransaction? tx = null)
    {
        using var cmd = new SqlCommand(@"SELECT CASE WHEN EXISTS (
            SELECT 1 FROM Quiz q WHERE q.QuizID = @QuizID AND
                (q.CreatorID = @TeacherID OR EXISTS (SELECT 1 FROM Material m WHERE m.QuizID = q.QuizID AND m.TeacherID = @TeacherID))
            ) THEN 1 ELSE 0 END", conn, tx);
        cmd.Parameters.Add(new SqlParameter("@QuizID", SqlDbType.UniqueIdentifier) { Value = quizId });
        cmd.Parameters.Add(new SqlParameter("@TeacherID", SqlDbType.UniqueIdentifier) { Value = teacherId });
        return Convert.ToInt32(cmd.ExecuteScalar()) == 1;
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
                var sessionTeacherId = GetCurrentTeacherId();
                if (!sessionTeacherId.HasValue)
                {
                    return Unauthorized(new SaveQuizResponse { Success = false, Message = "Sign in as a teacher before creating a quiz." });
                }

                if (!Guid.TryParse(req.CreatorId, out var teacherId) || teacherId != sessionTeacherId.Value)
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

            if (isTeacherQuiz && normalizedSkill is not ("Reading" or "Listening" or "Writing"))
            {
                return BadRequest(new SaveQuizResponse { Success = false, Message = "Teacher lesson quizzes currently support Reading, Listening and Writing." });
            }

            if (isTeacherQuiz && normalizedSkill == "Writing")
            {
                string[] writingSectionTypes =
                {
                    "TASK1_MAP", "TASK1_PROCESS", "TASK1_TABLE", "TASK1_PIE_CHART",
                    "TASK1_BAR_CHART", "TASK1_LINE_GRAPH", "TASK2_TWO_PART_QUESTION",
                    "TASK2_PROBLEM_SOLUTION", "TASK2_ADVANTAGES_DISADVANTAGES",
                    "TASK2_DISCUSSION", "TASK2_OPINION",
                };
                if (req.Sections == null || req.Sections.Count == 0 || req.Sections.Exists(section =>
                    string.IsNullOrWhiteSpace(section.Prompt)
                    || Array.IndexOf(writingSectionTypes, section.SectionType) < 0))
                {
                    return BadRequest(new SaveQuizResponse { Success = false, Message = "Add at least one valid Writing task prompt before saving." });
                }
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

            if (normalizedSkill == "Listening" && req.Audio != null
                && (!string.IsNullOrWhiteSpace(req.Audio.AudioURL)
                    || (!isTeacherQuiz && !string.IsNullOrWhiteSpace(req.Audio.Transcript))))
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
                cmdAudio.Parameters.Add(new SqlParameter("@AudioURL", SqlDbType.NVarChar, 500) { Value = (object?)(string.IsNullOrWhiteSpace(req.Audio.AudioURL) ? null : req.Audio.AudioURL.Trim()) ?? DBNull.Value });
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

            if (isTeacherQuiz && normalizedSkill == "Writing")
            {
                const string insertSectionSql = @"
                    INSERT INTO QuizSection (
                        SectionID, QuizID, Skill, SectionType, Title, Prompt,
                        Transcript, ModelAnswer, ExtraJson, OrderIndex, CreatedAt
                    ) VALUES (
                        @SectionID, @QuizID, @Skill, @SectionType, @Title, @Prompt,
                        @Transcript, @ModelAnswer, @ExtraJson, @OrderIndex, @CreatedAt
                    )";
                foreach (var section in req.Sections)
                {
                    using var cmdSection = new SqlCommand(insertSectionSql, conn, tx);
                    cmdSection.Parameters.Add(new SqlParameter("@SectionID", SqlDbType.UniqueIdentifier) { Value = Guid.NewGuid() });
                    cmdSection.Parameters.Add(new SqlParameter("@QuizID", SqlDbType.UniqueIdentifier) { Value = quizId });
                    cmdSection.Parameters.Add(new SqlParameter("@Skill", SqlDbType.NVarChar, 30) { Value = normalizedSkill });
                    cmdSection.Parameters.Add(new SqlParameter("@SectionType", SqlDbType.NVarChar, 50) { Value = section.SectionType });
                    cmdSection.Parameters.Add(new SqlParameter("@Title", SqlDbType.NVarChar, 255) { Value = (object?)section.Title ?? DBNull.Value });
                    cmdSection.Parameters.Add(new SqlParameter("@Prompt", SqlDbType.NVarChar, -1) { Value = section.Prompt.Trim() });
                    cmdSection.Parameters.Add(new SqlParameter("@Transcript", SqlDbType.NVarChar, -1) { Value = (object?)section.Transcript ?? DBNull.Value });
                    cmdSection.Parameters.Add(new SqlParameter("@ModelAnswer", SqlDbType.NVarChar, -1) { Value = (object?)section.ModelAnswer ?? DBNull.Value });
                    cmdSection.Parameters.Add(new SqlParameter("@ExtraJson", SqlDbType.NVarChar, -1) { Value = (object?)section.ExtraJson ?? DBNull.Value });
                    cmdSection.Parameters.Add(new SqlParameter("@OrderIndex", SqlDbType.Int) { Value = section.OrderIndex > 0 ? section.OrderIndex : 1 });
                    cmdSection.Parameters.Add(new SqlParameter("@CreatedAt", SqlDbType.DateTime) { Value = DateTime.UtcNow });
                    cmdSection.ExecuteNonQuery();
                }
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

            if (questionsCount > 0)
            {
                using var questionAttribution = new SqlCommand(@"
                    UPDATE Question
                    SET CreatedBy = COALESCE(CreatedBy, @CreatedBy),
                        CreatedByType = COALESCE(CreatedByType, @CreatedByType),
                        ModerationStatus = COALESCE(ModerationStatus, 'Pending')
                    WHERE QuizID = @QuizID", conn, tx);
                questionAttribution.Parameters.Add(new SqlParameter("@CreatedBy", SqlDbType.UniqueIdentifier) { Value = Guid.TryParse(req.CreatorId, out var createdById) ? (object)createdById : DBNull.Value });
                questionAttribution.Parameters.Add(new SqlParameter("@CreatedByType", SqlDbType.NVarChar, 20) { Value = isTeacherQuiz ? "Teacher" : string.IsNullOrWhiteSpace(req.CreatorId) ? "AI" : "User" });
                questionAttribution.Parameters.Add(new SqlParameter("@QuizID", SqlDbType.UniqueIdentifier) { Value = quizId });
                questionAttribution.ExecuteNonQuery();
            }

            if (isTeacherQuiz)
            {
                if (questionsCount == 0 && !(normalizedSkill == "Writing" && req.Sections.Count > 0))
                {
                    return BadRequest(new SaveQuizResponse { Success = false, Message = "Add at least one question before uploading the lesson." });
                }
                if (req.Price < 0 || req.Price > 9_999_999_999.99m)
                {
                    return BadRequest(new SaveQuizResponse { Success = false, Message = "Lesson price must be between 0 and 9,999,999,999.99 VND." });
                }
                if (!req.IsFree && req.Price <= 0)
                {
                    return BadRequest(new SaveQuizResponse { Success = false, Message = "Enter a price greater than zero for a paid lesson." });
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
        var teacherId = GetCurrentTeacherId();
        if (!teacherId.HasValue)
        {
            return Unauthorized(new { success = false, message = "Sign in as a teacher to view uploaded lessons." });
        }

        try
        {
            using var conn = GetConnection();
            conn.Open();
            const string sql = @"
                SELECT m.MaterialID, m.Title, m.Description, m.Skill, m.Level, m.IsFree, m.Price, m.Status, m.CreatedAt, m.QuizID,
                       COUNT(q.QuestionID) AS QuestionCount
                FROM Material m
                LEFT JOIN Quiz quiz ON quiz.QuizID = m.QuizID
                LEFT JOIN Question q ON q.QuizID = quiz.QuizID
                WHERE m.TeacherID = @TeacherID
                GROUP BY m.MaterialID, m.Title, m.Description, m.Skill, m.Level, m.IsFree, m.Price, m.Status, m.CreatedAt, m.QuizID
                ORDER BY m.CreatedAt DESC";
            using var cmd = new SqlCommand(sql, conn);
            cmd.Parameters.Add(new SqlParameter("@TeacherID", SqlDbType.UniqueIdentifier) { Value = teacherId.Value });
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
                    quizId = reader.IsDBNull(9) ? null : reader.GetGuid(9).ToString(),
                    questionCount = reader.GetInt32(10)
                });
            }
            return Ok(new { success = true, items });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { success = false, message = ex.Message });
        }
    }

    [HttpGet("available-lessons")]
    public IActionResult GetAvailableLessons()
    {
        try
        {
            using var conn = GetConnection();
            conn.Open();
            const string sql = @"
                SELECT quiz.QuizID, quiz.Title, material.Description, quiz.Skill, quiz.Level,
                       ISNULL(material.IsFree, 1) AS IsFree, ISNULL(material.Price, 0) AS Price,
                       quiz.CreatedAt,
                       COALESCE(NULLIF(quizTeacher.FullName, ''), NULLIF(quizUser.FullName, ''), materialTeacher.FullName) AS TeacherName,
                       ISNULL(material.MaterialID, quiz.QuizID) AS MaterialID,
                       (SELECT COUNT(*) FROM Question question WHERE question.QuizID = quiz.QuizID) AS QuestionCount
                FROM Quiz quiz
                OUTER APPLY (
                    SELECT TOP 1 m.MaterialID, m.Description, m.IsFree, m.Price, m.TeacherID
                    FROM Material m
                    WHERE m.QuizID = quiz.QuizID
                    ORDER BY CASE WHEN m.Status = 'Approved' THEN 0 ELSE 1 END, m.CreatedAt DESC
                ) material
                LEFT JOIN Teacher quizTeacher ON quizTeacher.TeacherID = quiz.CreatorID
                LEFT JOIN [User] quizUser ON quizUser.UserID = quiz.CreatorID
                LEFT JOIN Teacher materialTeacher ON materialTeacher.TeacherID = material.TeacherID
                WHERE quiz.Status = 'Approved' OR EXISTS (
                    SELECT 1 FROM Material approvedMaterial
                    WHERE approvedMaterial.QuizID = quiz.QuizID AND approvedMaterial.Status = 'Approved'
                )
                ORDER BY quiz.CreatedAt DESC";
            using var cmd = new SqlCommand(sql, conn);
            using var reader = cmd.ExecuteReader();
            var items = new List<object>();
            while (reader.Read())
            {
                items.Add(new
                {
                    materialId = reader.IsDBNull(9) ? null : reader.GetGuid(9).ToString(),
                    title = reader.GetString(1),
                    description = reader.IsDBNull(2) ? null : reader.GetString(2),
                    skill = reader.IsDBNull(3) ? null : reader.GetString(3),
                    level = reader.IsDBNull(4) ? null : reader.GetString(4),
                    isFree = reader.GetBoolean(5),
                    price = reader.GetDecimal(6),
                    createdAt = reader.GetDateTime(7),
                    teacherName = reader.IsDBNull(8) ? null : reader.GetString(8),
                    quizId = reader.GetGuid(0).ToString(),
                    questionCount = reader.GetInt32(10)
                });
            }
            return Ok(new { success = true, items });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { success = false, message = ex.Message });
        }
    }

    [HttpGet("play/{quizId}")]
    public IActionResult GetQuizForPractice(string quizId)
    {
        var session = GetCurrentSession();
        if (session == null || !IsLearner(session.UserType) || !Guid.TryParse(session.Id, out var userId))
            return Unauthorized(new { success = false, message = "Sign in as a learner to take a quiz." });
        if (!Guid.TryParse(quizId, out var parsedQuizId))
            return BadRequest(new { success = false, message = "Select a valid quiz." });

        try
        {
            using var conn = GetConnection();
            conn.Open();

            object? quiz;
            using (var cmd = new SqlCommand(@"
                SELECT q.QuizID, q.Title, q.Skill, q.Level,
                       rp.Title AS PassageTitle, rp.Content AS PassageContent,
                       la.AudioURL, la.Transcript
                FROM Quiz q
                LEFT JOIN ReadingPassage rp ON rp.PassageID = q.PassageID
                LEFT JOIN ListeningAudio la ON la.AudioID = q.AudioID
                OUTER APPLY (
                    SELECT TOP 1 m.MaterialID, m.IsFree
                    FROM Material m
                    WHERE m.QuizID = q.QuizID AND m.Status = 'Approved'
                    ORDER BY m.CreatedAt DESC
                ) material
                WHERE q.QuizID = @QuizID
                    AND (q.Status = 'Approved' OR material.MaterialID IS NOT NULL)
                    AND (material.MaterialID IS NULL OR material.IsFree = 1 OR EXISTS (
                        SELECT 1 FROM MaterialAccess access
                        WHERE access.MaterialID = material.MaterialID
                            AND access.UserID = @UserID
                            AND (access.ExpiresAt IS NULL OR access.ExpiresAt > GETDATE())
                    ))", conn))
            {
                cmd.Parameters.Add(new SqlParameter("@QuizID", SqlDbType.UniqueIdentifier) { Value = parsedQuizId });
                cmd.Parameters.Add(new SqlParameter("@UserID", SqlDbType.UniqueIdentifier) { Value = userId });
                using var reader = cmd.ExecuteReader();
                if (!reader.Read()) return NotFound(new { success = false, message = "This quiz is unavailable or requires a purchase." });
                quiz = new
                {
                    quizId = reader.GetGuid(0).ToString(),
                    title = reader.GetString(1),
                    skill = reader.IsDBNull(2) ? "Reading" : reader.GetString(2),
                    level = reader.IsDBNull(3) ? "All levels" : reader.GetString(3),
                    passageTitle = reader.IsDBNull(4) ? null : reader.GetString(4),
                    passageContent = reader.IsDBNull(5) ? null : reader.GetString(5),
                    audioUrl = reader.IsDBNull(6) ? null : reader.GetString(6),
                    transcript = reader.IsDBNull(7) ? null : reader.GetString(7)
                };
            }

            var questions = new List<object>();
            using (var cmd = new SqlCommand(@"
                SELECT question.QuestionID, question.Content, question.Options, question.OrderIndex,
                       COALESCE(question.QuestionType, type.Code) AS QuestionType,
                       questionGroup.Instruction, questionGroup.SharedOptions, questionGroup.WordLimit
                FROM Question question
                LEFT JOIN QuestionTypeCatalog type ON type.QuestionTypeID = question.QuestionTypeID
                LEFT JOIN QuestionGroup questionGroup ON questionGroup.GroupID = question.GroupID
                WHERE question.QuizID = @QuizID
                ORDER BY ISNULL(questionGroup.OrderIndex, question.OrderIndex), question.OrderIndex", conn))
            {
                cmd.Parameters.Add(new SqlParameter("@QuizID", SqlDbType.UniqueIdentifier) { Value = parsedQuizId });
                using var reader = cmd.ExecuteReader();
                while (reader.Read())
                {
                    questions.Add(new
                    {
                        questionId = reader.GetGuid(0).ToString(),
                        content = reader.GetString(1),
                        options = reader.IsDBNull(2) ? null : reader.GetString(2),
                        orderIndex = reader.GetInt32(3),
                        questionType = reader.IsDBNull(4) ? "SHORT_ANSWER" : reader.GetString(4),
                        instruction = reader.IsDBNull(5) ? null : reader.GetString(5),
                        sharedOptions = reader.IsDBNull(6) ? null : reader.GetString(6),
                        wordLimit = reader.IsDBNull(7) ? null : reader.GetString(7)
                    });
                }
            }

            if (questions.Count == 0)
                return NotFound(new { success = false, message = "This quiz does not contain any questions." });
            return Ok(new { success = true, quiz, questions });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { success = false, message = ex.Message });
        }
    }

    [HttpPost("attempt")]
    public IActionResult SubmitQuizAttempt([FromBody] SubmitQuizAttemptRequest request)
    {
        var session = GetCurrentSession();
        if (session == null || !IsLearner(session.UserType) || !Guid.TryParse(session.Id, out var userId))
            return Unauthorized(new { success = false, message = "Sign in as a learner to submit a quiz." });
        if (request == null || !Guid.TryParse(request.QuizId, out var quizId))
            return BadRequest(new { success = false, message = "Select a valid quiz." });

        var answersByQuestion = new Dictionary<Guid, QuizAttemptAnswer>();
        foreach (var answer in request.Answers ?? new List<QuizAttemptAnswer>())
        {
            if (!Guid.TryParse(answer.QuestionId, out var questionId) || !answersByQuestion.TryAdd(questionId, answer))
                return BadRequest(new { success = false, message = "The submitted answers contain an invalid or duplicate question." });
        }

        try
        {
            using var conn = GetConnection();
            conn.Open();
            using var tx = conn.BeginTransaction();

            var expectedAnswers = new List<(Guid QuestionId, string? CorrectAnswer, string? Explanation)>();
            using (var cmd = new SqlCommand(@"
                SELECT question.QuestionID, question.CorrectAnswer, question.Explanation
                FROM Question question
                JOIN Quiz quiz ON quiz.QuizID = question.QuizID
                OUTER APPLY (
                    SELECT TOP 1 m.MaterialID, m.IsFree
                    FROM Material m
                    WHERE m.QuizID = quiz.QuizID AND m.Status = 'Approved'
                    ORDER BY m.CreatedAt DESC
                ) material
                WHERE quiz.QuizID = @QuizID
                    AND (quiz.Status = 'Approved' OR material.MaterialID IS NOT NULL)
                    AND (material.MaterialID IS NULL OR material.IsFree = 1 OR EXISTS (
                        SELECT 1 FROM MaterialAccess access
                        WHERE access.MaterialID = material.MaterialID
                            AND access.UserID = @UserID
                            AND (access.ExpiresAt IS NULL OR access.ExpiresAt > GETDATE())
                    ))
                ORDER BY question.OrderIndex", conn, tx))
            {
                cmd.Parameters.Add(new SqlParameter("@QuizID", SqlDbType.UniqueIdentifier) { Value = quizId });
                cmd.Parameters.Add(new SqlParameter("@UserID", SqlDbType.UniqueIdentifier) { Value = userId });
                using var reader = cmd.ExecuteReader();
                while (reader.Read())
                    expectedAnswers.Add((reader.GetGuid(0), reader.IsDBNull(1) ? null : reader.GetString(1), reader.IsDBNull(2) ? null : reader.GetString(2)));
            }

            if (expectedAnswers.Count == 0)
            {
                tx.Rollback();
                return NotFound(new { success = false, message = "This quiz is unavailable or has no questions." });
            }
            foreach (var answerId in answersByQuestion.Keys)
            {
                if (!expectedAnswers.Exists(question => question.QuestionId == answerId))
                {
                    tx.Rollback();
                    return BadRequest(new { success = false, message = "An answer does not belong to this quiz." });
                }
            }

            var attemptId = Guid.NewGuid();
            var timeTaken = Math.Clamp(request.TimeTaken, 0, 86400);
            var results = new List<object>();
            var correctCount = 0;
            foreach (var question in expectedAnswers)
            {
                answersByQuestion.TryGetValue(question.QuestionId, out var submitted);
                var userAnswer = submitted?.Answer?.Trim();
                var isCorrect = !string.IsNullOrWhiteSpace(question.CorrectAnswer)
                    && string.Equals(NormalizeQuizAnswer(userAnswer), NormalizeQuizAnswer(question.CorrectAnswer), StringComparison.OrdinalIgnoreCase);
                if (isCorrect) correctCount++;
                results.Add(new
                {
                    questionId = question.QuestionId.ToString(),
                    answer = userAnswer,
                    correctAnswer = question.CorrectAnswer,
                    isCorrect,
                    explanation = question.Explanation
                });
            }

            var score = correctCount * 100d / expectedAnswers.Count;
            using (var cmd = new SqlCommand(@"
                INSERT INTO QuizAttempt (AttemptID, UserID, QuizID, Score, TimeTaken, StartedAt, SubmittedAt, Status)
                VALUES (@AttemptID, @UserID, @QuizID, @Score, @TimeTaken, DATEADD(SECOND, -@TimeTaken, GETDATE()), GETDATE(), 'Completed')", conn, tx))
            {
                cmd.Parameters.Add(new SqlParameter("@AttemptID", SqlDbType.UniqueIdentifier) { Value = attemptId });
                cmd.Parameters.Add(new SqlParameter("@UserID", SqlDbType.UniqueIdentifier) { Value = userId });
                cmd.Parameters.Add(new SqlParameter("@QuizID", SqlDbType.UniqueIdentifier) { Value = quizId });
                cmd.Parameters.Add(new SqlParameter("@Score", SqlDbType.Float) { Value = score });
                cmd.Parameters.Add(new SqlParameter("@TimeTaken", SqlDbType.Int) { Value = timeTaken });
                cmd.ExecuteNonQuery();
            }
            foreach (var question in expectedAnswers)
            {
                answersByQuestion.TryGetValue(question.QuestionId, out var submitted);
                var userAnswer = submitted?.Answer?.Trim();
                var isCorrect = !string.IsNullOrWhiteSpace(question.CorrectAnswer)
                    && string.Equals(NormalizeQuizAnswer(userAnswer), NormalizeQuizAnswer(question.CorrectAnswer), StringComparison.OrdinalIgnoreCase);
                using var cmd = new SqlCommand(@"
                    INSERT INTO AnswerRecord (AnswerID, AttemptID, QuestionID, UserAnswer, IsCorrect, TimeSpent)
                    VALUES (@AnswerID, @AttemptID, @QuestionID, @UserAnswer, @IsCorrect, @TimeSpent)", conn, tx);
                cmd.Parameters.Add(new SqlParameter("@AnswerID", SqlDbType.UniqueIdentifier) { Value = Guid.NewGuid() });
                cmd.Parameters.Add(new SqlParameter("@AttemptID", SqlDbType.UniqueIdentifier) { Value = attemptId });
                cmd.Parameters.Add(new SqlParameter("@QuestionID", SqlDbType.UniqueIdentifier) { Value = question.QuestionId });
                cmd.Parameters.Add(new SqlParameter("@UserAnswer", SqlDbType.NVarChar, 500) { Value = string.IsNullOrWhiteSpace(userAnswer) ? DBNull.Value : userAnswer });
                cmd.Parameters.Add(new SqlParameter("@IsCorrect", SqlDbType.Bit) { Value = isCorrect });
                cmd.Parameters.Add(new SqlParameter("@TimeSpent", SqlDbType.Int) { Value = Math.Clamp(submitted?.TimeSpent ?? 0, 0, timeTaken) });
                cmd.ExecuteNonQuery();
            }

            tx.Commit();
            return Ok(new
            {
                success = true,
                attemptId = attemptId.ToString(),
                score,
                correctCount,
                totalQuestions = expectedAnswers.Count,
                timeTaken,
                results
            });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { success = false, message = ex.Message });
        }
    }

    [HttpGet("attempts")]
    public IActionResult GetMyQuizAttempts()
    {
        var session = GetCurrentSession();
        if (session == null || !IsLearner(session.UserType) || !Guid.TryParse(session.Id, out var userId))
            return Unauthorized(new { success = false, message = "Sign in as a learner to view quiz results." });

        try
        {
            using var conn = GetConnection();
            conn.Open();
            using var cmd = new SqlCommand(@"
                SELECT attempt.AttemptID, attempt.QuizID, quiz.Title, quiz.Skill, attempt.Score,
                       attempt.TimeTaken, attempt.SubmittedAt, attempt.Status,
                       (SELECT COUNT(*) FROM AnswerRecord answer WHERE answer.AttemptID = attempt.AttemptID) AS AnswerCount,
                       (SELECT COUNT(*) FROM AnswerRecord answer WHERE answer.AttemptID = attempt.AttemptID AND answer.IsCorrect = 1) AS CorrectCount
                FROM QuizAttempt attempt
                JOIN Quiz quiz ON quiz.QuizID = attempt.QuizID
                WHERE attempt.UserID = @UserID
                ORDER BY attempt.SubmittedAt DESC", conn);
            cmd.Parameters.Add(new SqlParameter("@UserID", SqlDbType.UniqueIdentifier) { Value = userId });
            using var reader = cmd.ExecuteReader();
            var items = new List<object>();
            while (reader.Read())
            {
                items.Add(new
                {
                    attemptId = reader.GetGuid(0).ToString(),
                    quizId = reader.GetGuid(1).ToString(),
                    title = reader.GetString(2),
                    skill = reader.IsDBNull(3) ? "Reading" : reader.GetString(3),
                    score = reader.IsDBNull(4) ? 0 : reader.GetDouble(4),
                    timeTaken = reader.IsDBNull(5) ? 0 : reader.GetInt32(5),
                    submittedAt = reader.IsDBNull(6) ? (DateTime?)null : reader.GetDateTime(6),
                    status = reader.GetString(7),
                    totalQuestions = reader.GetInt32(8),
                    correctCount = reader.GetInt32(9)
                });
            }
            return Ok(new { success = true, items });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { success = false, message = ex.Message });
        }
    }

    private static bool IsLearner(string userType) =>
        string.Equals(userType, "User", StringComparison.OrdinalIgnoreCase)
        || string.Equals(userType, "Student", StringComparison.OrdinalIgnoreCase);

    private static string NormalizeQuizAnswer(string? answer)
    {
        var value = (answer ?? string.Empty).Trim();
        if (value.Contains(','))
        {
            var choices = value.Split(',');
            for (var index = 0; index < choices.Length; index++) choices[index] = choices[index].Trim();
            Array.Sort(choices, StringComparer.OrdinalIgnoreCase);
            return string.Join(",", choices);
        }
        return string.Join(" ", value.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries));
    }

    private static string NormalizePackageName(string? name)
    {
        var normalized = (name ?? string.Empty).Trim().ToLowerInvariant();
        if (normalized is "bronze" or "đồng" or "dong") return "bronze";
        if (normalized is "silver" or "bạc" or "bac") return "silver";
        if (normalized is "gold" or "vàng" or "vang") return "gold";
        return string.Empty;
    }

    [HttpGet("packages")]
    public IActionResult GetPackages()
    {
        try
        {
            using var conn = GetConnection();
            conn.Open();
            const string sql = @"
                WITH RankedPackages AS (
                    SELECT PackageID, PackageName, Price, DurationMonths, AIQuizLimit, LevelTestLimit, UploadLimitMB,
                           KnowledgeBaseAccess, HasSpeakingAI, HasSpeakingTeacher, HasWritingAI, HasWritingTeacher, WritingAILimited,
                           ROW_NUMBER() OVER (
                               PARTITION BY Price, DurationMonths, AIQuizLimit, LevelTestLimit, UploadLimitMB,
                                            KnowledgeBaseAccess, HasSpeakingAI, HasSpeakingTeacher, HasWritingAI,
                                            HasWritingTeacher, WritingAILimited
                               ORDER BY CASE WHEN PackageName IN (N'Đồng', N'Bạc', N'Vàng', N'Bronze', N'Silver', N'Gold') THEN 0 ELSE 1 END,
                                        PackageID
                           ) AS DuplicateRank
                    FROM Package
                    WHERE IsActive = 1
                )
                SELECT PackageID, PackageName, Price, DurationMonths, AIQuizLimit, LevelTestLimit, UploadLimitMB,
                       KnowledgeBaseAccess, HasSpeakingAI, HasSpeakingTeacher, HasWritingAI, HasWritingTeacher, WritingAILimited
                FROM RankedPackages
                WHERE DuplicateRank = 1
                ORDER BY Price, PackageName";
            using var cmd = new SqlCommand(sql, conn);
            using var reader = cmd.ExecuteReader();
            var items = new List<object>();
            while (reader.Read())
            {
                items.Add(new
                {
                    packageId = reader.GetGuid(0).ToString(),
                    name = reader.GetString(1),
                    tier = NormalizePackageName(reader.GetString(1)) is { Length: > 0 } tier ? tier
                        : reader.GetInt32(4) <= 8 ? "bronze"
                        : reader.GetInt32(4) <= 60 ? "silver" : "gold",
                    price = reader.GetDecimal(2),
                    durationMonths = reader.GetInt32(3),
                    aiQuizLimit = reader.GetInt32(4),
                    levelTestLimit = reader.GetInt32(5),
                    uploadLimitMB = reader.GetDouble(6),
                    knowledgeBaseAccess = reader.GetString(7),
                    hasSpeakingAI = reader.GetBoolean(8),
                    hasSpeakingTeacher = reader.GetBoolean(9),
                    hasWritingAI = reader.GetBoolean(10),
                    hasWritingTeacher = reader.GetBoolean(11),
                    writingAILimited = reader.GetBoolean(12)
                });
            }
            return Ok(new { success = true, items });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { success = false, message = ex.Message });
        }
    }

    [HttpGet("content")]
    public IActionResult GetContent()
    {
        var session = GetCurrentSession();
        if (session == null || !string.Equals(session.UserType, "Admin", StringComparison.OrdinalIgnoreCase))
            return Unauthorized(new { success = false, message = "Sign in as an admin to manage content." });
        try
        {
            using var conn = GetConnection();
            conn.Open();
            const string sql = @"SELECT COALESCE(m.MaterialID, q.QuizID) AS ContentID, m.MaterialID, q.QuizID,
                       COALESCE(m.Title, q.Title) AS Title, COALESCE(m.Skill, q.Skill) AS Skill,
                       COALESCE(m.Level, q.Level) AS Level,
                       CASE WHEN m.MaterialID IS NOT NULL THEN m.Status
                            WHEN q.Status IN ('Draft', 'PendingReview') THEN 'Pending'
                            ELSE q.Status END AS Status,
                       COALESCE(m.CreatedAt, q.CreatedAt) AS CreatedAt,
                       COALESCE(NULLIF(t.FullName, ''), NULLIF(u.FullName, '')) AS CreatorName,
                       q.Source, COUNT(qn.QuestionID) AS QuestionCount,
                       MAX(CASE WHEN m.EnrollmentKeyHash IS NULL THEN 0 ELSE 1 END) AS HasEnrollmentKey
                FROM Material m
                FULL OUTER JOIN Quiz q ON q.QuizID = m.QuizID
                LEFT JOIN Teacher t ON t.TeacherID = COALESCE(m.TeacherID, q.CreatorID)
                LEFT JOIN [User] u ON u.UserID = q.CreatorID
                LEFT JOIN Question qn ON qn.QuizID = q.QuizID
                GROUP BY m.MaterialID, q.QuizID, m.Title, q.Title, m.Skill, q.Skill,
                         m.Level, q.Level, m.Status, q.Status, m.CreatedAt, q.CreatedAt, t.FullName, u.FullName, q.Source
                ORDER BY COALESCE(m.CreatedAt, q.CreatedAt) DESC";
            using var cmd = new SqlCommand(sql, conn);
            using var reader = cmd.ExecuteReader();
            var items = new List<object>();
            while (reader.Read()) items.Add(new {
                id = reader.GetGuid(0).ToString(),
                materialId = reader.IsDBNull(1) ? null : reader.GetGuid(1).ToString(),
                quizId = reader.IsDBNull(2) ? null : reader.GetGuid(2).ToString(),
                title = reader.GetString(3), skill = reader.IsDBNull(4) ? "—" : reader.GetString(4),
                level = reader.IsDBNull(5) ? null : reader.GetString(5),
                status = reader.GetString(6), createdAt = reader.GetDateTime(7),
                creatorName = reader.IsDBNull(8) ? "" : reader.GetString(8),
                contentType = reader.IsDBNull(9) ? "Document" : reader.GetString(9),
                questionCount = reader.GetInt32(10),
                hasEnrollmentKey = reader.GetInt32(11) == 1
            });
            return Ok(new { success = true, items });
        }
        catch (Exception ex) { return StatusCode(500, new { success = false, message = ex.Message }); }
    }

    [HttpPost("material/{id:guid}/enrollment-key")]
    public IActionResult GenerateEnrollmentKey(Guid id)
    {
        var session = GetCurrentSession();
        if (session == null || !string.Equals(session.UserType, "Admin", StringComparison.OrdinalIgnoreCase))
            return Unauthorized(new { success = false, message = "Sign in as an admin to manage enrollment keys." });

        try
        {
            var enrollmentKey = EnrollmentKeyService.Generate();
            var keyHash = EnrollmentKeyService.Hash(enrollmentKey);
            using var conn = GetConnection();
            conn.Open();
            using var cmd = new SqlCommand(@"
                UPDATE Material
                SET EnrollmentKeyHash = @KeyHash
                WHERE MaterialID = @MaterialID AND QuizID IS NOT NULL", conn);
            cmd.Parameters.Add(new SqlParameter("@KeyHash", SqlDbType.NVarChar, 64) { Value = keyHash });
            cmd.Parameters.Add(new SqlParameter("@MaterialID", SqlDbType.UniqueIdentifier) { Value = id });
            if (cmd.ExecuteNonQuery() == 0)
                return NotFound(new { success = false, message = "A lesson with a quiz was not found." });

            return Ok(new { success = true, enrollmentKey });
        }
        catch (Exception ex) { return StatusCode(500, new { success = false, message = ex.Message }); }
    }

    [HttpGet("content/{id}")]
    public IActionResult GetContentDetails(string id)
    {
        var session = GetCurrentSession();
        if (session == null || !string.Equals(session.UserType, "Admin", StringComparison.OrdinalIgnoreCase))
            return Unauthorized(new { success = false, message = "Sign in as an admin to view content details." });
        if (!Guid.TryParse(id, out var contentId))
            return BadRequest(new { success = false, message = "A valid content id is required." });

        try
        {
            using var conn = GetConnection();
            conn.Open();
            const string materialSql = @"
                SELECT m.MaterialID, q.QuizID, COALESCE(m.Title, q.Title), m.Description,
                       COALESCE(m.Skill, q.Skill), COALESCE(m.Level, q.Level),
                       m.FileURL, m.FileType, m.IsFree, m.Price, m.DownloadCount,
                       CASE WHEN m.MaterialID IS NOT NULL THEN m.Status
                            WHEN q.Status IN ('Draft', 'PendingReview') THEN 'Pending'
                            ELSE q.Status END,
                       COALESCE(m.CreatedAt, q.CreatedAt),
                       COALESCE(NULLIF(t.FullName, ''), NULLIF(u.FullName, '')), q.Source, q.ExtraContent,
                       rp.Title, rp.Content, rp.WordCount, rp.Topic, rp.Level,
                       la.AudioURL, la.Transcript, la.DurationSeconds
                FROM Material m
                FULL OUTER JOIN Quiz q ON q.QuizID = m.QuizID
                LEFT JOIN Teacher t ON t.TeacherID = COALESCE(m.TeacherID, q.CreatorID)
                LEFT JOIN [User] u ON u.UserID = q.CreatorID
                LEFT JOIN ReadingPassage rp ON rp.PassageID = q.PassageID
                LEFT JOIN ListeningAudio la ON la.AudioID = q.AudioID
                WHERE m.MaterialID = @ContentID OR q.QuizID = @ContentID";
            Guid? quizId;
            object material;
            using (var cmd = new SqlCommand(materialSql, conn))
            {
                cmd.Parameters.Add(new SqlParameter("@ContentID", SqlDbType.UniqueIdentifier) { Value = contentId });
                using var reader = cmd.ExecuteReader();
                if (!reader.Read())
                    return NotFound(new { success = false, message = "Content not found." });

                quizId = reader.IsDBNull(1) ? null : reader.GetGuid(1);
                material = new
                {
                    id = reader.IsDBNull(0) ? quizId?.ToString() : reader.GetGuid(0).ToString(),
                    materialId = reader.IsDBNull(0) ? null : reader.GetGuid(0).ToString(),
                    quizId = quizId?.ToString(),
                    title = reader.GetString(2),
                    description = reader.IsDBNull(3) ? null : reader.GetString(3),
                    skill = reader.IsDBNull(4) ? null : reader.GetString(4),
                    level = reader.IsDBNull(5) ? null : reader.GetString(5),
                    fileUrl = reader.IsDBNull(6) ? null : reader.GetString(6),
                    fileType = reader.IsDBNull(7) ? null : reader.GetString(7),
                    isFree = reader.IsDBNull(8) || reader.GetBoolean(8),
                    price = reader.IsDBNull(9) ? 0m : reader.GetDecimal(9),
                    downloadCount = reader.IsDBNull(10) ? 0 : reader.GetInt32(10),
                    status = reader.GetString(11),
                    createdAt = reader.GetDateTime(12),
                    creatorName = reader.IsDBNull(13) ? null : reader.GetString(13),
                    source = reader.IsDBNull(14) ? null : reader.GetString(14),
                    extraContent = reader.IsDBNull(15) ? null : reader.GetString(15),
                    passage = reader.IsDBNull(17) ? null : new
                    {
                        title = reader.IsDBNull(16) ? null : reader.GetString(16),
                        content = reader.GetString(17),
                        wordCount = reader.IsDBNull(18) ? (int?)null : reader.GetInt32(18),
                        topic = reader.IsDBNull(19) ? null : reader.GetString(19),
                        level = reader.IsDBNull(20) ? null : reader.GetString(20),
                    },
                    audio = reader.IsDBNull(21) && reader.IsDBNull(22) && reader.IsDBNull(23) ? null : new
                    {
                        audioUrl = reader.IsDBNull(21) ? null : reader.GetString(21),
                        transcript = reader.IsDBNull(22) ? null : reader.GetString(22),
                        durationSeconds = reader.IsDBNull(23) ? (int?)null : reader.GetInt32(23),
                    },
                };
            }

            var sections = new List<object>();
            var questions = new List<object>();
            if (quizId.HasValue)
            {
                const string sectionSql = @"
                    SELECT Skill, SectionType, Title, Prompt, Transcript, ModelAnswer, ExtraJson, OrderIndex
                    FROM QuizSection
                    WHERE QuizID = @QuizID
                    ORDER BY OrderIndex";
                using (var cmd = new SqlCommand(sectionSql, conn))
                {
                    cmd.Parameters.Add(new SqlParameter("@QuizID", SqlDbType.UniqueIdentifier) { Value = quizId.Value });
                    using var reader = cmd.ExecuteReader();
                    while (reader.Read())
                    {
                        sections.Add(new
                        {
                            skill = reader.GetString(0),
                            sectionType = reader.GetString(1),
                            title = reader.IsDBNull(2) ? null : reader.GetString(2),
                            prompt = reader.GetString(3),
                            transcript = reader.IsDBNull(4) ? null : reader.GetString(4),
                            modelAnswer = reader.IsDBNull(5) ? null : reader.GetString(5),
                            extraJson = reader.IsDBNull(6) ? null : reader.GetString(6),
                            orderIndex = reader.GetInt32(7),
                        });
                    }
                }

                const string questionSql = @"
                    SELECT q.Content, q.Options, q.CorrectAnswer, q.Explanation, q.OrderIndex,
                           qt.Code, qt.NameVI, qt.NameEN,
                           qg.Instruction, qg.SharedOptions, qg.WordLimit, qg.ImageURL,
                           q.AudioTimestampSeconds
                    FROM Question q
                    LEFT JOIN QuestionTypeCatalog qt ON qt.QuestionTypeID = q.QuestionTypeID
                    LEFT JOIN QuestionGroup qg ON qg.GroupID = q.GroupID
                    WHERE q.QuizID = @QuizID
                    ORDER BY ISNULL(qg.OrderIndex, 0), q.OrderIndex";
                using (var cmd = new SqlCommand(questionSql, conn))
                {
                    cmd.Parameters.Add(new SqlParameter("@QuizID", SqlDbType.UniqueIdentifier) { Value = quizId.Value });
                    using var reader = cmd.ExecuteReader();
                    while (reader.Read())
                    {
                        questions.Add(new
                        {
                            content = reader.GetString(0),
                            options = reader.IsDBNull(1) ? null : reader.GetString(1),
                            correctAnswer = reader.IsDBNull(2) ? null : reader.GetString(2),
                            explanation = reader.IsDBNull(3) ? null : reader.GetString(3),
                            orderIndex = reader.GetInt32(4),
                            questionTypeCode = reader.IsDBNull(5) ? null : reader.GetString(5),
                            questionTypeNameVi = reader.IsDBNull(6) ? null : reader.GetString(6),
                            questionTypeNameEn = reader.IsDBNull(7) ? null : reader.GetString(7),
                            instruction = reader.IsDBNull(8) ? null : reader.GetString(8),
                            sharedOptions = reader.IsDBNull(9) ? null : reader.GetString(9),
                            wordLimit = reader.IsDBNull(10) ? null : reader.GetString(10),
                            imageUrl = reader.IsDBNull(11) ? null : reader.GetString(11),
                            audioTimestampSeconds = reader.IsDBNull(12) ? (int?)null : reader.GetInt32(12),
                        });
                    }
                }
            }

            return Ok(new { success = true, item = material, sections, questions });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { success = false, message = ex.Message });
        }
    }

    [HttpPut("material/{id}/status")]
    public IActionResult UpdateMaterialStatus(string id, [FromBody] MaterialStatusRequest? req)
    {
        var session = GetCurrentSession();
        var isAdmin = string.Equals(session?.UserType, "Admin", StringComparison.OrdinalIgnoreCase);
        var teacherId = isAdmin ? null : GetCurrentTeacherId();
        if (session == null || (!isAdmin && !teacherId.HasValue))
            return Unauthorized(new { success = false, message = "Sign in to manage content." });
        if (!Guid.TryParse(id, out var materialId) || req?.Status is not ("Pending" or "Approved" or "Rejected"))
            return BadRequest(new { success = false, message = "A valid content id and status (Pending, Approved, Rejected) are required." });
        try
        {
            using var conn = GetConnection(); conn.Open();
            using var cmd = new SqlCommand(isAdmin
                ? "UPDATE Material SET Status = @Status WHERE MaterialID = @Id"
                : "UPDATE Material SET Status = @Status WHERE MaterialID = @Id AND TeacherID = @TeacherID", conn);
            cmd.Parameters.Add(new SqlParameter("@Status", SqlDbType.NVarChar, 20) { Value = req.Status });
            cmd.Parameters.Add(new SqlParameter("@Id", SqlDbType.UniqueIdentifier) { Value = materialId });
            if (!isAdmin)
            {
                cmd.Parameters.Add(new SqlParameter("@TeacherID", SqlDbType.UniqueIdentifier) { Value = teacherId!.Value });
            }
            var affected = cmd.ExecuteNonQuery();
            if (isAdmin && affected == 0)
            {
                using var quizCmd = new SqlCommand(@"
                    UPDATE Quiz
                    SET Status = CASE WHEN @Status = 'Pending' THEN 'PendingReview' ELSE @Status END
                    WHERE QuizID = @Id", conn);
                quizCmd.Parameters.Add(new SqlParameter("@Status", SqlDbType.NVarChar, 20) { Value = req.Status });
                quizCmd.Parameters.Add(new SqlParameter("@Id", SqlDbType.UniqueIdentifier) { Value = materialId });
                affected = quizCmd.ExecuteNonQuery();
            }
            if (affected == 0) return NotFound(new { success = false, message = "Content not found." });
            return Ok(new { success = true, status = req.Status });
        }
        catch (Exception ex) { return StatusCode(500, new { success = false, message = ex.Message }); }
    }

    [HttpDelete("material/{id}")]
    public IActionResult DeleteMaterial(string id)
    {
        var session = GetCurrentSession();
        if (session == null || !string.Equals(session.UserType, "Admin", StringComparison.OrdinalIgnoreCase))
            return Unauthorized(new { success = false, message = "Sign in as an admin to delete content." });
        if (!Guid.TryParse(id, out var materialId)) return BadRequest(new { success = false, message = "A valid material id is required." });
        try
        {
            using var conn = GetConnection(); conn.Open();
            using var tx = conn.BeginTransaction();
            using (var access = new SqlCommand("DELETE FROM MaterialAccess WHERE MaterialID = @Id", conn, tx))
            {
                access.Parameters.Add(new SqlParameter("@Id", SqlDbType.UniqueIdentifier) { Value = materialId });
                access.ExecuteNonQuery();
            }
            using var cmd = new SqlCommand("DELETE FROM Material WHERE MaterialID = @Id AND QuizID IS NULL", conn, tx);
            cmd.Parameters.Add(new SqlParameter("@Id", SqlDbType.UniqueIdentifier) { Value = materialId });
            if (cmd.ExecuteNonQuery() == 0) { tx.Rollback(); return NotFound(new { success = false, message = "Unlinked material not found." }); }
            tx.Commit();
            return Ok(new { success = true, message = "Material deleted." });
        }
        catch (Exception ex) { return StatusCode(500, new { success = false, message = ex.Message }); }
    }

    private AuthPortal.Models.UserInfo? GetCurrentSession()
    {
        var token = Request.Headers.Authorization.ToString();
        if (token.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase)) token = token[7..].Trim();
        return AuthService?.GetSession(token);
    }

    [HttpGet("moderation-queue")]
    public IActionResult GetModerationQueue([FromQuery] string scope = "all", [FromQuery] string? creatorId = null)
    {
        var currentTeacherId = GetCurrentTeacherId();
        if (!currentTeacherId.HasValue) return Unauthorized(new { success = false, message = "Sign in as a teacher to review quizzes." });
        if (scope is not ("all" or "mine" or "unassigned" or "creator"))
            return BadRequest(new { success = false, message = "Invalid creator filter." });
        if (scope == "creator" && !Guid.TryParse(creatorId, out _))
            return BadRequest(new { success = false, message = "Select a valid quiz creator." });
        try
        {
            using var conn = GetConnection();
            conn.Open();

            var queue = new List<QuizModerationItem>();
            string sql = @"
                SELECT q.QuizID, q.Title, q.Skill, q.Level, q.Source, q.Status, q.CreatedAt,
                       rp.PassageID, rp.Title AS PassageTitle, rp.Topic, rp.WordCount, rp.Content AS PassageContent,
                       COALESCE(rp.ModerationStatus, la.ModerationStatus) AS ModerationStatus,
                       la.AudioURL, la.Transcript,
                       ISNULL(qc.QuestionCount, 0) AS QuestionCount,
                       COALESCE(q.CreatorID, questionCreator.CreatedBy) AS CreatorID,
                       COALESCE(NULLIF(t.FullName, ''), NULLIF(u.FullName, ''), questionCreator.CreatorName) AS CreatorName,
                       q.ApprovedBy, approver.FullName AS ApproverName,
                       CAST(CASE WHEN q.CreatorID = @TeacherID OR EXISTS (SELECT 1 FROM Material ownMaterial WHERE ownMaterial.QuizID = q.QuizID AND ownMaterial.TeacherID = @TeacherID) THEN 1 ELSE 0 END AS bit) AS CanManage
                FROM Quiz q
                LEFT JOIN ReadingPassage rp ON rp.PassageID = q.PassageID
                LEFT JOIN ListeningAudio la ON la.AudioID = q.AudioID
                LEFT JOIN Teacher t ON t.TeacherID = q.CreatorID
                LEFT JOIN [User] u ON u.UserID = q.CreatorID
                LEFT JOIN Teacher approver ON approver.TeacherID = q.ApprovedBy
                OUTER APPLY (
                    SELECT TOP 1 question.CreatedBy,
                        COALESCE(NULLIF(questionTeacher.FullName, ''), NULLIF(questionUser.FullName, '')) AS CreatorName
                    FROM Question question
                    LEFT JOIN Teacher questionTeacher ON questionTeacher.TeacherID = question.CreatedBy
                    LEFT JOIN [User] questionUser ON questionUser.UserID = question.CreatedBy
                    WHERE question.QuizID = q.QuizID AND question.CreatedBy IS NOT NULL
                    ORDER BY question.OrderIndex
                ) questionCreator
                LEFT JOIN (
                    SELECT QuizID, COUNT(*) AS QuestionCount
                    FROM Question
                    GROUP BY QuizID
                ) qc ON qc.QuizID = q.QuizID
                WHERE (@Scope = 'all'
                    OR (@Scope = 'mine' AND (q.CreatorID = @TeacherID OR EXISTS (SELECT 1 FROM Question ownQuestion WHERE ownQuestion.QuizID = q.QuizID AND ownQuestion.CreatedBy = @TeacherID)))
                    OR (@Scope = 'unassigned' AND (q.CreatorID IS NULL OR EXISTS (SELECT 1 FROM Question unassignedQuestion WHERE unassignedQuestion.QuizID = q.QuizID AND unassignedQuestion.CreatedBy IS NULL)))
                    OR (@Scope = 'creator' AND (q.CreatorID = @CreatorID OR EXISTS (SELECT 1 FROM Question selectedQuestion WHERE selectedQuestion.QuizID = q.QuizID AND selectedQuestion.CreatedBy = @CreatorID))))
                ORDER BY q.CreatedAt DESC";

            using var cmd = new SqlCommand(sql, conn);
            cmd.Parameters.Add(new SqlParameter("@Scope", SqlDbType.NVarChar, 20) { Value = scope });
            cmd.Parameters.Add(new SqlParameter("@TeacherID", SqlDbType.UniqueIdentifier) { Value = currentTeacherId.Value });
            cmd.Parameters.Add(new SqlParameter("@CreatorID", SqlDbType.UniqueIdentifier) { Value = Guid.TryParse(creatorId, out var selectedCreator) ? (object)selectedCreator : DBNull.Value });
            using (var reader = cmd.ExecuteReader())
            {
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
                        AudioURL = reader.IsDBNull(reader.GetOrdinal("AudioURL")) ? null : reader.GetString(reader.GetOrdinal("AudioURL")),
                        Transcript = reader.IsDBNull(reader.GetOrdinal("Transcript")) ? null : reader.GetString(reader.GetOrdinal("Transcript")),
                        QuestionCount = reader.IsDBNull(reader.GetOrdinal("QuestionCount")) ? 0 : reader.GetInt32(reader.GetOrdinal("QuestionCount")),
                        ModerationStatus = reader.IsDBNull(reader.GetOrdinal("ModerationStatus")) ? null : reader.GetString(reader.GetOrdinal("ModerationStatus")),
                        CreatorId = reader.IsDBNull(reader.GetOrdinal("CreatorID")) ? null : reader.GetGuid(reader.GetOrdinal("CreatorID")).ToString(),
                        CreatorName = reader.IsDBNull(reader.GetOrdinal("CreatorName")) ? null : reader.GetString(reader.GetOrdinal("CreatorName")),
                        ApprovedBy = reader.IsDBNull(reader.GetOrdinal("ApprovedBy")) ? null : reader.GetGuid(reader.GetOrdinal("ApprovedBy")).ToString(),
                        ApproverName = reader.IsDBNull(reader.GetOrdinal("ApproverName")) ? null : reader.GetString(reader.GetOrdinal("ApproverName")),
                        CanManage = reader.GetBoolean(reader.GetOrdinal("CanManage")),
                        CreatedAt = reader.GetDateTime(reader.GetOrdinal("CreatedAt"))
                    });
                }
            }
            var creators = new List<object>();
            using (var creatorsCmd = new SqlCommand(@"
                SELECT creatorId, creatorName FROM (
                    SELECT q.CreatorID AS creatorId, COALESCE(NULLIF(t.FullName, ''), NULLIF(u.FullName, '')) AS creatorName
                    FROM Quiz q LEFT JOIN Teacher t ON t.TeacherID = q.CreatorID LEFT JOIN [User] u ON u.UserID = q.CreatorID
                    WHERE q.CreatorID IS NOT NULL
                    UNION
                    SELECT question.CreatedBy, COALESCE(NULLIF(t.FullName, ''), NULLIF(u.FullName, ''))
                    FROM Question question LEFT JOIN Teacher t ON t.TeacherID = question.CreatedBy LEFT JOIN [User] u ON u.UserID = question.CreatedBy
                    WHERE question.CreatedBy IS NOT NULL
                ) creatorList ORDER BY creatorName", conn))
            using (var creatorsReader = creatorsCmd.ExecuteReader())
            {
                while (creatorsReader.Read()) creators.Add(new { id = creatorsReader.GetGuid(0).ToString(), name = creatorsReader.IsDBNull(1) ? "Unknown creator" : creatorsReader.GetString(1) });
            }
            return Ok(new { success = true, items = queue, creators });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { success = false, message = ex.Message });
        }
    }

    [HttpPost("moderation-decision")]
    public IActionResult UpdateModerationDecision([FromBody] ModerationDecisionRequest? req)
    {
        var authenticatedTeacherId = GetCurrentTeacherId();
        if (!authenticatedTeacherId.HasValue) return Unauthorized(new { success = false, message = "Sign in as a teacher to moderate quizzes." });
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

            Guid? passageId;
            Guid? audioId;
            const string selectQuiz = "SELECT PassageID, AudioID FROM Quiz WHERE QuizID = @QuizId";
            using (var cmd = new SqlCommand(selectQuiz, conn))
            {
                cmd.Parameters.Add(new SqlParameter("@QuizId", SqlDbType.UniqueIdentifier) { Value = quizId });
                using var reader = cmd.ExecuteReader();
                if (!reader.Read())
                {
                    return NotFound(new { success = false, message = "Quiz not found." });
                }
                passageId = reader.IsDBNull(0) ? null : reader.GetGuid(0);
                audioId = reader.IsDBNull(1) ? null : reader.GetGuid(1);
            }
            var teacherId = authenticatedTeacherId.Value;

            using (var tx = conn.BeginTransaction())
            {
                using (var updateQuiz = new SqlCommand(@"
                    UPDATE Quiz
                    SET Status = @Status,
                        ApprovedBy = CASE WHEN @Status = 'Approved' THEN @ApprovedBy ELSE ApprovedBy END,
                        ApprovedAt = @ApprovedAt
                    WHERE QuizID = @QuizId", conn, tx))
                {
                    updateQuiz.Parameters.Add(new SqlParameter("@Status", SqlDbType.NVarChar, 20) { Value = decisionStatus });
                    updateQuiz.Parameters.Add(new SqlParameter("@ApprovedBy", SqlDbType.UniqueIdentifier) { Value = teacherId });
                    updateQuiz.Parameters.Add(new SqlParameter("@ApprovedAt", SqlDbType.DateTime) { Value = DateTime.UtcNow });
                    updateQuiz.Parameters.Add(new SqlParameter("@QuizId", SqlDbType.UniqueIdentifier) { Value = quizId });
                    updateQuiz.ExecuteNonQuery();
                }

                using (var updateQuestions = new SqlCommand(@"
                    UPDATE Question
                    SET ModerationStatus = @ModerationStatus,
                        ModeratedBy = @ModeratedBy,
                        ModeratedByType = 'Teacher'
                    WHERE QuizID = @QuizId", conn, tx))
                {
                    updateQuestions.Parameters.Add(new SqlParameter("@ModerationStatus", SqlDbType.NVarChar, 20) { Value = passageStatus });
                    updateQuestions.Parameters.Add(new SqlParameter("@ModeratedBy", SqlDbType.UniqueIdentifier) { Value = teacherId });
                    updateQuestions.Parameters.Add(new SqlParameter("@QuizId", SqlDbType.UniqueIdentifier) { Value = quizId });
                    updateQuestions.ExecuteNonQuery();
                }

                using (var updateMaterials = new SqlCommand("UPDATE Material SET Status = @Status WHERE QuizID = @QuizId", conn, tx))
                {
                    updateMaterials.Parameters.Add(new SqlParameter("@Status", SqlDbType.NVarChar, 20) { Value = passageStatus });
                    updateMaterials.Parameters.Add(new SqlParameter("@QuizId", SqlDbType.UniqueIdentifier) { Value = quizId });
                    updateMaterials.ExecuteNonQuery();
                }

                if (passageId.HasValue)
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
                    updatePassage.Parameters.Add(new SqlParameter("@ModeratedBy", SqlDbType.UniqueIdentifier) { Value = teacherId });
                    updatePassage.Parameters.Add(new SqlParameter("@ModeratedByType", SqlDbType.NVarChar, 20) { Value = "Teacher" });
                    updatePassage.Parameters.Add(new SqlParameter("@ModeratedAt", SqlDbType.DateTime) { Value = DateTime.UtcNow });
                    updatePassage.Parameters.Add(new SqlParameter("@RejectionReason", SqlDbType.NVarChar, 500) { Value = string.IsNullOrWhiteSpace(req.RejectionReason) ? DBNull.Value : (object)req.RejectionReason.Trim() });
                    updatePassage.Parameters.Add(new SqlParameter("@UpdatedAt", SqlDbType.DateTime) { Value = DateTime.UtcNow });
                    updatePassage.Parameters.Add(new SqlParameter("@PassageId", SqlDbType.UniqueIdentifier) { Value = passageId.Value });
                    updatePassage.ExecuteNonQuery();
                }

                if (audioId.HasValue)
                using (var updateAudio = new SqlCommand(@"
                    UPDATE ListeningAudio
                    SET ModerationStatus = @ModerationStatus,
                        ModeratedBy = @ModeratedBy,
                        ModeratedByType = @ModeratedByType,
                        ModeratedAt = @ModeratedAt,
                        RejectionReason = @RejectionReason,
                        UpdatedAt = @UpdatedAt
                    WHERE AudioID = @AudioId", conn, tx))
                {
                    updateAudio.Parameters.Add(new SqlParameter("@ModerationStatus", SqlDbType.NVarChar, 20) { Value = passageStatus });
                    updateAudio.Parameters.Add(new SqlParameter("@ModeratedBy", SqlDbType.UniqueIdentifier) { Value = teacherId });
                    updateAudio.Parameters.Add(new SqlParameter("@ModeratedByType", SqlDbType.NVarChar, 20) { Value = "Teacher" });
                    updateAudio.Parameters.Add(new SqlParameter("@ModeratedAt", SqlDbType.DateTime) { Value = DateTime.UtcNow });
                    updateAudio.Parameters.Add(new SqlParameter("@RejectionReason", SqlDbType.NVarChar, 500) { Value = string.IsNullOrWhiteSpace(req.RejectionReason) ? DBNull.Value : (object)req.RejectionReason.Trim() });
                    updateAudio.Parameters.Add(new SqlParameter("@UpdatedAt", SqlDbType.DateTime) { Value = DateTime.UtcNow });
                    updateAudio.Parameters.Add(new SqlParameter("@AudioId", SqlDbType.UniqueIdentifier) { Value = audioId.Value });
                    updateAudio.ExecuteNonQuery();
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

    [HttpGet("review-questions/{quizId}")]
    public IActionResult GetReviewQuestions(string quizId)
    {
        var teacherId = GetCurrentTeacherId();
        if (!teacherId.HasValue) return Unauthorized(new { success = false, message = "Sign in as a teacher to review questions." });
        if (!Guid.TryParse(quizId, out var parsedQuizId)) return BadRequest(new { success = false, message = "A valid quiz id is required." });
        try
        {
            using var conn = GetConnection(); conn.Open();
            const string sql = @"
                SELECT q.QuestionID, q.QuestionTypeID, q.Content, q.Options, q.CorrectAnswer, q.Explanation,
                       q.OrderIndex, q.Difficulty, q.CreatedBy, q.CreatedByType, q.ModerationStatus,
                       q.ModeratedBy, q.ModeratedByType, qt.Code AS QuestionTypeCode,
                       COALESCE(NULLIF(createdTeacher.FullName, ''), NULLIF(createdUser.FullName, '')) AS CreatorName,
                       COALESCE(NULLIF(moderator.FullName, ''), NULLIF(moderatorUser.FullName, '')) AS ModeratorName,
                       CAST(CASE WHEN quiz.CreatorID = @TeacherID OR EXISTS (SELECT 1 FROM Material ownMaterial WHERE ownMaterial.QuizID = quiz.QuizID AND ownMaterial.TeacherID = @TeacherID) THEN 1 ELSE 0 END AS bit) AS CanManage
                FROM Question q
                JOIN Quiz quiz ON quiz.QuizID = q.QuizID
                LEFT JOIN QuestionTypeCatalog qt ON qt.QuestionTypeID = q.QuestionTypeID
                LEFT JOIN Teacher createdTeacher ON createdTeacher.TeacherID = q.CreatedBy
                LEFT JOIN [User] createdUser ON createdUser.UserID = q.CreatedBy
                LEFT JOIN Teacher moderator ON moderator.TeacherID = q.ModeratedBy
                LEFT JOIN [User] moderatorUser ON moderatorUser.UserID = q.ModeratedBy
                WHERE q.QuizID = @QuizID
                ORDER BY q.OrderIndex, q.QuestionID";
            using var cmd = new SqlCommand(sql, conn);
            cmd.Parameters.Add(new SqlParameter("@QuizID", SqlDbType.UniqueIdentifier) { Value = parsedQuizId });
            cmd.Parameters.Add(new SqlParameter("@TeacherID", SqlDbType.UniqueIdentifier) { Value = teacherId.Value });
            using var reader = cmd.ExecuteReader();
            var items = new List<object>();
            while (reader.Read()) items.Add(new
            {
                questionId = reader.GetGuid(0).ToString(), questionTypeId = reader.GetInt32(1),
                content = reader.GetString(2), options = reader.IsDBNull(3) ? null : reader.GetString(3),
                correctAnswer = reader.IsDBNull(4) ? null : reader.GetString(4), explanation = reader.IsDBNull(5) ? null : reader.GetString(5),
                orderIndex = reader.GetInt32(6), difficulty = reader.IsDBNull(7) ? null : reader.GetString(7),
                createdBy = reader.IsDBNull(8) ? null : reader.GetGuid(8).ToString(), createdByType = reader.IsDBNull(9) ? null : reader.GetString(9),
                moderationStatus = reader.IsDBNull(10) ? "Pending" : reader.GetString(10), moderatedBy = reader.IsDBNull(11) ? null : reader.GetGuid(11).ToString(),
                moderatedByType = reader.IsDBNull(12) ? null : reader.GetString(12), questionTypeCode = reader.IsDBNull(13) ? null : reader.GetString(13),
                creatorName = reader.IsDBNull(14) ? null : reader.GetString(14), moderatorName = reader.IsDBNull(15) ? null : reader.GetString(15), canManage = reader.GetBoolean(16)
            });
            return Ok(new { success = true, items });
        }
        catch (Exception ex) { return StatusCode(500, new { success = false, message = ex.Message }); }
    }

    [HttpPost("review-questions/{quizId}")]
    public IActionResult AddReviewQuestion(string quizId, [FromBody] ReviewQuestionRequest? req)
    {
        var teacherId = GetCurrentTeacherId();
        if (!teacherId.HasValue) return Unauthorized(new { success = false, message = "Sign in as a teacher to add questions." });
        if (!Guid.TryParse(quizId, out var parsedQuizId) || req == null || req.QuestionTypeID <= 0 || string.IsNullOrWhiteSpace(req.Content))
            return BadRequest(new { success = false, message = "Quiz, question type, and question content are required." });
        try
        {
            using var conn = GetConnection(); conn.Open();
            if (!TeacherOwnsQuiz(conn, parsedQuizId, teacherId.Value)) return Forbid();
            var questionId = Guid.NewGuid();
            using var cmd = new SqlCommand(@"
                INSERT INTO Question (QuestionID, QuizID, Content, Options, CorrectAnswer, Explanation, OrderIndex,
                    QuestionTypeID, QuestionType, Difficulty, CreatedBy, CreatedByType, ModerationStatus)
                SELECT @QuestionID, @QuizID, @Content, @Options, @CorrectAnswer, @Explanation,
                    CASE WHEN @OrderIndex > 0 THEN @OrderIndex ELSE ISNULL(MAX(OrderIndex), 0) + 1 END,
                    @QuestionTypeID, qt.Code, @Difficulty, @TeacherID, 'Teacher', 'Pending'
                FROM QuestionTypeCatalog qt
                LEFT JOIN Question existing ON existing.QuizID = @QuizID
                WHERE qt.QuestionTypeID = @QuestionTypeID
                GROUP BY qt.Code", conn);
            cmd.Parameters.Add(new SqlParameter("@QuestionID", SqlDbType.UniqueIdentifier) { Value = questionId });
            cmd.Parameters.Add(new SqlParameter("@QuizID", SqlDbType.UniqueIdentifier) { Value = parsedQuizId });
            cmd.Parameters.Add(new SqlParameter("@Content", SqlDbType.NVarChar, -1) { Value = req.Content.Trim() });
            cmd.Parameters.Add(new SqlParameter("@Options", SqlDbType.NVarChar, -1) { Value = string.IsNullOrWhiteSpace(req.Options) ? DBNull.Value : req.Options });
            cmd.Parameters.Add(new SqlParameter("@CorrectAnswer", SqlDbType.NVarChar, 500) { Value = string.IsNullOrWhiteSpace(req.CorrectAnswer) ? DBNull.Value : req.CorrectAnswer });
            cmd.Parameters.Add(new SqlParameter("@Explanation", SqlDbType.NVarChar, -1) { Value = string.IsNullOrWhiteSpace(req.Explanation) ? DBNull.Value : req.Explanation });
            cmd.Parameters.Add(new SqlParameter("@OrderIndex", SqlDbType.Int) { Value = req.OrderIndex });
            cmd.Parameters.Add(new SqlParameter("@QuestionTypeID", SqlDbType.Int) { Value = req.QuestionTypeID });
            cmd.Parameters.Add(new SqlParameter("@Difficulty", SqlDbType.NVarChar, 20) { Value = NormalizeQuestionDifficulty(req.Difficulty) });
            cmd.Parameters.Add(new SqlParameter("@TeacherID", SqlDbType.UniqueIdentifier) { Value = teacherId.Value });
            if (cmd.ExecuteNonQuery() == 0) return BadRequest(new { success = false, message = "Question type not found or quiz unavailable." });
            return Ok(new { success = true, questionId = questionId.ToString() });
        }
        catch (Exception ex) { return StatusCode(500, new { success = false, message = ex.Message }); }
    }

    [HttpPut("review-question/{questionId}")]
    public IActionResult UpdateReviewQuestion(string questionId, [FromBody] ReviewQuestionRequest? req)
    {
        var teacherId = GetCurrentTeacherId();
        if (!teacherId.HasValue) return Unauthorized(new { success = false, message = "Sign in as a teacher to edit questions." });
        if (!Guid.TryParse(questionId, out var parsedQuestionId) || req == null || req.QuestionTypeID <= 0 || string.IsNullOrWhiteSpace(req.Content))
            return BadRequest(new { success = false, message = "Question type and content are required." });
        var moderationStatus = string.IsNullOrWhiteSpace(req.ModerationStatus) ? "Pending" : req.ModerationStatus.Trim();
        if (moderationStatus is not ("Pending" or "Approved" or "Rejected")) return BadRequest(new { success = false, message = "Moderation status must be Pending, Approved, or Rejected." });
        try
        {
            using var conn = GetConnection(); conn.Open();
            using var cmd = new SqlCommand(@"
                UPDATE q SET q.Content = @Content, q.Options = @Options, q.CorrectAnswer = @CorrectAnswer,
                    q.Explanation = @Explanation, q.QuestionTypeID = @QuestionTypeID, q.QuestionType = qt.Code,
                    q.Difficulty = @Difficulty, q.OrderIndex = @OrderIndex, q.ModerationStatus = @ModerationStatus,
                    q.ModeratedBy = @TeacherID, q.ModeratedByType = 'Teacher'
                FROM Question q JOIN QuestionTypeCatalog qt ON qt.QuestionTypeID = @QuestionTypeID
                WHERE q.QuestionID = @QuestionID AND EXISTS (SELECT 1 FROM Quiz ownerQuiz WHERE ownerQuiz.QuizID = q.QuizID AND
                    (ownerQuiz.CreatorID = @TeacherID OR EXISTS (SELECT 1 FROM Material ownerMaterial WHERE ownerMaterial.QuizID = ownerQuiz.QuizID AND ownerMaterial.TeacherID = @TeacherID)))", conn);
            cmd.Parameters.Add(new SqlParameter("@QuestionID", SqlDbType.UniqueIdentifier) { Value = parsedQuestionId });
            cmd.Parameters.Add(new SqlParameter("@Content", SqlDbType.NVarChar, -1) { Value = req.Content.Trim() });
            cmd.Parameters.Add(new SqlParameter("@Options", SqlDbType.NVarChar, -1) { Value = string.IsNullOrWhiteSpace(req.Options) ? DBNull.Value : req.Options });
            cmd.Parameters.Add(new SqlParameter("@CorrectAnswer", SqlDbType.NVarChar, 500) { Value = string.IsNullOrWhiteSpace(req.CorrectAnswer) ? DBNull.Value : req.CorrectAnswer });
            cmd.Parameters.Add(new SqlParameter("@Explanation", SqlDbType.NVarChar, -1) { Value = string.IsNullOrWhiteSpace(req.Explanation) ? DBNull.Value : req.Explanation });
            cmd.Parameters.Add(new SqlParameter("@QuestionTypeID", SqlDbType.Int) { Value = req.QuestionTypeID });
            cmd.Parameters.Add(new SqlParameter("@Difficulty", SqlDbType.NVarChar, 20) { Value = NormalizeQuestionDifficulty(req.Difficulty) });
            cmd.Parameters.Add(new SqlParameter("@OrderIndex", SqlDbType.Int) { Value = req.OrderIndex });
            cmd.Parameters.Add(new SqlParameter("@ModerationStatus", SqlDbType.NVarChar, 20) { Value = moderationStatus });
            cmd.Parameters.Add(new SqlParameter("@TeacherID", SqlDbType.UniqueIdentifier) { Value = teacherId.Value });
            if (cmd.ExecuteNonQuery() == 0) return NotFound(new { success = false, message = "Question not found." });
            return Ok(new { success = true, moderationStatus, moderatedBy = teacherId.Value });
        }
        catch (Exception ex) { return StatusCode(500, new { success = false, message = ex.Message }); }
    }

    [HttpDelete("review-question/{questionId}")]
    public IActionResult DeleteReviewQuestion(string questionId)
    {
        var teacherId = GetCurrentTeacherId();
        if (!teacherId.HasValue) return Unauthorized(new { success = false, message = "Sign in as a teacher to delete questions." });
        if (!Guid.TryParse(questionId, out var parsedQuestionId)) return BadRequest(new { success = false, message = "A valid question id is required." });
        try
        {
            using var conn = GetConnection(); conn.Open(); using var tx = conn.BeginTransaction();
            using (var owner = new SqlCommand(@"SELECT q.QuizID FROM Question question JOIN Quiz q ON q.QuizID = question.QuizID
                WHERE question.QuestionID = @QuestionID AND (q.CreatorID = @TeacherID OR EXISTS
                (SELECT 1 FROM Material m WHERE m.QuizID = q.QuizID AND m.TeacherID = @TeacherID))", conn, tx))
            {
                owner.Parameters.Add(new SqlParameter("@QuestionID", SqlDbType.UniqueIdentifier) { Value = parsedQuestionId });
                owner.Parameters.Add(new SqlParameter("@TeacherID", SqlDbType.UniqueIdentifier) { Value = teacherId.Value });
                if (owner.ExecuteScalar() == null) return Forbid();
            }
            using (var answers = new SqlCommand("DELETE FROM AnswerRecord WHERE QuestionID = @QuestionID", conn, tx))
            { answers.Parameters.Add(new SqlParameter("@QuestionID", SqlDbType.UniqueIdentifier) { Value = parsedQuestionId }); answers.ExecuteNonQuery(); }
            using var cmd = new SqlCommand("DELETE FROM Question WHERE QuestionID = @QuestionID", conn, tx);
            cmd.Parameters.Add(new SqlParameter("@QuestionID", SqlDbType.UniqueIdentifier) { Value = parsedQuestionId });
            if (cmd.ExecuteNonQuery() == 0) return NotFound(new { success = false, message = "Question not found." });
            tx.Commit(); return Ok(new { success = true });
        }
        catch (Exception ex) { return StatusCode(500, new { success = false, message = ex.Message }); }
    }

    [HttpPost("repair-missing-creators")]
    public IActionResult RepairMissingCreators()
    {
        if (!GetCurrentTeacherId().HasValue) return Unauthorized(new { success = false, message = "Sign in as a teacher to repair creator records." });
        try
        {
            using var conn = GetConnection(); conn.Open(); using var tx = conn.BeginTransaction();
            int quizzes, questions, passages, audios;
            using (var cmd = new SqlCommand("UPDATE Quiz SET CreatorID = ApprovedBy WHERE CreatorID IS NULL AND ApprovedBy IS NOT NULL AND Status = 'Approved'; SELECT @@ROWCOUNT;", conn, tx)) quizzes = Convert.ToInt32(cmd.ExecuteScalar());
            using (var cmd = new SqlCommand(@"UPDATE Question SET CreatedBy = ModeratedBy, CreatedByType = ModeratedByType
                WHERE CreatedBy IS NULL AND ModeratedBy IS NOT NULL AND ModerationStatus = 'Approved'; SELECT @@ROWCOUNT;", conn, tx)) questions = Convert.ToInt32(cmd.ExecuteScalar());
            using (var cmd = new SqlCommand(@"UPDATE ReadingPassage SET CreatedBy = ModeratedBy, CreatedByType = ModeratedByType
                WHERE CreatedBy IS NULL AND ModeratedBy IS NOT NULL AND ModerationStatus = 'Approved'; SELECT @@ROWCOUNT;", conn, tx)) passages = Convert.ToInt32(cmd.ExecuteScalar());
            using (var cmd = new SqlCommand(@"UPDATE ListeningAudio SET CreatedBy = ModeratedBy, CreatedByType = ModeratedByType
                WHERE CreatedBy IS NULL AND ModeratedBy IS NOT NULL AND ModerationStatus = 'Approved'; SELECT @@ROWCOUNT;", conn, tx)) audios = Convert.ToInt32(cmd.ExecuteScalar());
            tx.Commit(); return Ok(new { success = true, updated = new { quizzes, questions, passages, audios } });
        }
        catch (Exception ex) { return StatusCode(500, new { success = false, message = ex.Message }); }
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
        var teacherId = GetCurrentTeacherId();
        if (!teacherId.HasValue) return Unauthorized(new { success = false, message = "Sign in as a teacher to edit quizzes." });
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
            string selectQuiz = @"SELECT PassageID FROM Quiz WHERE QuizID = @QuizId AND
                (CreatorID = @TeacherId OR EXISTS (SELECT 1 FROM Material WHERE QuizID = @QuizId AND TeacherID = @TeacherId))";
            object? passageIdObj;
            using (var cmd = new SqlCommand(selectQuiz, conn, tx))
            {
                cmd.Parameters.Add(new SqlParameter("@QuizId", SqlDbType.UniqueIdentifier) { Value = quizId });
                cmd.Parameters.Add(new SqlParameter("@TeacherId", SqlDbType.UniqueIdentifier) { Value = teacherId.Value });
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
        var session = GetCurrentSession();
        var isAdmin = string.Equals(session?.UserType, "Admin", StringComparison.OrdinalIgnoreCase);
        var teacherId = isAdmin ? null : GetCurrentTeacherId();
        if (session == null || (!isAdmin && !teacherId.HasValue))
            return Unauthorized(new { success = false, message = "Sign in to delete a lesson." });
        if (string.IsNullOrWhiteSpace(id) || !Guid.TryParse(id, out var quizId))
        {
            return BadRequest(new { success = false, message = "A valid quiz id is required." });
        }

        try
        {
            using var conn = GetConnection();
            conn.Open();
            using var tx = conn.BeginTransaction();

            // Get linked content IDs before deleting Quiz.
            const string selectQuiz = "SELECT PassageID, AudioID FROM Quiz WHERE QuizID = @QuizId";
            Guid? passageId;
            Guid? audioId;
            using (var cmd = new SqlCommand(selectQuiz, conn, tx))
            {
                cmd.Parameters.Add(new SqlParameter("@QuizId", SqlDbType.UniqueIdentifier) { Value = quizId });
                using var reader = cmd.ExecuteReader();
                if (!reader.Read()) return NotFound(new { success = false, message = "Quiz not found." });
                passageId = reader.IsDBNull(0) ? null : reader.GetGuid(0);
                audioId = reader.IsDBNull(1) ? null : reader.GetGuid(1);
            }

            if (!isAdmin)
            {
                using var ownerCheck = new SqlCommand("SELECT COUNT(1) FROM Material WHERE QuizID = @QuizId AND TeacherID = @TeacherID", conn, tx);
                ownerCheck.Parameters.Add(new SqlParameter("@QuizId", SqlDbType.UniqueIdentifier) { Value = quizId });
                ownerCheck.Parameters.Add(new SqlParameter("@TeacherID", SqlDbType.UniqueIdentifier) { Value = teacherId!.Value });
                if (Convert.ToInt32(ownerCheck.ExecuteScalar()) == 0) return Forbid();
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

            // Remove any lesson row linked to this quiz before deleting it.
            using (var cmd = new SqlCommand("DELETE FROM Material WHERE QuizID = @QuizId", conn, tx))
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
            if (passageId.HasValue)
            {
                using (var cmd = new SqlCommand("DELETE FROM ReadingPassage WHERE PassageID = @PassageId", conn, tx))
                {
                    cmd.Parameters.Add(new SqlParameter("@PassageId", SqlDbType.UniqueIdentifier) { Value = passageId.Value });
                    cmd.ExecuteNonQuery();
                }
            }

            if (audioId.HasValue)
            {
                using (var cmd = new SqlCommand("DELETE FROM ListeningAudio WHERE AudioID = @AudioId", conn, tx))
                {
                    cmd.Parameters.Add(new SqlParameter("@AudioId", SqlDbType.UniqueIdentifier) { Value = audioId.Value });
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
