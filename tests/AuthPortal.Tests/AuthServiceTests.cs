using AuthPortal.Services;
using Microsoft.Extensions.Configuration;
using Xunit;

namespace AuthPortal.Tests;

public class AuthServiceTests
{
    [Fact]
    public void Authenticate_WithoutConnectionString_ReturnsNull()
    {
        var config = new ConfigurationBuilder().AddInMemoryCollection().Build();
        var service = new AuthService(config);

        var result = service.Authenticate("student", "password", "student");

        Assert.Null(result);
    }

    [Fact]
    public void RegisterUser_WithoutConnectionString_ReturnsError()
    {
        var config = new ConfigurationBuilder().AddInMemoryCollection().Build();
        var service = new AuthService(config);

        var result = service.RegisterUser(new AuthPortal.Models.RegisterRequest { UserType = "student" }, out var error);

        Assert.False(result);
        Assert.Equal("No connection string configured.", error);
    }
}
