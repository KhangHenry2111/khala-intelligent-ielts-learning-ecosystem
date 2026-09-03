# IELTS Login Portal - Updated Documentation

## Overview
The IELTS Login Portal has been enhanced to display all user information after successful authentication. When a user logs in with their username and password, if the credentials match a user in the database, the system displays all user details both in the console (backend) and on the web interface (frontend).

## Features

### 1. Authentication Flow
- User enters username and password through the login form
- System validates credentials against the `[User]`, `Admin`, or `Teacher` table
- If credentials are valid and user status is 'Active', authentication succeeds

### 2. User Information Display

#### Frontend Display
After successful login, the web interface displays:
- **User Avatar**: First letter of user's full name
- **User Summary**: Full name, role (badge), and email
- **Detailed Information Table**: All database fields with Vietnamese labels
  - Fields are formatted appropriately (dates, boolean values, etc.)
  - Null values are displayed as "—"
  - Boolean fields show "✓ Có" or "✗ Chưa"

#### Console Display (Backend)
The backend logs all user information in a formatted table:
```
================================================================================
                         USER INFORMATION
================================================================================
User ID:                     [UUID]
Username:                    [username]
Full Name:                   [fullname]
Email:                       [email]
User Type:                   [User/Admin/Instructor]

Additional Details:
--------------------------------------------------------------------------------
  ColumnName                 : Value
  ...
================================================================================
```

### 3. Enhanced Logging
The AuthController now logs:
- Login attempts with username and user type
- Successful/failed login results
- User information retrieval

### 4. Database Fields Displayed
All database columns are displayed except `Password`, including:
- Basic info: UserID, FullName, Username, Email, PhoneNumber, DateOfBirth, Gender
- Verification: EmailVerified, PhoneVerified
- IELTS Scores: CurrentBand, TargetBand, SpeakingBand, ListeningBand, ReadingBand, WritingBand
- Learning: LearningLevel, Rank, TotalTests, TotalPracticeQuestions, LearningStreak
- Account: Status, Role, CreatedAt, UpdatedAt, LastLogin
- Package: PackageID, AIQuizUsedThisMonth, LevelTestUsedThisMonth, UploadedStorageMB
- And more...

## File Changes

### 1. `Services/AuthService.cs`
**Added:**
- Import: `using System.Linq;`
- Method: `PrintUserInfo(UserInfo user)` - Prints all user information to console in a formatted table

**Enhanced:**
- Better error handling with stack trace logging

### 2. `Services/IAuthService.cs`
**Added:**
- Interface method: `void PrintUserInfo(UserInfo user);`

### 3. `Controllers/AuthController.cs`
**Enhanced:**
- Detailed login logging
- Calls `PrintUserInfo()` on successful login
- Better response formatting
- Includes all user details in the JSON response

### 4. Frontend (No changes required)
The existing `wwwroot/js/auth.js` already:
- Displays all user details from the backend response
- Formats values appropriately (dates, booleans, etc.)
- Shows Vietnamese labels for database columns
- Renders a professional profile card

## How to Test

### Auth API

The authentication endpoints are available under `/api/auth`:

- `POST /api/auth/register` accepts registration data as JSON and validates username, password, email, phone number, and profile fields.
- `POST /api/auth/login` returns a session token and user information without the password.
- `POST /api/auth/logout` accepts `{ "token": "..." }` or a `Bearer` authorization header and revokes the session token.

Duplicate registration responses identify the existing field: `Username already exists.`, `Email already exists.`, or `PhoneNumber already exists.`

Example registration request:

```json
{
  "username": "student01",
  "password": "a-strong-password",
  "email": "student01@example.com",
  "userType": "student",
  "fullName": "Student Example",
  "phoneNumber": "0901234567",
  "dateOfBirth": "2000-01-15",
  "gender": "Other"
}
```

### Method 1: Web Interface
1. Start the AuthPortal application:
   ```bash
   cd auth-portal
   dotnet run
   ```

2. Open browser to `http://localhost:5000`

3. Select login type (Admin, Instructor, or Student)

4. Enter valid credentials:
   - Username and Password (must exist in respective table with Status = 'Active')

5. See all user information displayed:
   - On the web interface (formatted table)
   - In the console output (formatted text)

### Method 2: API Direct Call
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"your_username","password":"your_password","userType":"User"}'
```

**Response (on success):**
```json
{
  "success": true,
  "user": {
    "id": "UUID",
    "username": "string",
    "fullName": "string",
    "email": "string",
    "userType": "User|Admin|Instructor",
    "details": {
      "field1": "value1",
      "field2": "value2",
      ...
    }
  }
}
```

## Database Requirements

### User Table Schema
The `[User]` table must have the following columns:
- UserID (UNIQUEIDENTIFIER) - Primary Key
- Username (NVARCHAR(100)) - Unique
- Password (NVARCHAR(255))
- FullName (NVARCHAR(255))
- Email (NVARCHAR(255)) - Unique
- Status (NVARCHAR(20)) - Default 'Active'
- And other columns as defined in SqlScripts.sql

### Admin Table Schema
The `Admin` table must have:
- AdminID (UNIQUEIDENTIFIER) - Primary Key
- Username (NVARCHAR(100)) - Unique
- Password (NVARCHAR(255))
- Status (NVARCHAR(20)) - Default 'Active'
- And other columns

### Teacher Table Schema
The `Teacher` table must have:
- TeacherID (UNIQUEIDENTIFIER) - Primary Key
- Username (NVARCHAR(100)) - Unique
- Password (NVARCHAR(255))
- Status (NVARCHAR(20)) - Default 'Active'
- And other columns

## Configuration

The connection string is read from:
1. `config.cfg` in the parent directory (preferred)
2. `appsettings.json` in the project directory
3. Environment variable `USER_DB_CONNECTION`

**config.cfg format:**
```ini
[sqlserver]
connection_string = Data Source=(localdb)\MSSQLLocalDB;Initial Catalog=IELTS;Integrated Security=True;...
```

**appsettings.json format:**
```json
{
  "ConnectionStrings": {
    "Default": "Data Source=(localdb)\\MSSQLLocalDB;Initial Catalog=IELTS;..."
  }
}
```

## Error Handling

### Login Failures
- **Invalid credentials**: Returns 401 Unauthorized with message "Invalid credentials"
- **No connection string**: Logs error and returns null
- **Database error**: Logs error details and returns null
- **User status not Active**: Returns null (treated as invalid credentials)

### Console Error Messages
```
[AuthService] ERROR: No connection string configured.
[AuthService] Exception: [error details]
[AuthService] Stack: [stack trace]
[AuthService] DB Error: [error message]
[AuthController] Login failed - Invalid credentials for username: [username]
```

## Security Notes

1. **Password Field**: Password is never returned to the client or displayed in user details
2. **SQL Injection Prevention**: Uses parameterized queries with `@parameter` placeholders
3. **Status Check**: Only users with Status = 'Active' can log in
4. **Connection String**: Supports both Windows Authentication and SQL Authentication

## Future Enhancements

Potential improvements:
- Add password hashing/verification
- Implement JWT token generation
- Add rate limiting for failed login attempts
- Add audit logging (login history)
- Add two-factor authentication
- Add user role-based access control (RBAC)
- Cache user data for performance
