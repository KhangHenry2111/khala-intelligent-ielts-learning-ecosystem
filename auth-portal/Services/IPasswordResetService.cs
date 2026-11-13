using AuthPortal.Models;

namespace AuthPortal.Services;

public interface IPasswordResetService
{
    Task RequestCodeAsync(PasswordResetCodeRequest request);
    Task<bool> ResetPasswordAsync(PasswordResetConfirmRequest request);
}
