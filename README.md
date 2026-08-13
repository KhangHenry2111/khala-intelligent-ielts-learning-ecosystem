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
