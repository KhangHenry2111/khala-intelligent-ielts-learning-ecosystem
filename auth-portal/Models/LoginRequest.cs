namespace AuthPortal.Models;

using System.ComponentModel.DataAnnotations;

public class LoginRequest
{
    [Required]
    public string Username { get; set; } = string.Empty;
    [Required]
    public string Password { get; set; } = string.Empty;
    public string UserType { get; set; } = string.Empty; // Admin / Instructor / Student
}
