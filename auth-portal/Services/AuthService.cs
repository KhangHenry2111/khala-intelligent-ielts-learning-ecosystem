namespace AuthPortal.Services;

using AuthPortal.Models;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;
using System;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Collections.Concurrent;

public class AuthService : IAuthService
{
    private readonly string? _connectionString;
    private readonly ConcurrentDictionary<string, UserInfo> _sessions = new();

    public AuthService(IConfiguration config)
    {
        // Read connection string from configuration or environment (USER_DB_CONNECTION)
        _connectionString = config.GetConnectionString("Default") ?? Environment.GetEnvironmentVariable("USER_DB_CONNECTION");
    }


    /// <summary>
    /// Hash password using SHA256
    /// </summary>
    private string HashPassword(string password)
    {
        using (var sha256 = SHA256.Create())
        {
            var hashedBytes = sha256.ComputeHash(Encoding.UTF8.GetBytes(password));
            return BitConverter.ToString(hashedBytes).Replace("-", "").ToUpperInvariant();
        }
    }

    /// <summary>
    /// Verify plain text password against hashed password
    /// </summary>
    private bool VerifyPassword(string plainPassword, string storedPassword)
    {
        if (string.IsNullOrEmpty(storedPassword))
            return false;

        if (!storedPassword.StartsWith("PBKDF2$", StringComparison.Ordinal))
            return plainPassword.Equals(storedPassword, StringComparison.Ordinal);

        var parts = storedPassword.Split('$');
        if (parts.Length != 4 || !int.TryParse(parts[1], out var iterations))
            return false;

        var salt = Convert.FromBase64String(parts[2]);
        var expected = Convert.FromBase64String(parts[3]);
        var actual = Rfc2898DeriveBytes.Pbkdf2(plainPassword, salt, iterations, HashAlgorithmName.SHA256, expected.Length);
        return CryptographicOperations.FixedTimeEquals(actual, expected);
    }

    private string HashPasswordSecurely(string password)
    {
        const int iterations = 120_000;
        var salt = RandomNumberGenerator.GetBytes(16);
        var hash = Rfc2898DeriveBytes.Pbkdf2(password, salt, iterations, HashAlgorithmName.SHA256, 32);
        return $"PBKDF2${iterations}${Convert.ToBase64String(salt)}${Convert.ToBase64String(hash)}";
    }

