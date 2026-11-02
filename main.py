#!/usr/bin/env python3
"""
IELTS Study Assistant - Main Application Launcher
Uses subprocess to manage and run various components
"""

import os
import socket
import subprocess
import sys
from pathlib import Path


class IeltsAppLauncher:
    """Main application launcher for IELTS components."""

    def __init__(self):
        self.base_dir = Path(__file__).resolve().parent
        self.auth_portal_dir = self.base_dir / "auth-portal"
        self.service_processes = []

        # Vì venv đã được import sẵn, dùng interpreter đang chạy app này.
        self.python_exe = sys.executable
        # venv_python exposes the current interpreter as a Path object (test contract)
        self.venv_python = Path(sys.executable)


    def print_banner(self):
        """Print application banner."""
        print("\n" + "=" * 80)
        print("╔" + "=" * 78 + "╗")
        print("║" + " " * 78 + "║")
        print("║" + "IELTS STUDY ASSISTANT - MAIN LAUNCHER".center(78) + "║")
        print("║" + " " * 78 + "║")
        print("╚" + "=" * 78 + "╝")
        print("=" * 80 + "\n")

    def print_menu(self):
        """Display main menu."""
        print("\n┌─ MAIN MENU ────────────────────────────────────────────────────────────────┐")
        print("│                                                                            │")
        print("│  1. Test Database Connection (Python)                                     │")
        print("│  2. Query Database (C# - DatabaseConnector)                               │")
        print("│  3. Start Auth Portal (ASP.NET Core)                                      │")
        print("│  4. Start AI Quiz API (FastAPI on :8000)                                  │")
        print("│  5. Run SQL Initialization Script                                         │")
        print("│  6. View Config Settings                                                  │")
        print("│  7. Run Python Tests                                                      │")
        print("│  8. Start All Microservices (Auth + AI Quiz)                              │")
        print("│  9. Exit                                                                  │")
        print("│                                                                            │")
        print("└────────────────────────────────────────────────────────────────────────────┘")

    def test_connection(self):
        """Run database connection test."""
        print("\n[*] Running Database Connection Test...\n")
        script = self.base_dir / "test_connection.py"

        if not script.exists():
            print(f"✗ Script not found: {script}")
            return

        try:
            result = subprocess.run(
                [self.python_exe, str(script)],
                cwd=str(self.base_dir),
                capture_output=False,
            )
            if result.returncode == 0:
                print("\n✓ Connection test completed successfully")
            else:
                print(f"\n✗ Connection test failed with exit code: {result.returncode}")
        except Exception as e:
            print(f"✗ Error running connection test: {e}")

    def query_database(self):
        """Run database query tool."""
        print("\n[*] Running Database Query Tool...\n")

        if not (self.base_dir / "DatabaseConnector.cs").exists():
            print("✗ DatabaseConnector.cs not found")
            print("First, compile DatabaseConnector.cs:")
            print(f"  cd {self.base_dir}")
            print("  csc -r:System.Data.SqlClient.dll DatabaseConnector.cs")
            return

        exe_path = self.base_dir / "DatabaseConnector.exe"
        if not exe_path.exists():
            print("\n[*] Compiling DatabaseConnector.cs...")
            try:
                compile_result = subprocess.run(
                    ["csc", "-r:System.Data.SqlClient.dll", "DatabaseConnector.cs"],
                    cwd=str(self.base_dir),
                    capture_output=True,
                    text=True,
                )
                if compile_result.returncode != 0:
                    print(f"✗ Compilation failed:\n{compile_result.stderr}")
                    return
                print("✓ Compilation successful\n")
            except Exception as e:
                print(f"✗ Error compiling: {e}")
                print("Make sure C# compiler (csc.exe) is installed and in PATH")
                return

        try:
            result = subprocess.run(
                [str(exe_path)],
                cwd=str(self.base_dir),
                capture_output=False,
            )
            print(f"\n✓ Query tool exited with code: {result.returncode}")
        except Exception as e:
            print(f"✗ Error running query tool: {e}")

    def is_port_in_use(self, port):
        """Return True when a local TCP port is already bound."""
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                sock.bind(("127.0.0.1", port))
                return False
            except OSError:
                return True

    def get_available_port(self, start_port=8001, max_tries=20):
        """Find the first free port after the legacy 8000 port."""
        for port in range(start_port, start_port + max_tries):
            if not self.is_port_in_use(port):
                return port
        return start_port + max_tries - 1

    def cleanup_stale_ai_quiz_processes(self):
        """Stop stale uvicorn/AI_quiz instances left behind by previous failed starts."""
        try:
            result = subprocess.run(
                [
                    "powershell",
                    "-NoProfile",
                    "-Command",
                    "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'uvicorn|AI_quiz.quiz_api:app' } | Select-Object -ExpandProperty ProcessId",
                ],
                capture_output=True,
                text=True,
                check=False,
            )
            pids = [int(pid.strip()) for pid in result.stdout.splitlines() if pid.strip().isdigit()]
            for pid in sorted(set(pids)):
                try:
                    subprocess.run(["taskkill", "/PID", str(pid), "/F"], capture_output=True, check=False)
                except Exception:
                    pass
        except Exception:
            pass

    def start_ai_quiz_service(self):
        """Start the FastAPI AI quiz service on a free fallback port when 8000 is occupied."""
        print("\n[*] Starting AI Quiz API service...\n")
        self.cleanup_stale_ai_quiz_processes()

        if not (self.base_dir / "AI_quiz" / "quiz_api.py").exists():
            print(f"✗ Quiz API not found: {self.base_dir / 'AI_quiz' / 'quiz_api.py'}")
            return

        port = 8000 if not self.is_port_in_use(8000) else self.get_available_port()
        if port == 8000 and self.is_port_in_use(8000):
            print("⚠ Port 8000 is in use; switching to a free fallback port.")

        if port != 8000 and self.is_port_in_use(port):
            port = self.get_available_port()

        if self.is_port_in_use(port):
            print(f"✗ Unable to allocate a free AI Quiz API port. Last tried: {port}")
            return

        print(f"Starting FastAPI application on http://localhost:{port}")
        print(f"API will be available at: http://localhost:{port}")
        print("\nPress Ctrl+C to stop the server\n")

        try:
            result = subprocess.run(
                [
                    self.python_exe,
                    "-m",
                    "uvicorn",
                    "AI_quiz.quiz_api:app",
                    "--host",
                    "0.0.0.0",
                    "--port",
                    str(port),
                ],
                cwd=str(self.base_dir),
                capture_output=False,
            )
            print(f"\n✓ AI Quiz service stopped with exit code: {result.returncode}")
        except KeyboardInterrupt:
            print("\n\n[*] AI Quiz service stopped by user")
        except Exception as e:
            print(f"✗ Error starting AI Quiz service: {e}")

    def start_auth_portal(self):
        """Start ASP.NET Core Auth Portal."""
        print("\n[*] Starting Auth Portal...\n")

        if not self.auth_portal_dir.exists():
            print(f"✗ Auth portal directory not found: {self.auth_portal_dir}")
            return

        if self.is_port_in_use(5000):
            print("✓ Auth Portal already running on http://localhost:5000")
            return

        print("Starting ASP.NET Core application...")
        print("Open browser to: http://localhost:5000")
        print("\nPress Ctrl+C to stop the server\n")

        try:
            result = subprocess.run(
                ["dotnet", "run"],
                cwd=str(self.auth_portal_dir),
                capture_output=False,
            )
            print(f"\n✓ Auth portal stopped with exit code: {result.returncode}")
        except FileNotFoundError:
            print("✗ dotnet not found. Make sure .NET Core is installed")
        except KeyboardInterrupt:
            print("\n\n[*] Auth portal stopped by user")
        except Exception as e:
            print(f"✗ Error starting auth portal: {e}")

    def start_all_services(self):
        """Start both Auth Portal and AI Quiz API in one command using a free fallback port."""
        print("\n[*] Starting all microservices...\n")
        self.cleanup_stale_ai_quiz_processes()

        checks = []
        if not self.auth_portal_dir.exists():
            checks.append(f"✗ Auth portal directory not found: {self.auth_portal_dir}")
        if not (self.base_dir / "AI_quiz" / "quiz_api.py").exists():
            checks.append(f"✗ Quiz API not found: {self.base_dir / 'AI_quiz' / 'quiz_api.py'}")

        if checks:
            for message in checks:
                print(message)
            return

        started = []
        ai_port = 8000 if not self.is_port_in_use(8000) else self.get_available_port()

        if not self.is_port_in_use(5000):
            try:
                auth_proc = subprocess.Popen(
                    ["dotnet", "run"],
                    cwd=str(self.auth_portal_dir),
                    stdout=None,
                    stderr=None,
                    stdin=None,
                )
                started.append(("Auth Portal", auth_proc, "http://localhost:5000"))
                print(f"✓ Started Auth Portal (PID: {auth_proc.pid}) -> http://localhost:5000")
            except Exception as e:
                print(f"✗ Failed to start Auth Portal: {e}")
        else:
            print("✓ Auth Portal already running on http://localhost:5000")

        if not self.is_port_in_use(ai_port):
            try:
                ai_proc = subprocess.Popen(
                    [
                        self.python_exe,
                        "-m",
                        "uvicorn",
                        "AI_quiz.quiz_api:app",
                        "--host",
                        "0.0.0.0",
                        "--port",
                        str(ai_port),
                    ],
                    cwd=str(self.base_dir),
                    stdout=None,
                    stderr=None,
                    stdin=None,
                )
                started.append(("AI Quiz API", ai_proc, f"http://localhost:{ai_port}"))
                print(f"✓ Started AI Quiz API (PID: {ai_proc.pid}) -> http://localhost:{ai_port}")
            except Exception as e:
                print(f"✗ Failed to start AI Quiz API: {e}")
        else:
            print(f"✓ AI Quiz API already running on http://localhost:{ai_port}")

        self.service_processes.extend(proc for _, proc, _ in started)

        print("\nAll services started in the background.")
        print("Open browser to: http://localhost:5000")
        print(f"AI Quiz API health check: http://localhost:{ai_port}/api/quiz/health")
        print("\nUse Ctrl+C in this launcher to stop the app shell, or close the terminal to stop child processes.\n")

    def run_sql_init(self):
        """Run SQL initialization script."""
        print("\n[*] SQL Initialization\n")
        print("Options:")
        print("  1. Run InitUsers.sql (Insert test data)")
        print("  2. Run SqlScripts.sql (Create database schema)")
        print("  3. Exit")

        choice = input("\nSelect option (1-3): ").strip()

        if choice == "1":
            self.run_sql_script("auth-portal/Sql/InitUsers.sql", "Initialize Users")
        elif choice == "2":
            self.run_sql_script("SqlScripts.sql", "Create Database Schema")
        elif choice != "3":
            print("Invalid option")

    def run_sql_script(self, script_name, description):
        """Run a SQL script using sqlcmd."""
        script_path = self.base_dir / script_name

        if not script_path.exists():
            print(f"✗ Script not found: {script_path}")
            return

        print(f"\n[*] Running: {description}\n")
        print("This will execute SQL commands against your database.")
        print(f"Script: {script_path}")
        confirm = input("\nContinue? (yes/no): ").strip().lower()

        if confirm != "yes":
            print("Cancelled.")
            return

        try:
            result = subprocess.run(
                [
                    "sqlcmd",
                    "-S",
                    "(localdb)\\MSSQLLocalDB",
                    "-d",
                    "IELTS",
                    "-i",
                    str(script_path),
                ],
                capture_output=False,
            )
            if result.returncode == 0:
                print("\n✓ Script executed successfully")
            else:
                print(f"\n✗ Script failed with exit code: {result.returncode}")
        except FileNotFoundError:
            print("✗ sqlcmd not found. Install SQL Server Management Studio or SQL Server Express")
        except Exception as e:
            print(f"✗ Error running script: {e}")

    def view_config(self):
        """Display configuration settings."""
        print("\n┌─ CONFIGURATION SETTINGS ───────────────────────────────────────────────────┐")

        config_file = self.base_dir / "config.cfg"
        if config_file.exists():
            print("│ From: config.cfg                                                          │")
            print("└─────────────────────────────────────────────────────────────────────────────┘\n")
            with open(config_file, "r", encoding="utf-8") as f:
                for line in f:
                    if line.strip() and not line.strip().startswith(";"):
                        print(f"  {line.rstrip()}")
        else:
            print("✗ config.cfg not found")

        print("\n┌─ ENVIRONMENT ──────────────────────────────────────────────────────────────┐")
        print(f"│ Python Executable: {self.python_exe}")
        print(f"│ Base Directory:    {self.base_dir}")
        print(f"│ Auth Portal:       {self.auth_portal_dir}")
        print(f"│ Current Directory: {os.getcwd()}")
        print("└────────────────────────────────────────────────────────────────────────────┘\n")

    def run_python_tests(self):
        """Run Python tests."""
        print("\n[*] Running Python Tests...\n")

        tests_dir = self.base_dir / "tests"
        if not tests_dir.exists():
            print(f"✗ Tests directory not found: {tests_dir}")
            return

        print("Available tests:")
        test_files = list(tests_dir.glob("test_*.py"))

        if not test_files:
            print("✗ No test files found")
            return

        for i, test_file in enumerate(test_files, 1):
            print(f"  {i}. {test_file.name}")

        print(f"  {len(test_files) + 1}. Run all tests")
        print(f"  {len(test_files) + 2}. Exit")

        choice = input(f"\nSelect test (1-{len(test_files) + 2}): ").strip()

        try:
            choice_num = int(choice)
            if 1 <= choice_num <= len(test_files):
                self.run_single_test(test_files[choice_num - 1])
            elif choice_num == len(test_files) + 1:
                self.run_all_tests(test_files)
            elif choice_num == len(test_files) + 2:
                return
            else:
                print("Invalid choice")
        except ValueError:
            print("Invalid input")

    def run_single_test(self, test_file):
        """Run a single test file."""
        print(f"\n[*] Running: {test_file.name}\n")
        try:
            result = subprocess.run(
                [self.python_exe, str(test_file)],
                cwd=str(self.base_dir),
                capture_output=False,
            )
            print(f"\n✓ Test completed with exit code: {result.returncode}")
        except Exception as e:
            print(f"✗ Error running test: {e}")

    def run_all_tests(self, test_files):
        """Run all test files."""
        print(f"\n[*] Running {len(test_files)} tests...\n")
        for test_file in test_files:
            print(f"\n{'='*70}")
            print(f"Running: {test_file.name}")
            print("=" * 70)
            try:
                result = subprocess.run(
                    [self.python_exe, str(test_file)],
                    cwd=str(self.base_dir),
                    capture_output=False,
                )
                status = "✓ PASSED" if result.returncode == 0 else "✗ FAILED"
                print(f"\n{status}\n")
            except Exception as e:
                print(f"✗ Error running test: {e}\n")

    def run(self):
        """Main application loop."""
        self.print_banner()

        while True:
            self.print_menu()
            choice = input("Select option (1-9): ").strip()

            if choice == "1":
                self.test_connection()
            elif choice == "2":
                self.query_database()
            elif choice == "3":
                self.start_auth_portal()
            elif choice == "4":
                self.start_ai_quiz_service()
            elif choice == "5":
                self.run_sql_init()
            elif choice == "6":
                self.view_config()
            elif choice == "7":
                self.run_python_tests()
            elif choice == "8":
                self.start_all_services()
            elif choice == "9":
                print("\n[*] Exiting IELTS Study Assistant")
                print("Goodbye!\n")
                break
            else:
                print("✗ Invalid option. Please try again.")

            input("\nPress Enter to continue...")


def main():
    """Entry point."""
    try:
        launcher = IeltsAppLauncher()
        launcher.run()
    except KeyboardInterrupt:
        print("\n\n[*] Application interrupted by user")
        sys.exit(0)
    except Exception as e:
        print(f"\n✗ Fatal error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main() 
 