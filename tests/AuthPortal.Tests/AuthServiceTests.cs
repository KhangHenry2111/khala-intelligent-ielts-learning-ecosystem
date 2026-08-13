using AuthPortal.Services;
using Microsoft.Extensions.Configuration;
using Xunit;

namespace AuthPortal.Tests;

public class AuthServiceTests
{
    [Theory]
    [InlineData("admin","admin123","Admin", true)]
    [InlineData("instructor","inst123","Instructor", true)]
    [InlineData("student","stud123","Student", true)]
    [InlineData("admin","wrong","Admin", false)]
    [InlineData("user","pass","Student", false)]
    public void Authenticate_Credentials_ReturnsExpected(string user, string pass, string type, bool expected)
    {
        // No DB connection configured; service should fall back to demo users.
        var config = new ConfigurationBuilder().AddInMemoryCollection().Build();
        var svc = new AuthService(config);

        var result = svc.Authenticate(user, pass, type);
        var ok = result is not null;
        Assert.Equal(expected, ok);
    }
}
