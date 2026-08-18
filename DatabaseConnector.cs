using System;
using System.Collections.Generic;
using System.Data;
using Microsoft.Data.SqlClient;
using System.IO;
using System.Text;

/// <summary>
/// Database Access Utility
/// Reads connection string from config.cfg and fetches data from IELTS database
/// </summary>
public class DatabaseConnector
{
    private readonly string _connectionString;
    private const string CONFIG_FILE = "config.cfg";

    public DatabaseConnector()
    {
        _connectionString = ReadConnectionString();
    }

    /// <summary>
    /// Read connection string from config.cfg
    /// </summary>
    private string ReadConnectionString()
    {
        if (!File.Exists(CONFIG_FILE))
        {
            throw new FileNotFoundException($"Configuration file not found: {CONFIG_FILE}");
        }

        var lines = File.ReadAllLines(CONFIG_FILE);
        foreach (var line in lines)
        {
            if (line.Contains("connection_string") && !line.TrimStart().StartsWith(";"))
            {
                var parts = line.Split('=', 2);
                if (parts.Length == 2)
                {
                    return parts[1].Trim();
                }
            }
        }

        throw new InvalidOperationException("connection_string not found in config.cfg");
    }

    /// <summary>
    /// Get all users from [User] table
    /// </summary>
    public List<Dictionary<string, object>> GetAllUsers()
    {
        const string query = @"
            SELECT 
                UserID, FullName, Username, Email, PhoneNumber, Status,
                CurrentBand, TargetBand, LearningLevel, CreatedAt, LastLogin
            FROM [User]
            ORDER BY CreatedAt DESC
        ";
        return ExecuteQuery(query, "Users");
    }

    /// <summary>
    /// Get all teachers from Teacher table
    /// </summary>
    public List<Dictionary<string, object>> GetAllTeachers()
    {
        const string query = @"
            SELECT 
                TeacherID, FullName, Username, Email, PhoneNumber, Status,
                Biography, IELTSBand, ExperienceYears, Specialization,
                VerificationStatus, AverageRating, CreatedAt, LastLogin
            FROM Teacher
            ORDER BY CreatedAt DESC
        ";
        return ExecuteQuery(query, "Teachers");
    }

    /// <summary>
    /// Get all admins from Admin table
    /// </summary>
    public List<Dictionary<string, object>> GetAllAdmins()
    {
        const string query = @"
            SELECT 
                AdminID, FullName, Username, Email, PhoneNumber, Status,
                AdminLevel, IsITCenterIssued, CreatedAt, LastLogin
            FROM Admin
            ORDER BY CreatedAt DESC
        ";
        return ExecuteQuery(query, "Admins");
    }

    /// <summary>
    /// Get user by username
    /// </summary>
    public Dictionary<string, object> GetUserByUsername(string username)
    {
        const string query = @"
            SELECT * FROM [User] WHERE Username = @username
        ";
        using (var conn = new SqlConnection(_connectionString))
        {
            conn.Open();
            using (var cmd = new SqlCommand(query, conn))
            {
                cmd.Parameters.AddWithValue("@username", username);
                using (var reader = cmd.ExecuteReader())
                {
                    if (reader.Read())
                    {
                        return ReadRow(reader);
                    }
                }
            }
        }
        return null;
    }

    /// <summary>
    /// Get teacher by username
    /// </summary>
    public Dictionary<string, object> GetTeacherByUsername(string username)
    {
        const string query = @"
            SELECT * FROM Teacher WHERE Username = @username
        ";
        using (var conn = new SqlConnection(_connectionString))
        {
            conn.Open();
            using (var cmd = new SqlCommand(query, conn))
            {
                cmd.Parameters.AddWithValue("@username", username);
                using (var reader = cmd.ExecuteReader())
                {
                    if (reader.Read())
                    {
                        return ReadRow(reader);
                    }
                }
            }
        }
        return null;
    }

