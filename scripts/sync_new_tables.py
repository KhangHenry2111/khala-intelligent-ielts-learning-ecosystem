"""Generate an idempotent SQL migration for tables missing from the base schema."""

import argparse
import configparser
import os
import re
import sys
from collections import defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE = ROOT / "sqlScripts.sql"
CONNECTION_ENV_VARS = (
    "SQLSERVER_CONNECTION_STRING",
    "ConnectionStrings__Default",
    "USER_DB_CONNECTION",
)
GENERATED_START = "-- BEGIN AUTO-GENERATED TABLES (sync_new_tables.py)"
GENERATED_END = "-- END AUTO-GENERATED TABLES (sync_new_tables.py)"
GENERATED_BLOCK_PATTERN = re.compile(
    rf"(?m)^{re.escape(GENERATED_START)}\r?\n.*?^{re.escape(GENERATED_END)}(?:\r?\n|$)",
    re.DOTALL,
)

CREATE_TABLE_PATTERN = re.compile(
    r"""
    \bCREATE\s+TABLE\s+
    (?:\[(?P<schema_bracket>(?:[^\]]|\]\])+)\]|(?P<schema_bare>[\w$#@]+))
    \s*\.\s*
    (?:\[(?P<table_bracket>(?:[^\]]|\]\])+)\]|(?P<table_bare>[\w$#@]+))
    """,
    re.IGNORECASE | re.VERBOSE,
)


def _unquote_identifier(value):
    return value.replace("]]", "]")


def table_names_in_script(script_text):
    names = set()
    for match in CREATE_TABLE_PATTERN.finditer(script_text):
        schema = match.group("schema_bracket") or match.group("schema_bare")
        table = match.group("table_bracket") or match.group("table_bare")
        names.add((_unquote_identifier(schema).casefold(), _unquote_identifier(table).casefold()))
    return names


def quote_identifier(value):
    return "[" + value.replace("]", "]]") + "]"


def _connection_string_from_environment_or_config():
    for variable in CONNECTION_ENV_VARS:
        value = os.environ.get(variable)
        if value and value.strip():
            return value.strip()

    config_path = ROOT / "config.cfg"
    if not config_path.exists():
        raise RuntimeError(
            "No SQL Server connection string found. Set SQLSERVER_CONNECTION_STRING "
            "or add [sqlserver] connection_string to config.cfg."
        )

    config = configparser.ConfigParser(interpolation=None)
    config.read(config_path, encoding="utf-8")
    connection_string = config.get("sqlserver", "connection_string", fallback="").strip()
    if not connection_string:
        raise RuntimeError(
            "No SQL Server connection string found. Set SQLSERVER_CONNECTION_STRING "
            "or add [sqlserver] connection_string to config.cfg."
        )
    return connection_string


def _parse_connection_string(connection_string):
    parts = {}
    for item in connection_string.split(";"):
        key, separator, value = item.partition("=")
        if not separator:
            continue
        value = value.strip()
        if len(value) >= 2 and value[0] == "{" and value[-1] == "}":
            value = value[1:-1].replace("}}", "}")
        parts[key.strip().casefold()] = value
    return parts


