import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock

from test_connection import convert_ado_to_sqlalchemy, read_connection_string
from test_sql_scripts import _build_engine_url, _split_sql_statements


class TestConnectionHelpers(unittest.TestCase):
    def test_read_connection_string_returns_configured_value(self):
        with tempfile.TemporaryDirectory() as directory:
            config_path = Path(directory) / "config.cfg"
            config_path.write_text(
                "[sqlserver]\nconnection_string = Server=test;Database=IELTS\n",
                encoding="utf-8",
            )

            self.assertEqual(
                read_connection_string(config_path),
                "Server=test;Database=IELTS",
            )

    def test_read_connection_string_rejects_missing_section(self):
        with tempfile.TemporaryDirectory() as directory:
            config_path = Path(directory) / "config.cfg"
            config_path.write_text("[other]\nvalue=yes\n", encoding="utf-8")

            with self.assertRaises(ValueError):
                read_connection_string(config_path)

    def test_convert_ado_to_sqlalchemy_uses_windows_authentication(self):
        url = convert_ado_to_sqlalchemy(
            "Data Source=localhost;Initial Catalog=IELTS;Integrated Security=True"
        )

        self.assertIn("mssql+pyodbc://@localhost/IELTS", url)
        self.assertIn("Trusted_Connection=yes", url)

    def test_convert_ado_to_sqlalchemy_uses_sql_authentication(self):
        url = convert_ado_to_sqlalchemy(
            "Data Source=db;Initial Catalog=IELTS;User Id=alice;Password=secret"
        )

        self.assertIn("alice:secret@db/IELTS", url)
        self.assertNotIn("Trusted_Connection=yes", url)

    def test_split_sql_statements_handles_go_batches(self):
        batches = list(_split_sql_statements("SELECT 1\nGO\nSELECT 2\nGO\n"))

        self.assertEqual(batches, ["SELECT 1", "SELECT 2"])

    def test_build_engine_url_adds_driver_and_maps_ado_options(self):
        url = _build_engine_url(
            "Data Source=db;Initial Catalog=IELTS;Encrypt=False;TrustServerCertificate=True"
        )

        self.assertIn("ODBC+Driver+17+for+SQL+Server", url)
        self.assertIn("Server%3Ddb", url)
        self.assertIn("Encrypt%3Dno", url)
        self.assertIn("TrustServerCertificate%3Dyes", url)

if __name__ == "__main__":
    unittest.main(verbosity=2)