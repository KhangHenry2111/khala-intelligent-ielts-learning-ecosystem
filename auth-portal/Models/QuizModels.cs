namespace AuthPortal.Models;

using System;
using System.Collections.Generic;

public class SaveQuizRequest
{
    public string Title { get; set; } = string.Empty;
    public string Skill { get; set; } = "Reading";
    public string? Level { get; set; } = "Intermediate";
    public string? Source { get; set; } = "AI_Generated";
    public string? CreatorId { get; set; }
    public string? Description { get; set; }
    public bool IsFree { get; set; } = true;
    public decimal Price { get; set; }
    public PassageDto? Passage { get; set; }
    public ListeningAudioDto? Audio { get; set; }
    public List<QuizSectionDto> Sections { get; set; } = new();
    public List<QuestionGroupDto> QuestionGroups { get; set; } = new();
    public List<QuestionDto> DirectQuestions { get; set; } = new();
}

public class QuizSectionDto
{
    public string SectionType { get; set; } = string.Empty;
    public string? Title { get; set; }
    public string Prompt { get; set; } = string.Empty;
    public string? Transcript { get; set; }
    public string? ModelAnswer { get; set; }
    public string? ExtraJson { get; set; }
    public int OrderIndex { get; set; } = 1;
}

public class ListeningAudioDto
{
    public string? AudioURL { get; set; }
    public string? Transcript { get; set; }
    public string? Topic { get; set; }
}

public class PassageDto
{
    public string Title { get; set; } = string.Empty;
    public string Content { get; set; } = string.Empty;
    public string? Topic { get; set; }
    public string? Level { get; set; }
    public int? WordCount { get; set; }
}

public class QuestionGroupDto
{
    public int? QuestionTypeID { get; set; }
    public string? QuestionTypeCode { get; set; }
    public string? Instruction { get; set; }
    public string? SharedOptions { get; set; }
    public string? WordLimit { get; set; }
    public int OrderIndex { get; set; } = 1;
    public List<QuestionDto> Questions { get; set; } = new();
}

public class QuestionDto
{
    public string QuestionType { get; set; } = "MULTIPLE_CHOICE_SINGLE";
    public int? QuestionTypeID { get; set; }
    public string? QuestionTypeCode { get; set; }
    public string Content { get; set; } = string.Empty;
    public string? Options { get; set; }
    public string? CorrectAnswer { get; set; }
    public string? Explanation { get; set; }
    public string? Difficulty { get; set; }
    public int OrderIndex { get; set; } = 1;
}

public class SaveKnowledgeRequest
{
    public string Title { get; set; } = string.Empty;
    public string? Category { get; set; } = "Quiz_Export";
    public string? Content { get; set; }
    public string? FileURL { get; set; }
    public string? Source { get; set; } = "AI_Generated";
    public string? UploadedBy { get; set; }
    public string? UploadedByUserId { get; set; }
}

public class ModerationDecisionRequest
{
    public string QuizId { get; set; } = string.Empty;
    public string Status { get; set; } = "Approved";
    public string? RejectionReason { get; set; }
    public string? TeacherId { get; set; }
}

public class ReviewQuestionRequest
{
    public int QuestionTypeID { get; set; }
    public string Content { get; set; } = string.Empty;
    public string? Options { get; set; }
    public string? CorrectAnswer { get; set; }
    public string? Explanation { get; set; }
    public string? Difficulty { get; set; }
    public int OrderIndex { get; set; }
    public string? ModerationStatus { get; set; }
}

public class QuizModerationItem
{
    public string QuizId { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public string Skill { get; set; } = "Reading";
    public string Level { get; set; } = "Intermediate";
    public string Source { get; set; } = "AI";
    public string Status { get; set; } = "PendingReview";
    public string? PassageId { get; set; }
    public string? PassageTitle { get; set; }
    public string? Topic { get; set; }
    public int? WordCount { get; set; }
    public int QuestionCount { get; set; }
    public string? PassageContent { get; set; }
    public string? AudioURL { get; set; }
    public string? Transcript { get; set; }
    public string? ModerationStatus { get; set; }
    public string? CreatorId { get; set; }
    public string? CreatorName { get; set; }
    public string? ApprovedBy { get; set; }
    public string? ApproverName { get; set; }
    public bool CanManage { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public class SaveQuizResponse
{
    public bool Success { get; set; }
    public string Message { get; set; } = string.Empty;
    public string? QuizId { get; set; }
    public string? PassageId { get; set; }
    public int QuestionsCount { get; set; }
    public string? MaterialId { get; set; }
}

public class EditQuizRequest
{
    public string? Title { get; set; }
    public string? Level { get; set; }
    public string? Topic { get; set; }
    public string? PassageContent { get; set; }
}

public class MaterialStatusRequest
{
    public string Status { get; set; } = "Pending";
}

public class SubmitQuizAttemptRequest
{
    public string QuizId { get; set; } = string.Empty;
    public int TimeTaken { get; set; }
    public List<QuizAttemptAnswer> Answers { get; set; } = new();
}

public class QuizAttemptAnswer
{
    public string QuestionId { get; set; } = string.Empty;
    public string? Answer { get; set; }
    public int TimeSpent { get; set; }
}
