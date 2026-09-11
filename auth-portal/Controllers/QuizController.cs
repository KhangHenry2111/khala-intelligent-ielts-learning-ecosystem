namespace AuthPortal.Controllers;

using System;
using System.Collections.Generic;
using System.Data;
using AuthPortal.Models;
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

    private SqlConnection GetConnection()
    {
        if (string.IsNullOrWhiteSpace(_connectionString))
        {
            throw new InvalidOperationException("Connection string 'Default' is not configured.");
        }
        return new SqlConnection(_connectionString);
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
            using var tx = conn.BeginTransaction();

            Guid quizId = Guid.NewGuid();
            Guid? passageId = null;
            int questionsCount = 0;

            // 1. Normalize fields according to Database CHECK constraints
            string normalizedSource = "AI";
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
                if (sLower.Contains("writing") && !sLower.Contains("reading"))
                    normalizedSkill = "Writing";
                else if (sLower.Contains("all") || sLower.Contains("toàn") || sLower.Contains("speaking") || sLower.Contains("listening") || (sLower.Contains("reading") && sLower.Contains("writing")))
                    normalizedSkill = "Reading+Writing";
                else
                    normalizedSkill = "Reading";
            }

            // 2. If passage is provided, save ReadingPassage with ModerationStatus = 'Pending'
            if (req.Passage != null && !string.IsNullOrWhiteSpace(req.Passage.Content))
            {
                passageId = Guid.NewGuid();
                string insertPassageSql = @"
                    INSERT INTO ReadingPassage (
                        PassageID, Title, Content, WordCount, Topic, Level, Source, 
                        CreatedByType, ModerationStatus, CreatedAt, UpdatedAt
                    ) VALUES (
                        @PassageID, @Title, @Content, @WordCount, @Topic, @Level, @Source, 
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
                cmdPassage.Parameters.Add(new SqlParameter("@CreatedByType", SqlDbType.NVarChar, 20) { Value = "AI" });
                cmdPassage.Parameters.Add(new SqlParameter("@ModerationStatus", SqlDbType.NVarChar, 20) { Value = "Pending" });
                cmdPassage.Parameters.Add(new SqlParameter("@CreatedAt", SqlDbType.DateTime) { Value = DateTime.UtcNow });
                cmdPassage.Parameters.Add(new SqlParameter("@UpdatedAt", SqlDbType.DateTime) { Value = DateTime.UtcNow });

                cmdPassage.ExecuteNonQuery();
            }

            // 3. Insert Quiz with Status = 'Draft'
            string insertQuizSql = @"
                INSERT INTO Quiz (
                    QuizID, Title, Skill, Level, Source, CreatorID, Status, CreatedAt, PassageID
                ) VALUES (
                    @QuizID, @Title, @Skill, @Level, @Source, @CreatorID, @Status, @CreatedAt, @PassageID
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
                                    CorrectAnswer, Explanation, OrderIndex, GroupID, QuestionTypeID
                                ) VALUES (
                                    @QuestionID, @QuizID, @QuestionType, @Content, @Options, 
                                    @CorrectAnswer, @Explanation, @OrderIndex, @GroupID, @QuestionTypeID
                                )";

                            using var cmdQ = new SqlCommand(insertQSql, conn, tx);
                            cmdQ.Parameters.Add(new SqlParameter("@QuestionID", SqlDbType.UniqueIdentifier) { Value = Guid.NewGuid() });
                            cmdQ.Parameters.Add(new SqlParameter("@QuizID", SqlDbType.UniqueIdentifier) { Value = quizId });
                            cmdQ.Parameters.Add(new SqlParameter("@QuestionType", SqlDbType.NVarChar, 30) { Value = q.QuestionType ?? "MULTIPLE_CHOICE_SINGLE" });
                            cmdQ.Parameters.Add(new SqlParameter("@Content", SqlDbType.NVarChar, -1) { Value = q.Content ?? string.Empty });
                            cmdQ.Parameters.Add(new SqlParameter("@Options", SqlDbType.NVarChar, -1) { Value = (object?)q.Options ?? DBNull.Value });
                            cmdQ.Parameters.Add(new SqlParameter("@CorrectAnswer", SqlDbType.NVarChar, 500) { Value = (object?)q.CorrectAnswer ?? DBNull.Value });
                            cmdQ.Parameters.Add(new SqlParameter("@Explanation", SqlDbType.NVarChar, -1) { Value = (object?)q.Explanation ?? DBNull.Value });
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
                            CorrectAnswer, Explanation, OrderIndex, GroupID, QuestionTypeID
                        ) VALUES (
                            @QuestionID, @QuizID, @QuestionType, @Content, @Options, 
                            @CorrectAnswer, @Explanation, @OrderIndex, NULL, @QuestionTypeID
                        )";

                    using var cmdQ = new SqlCommand(insertQSql, conn, tx);
                    cmdQ.Parameters.Add(new SqlParameter("@QuestionID", SqlDbType.UniqueIdentifier) { Value = Guid.NewGuid() });
                    cmdQ.Parameters.Add(new SqlParameter("@QuizID", SqlDbType.UniqueIdentifier) { Value = quizId });
                    cmdQ.Parameters.Add(new SqlParameter("@QuestionType", SqlDbType.NVarChar, 30) { Value = q.QuestionType ?? "MULTIPLE_CHOICE_SINGLE" });
                    cmdQ.Parameters.Add(new SqlParameter("@Content", SqlDbType.NVarChar, -1) { Value = q.Content ?? string.Empty });
                    cmdQ.Parameters.Add(new SqlParameter("@Options", SqlDbType.NVarChar, -1) { Value = (object?)q.Options ?? DBNull.Value });
                    cmdQ.Parameters.Add(new SqlParameter("@CorrectAnswer", SqlDbType.NVarChar, 500) { Value = (object?)q.CorrectAnswer ?? DBNull.Value });
                    cmdQ.Parameters.Add(new SqlParameter("@Explanation", SqlDbType.NVarChar, -1) { Value = (object?)q.Explanation ?? DBNull.Value });
                    cmdQ.Parameters.Add(new SqlParameter("@OrderIndex", SqlDbType.Int) { Value = q.OrderIndex > 0 ? q.OrderIndex : questionsCount });
                    cmdQ.Parameters.Add(new SqlParameter("@QuestionTypeID", SqlDbType.Int) { Value = qTypeId });

                    cmdQ.ExecuteNonQuery();
                }
            }

            tx.Commit();

            return Ok(new SaveQuizResponse
            {
                Success = true,
                Message = "Quiz successfully saved with unmoderated status (Draft / Pending).",
                QuizId = quizId.ToString(),
                PassageId = passageId?.ToString(),
                QuestionsCount = questionsCount
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
}
