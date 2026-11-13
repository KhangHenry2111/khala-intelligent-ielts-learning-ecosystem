using AuthPortal.Services;
using Microsoft.Extensions.Configuration;
using System.IO;

var builder = WebApplication.CreateBuilder(args);

var workingDirectory = Directory.GetCurrentDirectory();
var localConfigPath = Path.Combine(workingDirectory, "config.cfg");
if (!File.Exists(localConfigPath))
    localConfigPath = Path.GetFullPath(Path.Combine(workingDirectory, "..", "config.cfg"));
if (File.Exists(localConfigPath))
    builder.Configuration.AddIniFile(localConfigPath, optional: true, reloadOnChange: false);
builder.Configuration.AddEnvironmentVariables();

var configConnectionString = builder.Configuration["sqlserver:connection_string"];
if (!string.IsNullOrWhiteSpace(configConnectionString))
    builder.Configuration["ConnectionStrings:Default"] = configConnectionString;

// Prefer environment variables and managed secrets over a checked-in config file.
var envConnectionString =
    Environment.GetEnvironmentVariable("SQLSERVER_CONNECTION_STRING")
    ?? Environment.GetEnvironmentVariable("ConnectionStrings__Default")
    ?? Environment.GetEnvironmentVariable("ConnectionStrings:Default")
    ?? Environment.GetEnvironmentVariable("USER_DB_CONNECTION");

if (!string.IsNullOrWhiteSpace(envConnectionString))
{
    builder.Configuration["ConnectionStrings:Default"] = envConnectionString;
}

builder.Services.AddSingleton<IAuthService, AuthService>();
builder.Services.AddHttpClient();
builder.Services.AddSingleton<IPasswordResetService, PasswordResetService>();
builder.Services.AddControllers();

var app = builder.Build();

app.UseStaticFiles();
app.MapControllers();

// Fallback to index.html for SPA behavior
app.MapFallbackToFile("/index.html");

app.Run();