def build_odbc_connection_string(connection_string, available_drivers):
    """Translate common ADO.NET/ODBC SQL Server connection-string keys."""
    source = _parse_connection_string(connection_string)
    driver = source.get("driver")
    if not driver:
        driver = next(
            (
                candidate
                for candidate in (
                    "ODBC Driver 18 for SQL Server",
                    "ODBC Driver 17 for SQL Server",
                    "SQL Server",
                )
                if candidate in available_drivers
            ),
            None,
        )
    if not driver:
        raise RuntimeError("No SQL Server ODBC driver is installed.")

    options = {"DRIVER": driver}
    aliases = {
        "data source": "SERVER",
        "server": "SERVER",
        "initial catalog": "DATABASE",
        "database": "DATABASE",
        "user id": "UID",
        "uid": "UID",
        "password": "PWD",
        "pwd": "PWD",
        "connect timeout": "Connection Timeout",
        "connection timeout": "Connection Timeout",
        "application name": "APP",
        "app": "APP",
        "application intent": "ApplicationIntent",
        "authentication": "Authentication",
    }

    for source_key, target_key in aliases.items():
        if source_key in source:
            options[target_key] = source[source_key]

    for key in ("encrypt", "trustservercertificate"):
        if key in source:
            options[key] = "yes" if source[key].casefold() in ("true", "yes", "1") else "no"

    integrated_security = source.get("integrated security", source.get("trusted_connection"))
    if integrated_security:
        if integrated_security.casefold() in ("true", "yes", "sspi", "1"):
            options["Trusted_Connection"] = "yes"
        elif integrated_security.casefold() in ("false", "no", "0"):
            options["Trusted_Connection"] = "no"

    if "SERVER" not in options:
        raise RuntimeError("The SQL Server connection string does not specify a server.")
    if "DATABASE" not in options:
        raise RuntimeError("The SQL Server connection string does not specify a database.")
    if options.get("Trusted_Connection") != "yes" and "UID" not in options:
        raise RuntimeError("The connection string must specify integrated security or a user ID.")

    def brace(value):
        return "{" + value.replace("}", "}}") + "}"

    return ";".join(f"{key}={brace(value)}" for key, value in options.items())


TABLES_QUERY = """
SELECT s.name AS schema_name, t.name AS table_name, t.object_id
FROM sys.tables AS t
JOIN sys.schemas AS s ON s.schema_id = t.schema_id
WHERE t.is_ms_shipped = 0
ORDER BY s.name, t.name;
"""

COLUMNS_QUERY = """
SELECT s.name AS schema_name, t.name AS table_name, c.column_id,
       c.name AS column_name, ts.name AS type_schema, ty.name AS type_name,
       ty.is_user_defined, c.max_length, c.precision, c.scale, c.is_nullable,
       c.is_identity, CONVERT(nvarchar(100), ic.seed_value) AS identity_seed,
       CONVERT(nvarchar(100), ic.increment_value) AS identity_increment,
       dc.name AS default_name, dc.definition AS default_definition,
       cc.definition AS computed_definition,
       cc.is_persisted, c.collation_name, c.is_sparse, c.is_rowguidcol
FROM sys.columns AS c
JOIN sys.tables AS t ON t.object_id = c.object_id
JOIN sys.schemas AS s ON s.schema_id = t.schema_id
JOIN sys.types AS ty ON ty.user_type_id = c.user_type_id
JOIN sys.schemas AS ts ON ts.schema_id = ty.schema_id
LEFT JOIN sys.identity_columns AS ic
       ON ic.object_id = c.object_id AND ic.column_id = c.column_id
LEFT JOIN sys.default_constraints AS dc ON dc.object_id = c.default_object_id
LEFT JOIN sys.computed_columns AS cc
       ON cc.object_id = c.object_id AND cc.column_id = c.column_id
WHERE t.is_ms_shipped = 0
ORDER BY s.name, t.name, c.column_id;
"""

KEYS_QUERY = """
SELECT s.name AS schema_name, t.name AS table_name, kc.name AS constraint_name,
       kc.type AS constraint_type, i.type_desc AS index_type,
       c.name AS column_name, ic.key_ordinal, ic.is_descending_key
FROM sys.key_constraints AS kc
JOIN sys.tables AS t ON t.object_id = kc.parent_object_id
JOIN sys.schemas AS s ON s.schema_id = t.schema_id
JOIN sys.indexes AS i ON i.object_id = kc.parent_object_id AND i.index_id = kc.unique_index_id
JOIN sys.index_columns AS ic
       ON ic.object_id = i.object_id AND ic.index_id = i.index_id AND ic.key_ordinal > 0
JOIN sys.columns AS c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
ORDER BY s.name, t.name, kc.name, ic.key_ordinal;
"""