    public string CreateSession(UserInfo user)
    {
        var token = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32));
        _sessions[token] = user;
        return token;
    }

    public bool RevokeSession(string token) => !string.IsNullOrWhiteSpace(token) && _sessions.TryRemove(token, out _);

    public UserInfo? GetSession(string token) =>
        !string.IsNullOrWhiteSpace(token) && _sessions.TryGetValue(token, out var user) ? user : null;

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
            UserInfo? QuerySingle(string sql, (string name, object value)[] parms, string resultUserType, string inputPassword = "")
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
                    string? storedPassword = null;

                    for (int i = 0; i < reader.FieldCount; i++)
                    {
                        var name = reader.GetName(i);
                        if (string.Equals(name, "Password", StringComparison.OrdinalIgnoreCase))
                        {
                            storedPassword = reader.IsDBNull(i) ? null : reader.GetValue(i)?.ToString();
                            continue; // never include password in response
                        }

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

                    // Verify password if needed
                    if (!string.IsNullOrEmpty(inputPassword))
                    {
                        if (string.IsNullOrEmpty(storedPassword) || !VerifyPassword(inputPassword, storedPassword))
                        {
                            return null; // Password doesn't match
                        }
                    }

                    return ui;
                }

                return null;
            }

            // If userType specified, query that table first
            var ut = userType.ToLowerInvariant();

            if (ut == "admin")
            {
                var adminSql = "SELECT * FROM Admin WHERE Username = @u AND Status = 'Active'";
                return QuerySingle(adminSql, new[] { ("@u", (object)username) }, "Admin", password);
            }

            if (ut == "instructor" || ut == "teacher")
            {
                var teacherSql = "SELECT * FROM Teacher WHERE Username = @u AND Status = 'Active'";
                return QuerySingle(teacherSql, new[] { ("@u", (object)username) }, "Instructor", password);
            }

            // default or 'user' -> check [User] table
            if (ut == "student" || ut == "user")
            {
                var userSql = "SELECT * FROM [User] WHERE Username = @u AND Status = 'Active'";
                return QuerySingle(userSql, new[] { ("@u", (object)username) }, "User", password);
            }

            // If userType was empty or a non-matching value, try all tables in order Admin -> Teacher -> User
            if (string.IsNullOrWhiteSpace(userType))
            {
                var tryAdmin = QuerySingle("SELECT * FROM Admin WHERE Username = @u AND Status = 'Active'", new[] { ("@u", (object)username) }, "Admin", password);
                if (tryAdmin != null) return tryAdmin;
                var tryTeacher = QuerySingle("SELECT * FROM Teacher WHERE Username = @u AND Status = 'Active'", new[] { ("@u", (object)username) }, "Instructor", password);
                if (tryTeacher != null) return tryTeacher;
                var tryUser = QuerySingle("SELECT * FROM [User] WHERE Username = @u AND Status = 'Active'", new[] { ("@u", (object)username) }, "User", password);
                if (tryUser != null) return tryUser;
            }

            return null;
        }
        catch (SqlException sqlEx)
        {
            Console.WriteLine($"\n[AuthService] ✗✗✗ SQL SERVER EXCEPTION ✗✗✗");
            Console.WriteLine($"[AuthService] Timestamp: {DateTime.Now:yyyy-MM-dd HH:mm:ss}");
            Console.WriteLine($"[AuthService] SQL Error Number: {sqlEx.Number}");
            Console.WriteLine($"[AuthService] SQL Error Message: {sqlEx.Message}");
            Console.WriteLine($"[AuthService] Line Number: {sqlEx.LineNumber}");
            foreach (SqlError error in sqlEx.Errors)
            {
                Console.WriteLine($"[AuthService] --- SQL Error Detail ---");
                Console.WriteLine($"[AuthService]    Procedure: {error.Procedure}");
                Console.WriteLine($"[AuthService]    Message: {error.Message}");
                Console.WriteLine($"[AuthService]    Severity: {error.Class}");
            }
            Console.WriteLine($"[AuthService] Stack Trace: {sqlEx.StackTrace}");
            Console.WriteLine($"[AuthService] ✗✗✗ END SQL EXCEPTION ✗✗✗\n");
            return null;
        }
        catch (InvalidOperationException invEx)
        {
            Console.WriteLine($"\n[AuthService] ✗✗✗ INVALID OPERATION EXCEPTION ✗✗✗");
            Console.WriteLine($"[AuthService] Timestamp: {DateTime.Now:yyyy-MM-dd HH:mm:ss}");
            Console.WriteLine($"[AuthService] Message: {invEx.Message}");
            Console.WriteLine($"[AuthService] Common Cause: Connection string issue or database not found");
            Console.WriteLine($"[AuthService] Stack Trace: {invEx.StackTrace}");
            Console.WriteLine($"[AuthService] ✗✗✗ END INVALID OPERATION EXCEPTION ✗✗✗\n");
            return null;
        }
        catch (Exception ex)
        {
            Console.WriteLine($"\n[AuthService] ✗✗✗ GENERAL EXCEPTION ✗✗✗");
            Console.WriteLine($"[AuthService] Timestamp: {DateTime.Now:yyyy-MM-dd HH:mm:ss}");
            Console.WriteLine($"[AuthService] Exception Type: {ex.GetType().Name}");
            Console.WriteLine($"[AuthService] Exception Message: {ex.Message}");
            Console.WriteLine($"[AuthService] Stack Trace: {ex.StackTrace}");
            if (ex.InnerException != null)
            {
                Console.WriteLine($"[AuthService] Inner Exception Type: {ex.InnerException.GetType().Name}");
                Console.WriteLine($"[AuthService] Inner Exception Message: {ex.InnerException.Message}");
            }
            Console.WriteLine($"[AuthService] ✗✗✗ END GENERAL EXCEPTION ✗✗✗\n");
            return null;
        }
    }

    public void PrintUserInfo(UserInfo user)
    {
        if (user == null)
            return;

        Console.WriteLine("\n" + new string('=', 80));
        Console.WriteLine("                         USER INFORMATION");
        Console.WriteLine(new string('=', 80));
        Console.WriteLine($"User ID:                     {user.Id}");
        Console.WriteLine($"Username:                    {user.Username}");
        Console.WriteLine($"Full Name:                   {user.FullName}");
        Console.WriteLine($"Email:                       {user.Email}");
        Console.WriteLine($"User Type:                   {user.UserType}");
        Console.WriteLine();
        Console.WriteLine("Additional Details:");
        Console.WriteLine(new string('-', 80));

        foreach (var detail in user.Details.OrderBy(x => x.Key))
        {
            // Skip password and already displayed fields
            if (detail.Key.Equals("Password", StringComparison.OrdinalIgnoreCase) ||
                detail.Key.Equals("Username", StringComparison.OrdinalIgnoreCase) ||
                detail.Key.Equals("FullName", StringComparison.OrdinalIgnoreCase) ||
                detail.Key.Equals("Email", StringComparison.OrdinalIgnoreCase))
                continue;

            string value = detail.Value == null ? "[NULL]" : detail.Value.ToString() ?? "[NULL]";
            Console.WriteLine($"  {detail.Key,-30} : {value}");
        }

        Console.WriteLine(new string('=', 80));
        Console.WriteLine();
    }
    public bool RegisterUser(RegisterRequest req, out string errorMessage)
    {
        errorMessage = string.Empty;
        if (string.IsNullOrWhiteSpace(_connectionString))
        {
            errorMessage = "No connection string configured.";
            return false;
        }

        try
        {
            using var conn = new SqlConnection(_connectionString);
            conn.Open();

            var ut = (req.UserType ?? "").ToLowerInvariant();

            if (ut == "student" || ut == "user")
            {
                var duplicateSql = @"SELECT TOP 1 CASE
                    WHEN Username = @Username THEN 'Username'
                    WHEN Email = @Email THEN 'Email'
                    WHEN @PhoneNumber IS NOT NULL AND PhoneNumber = @PhoneNumber THEN 'PhoneNumber'
                    END
                    FROM [User]
                    WHERE Username = @Username OR Email = @Email
                       OR (@PhoneNumber IS NOT NULL AND PhoneNumber = @PhoneNumber)";
                using var cmd = conn.CreateCommand();
                cmd.CommandText = duplicateSql;
                AddParameter(cmd, "@Username", req.Username);
                AddParameter(cmd, "@Email", req.Email);
                AddParameter(cmd, "@PhoneNumber", req.PhoneNumber);
                var duplicate = cmd.ExecuteScalar()?.ToString();
                if (!string.IsNullOrWhiteSpace(duplicate))
                {
                    errorMessage = $"{duplicate} already exists.";
                    return false;
                }

                cmd.CommandText = @"INSERT INTO [User]
                    (FullName, Username, Password, Email, PhoneNumber, DateOfBirth, Gender)
                    VALUES (@FullName, @Username, @Password, @Email, @PhoneNumber, @DateOfBirth, @Gender)";
                cmd.Parameters.Clear();
                AddParameter(cmd, "@FullName", string.IsNullOrWhiteSpace(req.FullName) ? req.Username : req.FullName);
                AddParameter(cmd, "@Username", req.Username);
                AddParameter(cmd, "@Password", HashPasswordSecurely(req.Password));
                AddParameter(cmd, "@Email", req.Email);
                AddParameter(cmd, "@PhoneNumber", req.PhoneNumber);
                AddParameter(cmd, "@DateOfBirth", req.DateOfBirth);
                AddParameter(cmd, "@Gender", req.Gender);

                cmd.ExecuteNonQuery();
                return true;
            }
            else if (ut == "teacher" || ut == "instructor")
            {
                var sql = @"INSERT INTO Teacher (FullName, Username, Password, Email, PhoneNumber, Avatar, Biography, Qualification, QualificationFileURL, IELTSBand, ExperienceYears, Specialization) 
                            VALUES (@FullName, @Username, @Password, @Email, @PhoneNumber, @Avatar, @Biography, @Qualification, @QualificationFileURL, @IELTSBand, @ExperienceYears, @Specialization)";
                using var cmd = conn.CreateCommand();
                cmd.CommandText = sql;
                cmd.Parameters.AddWithValue("@FullName", req.FullName ?? (object)DBNull.Value);
                cmd.Parameters.AddWithValue("@Username", req.Username ?? (object)DBNull.Value);
                cmd.Parameters.AddWithValue("@Password", HashPasswordSecurely(req.Password));
                cmd.Parameters.AddWithValue("@Email", req.Email ?? (object)DBNull.Value);
                cmd.Parameters.AddWithValue("@PhoneNumber", req.PhoneNumber ?? (object)DBNull.Value);
                cmd.Parameters.AddWithValue("@Avatar", req.Avatar ?? (object)DBNull.Value);
                cmd.Parameters.AddWithValue("@Biography", req.Biography ?? (object)DBNull.Value);
                cmd.Parameters.AddWithValue("@Qualification", req.Qualification ?? (object)DBNull.Value);
                cmd.Parameters.AddWithValue("@QualificationFileURL", req.QualificationFileURL ?? (object)DBNull.Value);
                cmd.Parameters.AddWithValue("@IELTSBand", req.IELTSBand.HasValue ? req.IELTSBand.Value : (object)DBNull.Value);
                cmd.Parameters.AddWithValue("@ExperienceYears", req.ExperienceYears.HasValue ? req.ExperienceYears.Value : (object)DBNull.Value);
                cmd.Parameters.AddWithValue("@Specialization", req.Specialization ?? (object)DBNull.Value);

                cmd.ExecuteNonQuery();
                return true;
            }
            else
            {
                errorMessage = "Invalid or unsupported user type for registration.";
                return false;
            }
        }
        catch (SqlException sqlEx)
        {
            if (sqlEx.Number == 2627 || sqlEx.Number == 2601)
            {
                errorMessage = "Username, Email, or PhoneNumber already exists.";
            }
            else
            {
                errorMessage = $"Database error: {sqlEx.Message}";
            }
            return false;
        }
        catch (Exception ex)
        {
            errorMessage = $"An error occurred: {ex.Message}";
            return false;
        }
    }

    private static void AddParameter(SqlCommand command, string name, object? value)
    {
        command.Parameters.AddWithValue(name, value ?? DBNull.Value);
    }
}
