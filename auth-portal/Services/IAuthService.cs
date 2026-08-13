namespace AuthPortal.Services;

using AuthPortal.Models;

public interface IAuthService
{
    /// <summary>
    /// Authenticate against configured user store. Returns a UserInfo when successful, null otherwise.
    /// </summary>
    UserInfo? Authenticate(string username, string password, string userType);
}