CHECKS_QUERY = """
SELECT s.name AS schema_name, t.name AS table_name, ck.name AS constraint_name,
       ck.definition, ck.is_disabled, ck.is_not_trusted
FROM sys.check_constraints AS ck
JOIN sys.tables AS t ON t.object_id = ck.parent_object_id
JOIN sys.schemas AS s ON s.schema_id = t.schema_id
ORDER BY s.name, t.name, ck.name;
"""

FOREIGN_KEYS_QUERY = """
SELECT ps.name AS schema_name, pt.name AS table_name, fk.name AS constraint_name,
       rs.name AS referenced_schema, rt.name AS referenced_table,
       pc.name AS column_name, rc.name AS referenced_column, fkc.constraint_column_id,
       fk.delete_referential_action_desc, fk.update_referential_action_desc,
       fk.is_disabled, fk.is_not_trusted
FROM sys.foreign_keys AS fk
JOIN sys.tables AS pt ON pt.object_id = fk.parent_object_id
JOIN sys.schemas AS ps ON ps.schema_id = pt.schema_id
JOIN sys.tables AS rt ON rt.object_id = fk.referenced_object_id
JOIN sys.schemas AS rs ON rs.schema_id = rt.schema_id
JOIN sys.foreign_key_columns AS fkc ON fkc.constraint_object_id = fk.object_id
JOIN sys.columns AS pc
       ON pc.object_id = fkc.parent_object_id AND pc.column_id = fkc.parent_column_id
JOIN sys.columns AS rc
       ON rc.object_id = fkc.referenced_object_id AND rc.column_id = fkc.referenced_column_id
ORDER BY ps.name, pt.name, fk.name, fkc.constraint_column_id;
"""

INDEXES_QUERY = """
SELECT s.name AS schema_name, t.name AS table_name, i.name AS index_name,
       i.is_unique, i.filter_definition, c.name AS column_name,
       ic.key_ordinal, ic.is_included_column, ic.is_descending_key
FROM sys.indexes AS i
JOIN sys.tables AS t ON t.object_id = i.object_id
JOIN sys.schemas AS s ON s.schema_id = t.schema_id
JOIN sys.index_columns AS ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
JOIN sys.columns AS c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
WHERE t.is_ms_shipped = 0 AND i.type = 2 AND i.is_primary_key = 0
  AND i.is_unique_constraint = 0 AND i.is_hypothetical = 0 AND i.name IS NOT NULL
ORDER BY s.name, t.name, i.name, ic.is_included_column, ic.key_ordinal, ic.index_column_id;
"""


def _fetch_dicts(cursor, query):
    cursor.execute(query)
    names = [column[0].casefold() for column in cursor.description]
    return [dict(zip(names, row)) for row in cursor.fetchall()]


def _table_key(row):
    return row["schema_name"].casefold(), row["table_name"].casefold()


def _group_by_table(rows):
    grouped = defaultdict(list)
    for row in rows:
        grouped[_table_key(row)].append(row)
    return grouped


def _format_type(column):
    type_name = column["type_name"].lower()
    if column["is_user_defined"]:
        return f'{quote_identifier(column["type_schema"])}.{quote_identifier(column["type_name"])}'
    if type_name in ("varchar", "char", "varbinary", "binary", "nvarchar", "nchar"):
        length = column["max_length"]
        if length == -1:
            length = "max"
        elif type_name in ("nvarchar", "nchar"):
            length //= 2
        return f"{type_name}({length})"
    if type_name in ("decimal", "numeric"):
        return f'{type_name}({column["precision"]},{column["scale"]})'
    if type_name in ("datetime2", "datetimeoffset", "time"):
        return f'{type_name}({column["scale"]})'
    if type_name == "float":
        return f'float({column["precision"]})'
    return quote_identifier(column["type_name"])


