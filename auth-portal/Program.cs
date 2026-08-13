using AuthPortal.Services;
using Microsoft.Extensions.Configuration;
using System.IO;

var builder = WebApplication.CreateBuilder(args);

// Attempt to load connection string from a top-level config.cfg (INI-style) if present.
try
{
	var cfgPath = Path.Combine(Directory.GetCurrentDirectory(), "..", "config.cfg");
	if (File.Exists(cfgPath))
	{
		var cfgBuilder = new ConfigurationBuilder();
		cfgBuilder.AddIniFile(cfgPath, optional: true, reloadOnChange: false);
		var cfg = cfgBuilder.Build();
		var conn = cfg["sqlserver:connection_string"];
		if (!string.IsNullOrWhiteSpace(conn))
		{
			builder.Configuration["ConnectionStrings:Default"] = conn;
		}
	}
}
catch
{
	// ignore config load errors and proceed with existing configuration
}

builder.Services.AddSingleton<IAuthService, AuthService>();
builder.Services.AddControllers();

var app = builder.Build();

app.UseStaticFiles();
app.MapControllers();

// Fallback to index.html for SPA behavior
app.MapFallbackToFile("/index.html");

app.Run();
