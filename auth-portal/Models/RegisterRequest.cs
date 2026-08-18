namespace AuthPortal.Models;

public class RegisterRequest
{
    public string Username { get; set; } = string.Empty;
    public string Password { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string UserType { get; set; } = string.Empty; // "Student" or "Teacher"

    // Optional fields (Required for Teacher)
    public string? FullName { get; set; }
    public string? PhoneNumber { get; set; }
    public string? Avatar { get; set; }
    public string? Biography { get; set; }
    public string? Qualification { get; set; }
    public string? QualificationFileURL { get; set; }
    public double? IELTSBand { get; set; }
    public int? ExperienceYears { get; set; }
    public string? Specialization { get; set; }
}
