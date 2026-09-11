import unittest
from pathlib import Path
from unittest.mock import patch

from main import IeltsAppLauncher


class LauncherTests(unittest.TestCase):
    def test_start_ai_quiz_service_uses_project_directory(self):
        launcher = IeltsAppLauncher()
        with patch('main.subprocess.run') as mock_run:
            launcher.start_ai_quiz_service()

        self.assertEqual(mock_run.call_count, 1)
        cmd = mock_run.call_args.args[0]
        self.assertEqual(cmd[:4], [str(launcher.python_exe), '-m', 'uvicorn', 'AI_quiz.quiz_api:app'])
        self.assertEqual(mock_run.call_args.kwargs['cwd'], str(launcher.base_dir))


if __name__ == '__main__':
    unittest.main()
