namespace AuthPortal.Services;

using AuthPortal.Models;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;

public class AuthService : IAuthService
{
    private readonly string? _connectionString;

    public AuthService(IConfiguration config)
    {
        // Read connection string from configuration or environment (USER_DB_CONNECTION)
        _connectionString = config.GetConnectionString("Default") ?? Environment.GetEnvironmentVariable("USER_DB_CONNECTION");
    }

    public UserInfo? Authenticate(string username, string password, string userType)
    {
        userType = (userType ?? string.Empty).Trim();

        if (string.IsNullOrWhiteSpace(_connectionString))
        {
            Console.WriteLine("[AuthService] ERROR: No connection string configured.");
            return null;
        }

        try
        {
            using var conn = new SqlConnection(_connectionString);
            conn.Open();

            // Helper to run a parameterized query and map first row to UserInfo
            UserInfo? QuerySingle(string sql, (string name, object value)[] parms, string resultUserType)
            {
                using var cmd = conn.CreateCommand();
                cmd.CommandText = sql;
                foreach (var p in parms)
                {
                    cmd.Parameters.AddWithValue(p.name, p.value ?? string.Empty);
                }

                using var reader = cmd.ExecuteReader();
                if (reader.Read())
                {
                    var ui = new UserInfo { UserType = resultUserType };

                    for (int i = 0; i < reader.FieldCount; i++)
                    {
                        var name = reader.GetName(i);
                        if (string.Equals(name, "Password", StringComparison.OrdinalIgnoreCase))
                            continue; // never include password

                        var val = reader.IsDBNull(i) ? null : reader.GetValue(i);

                        // Map common fields to top-level props
                        if (string.Equals(name, "UserID", StringComparison.OrdinalIgnoreCase)
                            || string.Equals(name, "AdminID", StringComparison.OrdinalIgnoreCase)
                            || string.Equals(name, "TeacherID", StringComparison.OrdinalIgnoreCase)
                            || string.Equals(name, "Id", StringComparison.OrdinalIgnoreCase))
                        {
                            ui.Id = val?.ToString();
                        }
                        else if (string.Equals(name, "Username", StringComparison.OrdinalIgnoreCase))
                        {
                            ui.Username = val?.ToString() ?? string.Empty;
                        }
                        else if (string.Equals(name, "FullName", StringComparison.OrdinalIgnoreCase))
                        {
                            ui.FullName = val?.ToString() ?? string.Empty;
                        }
                        else if (string.Equals(name, "Email", StringComparison.OrdinalIgnoreCase))
                        {
                            ui.Email = val?.ToString() ?? string.Empty;
                        }

                        ui.Details[name] = val;
                    }

                    return ui;
                }

                return null;
            }

            // If userType specified, query that table first
            var ut = userType.ToLowerInvariant();

            if (ut == "admin")
            {
                var adminSql = "SELECT * FROM Admin WHERE Username = @u AND Password = @p AND Status = 'Active'";
                return QuerySingle(adminSql, new[] { ("@u", (object)username), ("@p", (object)password) }, "Admin");
            }

            if (ut == "instructor" || ut == "teacher")
            {
                var teacherSql = "SELECT * FROM Teacher WHERE Username = @u AND Password = @p AND Status = 'Active'";
                return QuerySingle(teacherSql, new[] { ("@u", (object)username), ("@p", (object)password) }, "Instructor");
            }

            // default or 'user' -> check [User] table
            if (ut == "student" || ut == "user")
            {
                var userSql = "SELECT * FROM [User] WHERE Username = @u AND Password = @p AND Status = 'Active'";
                return QuerySingle(userSql, new[] { ("@u", (object)username), ("@p", (object)password) }, "User");
            }

            // If userType was empty or a non-matching value, try all tables in order Admin -> Teacher -> User
            if (string.IsNullOrWhiteSpace(userType))
            {
                var tryAdmin = QuerySingle("SELECT * FROM Admin WHERE Username = @u AND Password = @p AND Status = 'Active'", new[] { ("@u", (object)username), ("@p", (object)password) }, "Admin");
                if (tryAdmin != null) return tryAdmin;
                var tryTeacher = QuerySingle("SELECT * FROM Teacher WHERE Username = @u AND Password = @p AND Status = 'Active'", new[] { ("@u", (object)username), ("@p", (object)password) }, "Instructor");
                if (tryTeacher != null) return tryTeacher;
                var tryUser = QuerySingle("SELECT * FROM [User] WHERE Username = @u AND Password = @p AND Status = 'Active'", new[] { ("@u", (object)username), ("@p", (object)password) }, "User");
                if (tryUser != null) return tryUser;
            }

            return null;
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[AuthService] DB Error: {ex.Message}");
            return null;
        }
    }
}
