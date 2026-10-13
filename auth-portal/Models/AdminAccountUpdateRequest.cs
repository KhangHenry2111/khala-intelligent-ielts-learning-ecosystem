namespace AuthPortal.Models;

public class AdminAccountUpdateRequest
{
    public string? FullName { get; set; }
    public string? Username { get; set; }
    public string? Email { get; set; }
    public string? PhoneNumber { get; set; }
    public string? Avatar { get; set; }
    public string? Role { get; set; }
    public string? Status { get; set; }
    public string? NewPassword { get; set; }

    public DateTime? DateOfBirth { get; set; }
    public string? Gender { get; set; }
    public bool? EmailVerified { get; set; }
    public bool? PhoneVerified { get; set; }
    public double? CurrentBand { get; set; }
    public double? TargetBand { get; set; }
    public double? SpeakingBand { get; set; }
    public double? ListeningBand { get; set; }
    public double? ReadingBand { get; set; }
    public double? WritingBand { get; set; }
    public string? LearningLevel { get; set; }
    public string? Rank { get; set; }
    public Guid? PackageId { get; set; }

    public string? Biography { get; set; }
    public string? Qualification { get; set; }
    public string? QualificationFileUrl { get; set; }
    public double? IeltsBand { get; set; }
    public int? ExperienceYears { get; set; }
    public string? Specialization { get; set; }
    public string? VerificationStatus { get; set; }
}
