using System.Security.Cryptography;
using System.Net.Http.Json;
using AuthPortal.Models;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;

namespace AuthPortal.Services;

public sealed class PasswordResetService : IPasswordResetService
{
    private const int CodeLifetimeMinutes = 10;
    private const int MaxCodeAttempts = 5;
    private const int ResendCooldownSeconds = 60;
    private const int PasswordHashIterations = 120_000;
    private readonly string? _connectionString;
    private readonly string _notificationServiceUrl;
    private readonly string _notificationServiceApiKey;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly IAuthService _auth;

    public PasswordResetService(
        IConfiguration configuration,
        IHttpClientFactory httpClientFactory,
        IAuthService auth)
    {
        _connectionString = configuration.GetConnectionString("Default")
            ?? Environment.GetEnvironmentVariable("USER_DB_CONNECTION");
        _notificationServiceUrl = configuration["password_reset:service_url"]?.TrimEnd('/')
            ?? string.Empty;
        _notificationServiceApiKey = configuration["password_reset:service_api_key"]
            ?? string.Empty;
        _httpClientFactory = httpClientFactory;
        _auth = auth;
    }

    public async Task RequestCodeAsync(PasswordResetCodeRequest request)
    {
        var account = await FindAccountAsync(request);
        if (account == null)
            return;

        var code = await GenerateCodeAsync();
        var resetId = Guid.NewGuid();
        var salt = RandomNumberGenerator.GetBytes(16);
        var codeHash = HashCode(code, salt);

        await using (var connection = CreateConnection())
        {
            await connection.OpenAsync();
            using var transaction = connection.BeginTransaction();
            using var recentCommand = new SqlCommand(@"
                SELECT COUNT(*)
                FROM dbo.PasswordResetCode WITH (UPDLOCK, HOLDLOCK)
                WHERE AccountID = @AccountID AND UserType = @UserType
                    AND CreatedAt > DATEADD(SECOND, -@Cooldown, SYSUTCDATETIME())", connection, transaction);
            recentCommand.Parameters.AddWithValue("@AccountID", account.Id);
            recentCommand.Parameters.AddWithValue("@UserType", account.UserType);
            recentCommand.Parameters.AddWithValue("@Cooldown", ResendCooldownSeconds);
            var recentlyRequested = Convert.ToInt32(await recentCommand.ExecuteScalarAsync()) > 0;
            if (recentlyRequested)
            {
                transaction.Commit();
                return;
            }

            using var invalidateCommand = new SqlCommand(@"
                UPDATE dbo.PasswordResetCode
                SET IsUsed = 1
                WHERE AccountID = @AccountID AND UserType = @UserType AND IsUsed = 0", connection, transaction);
            invalidateCommand.Parameters.AddWithValue("@AccountID", account.Id);
            invalidateCommand.Parameters.AddWithValue("@UserType", account.UserType);
            await invalidateCommand.ExecuteNonQueryAsync();

            using var insertCommand = new SqlCommand(@"
                INSERT INTO dbo.PasswordResetCode
                    (PasswordResetCodeID, AccountID, UserType, Method, CodeSalt, CodeHash,
                     CreatedAt, ExpiresAt, Attempts, IsUsed)
                VALUES
                    (@ResetID, @AccountID, @UserType, @Method, @CodeSalt, @CodeHash,
                     SYSUTCDATETIME(), DATEADD(MINUTE, @Lifetime, SYSUTCDATETIME()), 0, 0)", connection, transaction);
            insertCommand.Parameters.AddWithValue("@ResetID", resetId);
            insertCommand.Parameters.AddWithValue("@AccountID", account.Id);
            insertCommand.Parameters.AddWithValue("@UserType", account.UserType);
            insertCommand.Parameters.AddWithValue("@Method", request.Method.ToLowerInvariant());
            insertCommand.Parameters.AddWithValue("@CodeSalt", salt);
            insertCommand.Parameters.AddWithValue("@CodeHash", codeHash);
            insertCommand.Parameters.AddWithValue("@Lifetime", CodeLifetimeMinutes);
            await insertCommand.ExecuteNonQueryAsync();
            transaction.Commit();
        }

        try
        {
            await SendCodeAsync(request.Method.ToLowerInvariant(), account.Destination, code);
        }
        catch
        {
            await InvalidateCodeAsync(resetId);
            throw;
        }
    }

    public async Task<bool> ResetPasswordAsync(PasswordResetConfirmRequest request)
    {
        var account = await FindAccountAsync(request);
        if (account == null)
            return false;

        byte[]? salt = null;
        byte[]? expectedHash = null;
        Guid resetId = Guid.Empty;

        await using var connection = CreateConnection();
        await connection.OpenAsync();
        using var transaction = connection.BeginTransaction();

        using (var findCodeCommand = new SqlCommand(@"
            SELECT TOP (1) PasswordResetCodeID, CodeSalt, CodeHash
            FROM dbo.PasswordResetCode WITH (UPDLOCK, ROWLOCK)
            WHERE AccountID = @AccountID AND UserType = @UserType AND Method = @Method
                AND IsUsed = 0 AND ExpiresAt > SYSUTCDATETIME() AND Attempts < @MaxAttempts
            ORDER BY CreatedAt DESC", connection, transaction))
        {
            findCodeCommand.Parameters.AddWithValue("@AccountID", account.Id);
            findCodeCommand.Parameters.AddWithValue("@UserType", account.UserType);
            findCodeCommand.Parameters.AddWithValue("@Method", request.Method.ToLowerInvariant());
            findCodeCommand.Parameters.AddWithValue("@MaxAttempts", MaxCodeAttempts);
            using var reader = await findCodeCommand.ExecuteReaderAsync();
            if (await reader.ReadAsync())
            {
                resetId = reader.GetGuid(0);
                salt = (byte[])reader["CodeSalt"];
                expectedHash = (byte[])reader["CodeHash"];
            }
        }

        if (salt == null || expectedHash == null)
        {
            transaction.Commit();
            return false;
        }

        var suppliedHash = HashCode(request.Code, salt);
        if (!CryptographicOperations.FixedTimeEquals(suppliedHash, expectedHash))
        {
            using var attemptCommand = new SqlCommand(@"
                UPDATE dbo.PasswordResetCode
                SET Attempts = Attempts + 1,
                    IsUsed = CASE WHEN Attempts + 1 >= @MaxAttempts THEN 1 ELSE 0 END
                WHERE PasswordResetCodeID = @ResetID", connection, transaction);
            attemptCommand.Parameters.AddWithValue("@MaxAttempts", MaxCodeAttempts);
            attemptCommand.Parameters.AddWithValue("@ResetID", resetId);
            await attemptCommand.ExecuteNonQueryAsync();
            transaction.Commit();
            return false;
        }

        using (var updatePasswordCommand = new SqlCommand(
            account.UserType == "Teacher"
                ? "UPDATE dbo.Teacher SET Password = @Password, UpdatedAt = GETDATE() WHERE TeacherID = @AccountID AND Status = 'Active'"
                : "UPDATE dbo.[User] SET Password = @Password, UpdatedAt = GETDATE() WHERE UserID = @AccountID AND Status = 'Active'",
            connection,
            transaction))
        {
            updatePasswordCommand.Parameters.AddWithValue("@Password", HashPassword(request.NewPassword));
            updatePasswordCommand.Parameters.AddWithValue("@AccountID", account.Id);
            if (await updatePasswordCommand.ExecuteNonQueryAsync() != 1)
            {
                transaction.Rollback();
                return false;
            }
        }

        using (var consumeCommand = new SqlCommand(@"
            UPDATE dbo.PasswordResetCode SET IsUsed = 1
            WHERE AccountID = @AccountID AND UserType = @UserType AND IsUsed = 0", connection, transaction))
        {
            consumeCommand.Parameters.AddWithValue("@AccountID", account.Id);
            consumeCommand.Parameters.AddWithValue("@UserType", account.UserType);
            await consumeCommand.ExecuteNonQueryAsync();
        }

        transaction.Commit();
        _auth.RevokeSessions(account.Id.ToString(), account.UserType);
        return true;
    }

    private async Task<Account?> FindAccountAsync(PasswordResetCodeRequest request)
    {
        var userType = NormalizeUserType(request.UserType);
        var method = request.Method.ToLowerInvariant();
        var table = userType == "Teacher" ? "dbo.Teacher" : "dbo.[User]";
        var idColumn = userType == "Teacher" ? "TeacherID" : "UserID";
        var contactColumn = method == "email" ? "Email" : "PhoneNumber";
        var comparison = method == "email"
            ? $"UPPER({contactColumn}) = UPPER(@Destination)"
            : $"{contactColumn} = @Destination";

        await using var connection = CreateConnection();
        await connection.OpenAsync();
        using var command = new SqlCommand($@"
            SELECT TOP (1) {idColumn}, {contactColumn}
            FROM {table}
            WHERE Username = @Username AND {comparison} AND Status = 'Active'", connection);
        command.Parameters.AddWithValue("@Username", request.Username.Trim());
        command.Parameters.AddWithValue("@Destination", request.Destination.Trim());
        using var reader = await command.ExecuteReaderAsync();
        if (!await reader.ReadAsync() || reader.IsDBNull(1))
            return null;

        return new Account(reader.GetGuid(0), userType, reader.GetString(1));
    }

    private async Task<string> GenerateCodeAsync()
    {
        using var response = await SendInternalRequestAsync("/generate-code", new { });
        response.EnsureSuccessStatusCode();
        var result = await response.Content.ReadFromJsonAsync<GeneratedCodeResponse>();
        if (result?.Code is not { Length: 8 } || result.Code.Any(character => !char.IsAsciiDigit(character)))
            throw new InvalidOperationException("The notification service returned an invalid verification code.");
        return result.Code;
    }

    private async Task SendCodeAsync(string method, string destination, string code)
    {
        using var response = await SendInternalRequestAsync("/send-code", new
        {
            method,
            destination,
            code
        });
        response.EnsureSuccessStatusCode();
    }

    private async Task<HttpResponseMessage> SendInternalRequestAsync(string path, object payload)
    {
        if (string.IsNullOrWhiteSpace(_notificationServiceUrl)
            || string.IsNullOrWhiteSpace(_notificationServiceApiKey))
            throw new InvalidOperationException("The password-reset notification service is not configured.");

        using var request = new HttpRequestMessage(HttpMethod.Post, _notificationServiceUrl + path)
        {
            Content = JsonContent.Create(payload)
        };
        request.Headers.Add("X-Internal-Api-Key", _notificationServiceApiKey);
        return await _httpClientFactory.CreateClient().SendAsync(request);
    }

    private async Task InvalidateCodeAsync(Guid resetId)
    {
        await using var connection = CreateConnection();
        await connection.OpenAsync();
        using var command = new SqlCommand(@"
            UPDATE dbo.PasswordResetCode SET IsUsed = 1 WHERE PasswordResetCodeID = @ResetID", connection);
        command.Parameters.AddWithValue("@ResetID", resetId);
        await command.ExecuteNonQueryAsync();
    }

    private SqlConnection CreateConnection()
    {
        if (string.IsNullOrWhiteSpace(_connectionString))
            throw new InvalidOperationException("The user database connection is not configured.");
        return new SqlConnection(_connectionString);
    }

    private static string NormalizeUserType(string userType) =>
        userType.Trim().ToLowerInvariant() switch
        {
            "user" or "student" => "User",
            "teacher" or "instructor" => "Teacher",
            _ => throw new ArgumentException("Only User and Teacher accounts can reset passwords.")
        };

    private static byte[] HashCode(string code, byte[] salt) =>
        Rfc2898DeriveBytes.Pbkdf2(code, salt, PasswordHashIterations, HashAlgorithmName.SHA256, 32);

    private static string HashPassword(string password)
    {
        var salt = RandomNumberGenerator.GetBytes(16);
        var hash = Rfc2898DeriveBytes.Pbkdf2(password, salt, PasswordHashIterations, HashAlgorithmName.SHA256, 32);
        return $"PBKDF2${PasswordHashIterations}${Convert.ToBase64String(salt)}${Convert.ToBase64String(hash)}";
    }

    private sealed record Account(Guid Id, string UserType, string Destination);
    private sealed record GeneratedCodeResponse(string Code);
}
