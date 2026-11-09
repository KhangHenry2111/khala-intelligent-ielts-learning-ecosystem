import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import Mock, patch

from main import IeltsAppLauncher


class LauncherTests(unittest.TestCase):
    def test_start_ai_quiz_service_uses_project_directory(self):
        launcher = IeltsAppLauncher()
        with patch('builtins.print'), patch('main.subprocess.run') as mock_run:
            mock_run.return_value.returncode = 0
            launcher.start_ai_quiz_service()

        expected_prefix = [str(launcher.python_exe), '-m', 'uvicorn', 'AI_quiz.quiz_api:app']
        service_call = next(
            call for call in mock_run.call_args_list
            if call.args[0][:4] == expected_prefix
        )
        self.assertEqual(service_call.kwargs['cwd'], str(launcher.base_dir))

    def test_schema_initialization_targets_master(self):
        launcher = IeltsAppLauncher()
        with patch('builtins.input', return_value='2'), patch('builtins.print'), patch.object(
            launcher, 'run_sql_script'
        ) as run_sql_script:
            launcher.run_sql_init()

        self.assertEqual(run_sql_script.call_args.kwargs['database'], 'master')

    def test_schema_initialization_skips_existing_database(self):
        launcher = IeltsAppLauncher()
        with patch('builtins.input', return_value='yes'), patch('builtins.print'), \
                patch.object(launcher, '_database_exists', return_value=True) as database_exists, \
                patch('main.subprocess.run') as run:
            launcher.run_sql_script('SqlScripts.sql', 'Create Database Schema', database='master')

        database_exists.assert_called_once_with('Ielts')
        run.assert_not_called()

    def test_sql_script_uses_pyodbc_when_sqlcmd_is_missing(self):
        with TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            script = root / 'schema.sql'
            script.write_text('CREATE DATABASE IELTS;\nGO\nUSE IELTS;\nGO\n', encoding='utf-16')
            (root / 'config.cfg').write_text(
                '[sqlserver]\nconnection_string = Data Source=(localdb)\\\\MSSQLLocalDB;'
                'Initial Catalog=IELTS;Integrated Security=True;Encrypt=False\n',
                encoding='utf-8',
            )
            launcher = IeltsAppLauncher()
            launcher.base_dir = root
            cursor = Mock()
            connection = Mock()
            connection.cursor.return_value = cursor
            odbc = Mock()
            odbc.drivers.return_value = ['ODBC Driver 17 for SQL Server']
            odbc.connect.return_value = connection

            with patch('builtins.input', return_value='yes'), patch('builtins.print'), \
                    patch('main.shutil.which', return_value=None), patch('main.pyodbc', odbc):
                launcher.run_sql_script('schema.sql', 'Create Database Schema', database='master')

        odbc.connect.assert_called_once()
        self.assertIn('DATABASE={master}', odbc.connect.call_args.args[0])
        self.assertTrue(odbc.connect.call_args.kwargs['autocommit'])
        self.assertEqual(
            [call.args[0] for call in cursor.execute.call_args_list],
            ['CREATE DATABASE IELTS;', 'USE IELTS;'],
        )
        connection.close.assert_called_once()


if __name__ == '__main__':
    unittest.main()
