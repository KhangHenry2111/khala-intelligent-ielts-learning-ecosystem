using System;
using AuthPortal.Models;
using AuthPortal.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;
using System.Linq;
using System.Collections.Generic;
using System.Net.Http;

namespace AuthPortal.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AuthController : ControllerBase
{
    private readonly IAuthService _auth;
    private readonly IPasswordResetService _passwordReset;

    public AuthController(IAuthService auth, IPasswordResetService passwordReset)
    {
        _auth = auth;
        _passwordReset = passwordReset;
    }

    [HttpPut("profile")]
    public IActionResult UpdateProfile([FromBody] ProfileUpdateRequest? req)
    {
        var token = Request.Headers.Authorization.ToString()
            .Replace("Bearer ", "", StringComparison.OrdinalIgnoreCase).Trim();
        var user = _auth.GetSession(token);
        if (user == null)
            return Unauthorized(new { success = false, message = "A valid session is required." });
        if (!string.Equals(user.UserType, "User", StringComparison.OrdinalIgnoreCase)
            && !string.Equals(user.UserType, "Student", StringComparison.OrdinalIgnoreCase))
            return Forbid();
        if (req == null || string.IsNullOrWhiteSpace(req.FullName) || string.IsNullOrWhiteSpace(req.Email))
            return BadRequest(new { success = false, message = "Name and email are required." });
        if (req.DateOfBirth > DateTime.Today)
            return BadRequest(new { success = false, message = "Date of birth cannot be in the future." });
        var allowedGenders = new[] { "Female", "Male", "Other", "Prefer not to say" };
        var gender = allowedGenders.FirstOrDefault(value =>
            string.Equals(value, req.Gender?.Trim(), StringComparison.OrdinalIgnoreCase));
        if (!string.IsNullOrWhiteSpace(req.Gender) && gender == null)
            return BadRequest(new { success = false, message = "Choose a valid gender option." });
        req.Gender = gender;
        if (!string.IsNullOrWhiteSpace(req.Avatar)
            && (!Uri.TryCreate(req.Avatar, UriKind.Absolute, out var avatarUri)
                || (avatarUri.Scheme != Uri.UriSchemeHttps && avatarUri.Scheme != Uri.UriSchemeHttp)))
            return BadRequest(new { success = false, message = "Profile photo must be an HTTP or HTTPS URL." });

        try
        {
            if (!_auth.UpdateUserProfile(token, req))
                return NotFound(new { success = false, message = "The user profile could not be found." });

            return Ok(new
            {
                success = true,
                user = new
                {
                    fullName = req.FullName.Trim(),
                    email = req.Email.Trim(),
                    details = new
                    {
                        PhoneNumber = req.PhoneNumber?.Trim(),
                        DateOfBirth = req.DateOfBirth?.Date,
                        Gender = req.Gender?.Trim(),
                        Avatar = req.Avatar?.Trim()
                    }
                }
            });
        }
        catch (SqlException ex) when (ex.Number is 2601 or 2627)
        {
            return Conflict(new { success = false, message = "That email address is already in use." });
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[AuthController] Profile update failed: {ex}");
            return StatusCode(500, new { success = false, message = "An error occurred while updating the profile." });
        }
    }

