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
        var user = _auth.Authenticate(req.Username, req.Password, req.UserType);

        if (user is not null)
            return Ok(new { success = true, user });

        return Unauthorized(new { success = false, message = "Invalid credentials" });
    }
}
