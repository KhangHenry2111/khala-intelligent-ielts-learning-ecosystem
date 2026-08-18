using System;
using System.Data;
using System.Data.SqlClient;
using System.IO;
using IniParser;
using IniParser.Model;

class TestConnection
{
    static void Main()
    {
        Console.WriteLine("========================================");
        Console.WriteLine("IELTS Database Connection Test");
        Console.WriteLine("========================================\n");

        try
        {
            // Read connection string from config.cfg
            string configPath = "config.cfg";
            string connectionString = ReadConnectionString(configPath);

            Console.WriteLine($"✓ Configuration loaded from: {configPath}");
            Console.WriteLine($"✓ Connection String: {connectionString}\n");

            // Test connection
            Console.WriteLine("Testing database connection...");
            TestDatabaseConnection(connectionString);

            // Query all users
            Console.WriteLine("\nQuerying all users from [User] table...\n");
            QueryAllUsers(connectionString);

            Console.WriteLine("\n========================================");
            Console.WriteLine("✓ Test completed successfully!");
            Console.WriteLine("========================================");
        }
        catch (Exception ex)
        {
            Console.WriteLine($"\n✗ Error: {ex.Message}");
            Console.WriteLine($"Details: {ex.InnerException?.Message}");
        }
    }

    static string ReadConnectionString(string configPath)
    {
        if (!File.Exists(configPath))
            throw new FileNotFoundException($"Config file not found: {configPath}");

        var parser = new FileIniDataParser();
        IniData data = parser.ReadFile(configPath);
        
        string connectionString = data["sqlserver"]["connection_string"];
        if (string.IsNullOrEmpty(connectionString))
            throw new Exception("connection_string not found in config.cfg");

        return connectionString;
    }

    static void TestDatabaseConnection(string connectionString)
    {
        using (SqlConnection connection = new SqlConnection(connectionString))
        {
            connection.Open();
            Console.WriteLine("✓ Connection successful!");

            // Get database info
            SqlCommand cmd = new SqlCommand("SELECT DB_NAME() as DatabaseName, @@VERSION as ServerVersion", connection);
            using (SqlDataReader reader = cmd.ExecuteReader())
            {
                if (reader.Read())
                {
                    Console.WriteLine($"  Database: {reader["DatabaseName"]}");
                    Console.WriteLine($"  Server Version: {reader["ServerVersion"]}");
                }
            }
        }
    }

    static void QueryAllUsers(string connectionString)
    {
        using (SqlConnection connection = new SqlConnection(connectionString))
        {
            connection.Open();

            string query = @"
                SELECT 
                    UserID,
                    FullName,
                    Username,
                    Email,
                    Role,
                    Status,
                    CurrentBand,
                    TargetBand,
                    CreatedAt,
                    LastLogin
                FROM [User]
                ORDER BY CreatedAt DESC
            ";

            SqlCommand cmd = new SqlCommand(query, connection);
            using (SqlDataReader reader = cmd.ExecuteReader())
            {
                if (!reader.HasRows)
                {
                    Console.WriteLine("No users found in database.");
                    return;
                }

                // Print header
                Console.WriteLine(string.Format("{0,-36} {1,-20} {2,-20} {3,-30} {4,-10} {5,-10}",
                    "UserID", "FullName", "Username", "Email", "Role", "Status"));
                Console.WriteLine(new string('-', 150));

                // Print rows
                while (reader.Read())
                {
                    string userId = reader["UserID"].ToString();
                    string fullName = reader["FullName"].ToString();
                    string username = reader["Username"].ToString();
                    string email = reader["Email"].ToString();
                    string role = reader["Role"].ToString();
                    string status = reader["Status"].ToString();

                    Console.WriteLine(string.Format("{0,-36} {1,-20} {2,-20} {3,-30} {4,-10} {5,-10}",
                        userId, fullName, username, email, role, status));
                }

                Console.WriteLine(new string('-', 150));
                Console.WriteLine($"Total users: {reader.RecordsAffected}");
            }
        }
    }
}