    /// <summary>
    /// Get admin by username
    /// </summary>
    public Dictionary<string, object> GetAdminByUsername(string username)
    {
        const string query = @"
            SELECT * FROM Admin WHERE Username = @username
        ";
        using (var conn = new SqlConnection(_connectionString))
        {
            conn.Open();
            using (var cmd = new SqlCommand(query, conn))
            {
                cmd.Parameters.AddWithValue("@username", username);
                using (var reader = cmd.ExecuteReader())
                {
                    if (reader.Read())
                    {
                        return ReadRow(reader);
                    }
                }
            }
        }
        return null;
    }

    /// <summary>
    /// Get database statistics
    /// </summary>
    public Dictionary<string, object> GetDatabaseStats()
    {
        const string query = @"
            SELECT 
                (SELECT COUNT(*) FROM [User]) AS TotalUsers,
                (SELECT COUNT(*) FROM Teacher) AS TotalTeachers,
                (SELECT COUNT(*) FROM Admin) AS TotalAdmins,
                (SELECT COUNT(*) FROM [User] WHERE Status = 'Active') AS ActiveUsers,
                (SELECT COUNT(*) FROM Teacher WHERE Status = 'Active') AS ActiveTeachers,
                (SELECT COUNT(*) FROM Admin WHERE Status = 'Active') AS ActiveAdmins
        ";
        using (var conn = new SqlConnection(_connectionString))
        {
            conn.Open();
            using (var cmd = new SqlCommand(query, conn))
            {
                using (var reader = cmd.ExecuteReader())
                {
                    if (reader.Read())
                    {
                        return ReadRow(reader);
                    }
                }
            }
        }
        return null;
    }

    /// <summary>
    /// Execute a query and return list of results
    /// </summary>
    private List<Dictionary<string, object>> ExecuteQuery(string query, string tableName)
    {
        var results = new List<Dictionary<string, object>>();

        try
        {
            using (var conn = new SqlConnection(_connectionString))
            {
                conn.Open();
                using (var cmd = new SqlCommand(query, conn))
                {
                    using (var reader = cmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            results.Add(ReadRow(reader));
                        }
                    }
                }
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Error fetching {tableName}: {ex.Message}");
        }

        return results;
    }

    /// <summary>
    /// Read a single row and convert to dictionary
    /// </summary>
    private Dictionary<string, object> ReadRow(SqlDataReader reader)
    {
        var row = new Dictionary<string, object>();
        for (int i = 0; i < reader.FieldCount; i++)
        {
            string fieldName = reader.GetName(i);
            object fieldValue = reader.IsDBNull(i) ? null : reader.GetValue(i);
            row[fieldName] = fieldValue;
        }
        return row;
    }

    /// <summary>
    /// Print data in a formatted table
    /// </summary>
    public static void PrintTable(string title, List<Dictionary<string, object>> data)
    {
        if (data == null || data.Count == 0)
        {
            Console.WriteLine($"\n{title}: No data found\n");
            return;
        }

        Console.WriteLine($"\n{new string('=', 100)}");
        Console.WriteLine($"{title} ({data.Count} records)");
        Console.WriteLine(new string('=', 100));

        // Get all column names from first row
        var columns = data[0].Keys;
        var colWidths = new Dictionary<string, int>();

        foreach (var col in columns)
        {
            colWidths[col] = Math.Max(col.Length, 20);
        }

        // Print header
        foreach (var col in columns)
        {
            Console.Write($"{col,-{colWidths[col]}} | ");
        }
        Console.WriteLine();
        Console.WriteLine(new string('-', 100));

        // Print rows
        foreach (var row in data)
        {
            foreach (var col in columns)
            {
                string value = row[col] == null ? "[NULL]" : row[col].ToString();
                if (value.Length > colWidths[col])
                    value = value.Substring(0, colWidths[col] - 3) + "...";
                Console.Write($"{value,-{colWidths[col]}} | ");
            }
            Console.WriteLine();
        }

        Console.WriteLine(new string('=', 100));
    }
}

