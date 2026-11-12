import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from scripts import sync_new_tables


class SchemaSyncTests(unittest.TestCase):
    def test_table_names_in_script_are_case_insensitive(self):
        names = sync_new_tables.table_names_in_script(
            "CREATE TABLE [dbo].[ReadingPassage] (Id int);"
        )

        self.assertIn(("dbo", "readingpassage"), names)

    def test_build_odbc_connection_string_maps_ado_net_keys(self):
        value = sync_new_tables.build_odbc_connection_string(
            "Data Source=(localdb)\\MSSQLLocalDB;Initial Catalog=IELTS;"
            "Integrated Security=True;Encrypt=False",
            ["ODBC Driver 17 for SQL Server"],
        )

        self.assertIn("DRIVER={ODBC Driver 17 for SQL Server}", value)
        self.assertIn("SERVER={(localdb)\\MSSQLLocalDB}", value)
        self.assertIn("DATABASE={IELTS}", value)
        self.assertIn("Trusted_Connection={yes}", value)
        self.assertIn("encrypt={no}", value)

    def test_generate_migration_includes_only_missing_tables(self):
        table_rows = [
            {"schema_name": "dbo", "table_name": "Existing", "object_id": 1},
            {"schema_name": "dbo", "table_name": "NewTable", "object_id": 2},
        ]
        column_rows = [
            {
                "schema_name": "dbo",
                "table_name": "NewTable",
                "column_id": 1,
                "column_name": "Id",
                "type_schema": "sys",
                "type_name": "int",
                "is_user_defined": False,
                "max_length": 4,
                "precision": 10,
                "scale": 0,
                "is_nullable": False,
                "is_identity": False,
                "identity_seed": None,
                "identity_increment": None,
                "default_name": None,
                "default_definition": None,
                "computed_definition": None,
                "is_persisted": False,
                "collation_name": None,
                "is_sparse": False,
                "is_rowguidcol": False,
            }
        ]
        rows_by_query = {
            sync_new_tables.TABLES_QUERY: table_rows,
            sync_new_tables.COLUMNS_QUERY: column_rows,
            sync_new_tables.KEYS_QUERY: [],
            sync_new_tables.CHECKS_QUERY: [],
            sync_new_tables.FOREIGN_KEYS_QUERY: [],
            sync_new_tables.INDEXES_QUERY: [],
        }

        with patch.object(
            sync_new_tables,
            "_fetch_dicts",
            side_effect=lambda cursor, query: rows_by_query[query],
        ):
            migration = sync_new_tables.generate_migration(
                object(),
                "CREATE TABLE [dbo].[Existing] ([Id] int);",
            )

        self.assertIn("CREATE TABLE [dbo].[NewTable]", migration)
        self.assertNotIn("CREATE TABLE [dbo].[Existing]", migration)

    def test_merge_generated_section_replaces_instead_of_duplicating(self):
        source = (
            "USE [master]\r\nGO\r\n"
            f"{sync_new_tables.GENERATED_START}\r\nold migration\r\n"
            f"{sync_new_tables.GENERATED_END}\r\n"
        )

        updated = sync_new_tables.merge_generated_section(source, "new migration\n")

        self.assertIn("USE [master]\r\nGO", updated)
        self.assertIn("new migration", updated)
        self.assertNotIn("old migration", updated)
        self.assertEqual(updated.count(sync_new_tables.GENERATED_START), 1)
        self.assertEqual(updated.count(sync_new_tables.GENERATED_END), 1)

    def test_sql_file_writer_preserves_utf16_encoding(self):
        with TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "schema.sql"
            original = "USE [master]\r\nGO\r\n".encode("utf-16")
            path.write_bytes(original)

            sync_new_tables._write_sql_file(path, "USE [IELTS]\r\nGO\r\n", original)

            saved = path.read_bytes()
            self.assertTrue(saved.startswith(b"\xff\xfe"))
            self.assertEqual(saved.decode("utf-16"), "USE [IELTS]\r\nGO\r\n")


if __name__ == "__main__":
    unittest.main()
