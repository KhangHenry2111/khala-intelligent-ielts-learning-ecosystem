namespace AuthPortal.Services;

using AuthPortal.Models;

public interface IAuthService
{
    /// <summary>
    /// Authenticate against configured user store. Returns a UserInfo when successful, null otherwise.
    /// </summary>
    UserInfo? Authenticate(string username, string password, string userType);

    string CreateSession(UserInfo user);

    bool RevokeSession(string token);
    UserInfo? GetSession(string token);
    int RevokeSessions(string userId, string userType);
    bool UpdateUserProfile(string token, ProfileUpdateRequest request);
    
    /// <summary>
    /// Print all user information to console
    /// </summary>
    void PrintUserInfo(UserInfo user);

    /// <summary>
    /// Registers a new user or teacher. Returns true if successful, false otherwise with an error message.
    /// </summary>
    bool RegisterUser(RegisterRequest req, out string errorMessage);
}