    [HttpPost("login")]
    public IActionResult Login([FromBody] LoginRequest req)
    {
        try
        {
            Console.WriteLine($"\n[AuthController] ======================================");
            Console.WriteLine($"[AuthController] Login attempt at {DateTime.Now:yyyy-MM-dd HH:mm:ss}");
            Console.WriteLine($"[AuthController] Username: {req.Username}");
            Console.WriteLine($"[AuthController] Password: {new string('*', req.Password?.Length ?? 0)}");
            Console.WriteLine($"[AuthController] User Type: {req.UserType}");
            Console.WriteLine($"[AuthController] ======================================");
            
            if (string.IsNullOrWhiteSpace(req.Username))
            {
                Console.WriteLine("[AuthController] ✗ ERROR: Username is empty");
                return BadRequest(new { success = false, message = "Username is required" });
            }

            if (string.IsNullOrWhiteSpace(req.Password))
            {
                Console.WriteLine("[AuthController] ✗ ERROR: Password is empty");
                return BadRequest(new { success = false, message = "Password is required" });
            }

            var user = _auth.Authenticate(req.Username.Trim(), req.Password, req.UserType);

            if (user is not null)
            {
                Console.WriteLine($"[AuthController] ✓ SUCCESS: Login successful for user: {user.Username}");
                _auth.PrintUserInfo(user);
                
                var token = _auth.CreateSession(user);
                return Ok(new {
                    success = true, 
                    message = "Login successful",
                    token,
                    user = new {
                        id = user.Id,
                        username = user.Username,
                        fullName = user.FullName,
                        email = user.Email,
                        userType = user.UserType,
                        details = user.Details
                            .Where(detail => !string.Equals(detail.Key, "Password", StringComparison.OrdinalIgnoreCase))
                            .ToDictionary(detail => detail.Key, detail => detail.Value)
                    }
                });
            }

            Console.WriteLine($"[AuthController] ✗ FAILED: Invalid credentials for username: {req.Username}");
            Console.WriteLine($"[AuthController] ======================================\n");
            return Unauthorized(new { success = false, message = "Invalid username or password" });
        }
        catch (Exception ex)
        {
            Console.WriteLine($"\n[AuthController] ✗✗✗ EXCEPTION OCCURRED ✗✗✗");
            Console.WriteLine($"[AuthController] Timestamp: {DateTime.Now:yyyy-MM-dd HH:mm:ss}");
            Console.WriteLine($"[AuthController] Exception Type: {ex.GetType().Name}");
            Console.WriteLine($"[AuthController] Message: {ex.Message}");
            Console.WriteLine($"[AuthController] Stack Trace: {ex.StackTrace}");
            if (ex.InnerException != null)
            {
                Console.WriteLine($"[AuthController] Inner Exception: {ex.InnerException.Message}");
            }
            Console.WriteLine($"[AuthController] ✗✗✗ END EXCEPTION ✗✗✗\n");

            return StatusCode(500, new { 
                success = false, 
                message = "An error occurred during login",
                error = ex.Message
            });
        }
    }
    [HttpPost("register")]
    public IActionResult Register([FromBody] RegisterRequest req)
    {
        try
        {
            // Validate Header
            if (!Request.Headers.TryGetValue("X-Frontend-Client", out _))
            {
                return StatusCode(403, new { success = false, message = "Forbidden: Invalid client request" });
            }

            Console.WriteLine($"\n[AuthController] ======================================");
            Console.WriteLine($"[AuthController] Register attempt at {DateTime.Now:yyyy-MM-dd HH:mm:ss}");
            Console.WriteLine($"[AuthController] Username: {req.Username}");
            Console.WriteLine($"[AuthController] Email: {req.Email}");
            Console.WriteLine($"[AuthController] User Type: {req.UserType}");
            Console.WriteLine($"[AuthController] ======================================");

            // Admin account registration is forbidden
            if (string.Equals(req.UserType, "admin", StringComparison.OrdinalIgnoreCase))
            {
                return StatusCode(403, new { success = false, message = "Forbidden: Admin accounts cannot be created via this API." });
            }

            if (!ModelState.IsValid)
            {
                return BadRequest(new { success = false, message = "Invalid registration data.", errors = ModelState.Values.SelectMany(value => value.Errors).Select(error => error.ErrorMessage) });
            }

            if (string.IsNullOrWhiteSpace(req.Username) || string.IsNullOrWhiteSpace(req.Password) || string.IsNullOrWhiteSpace(req.Email) || string.IsNullOrWhiteSpace(req.UserType))
            {
                return BadRequest(new { success = false, message = "Username, Password, Email, and UserType are required." });
            }

            // Teacher required fields validation
            if (string.Equals(req.UserType, "teacher", StringComparison.OrdinalIgnoreCase) || string.Equals(req.UserType, "instructor", StringComparison.OrdinalIgnoreCase))
            {
                if (string.IsNullOrWhiteSpace(req.FullName) ||
                    string.IsNullOrWhiteSpace(req.PhoneNumber) ||
                    string.IsNullOrWhiteSpace(req.Avatar) ||
                    string.IsNullOrWhiteSpace(req.Biography) ||
                    string.IsNullOrWhiteSpace(req.Qualification) ||
                    string.IsNullOrWhiteSpace(req.QualificationFileURL) ||
                    string.IsNullOrWhiteSpace(req.Specialization) ||
                    !req.IELTSBand.HasValue ||
                    !req.ExperienceYears.HasValue)
                {
                    return BadRequest(new { success = false, message = "All teacher fields (FullName, PhoneNumber, Avatar, Biography, Qualification, QualificationFileURL, Specialization, IELTSBand, ExperienceYears) are required." });
                }
            }

            bool success = _auth.RegisterUser(req, out string errorMessage);
            if (success)
            {
                Console.WriteLine($"[AuthController] ✓ SUCCESS: User registered successfully: {req.Username}");
                return Ok(new { success = true, message = "Registration successful" });
            }
            else
            {
                Console.WriteLine($"[AuthController] ✗ FAILED: Registration error: {errorMessage}");
                return BadRequest(new { success = false, message = errorMessage });
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[AuthController] ✗✗✗ EXCEPTION OCCURRED DURING REGISTER ✗✗✗");
            Console.WriteLine($"[AuthController] Message: {ex.Message}");
            return StatusCode(500, new { success = false, message = "An error occurred during registration" });
        }
    }

    [HttpPost("forgot-password")]
    public async Task<IActionResult> RequestPasswordReset([FromBody] PasswordResetCodeRequest req)
    {
        if (!IsPasswordResetRoleAllowed(req.UserType))
            return StatusCode(403, new { success = false, message = "Password reset is available only for User and Teacher accounts." });
        if (!ModelState.IsValid)
            return BadRequest(new { success = false, message = "Invalid password reset request." });

        try
        {
            await _passwordReset.RequestCodeAsync(req);
            return Ok(new
            {
                success = true,
                message = "If the account details match, a verification code will be sent."
            });
        }
        catch (HttpRequestException ex)
        {
            Console.Error.WriteLine($"[AuthController] Password reset code delivery failed: {ex}");
            return StatusCode(503, new { success = false, message = "The verification code could not be sent. Check the email/SMS service configuration." });
        }
        catch (InvalidOperationException ex)
        {
            Console.Error.WriteLine($"[AuthController] Password reset is not configured: {ex}");
            return StatusCode(503, new { success = false, message = "Password reset is not configured. Check config.cfg and the notification service." });
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[AuthController] Password reset request failed: {ex}");
            return StatusCode(500, new { success = false, message = "An error occurred while requesting a password reset." });
        }
    }

    [HttpPost("reset-password")]
    public async Task<IActionResult> ResetPassword([FromBody] PasswordResetConfirmRequest req)
    {
        if (!IsPasswordResetRoleAllowed(req.UserType))
            return StatusCode(403, new { success = false, message = "Password reset is available only for User and Teacher accounts." });
        if (!ModelState.IsValid)
            return BadRequest(new { success = false, message = "Invalid password reset data." });

        try
        {
            if (!await _passwordReset.ResetPasswordAsync(req))
                return BadRequest(new { success = false, message = "The verification code is invalid or expired." });

            return Ok(new { success = true, message = "Password reset successful." });
        }
        catch (InvalidOperationException ex)
        {
            Console.Error.WriteLine($"[AuthController] Password reset is not configured: {ex}");
            return StatusCode(503, new { success = false, message = "Password reset is not configured. Check config.cfg." });
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[AuthController] Password update failed: {ex}");
            return StatusCode(500, new { success = false, message = "An error occurred while resetting the password." });
        }
    }

    [HttpPost("logout")]
    public IActionResult Logout([FromBody] LogoutRequest? req)
    {
        var token = req?.Token ?? Request.Headers.Authorization.ToString().Replace("Bearer ", "", StringComparison.OrdinalIgnoreCase).Trim();
        if (string.IsNullOrWhiteSpace(token))
            return BadRequest(new { success = false, message = "Token is required" });

        _auth.RevokeSession(token);
        return Ok(new { success = true, message = "Logout successful" });
    }

    private static bool IsPasswordResetRoleAllowed(string? userType) =>
        string.Equals(userType?.Trim(), "user", StringComparison.OrdinalIgnoreCase)
        || string.Equals(userType?.Trim(), "student", StringComparison.OrdinalIgnoreCase)
        || string.Equals(userType?.Trim(), "teacher", StringComparison.OrdinalIgnoreCase)
        || string.Equals(userType?.Trim(), "instructor", StringComparison.OrdinalIgnoreCase);
}