def _render_column(column):
    name = quote_identifier(column["column_name"])
    if column["computed_definition"]:
        definition = f"{name} AS ({column['computed_definition']})"
        if column["is_persisted"]:
            definition += " PERSISTED"
        return definition

    definition = f"{name} {_format_type(column)}"
    if column["collation_name"]:
        definition += f' COLLATE {column["collation_name"]}'
    if column["is_identity"]:
        definition += (
            f' IDENTITY({column["identity_seed"]},{column["identity_increment"]})'
        )
    if column["is_rowguidcol"]:
        definition += " ROWGUIDCOL"
    if column["is_sparse"]:
        definition += " SPARSE"
    definition += " NULL" if column["is_nullable"] else " NOT NULL"
    if column["default_definition"]:
        definition += f' CONSTRAINT {quote_identifier(column["default_name"])}'
        definition += f' DEFAULT {column["default_definition"]}'
    return definition


def _render_key_constraints(rows):
    grouped = defaultdict(list)
    for row in rows:
        grouped[row["constraint_name"]].append(row)

    statements = []
    for name, members in grouped.items():
        first = members[0]
        kind = "PRIMARY KEY" if first["constraint_type"] == "PK" else "UNIQUE"
        index_type = "CLUSTERED" if first["index_type"] == "CLUSTERED" else "NONCLUSTERED"
        columns = ", ".join(
            quote_identifier(row["column_name"])
            + (" DESC" if row["is_descending_key"] else " ASC")
            for row in sorted(members, key=lambda row: row["key_ordinal"])
        )
        statements.append(
            f'CONSTRAINT {quote_identifier(name)} {kind} {index_type} ({columns})'
        )
    return statements


def _render_checks(rows):
    statements = []
    for row in rows:
        statements.append(
            f'CONSTRAINT {quote_identifier(row["constraint_name"])} '
            f'CHECK {row["definition"]}'
        )
    return statements


def _render_table(table, columns, keys, checks):
    definitions = [_render_column(column) for column in columns]
    definitions.extend(_render_key_constraints(keys))
    definitions.extend(_render_checks(checks))
    body = ",\n    ".join(definitions)
    name = f'{quote_identifier(table["schema_name"])}.{quote_identifier(table["table_name"])}'
    return (
        f"IF OBJECT_ID(N'{name.replace(chr(39), chr(39) * 2)}', N'U') IS NULL\n"
        f"BEGIN\n    CREATE TABLE {name} (\n    {body}\n    );\nEND;"
    )


def _render_foreign_keys(rows):
    grouped = defaultdict(list)
    for row in rows:
        grouped[(row["schema_name"], row["table_name"], row["constraint_name"])].append(row)

    statements = []
    for (_, _, name), members in grouped.items():
        first = members[0]
        source = f'{quote_identifier(first["schema_name"])}.{quote_identifier(first["table_name"])}'
        target = (
            f'{quote_identifier(first["referenced_schema"])}.'
            f'{quote_identifier(first["referenced_table"])}'
        )
        source_columns = ", ".join(
            quote_identifier(row["column_name"])
            for row in sorted(members, key=lambda row: row["constraint_column_id"])
        )
        target_columns = ", ".join(
            quote_identifier(row["referenced_column"])
            for row in sorted(members, key=lambda row: row["constraint_column_id"])
        )
        statement = (
            f"IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys "
            f"WHERE name = N'{name.replace(chr(39), chr(39) * 2)}' "
            f"AND parent_object_id = OBJECT_ID(N'{source.replace(chr(39), chr(39) * 2)}'))\n"
            f"    ALTER TABLE {source} "
            f'{"WITH NOCHECK " if first["is_not_trusted"] else ""}'
            f"ADD CONSTRAINT {quote_identifier(name)} "
            f"FOREIGN KEY ({source_columns}) REFERENCES {target} ({target_columns})"
        )
        delete_action = first["delete_referential_action_desc"]
        update_action = first["update_referential_action_desc"]
        if delete_action != "NO_ACTION":
            statement += f" ON DELETE {delete_action.replace('_', ' ')}"
        if update_action != "NO_ACTION":
            statement += f" ON UPDATE {update_action.replace('_', ' ')}"
        statement += ";"
        if first["is_disabled"]:
            statement += f"\nALTER TABLE {source} NOCHECK CONSTRAINT {quote_identifier(name)};"
        statements.append(statement)
    return statements


