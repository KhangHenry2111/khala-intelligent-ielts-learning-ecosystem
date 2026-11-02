using System.Security.Cryptography;
using System.Text;

namespace AuthPortal.Services;

public static class EnrollmentKeyService
{
    public static string Generate()
    {
        return Convert.ToHexString(RandomNumberGenerator.GetBytes(16));
    }

    public static string Hash(string key)
    {
        return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(key.Trim().ToUpperInvariant())));
    }
}
