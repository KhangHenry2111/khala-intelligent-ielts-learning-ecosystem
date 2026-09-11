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
    public PassageDto? Passage { get; set; }
    public List<QuestionGroupDto> QuestionGroups { get; set; } = new();
    public List<QuestionDto> DirectQuestions { get; set; } = new();
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
}

public class SaveQuizResponse
{
    public bool Success { get; set; }
    public string Message { get; set; } = string.Empty;
    public string? QuizId { get; set; }
    public string? PassageId { get; set; }
    public int QuestionsCount { get; set; }
}
