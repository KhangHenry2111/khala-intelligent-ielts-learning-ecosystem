namespace AuthPortal.Models;

public class UserInfo
{
    // Use string to hold GUID or int identifiers consistently across schemas
    public string? Id { get; set; }
    public string Username { get; set; } = string.Empty;
    public string FullName { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string UserType { get; set; } = string.Empty;
    // Additional database columns (excluding password) returned as name->value
    public System.Collections.Generic.IDictionary<string, object?> Details { get; set; } = new System.Collections.Generic.Dictionary<string, object?>();
}
