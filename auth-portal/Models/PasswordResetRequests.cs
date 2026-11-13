namespace AuthPortal.Models;

using System.ComponentModel.DataAnnotations;

public class PasswordResetCodeRequest
{
    [Required, StringLength(100)]
    public string Username { get; set; } = string.Empty;

    [Required, StringLength(20)]
    public string UserType { get; set; } = string.Empty;

    [Required, RegularExpression("^(email|phone)$", ErrorMessage = "Choose email or phone verification.")]
    public string Method { get; set; } = string.Empty;

    [Required, StringLength(255)]
    public string Destination { get; set; } = string.Empty;
}

public class PasswordResetConfirmRequest : PasswordResetCodeRequest
{
    [Required, RegularExpression("^\\d{8}$", ErrorMessage = "The verification code must contain 8 digits.")]
    public string Code { get; set; } = string.Empty;

    [Required, StringLength(255, MinimumLength = 8)]
    public string NewPassword { get; set; } = string.Empty;
}
