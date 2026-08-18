# ielts-study-assistant

## SQL Server Test Configuration

This repository includes a SQL syntax test that uses `pyodbc` to validate `SqlScripts.sql` against a SQL Server instance.

### Setup

1. Install requirements and `pyodbc` in your Python environment.
2. Update `config.cfg` with the SQL Server connection values.
3. For Windows Authentication, set:

```ini
trusted_connection = yes
username =
password =
```

4. For SQL Server authentication, set `trusted_connection = no` and provide valid `username` / `password`.

### Run tests

```bash
python -m unittest tests.test_sql_scripts
```

## Authentication Flow (Luồng hoạt động Authentication)

The authentication feature (located in the `auth-portal` directory) validates credentials and retrieves user information.

### Workflow:
1. User enters username and password through the login form.
2. System validates credentials against the `[User]`, `Admin`, or `Teacher` table in the database.
3. If credentials are valid and user status is 'Active', authentication succeeds.
4. The system returns all user details (excluding password) to the frontend, which are displayed on the user interface.

### Running the Auth Portal
To test the authentication portal locally:
```bash
cd auth-portal
dotnet run
```
Then open `http://localhost:5000` in your web browser.