def _render_indexes(rows):
    grouped = defaultdict(list)
    for row in rows:
        grouped[(row["schema_name"], row["table_name"], row["index_name"])].append(row)

    statements = []
    for (schema, table, name), members in grouped.items():
        first = members[0]
        key_columns = [
            row for row in members
            if not row["is_included_column"] and row["key_ordinal"] > 0
        ]
        include_columns = [row for row in members if row["is_included_column"]]
        keys = ", ".join(
            quote_identifier(row["column_name"])
            + (" DESC" if row["is_descending_key"] else " ASC")
            for row in sorted(key_columns, key=lambda row: row["key_ordinal"])
        )
        if not keys:
            continue
        table_name = f"{quote_identifier(schema)}.{quote_identifier(table)}"
        unique = "UNIQUE " if first["is_unique"] else ""
        statement = (
            f"IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = "
            f"N'{name.replace(chr(39), chr(39) * 2)}' "
            f"AND object_id = OBJECT_ID(N'{table_name.replace(chr(39), chr(39) * 2)}'))\n"
            f"    CREATE {unique}NONCLUSTERED INDEX {quote_identifier(name)} "
            f"ON {table_name} ({keys})"
        )
        if include_columns:
            includes = ", ".join(quote_identifier(row["column_name"]) for row in include_columns)
            statement += f" INCLUDE ({includes})"
        if first["filter_definition"]:
            statement += f' WHERE {first["filter_definition"]}'
        statement += ";"
        statements.append(statement)
    return statements


def generate_migration(cursor, source_script_text, database_name="IELTS"):
    base_tables = table_names_in_script(source_script_text)
    tables = _fetch_dicts(cursor, TABLES_QUERY)
    new_tables = [
        table for table in tables
        if _table_key(table) not in base_tables
    ]
    if not new_tables:
        return ""

    table_lookup = {_table_key(table): table for table in new_tables}
    columns = _group_by_table(_fetch_dicts(cursor, COLUMNS_QUERY))
    keys = _group_by_table(_fetch_dicts(cursor, KEYS_QUERY))
    checks = _group_by_table(_fetch_dicts(cursor, CHECKS_QUERY))
    foreign_keys = _group_by_table(_fetch_dicts(cursor, FOREIGN_KEYS_QUERY))
    indexes = _group_by_table(_fetch_dicts(cursor, INDEXES_QUERY))

    table_statements = []
    for key, table in table_lookup.items():
        table_statements.append(
            _render_table(
                table,
                columns.get(key, []),
                keys.get(key, []),
                checks.get(key, []),
            )
        )

    statements = [
        "-- Generated from the live database; only tables absent from the base schema are included.",
        f"USE {quote_identifier(database_name)};",
        "GO",
        "SET ANSI_NULLS ON;",
        "SET QUOTED_IDENTIFIER ON;",
        "GO",
        *table_statements,
        "GO",
    ]
    for table in new_tables:
        key = _table_key(table)
        table_name = (
            f'{quote_identifier(table["schema_name"])}.'
            f'{quote_identifier(table["table_name"])}'
        )
        for check in checks.get(key, []):
            if check["is_disabled"]:
                statements.append(
                    f'ALTER TABLE {table_name} NOCHECK CONSTRAINT '
                    f'{quote_identifier(check["constraint_name"])};'
                )
            elif check["is_not_trusted"]:
                statements.append(
                    f'ALTER TABLE {table_name} WITH NOCHECK CHECK CONSTRAINT '
                    f'{quote_identifier(check["constraint_name"])};'
                )
    for table in new_tables:
        key = _table_key(table)
        statements.extend(_render_foreign_keys(foreign_keys.get(key, [])))
        statements.extend(_render_indexes(indexes.get(key, [])))
    statements.append("GO")
    return "\n\n".join(statements) + "\n"