/// <summary>
/// Main Program - Demonstrates database access
/// </summary>
class Program
{
    static void Main(string[] args)
    {
        try
        {
            Console.WriteLine("\n╔════════════════════════════════════════════════════════════════╗");
            Console.WriteLine("║    IELTS DATABASE DATA RETRIEVAL UTILITY                      ║");
            Console.WriteLine("╚════════════════════════════════════════════════════════════════╝\n");

            var db = new DatabaseConnector();
            Console.WriteLine("✓ Connection string loaded successfully");

            // Display menu
            while (true)
            {
                Console.WriteLine("\n┌─ SELECT DATA TO RETRIEVE ─────────────────────────────────────┐");
                Console.WriteLine("│ 1. Get all users                                              │");
                Console.WriteLine("│ 2. Get all teachers                                           │");
                Console.WriteLine("│ 3. Get all admins                                             │");
                Console.WriteLine("│ 4. Get user by username                                       │");
                Console.WriteLine("│ 5. Get teacher by username                                    │");
                Console.WriteLine("│ 6. Get admin by username                                      │");
                Console.WriteLine("│ 7. Get database statistics                                    │");
                Console.WriteLine("│ 8. Exit                                                       │");
                Console.WriteLine("└───────────────────────────────────────────────────────────────┘");
                Console.Write("\nEnter choice (1-8): ");

                string choice = Console.ReadLine();

                switch (choice)
                {
                    case "1":
                        var users = db.GetAllUsers();
                        DatabaseConnector.PrintTable("ALL USERS", users);
                        break;

                    case "2":
                        var teachers = db.GetAllTeachers();
                        DatabaseConnector.PrintTable("ALL TEACHERS", teachers);
                        break;

                    case "3":
                        var admins = db.GetAllAdmins();
                        DatabaseConnector.PrintTable("ALL ADMINS", admins);
                        break;

                    case "4":
                        Console.Write("Enter username: ");
                        var username = Console.ReadLine();
                        var user = db.GetUserByUsername(username);
                        if (user != null)
                        {
                            DatabaseConnector.PrintTable($"USER: {username}", new List<Dictionary<string, object>> { user });
                        }
                        else
                        {
                            Console.WriteLine($"User '{username}' not found");
                        }
                        break;

                    case "5":
                        Console.Write("Enter teacher username: ");
                        var teacherUsername = Console.ReadLine();
                        var teacher = db.GetTeacherByUsername(teacherUsername);
                        if (teacher != null)
                        {
                            DatabaseConnector.PrintTable($"TEACHER: {teacherUsername}", new List<Dictionary<string, object>> { teacher });
                        }
                        else
                        {
                            Console.WriteLine($"Teacher '{teacherUsername}' not found");
                        }
                        break;

                    case "6":
                        Console.Write("Enter admin username: ");
                        var adminUsername = Console.ReadLine();
                        var admin = db.GetAdminByUsername(adminUsername);
                        if (admin != null)
                        {
                            DatabaseConnector.PrintTable($"ADMIN: {adminUsername}", new List<Dictionary<string, object>> { admin });
                        }
                        else
                        {
                            Console.WriteLine($"Admin '{adminUsername}' not found");
                        }
                        break;

                    case "7":
                        var stats = db.GetDatabaseStats();
                        if (stats != null)
                        {
                            Console.WriteLine("\n┌─ DATABASE STATISTICS ─────────────────────────────────────────┐");
                            Console.WriteLine($"│ Total Users:        {stats["TotalUsers"],-45}│");
                            Console.WriteLine($"│ Active Users:       {stats["ActiveUsers"],-45}│");
                            Console.WriteLine($"│ Total Teachers:     {stats["TotalTeachers"],-45}│");
                            Console.WriteLine($"│ Active Teachers:    {stats["ActiveTeachers"],-45}│");
                            Console.WriteLine($"│ Total Admins:       {stats["TotalAdmins"],-45}│");
                            Console.WriteLine($"│ Active Admins:      {stats["ActiveAdmins"],-45}│");
                            Console.WriteLine("└───────────────────────────────────────────────────────────────┘");
                        }
                        break;

                    case "8":
                        Console.WriteLine("\nGoodbye!");
                        return;

                    default:
                        Console.WriteLine("Invalid choice. Please try again.");
                        break;
                }
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"\n✗ ERROR: {ex.Message}");
            if (ex.InnerException != null)
            {
                Console.WriteLine($"Inner Exception: {ex.InnerException.Message}");
            }
        }
    }
}
