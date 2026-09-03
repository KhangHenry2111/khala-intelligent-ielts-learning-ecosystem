namespace AuthPortal.Models;

using System;
using System.ComponentModel.DataAnnotations;

public class RegisterRequest
{
    [Required, StringLength(100, MinimumLength = 3)]
    public string Username { get; set; } = string.Empty;
    [Required, StringLength(255, MinimumLength = 8)]
    public string Password { get; set; } = string.Empty;
    [Required, EmailAddress, StringLength(255)]
    public string Email { get; set; } = string.Empty;
    public string UserType { get; set; } = string.Empty; // "Student" or "Teacher"

    // Optional fields (Required for Teacher)
    public string? FullName { get; set; }
    [Phone, StringLength(20)]
    public string? PhoneNumber { get; set; }
    public DateTime? DateOfBirth { get; set; }
    public string? Gender { get; set; }
    public string? Avatar { get; set; }
    public string? Biography { get; set; }
    public string? Qualification { get; set; }
    public string? QualificationFileURL { get; set; }
    public double? IELTSBand { get; set; }
    public int? ExperienceYears { get; set; }
    public string? Specialization { get; set; }
}