def split_generated_section(script_text):
    start_count = script_text.count(GENERATED_START)
    end_count = script_text.count(GENERATED_END)
    if start_count == 0 and end_count == 0:
        return script_text, ""
    if start_count != 1 or end_count != 1:
        raise RuntimeError("The auto-generated SQL section markers are missing or duplicated.")

    match = GENERATED_BLOCK_PATTERN.search(script_text)
    if match is None:
        raise RuntimeError("The auto-generated SQL section markers are out of order.")
    base_script = script_text[:match.start()] + script_text[match.end():]
    return base_script, match.group(0)


def merge_generated_section(script_text, migration):
    base_script, _ = split_generated_section(script_text)
    if not migration:
        return base_script

    newline = "\r\n" if "\r\n" in base_script else "\n"
    prefix = base_script.rstrip("\r\n")
    if prefix:
        prefix += newline * 2
    migration_text = migration.rstrip("\r\n").replace("\n", newline)
    block = (
        f"{GENERATED_START}{newline}"
        f"{migration_text}{newline}"
        f"{GENERATED_END}{newline}"
    )
    return prefix + block


def _read_sql_file(path):
    data = path.read_bytes()
    encoding = "utf-16" if data.startswith((b"\xff\xfe", b"\xfe\xff")) else "utf-8-sig"
    return data.decode(encoding)


def _write_sql_file(path, script_text, original_bytes):
    if original_bytes.startswith(b"\xff\xfe"):
        encoded = b"\xff\xfe" + script_text.encode("utf-16-le")
    elif original_bytes.startswith(b"\xfe\xff"):
        encoded = b"\xfe\xff" + script_text.encode("utf-16-be")
    elif original_bytes.startswith(b"\xef\xbb\xbf"):
        encoded = b"\xef\xbb\xbf" + script_text.encode("utf-8")
    else:
        encoded = script_text.encode("utf-8")
    path.write_bytes(encoded)


def main(argv=None):
    parser = argparse.ArgumentParser(
        description="Update the auto-generated table section in sqlScripts.sql."
    )
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE, help="Base SQL schema file.")
    parser.add_argument(
        "--output",
        type=Path,
        help="Write a standalone migration here instead of updating the source schema.",
    )
    args = parser.parse_args(argv)

    if not args.source.is_file():
        parser.error(f"Base schema file not found: {args.source}")

    try:
        import pyodbc
    except ImportError:
        print(
            "Schema sync failed: pyodbc is not installed. "
            "Install project dependencies with: python -m pip install -r requirements.txt",
            file=sys.stderr,
        )
        return 1

    try:
        connection_string = _connection_string_from_environment_or_config()
        odbc_connection_string = build_odbc_connection_string(
            connection_string,
            pyodbc.drivers(),
        )
        original_bytes = args.source.read_bytes()
        source_script = _read_sql_file(args.source)
        base_script, _ = split_generated_section(source_script)
        connection = pyodbc.connect(odbc_connection_string)
        try:
            cursor = connection.cursor()
            try:
                database_name = cursor.execute("SELECT DB_NAME()").fetchone()[0]
                migration = generate_migration(cursor, base_script, database_name)
            finally:
                cursor.close()
        finally:
            connection.close()

        update_source = args.output is None or args.output.resolve() == args.source.resolve()
        if update_source:
            updated_script = merge_generated_section(source_script, migration)
            _write_sql_file(args.source, updated_script, original_bytes)
            destination = args.source
        else:
            args.output.parent.mkdir(parents=True, exist_ok=True)
            args.output.write_text(migration, encoding="utf-8", newline="\n")
            destination = args.output
    except (OSError, UnicodeError, configparser.Error, RuntimeError, pyodbc.Error) as exc:
        print(f"Schema sync failed: {exc}", file=sys.stderr)
        return 1

    if migration:
        print(f"Updated SQL schema: {destination}")
    else:
        print(f"No new tables found; auto-generated section removed or unchanged in {destination}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
