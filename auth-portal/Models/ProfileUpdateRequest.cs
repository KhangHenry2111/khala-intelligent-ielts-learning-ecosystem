using System.ComponentModel.DataAnnotations;

namespace AuthPortal.Models;

public class ProfileUpdateRequest
{
    [Required, StringLength(255)]
    public string FullName { get; set; } = string.Empty;

    [Required, EmailAddress, StringLength(255)]
    public string Email { get; set; } = string.Empty;

    [StringLength(20)]
    public string? PhoneNumber { get; set; }

    public DateTime? DateOfBirth { get; set; }

    [StringLength(20)]
    public string? Gender { get; set; }

    [StringLength(500)]
    public string? Avatar { get; set; }

}
