using System;
using AuthPortal.Models;
using AuthPortal.Services;
using Microsoft.AspNetCore.Mvc;

namespace AuthPortal.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AuthController : ControllerBase
{
    private readonly IAuthService _auth;

    public AuthController(IAuthService auth)
    {
        _auth = auth;
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

            var user = _auth.Authenticate(req.Username, req.Password, req.UserType);

            if (user is not null)
            {
                Console.WriteLine($"[AuthController] ✓ SUCCESS: Login successful for user: {user.Username}");
                _auth.PrintUserInfo(user);
                
                return Ok(new { 
                    success = true, 
                    message = "Login successful",
                    user = new {
                        id = user.Id,
                        username = user.Username,
                        fullName = user.FullName,
                        email = user.Email,
                        userType = user.UserType,
                        details = user.Details
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
            return StatusCode(500, new { success = false, message = "An error occurred during registration", error = ex.Message });
        }
    }
}
