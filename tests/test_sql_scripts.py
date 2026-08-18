import configparser
import os
import sys
import unittest
from pathlib import Path
from urllib.parse import quote_plus

ROOT = Path(__file__).resolve().parent.parent
CONFIG_PATH = ROOT / "config.cfg"
SCRIPT_PATH = ROOT / "SqlScripts.sql"


# ============================================================
# Auto-load newest venv (re-exec this script using the venv's
# python if we are not already running inside a venv).
# Priority when searching for venv folders under ROOT:
#   .venv, venv, env, .env -> pick whichever exists, newest mtime wins
#   if several match. Scans ROOT and one level of subfolders.
# Set SKIP_VENV_AUTOLOAD=1 to disable this behaviour.
# ============================================================
def _venv_python(venv_dir: Path):
    if os.name == "nt":
        candidate = venv_dir / "Scripts" / "python.exe"
    else:
        candidate = venv_dir / "bin" / "python"
    return candidate if candidate.exists() else None


def _find_latest_venv(root: Path):
    names = (".venv", "venv", "env", ".env")
    found = []

    for name in names:
        candidate = root / name
        if _venv_python(candidate) is not None:
            found.append(candidate)

    for child in root.iterdir():
        if not child.is_dir() or child.name.startswith("."):
            continue
        for name in names:
            candidate = child / name
            if _venv_python(candidate) is not None:
                found.append(candidate)

    if not found:
        return None

    return max(found, key=lambda p: p.stat().st_mtime)


def _autoload_latest_venv():
    if os.environ.get("SKIP_VENV_AUTOLOAD") == "1":
        return

    if os.environ.get("_VENV_AUTOLOADED") == "1":
        return  # already re-exec'd once, avoid infinite loop

    if sys.prefix != sys.base_prefix:
        return  # already running inside a venv, respect it

    latest_venv = _find_latest_venv(ROOT)
    if latest_venv is None:
        return

    venv_python = _venv_python(latest_venv)
    if venv_python is None or Path(sys.executable).resolve() == venv_python.resolve():
        return

    os.environ["_VENV_AUTOLOADED"] = "1"
    print(f"[venv] Re-launching with interpreter from: {latest_venv}")
    os.execv(str(venv_python), [str(venv_python)] + sys.argv)


_autoload_latest_venv()

# Imports that depend on the (possibly re-exec'd) venv must come after autoload.
try:
    import sqlalchemy
    from sqlalchemy import create_engine, text
except ImportError:
    sqlalchemy = None
    create_engine = None
    text = None


def _split_sql_statements(sql_text: str):
    lines = sql_text.replace("\r\n", "\n").split("\n")
    statement_lines = []

    for line in lines:
        if line.strip().upper() == "GO":
            if statement_lines:
                yield "\n".join(statement_lines)
                statement_lines = []
        else:
            statement_lines.append(line)

    if statement_lines:
        yield "\n".join(statement_lines)


def _build_engine_url(odbc_connection_string: str) -> str:
    """
    Wrap a raw ODBC connection string (DRIVER=...;SERVER=...;...) into
    a SQLAlchemy engine URL using the mssql+pyodbc dialect.
    """
    if "driver=" not in odbc_connection_string.lower():
        odbc_connection_string = "Driver={ODBC Driver 17 for SQL Server};" + odbc_connection_string
    
    # Map ADO.NET values to ODBC Driver values
    odbc_connection_string = odbc_connection_string.replace("Data Source=", "Server=")
    odbc_connection_string = odbc_connection_string.replace("Encrypt=False", "Encrypt=no")
    odbc_connection_string = odbc_connection_string.replace("Encrypt=True", "Encrypt=yes")
    odbc_connection_string = odbc_connection_string.replace("TrustServerCertificate=False", "TrustServerCertificate=no")
    odbc_connection_string = odbc_connection_string.replace("TrustServerCertificate=True", "TrustServerCertificate=yes")

    quoted = quote_plus(odbc_connection_string)
    return f"mssql+pyodbc:///?odbc_connect={quoted}"


class TestSqlScripts(unittest.TestCase):

    connection = None
    engine = None

    @classmethod
    def setUpClass(cls):
        if sqlalchemy is None:
            raise unittest.SkipTest(
                "sqlalchemy (and pyodbc) is not installed. "
                "Run: pip install sqlalchemy pyodbc"
            )

        if not CONFIG_PATH.exists():
            raise unittest.SkipTest(
                f"Missing config.cfg at {CONFIG_PATH}. "
                "Add a [sqlserver] section with a connection_string value."
            )

        parser = configparser.ConfigParser()

        try:
            with CONFIG_PATH.open("r", encoding="utf-8") as fp:
                parser.read_file(fp)
        except UnicodeDecodeError as exc:
            raise unittest.SkipTest(
                f"Cannot read config.cfg as UTF-8: {exc}. "
                "Please save config.cfg with UTF-8 encoding."
            )
        except configparser.Error as exc:
            raise unittest.SkipTest(
                f"Failed to parse config.cfg: {exc}"
            )

        if "sqlserver" not in parser:
            raise unittest.SkipTest(
                "Missing [sqlserver] section in config.cfg."
            )

        cfg = parser["sqlserver"]

        connection_string = cfg.get("connection_string", "").strip()

        if not connection_string:
            raise unittest.SkipTest(
                "config.cfg must contain a connection_string value under [sqlserver]."
            )

        engine_url = _build_engine_url(connection_string)

        try:
            cls.engine = create_engine(engine_url, future=True)
            cls.connection = cls.engine.connect()
            cls.connection = cls.connection.execution_options(isolation_level="AUTOCOMMIT")
        except Exception as exc:
            raise unittest.SkipTest(f"Could not connect to SQL Server: {exc}")

    @classmethod
    def tearDownClass(cls):
        if cls.connection is not None:
            cls.connection.close()
        if cls.engine is not None:
            cls.engine.dispose()

    def test_sql_script_syntax(self):
        self.assertTrue(
            SCRIPT_PATH.exists(),
            f"SQL script not found: {SCRIPT_PATH}"
        )

        with SCRIPT_PATH.open("r", encoding="utf-8") as f:
            sql_text = f.read()

        self.connection.execute(text("SET NOEXEC ON;"))

        exceptions = []

        try:
            for statement in _split_sql_statements(sql_text):
                stripped = statement.strip()

                if not stripped:
                    continue

                try:
                    self.connection.execute(text(stripped))
                except Exception as exc:
                    exceptions.append(
                        f"Error in statement:\n"
                        f"{str(exc)}\n"
                        f"{stripped}"
                    )

        finally:
            self.connection.execute(text("SET NOEXEC OFF;"))

        if exceptions:
            failure_message = (
                "SQL syntax check failed:\n"
                + "\n\n".join(exceptions)
            )

            print(failure_message)
            self.fail(failure_message)

    def test_query_all_users(self):
        """Test querying all records from the [User] table."""
        try:
            result = self.connection.execute(text("SELECT * FROM [User]"))
            rows = result.fetchall()
            print(f"Successfully queried [User] table. Found {len(rows)} records.")
            self.assertIsNotNone(rows)
        except Exception as exc:
            self.fail(f"Querying [User] table failed: {exc}")


if __name__ == "__main__":
    print("Running SQL script syntax test...")
    unittest.main(verbosity=2)