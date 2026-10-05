using AuthPortal.Controllers;
using AuthPortal.Models;
using AuthPortal.Services;
using System;
using System.Collections.Generic;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using Xunit;

namespace AuthPortal.Tests;

public class AuthControllerTests
{
    [Fact]
    public void Login_WithMissingUsername_ReturnsBadRequest()
    {
        var controller = new AuthController(new FakeAuthService());

        var result = controller.Login(new LoginRequest { Password = "secret" });

        Assert.IsType<BadRequestObjectResult>(result);
    }

    [Fact]
    public void Login_WithInvalidCredentials_ReturnsUnauthorized()
    {
        var controller = new AuthController(new FakeAuthService());

        var result = controller.Login(new LoginRequest
        {
            Username = "student", Password = "wrong", UserType = "student"
        });

        Assert.IsType<UnauthorizedObjectResult>(result);
    }

    [Fact]
    public void Login_Success_DoesNotExposePassword()
    {
        var service = new FakeAuthService
        {
            UserToReturn = new UserInfo
            {
                Id = "1", Username = "student", FullName = "Student",
                Email = "student@example.com", UserType = "User",
                Details = new Dictionary<string, object?> { ["Password"] = "secret" }
            }
        };
        var controller = new AuthController(service);

        var result = Assert.IsType<OkObjectResult>(controller.Login(new LoginRequest
        {
            Username = "student", Password = "secret", UserType = "student"
        }));

        Assert.DoesNotContain("secret", System.Text.Json.JsonSerializer.Serialize(result.Value));
    }

    [Fact]
    public void Register_WithoutFrontendHeader_ReturnsForbidden()
    {
        var result = CreateController(new FakeAuthService()).Register(new RegisterRequest { UserType = "student" });

        Assert.Equal(403, Assert.IsType<ObjectResult>(result).StatusCode);
    }

    [Fact]
    public void Register_Admin_ReturnsForbidden()
    {
        var result = CreateController(new FakeAuthService(), true).Register(new RegisterRequest
        {
            Username = "admin", Password = "secret", Email = "admin@example.com", UserType = "admin"
        });

        Assert.Equal(403, Assert.IsType<ObjectResult>(result).StatusCode);
    }

    [Fact]
    public void Register_ValidStudent_ReturnsOk()
    {
        var service = new FakeAuthService { RegisterResult = true };
        var result = CreateController(service, true).Register(new RegisterRequest
        {
            Username = "student", Password = "secret", Email = "student@example.com", UserType = "student"
        });

        Assert.IsType<OkObjectResult>(result);
        Assert.Equal("student", service.RegisteredRequest?.Username);
    }

    [Fact]
    public void Register_InvalidModelState_ReturnsBadRequest()
    {
        var controller = CreateController(new FakeAuthService(), true);
        controller.ModelState.AddModelError(nameof(RegisterRequest.Email), "Invalid email");

        var result = controller.Register(new RegisterRequest
        {
            Username = "student", Password = "secret", Email = "not-an-email", UserType = "student"
        });

        Assert.IsType<BadRequestObjectResult>(result);
    }

    [Fact]
    public void Logout_WithoutToken_ReturnsBadRequest()
    {
        var result = CreateController(new FakeAuthService(), true).Logout(new LogoutRequest());

        Assert.IsType<BadRequestObjectResult>(result);
    }

    [Fact]
    public void QuizReview_WithNullPayload_ReturnsBadRequest()
    {
        var controller = new QuizController(new ConfigurationBuilder().AddInMemoryCollection().Build());

        var result = controller.UpdateModerationDecision(null!);

        Assert.IsType<BadRequestObjectResult>(result);
    }

    [Fact]
    public void QuizReview_WithInvalidStatus_ReturnsBadRequest()
    {
        var controller = new QuizController(new ConfigurationBuilder().AddInMemoryCollection().Build());

        var result = controller.UpdateModerationDecision(new ModerationDecisionRequest
        {
            QuizId = Guid.Empty.ToString(),
            Status = "InvalidValue"
        });

        Assert.IsType<BadRequestObjectResult>(result);
    }

    private static AuthController CreateController(IAuthService service, bool includeHeader = false)
    {
        var controller = new AuthController(service)
        {
            ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext() }
        };

        if (includeHeader)
            controller.Request.Headers["X-Frontend-Client"] = "auth-portal";

        return controller;
    }
}

public class FakeAuthService : IAuthService
{
    public UserInfo? UserToReturn { get; set; }
    public bool RegisterResult { get; set; }
    public RegisterRequest? RegisteredRequest { get; private set; }

    public UserInfo? Authenticate(string username, string password, string userType) => UserToReturn;
    public void PrintUserInfo(UserInfo user) { }

    public bool RegisterUser(RegisterRequest request, out string errorMessage)
    {
        RegisteredRequest = request;
        errorMessage = "";
        return RegisterResult;
    }

    public string CreateSession(UserInfo user) => "test-token";
    public bool RevokeSession(string token) => token == "test-token";
    public UserInfo? GetSession(string token) => token == "test-token" ? UserToReturn : null;
}
