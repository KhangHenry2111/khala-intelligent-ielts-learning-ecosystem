#!/usr/bin/env python3
"""
IELTS Study Assistant - Main Application Launcher
Uses subprocess to manage and run various components
"""

import subprocess
import sys
import os
import time
from pathlib import Path

class IeltsAppLauncher:
    """Main application launcher for IELTS components"""
    
    def __init__(self):
        self.base_dir = Path(__file__).parent
        self.auth_portal_dir = self.base_dir / "auth-portal"
        self.venv_python = self.base_dir / "venv" / "Scripts" / "python.exe"
        self.system_python = sys.executable
        
        # Use venv python if available, otherwise use system python
        self.python_exe = str(self.venv_python) if self.venv_python.exists() else sys.executable
    
    def print_banner(self):
        """Print application banner"""
        print("\n" + "=" * 80)
        print("╔" + "=" * 78 + "╗")
        print("║" + " " * 78 + "║")
        print("║" + "IELTS STUDY ASSISTANT - MAIN LAUNCHER".center(78) + "║")
        print("║" + " " * 78 + "║")
        print("╚" + "=" * 78 + "╝")
        print("=" * 80 + "\n")
    
    def print_menu(self):
        """Display main menu"""
        print("\n┌─ MAIN MENU ────────────────────────────────────────────────────────────────┐")
        print("│                                                                            │")
        print("│  1. Test Database Connection (Python)                                     │")
        print("│  2. Query Database (C# - DatabaseConnector)                               │")
        print("│  3. Start Auth Portal (ASP.NET Core)                                      │")
        print("│  4. Run SQL Initialization Script                                         │")
        print("│  5. View Config Settings                                                  │")
        print("│  6. Run Python Tests                                                      │")
        print("│  7. Exit                                                                  │")
        print("│                                                                            │")
        print("└────────────────────────────────────────────────────────────────────────────┘")
    
    def test_connection(self):
        """Run database connection test"""
        print("\n[*] Running Database Connection Test...\n")
        script = self.base_dir / "test_connection.py"
        
        if not script.exists():
            print(f"✗ Script not found: {script}")
            return
        
        try:
            result = subprocess.run(
                [self.python_exe, str(script)],
                cwd=str(self.base_dir),
                capture_output=False
            )
            if result.returncode == 0:
                print("\n✓ Connection test completed successfully")
            else:
                print(f"\n✗ Connection test failed with exit code: {result.returncode}")
        except Exception as e:
            print(f"✗ Error running connection test: {e}")
    
    def query_database(self):
        """Run database query tool"""
        print("\n[*] Running Database Query Tool...\n")
        
        if not (self.base_dir / "DatabaseConnector.cs").exists():
            print("✗ DatabaseConnector.cs not found")
            print("First, compile DatabaseConnector.cs:")
            print(f"  cd {self.base_dir}")
            print("  csc -r:System.Data.SqlClient.dll DatabaseConnector.cs")
            return
        
        exe_path = self.base_dir / "DatabaseConnector.exe"
        if not exe_path.exists():
            print("\n[*] Compiling DataadbaseConnector.cs...")
            try:
                compile_result = subprocess.run(
                    ["csc", "-r:System.Data.SqlClient.dll", "DatabaseConnector.cs"],
                    cwd=str(self.base_dir),
                    capture_output=True,
                    text=True
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
                capture_output=False
            )
            print(f"\n✓ Query tool exited with code: {result.returncode}")
        except Exception as e:
            print(f"✗ Error running query tool: {e}")
    
    def start_auth_portal(self):
        """Start ASP.NET Core Auth Portal"""
        print("\n[*] Starting Auth Portal...\n")
        
        if not self.auth_portal_dir.exists():
            print(f"✗ Auth portal directory not found: {self.auth_portal_dir}")
            return
        
        print("Starting ASP.NET Core application...")
        print("Open browser to: http://localhost:5000")
        print("\nPress Ctrl+C to stop the server\n")
        
        try:
            result = subprocess.run(
                ["dotnet", "run"],
                cwd=str(self.auth_portal_dir),
                capture_output=False
            )
            print(f"\n✓ Auth portal stopped with exit code: {result.returncode}")
        except FileNotFoundError:
            print("✗ dotnet not found. Make sure .NET Core is installed")
        except KeyboardInterrupt:
            print("\n\n[*] Auth portal stopped by user")
        except Exception as e:
            print(f"✗ Error starting auth portal: {e}")
    
    def run_sql_init(self):
        """Run SQL initialization script"""
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
        """Run a SQL script using sqlcmd"""
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
            # Use sqlcmd to run the script
            result = subprocess.run(
                [
                    "sqlcmd",
                    "-S", "(localdb)\\MSSQLLocalDB",
                    "-d", "IELTS",
                    "-i", str(script_path)
                ],
                capture_output=False
            )
            if result.returncode == 0:
                print(f"\n✓ Script executed successfully")
            else:
                print(f"\n✗ Script failed with exit code: {result.returncode}")
        except FileNotFoundError:
            print("✗ sqlcmd not found. Install SQL Server Management Studio or SQL Server Express")
        except Exception as e:
            print(f"✗ Error running script: {e}")
    
    def view_config(self):
        """Display configuration settings"""
        print("\n┌─ CONFIGURATION SETTINGS ───────────────────────────────────────────────────┐")
        
        config_file = self.base_dir / "config.cfg"
        if config_file.exists():
            print("│ From: config.cfg                                                          │")
            print("└─────────────────────────────────────────────────────────────────────────────┘\n")
            with open(config_file, 'r', encoding='utf-8') as f:
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
        """Run Python tests"""
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
        """Run a single test file"""
        print(f"\n[*] Running: {test_file.name}\n")
        try:
            result = subprocess.run(
                [self.python_exe, str(test_file)],
                cwd=str(self.base_dir),
                capture_output=False
            )
            print(f"\n✓ Test completed with exit code: {result.returncode}")
        except Exception as e:
            print(f"✗ Error running test: {e}")
    
    def run_all_tests(self, test_files):
        """Run all test files"""
        print(f"\n[*] Running {len(test_files)} tests...\n")
        for test_file in test_files:
            print(f"\n{'='*70}")
            print(f"Running: {test_file.name}")
            print('='*70)
            try:
                result = subprocess.run(
                    [self.python_exe, str(test_file)],
                    cwd=str(self.base_dir),
                    capture_output=False
                )
                status = "✓ PASSED" if result.returncode == 0 else "✗ FAILED"
                print(f"\n{status}\n")
            except Exception as e:
                print(f"✗ Error running test: {e}\n")
    
    def run(self):
        """Main application loop"""
        self.print_banner()
        
        while True:
            self.print_menu()
            choice = input("Select option (1-7): ").strip()
            
            if choice == "1":
                self.test_connection()
            elif choice == "2":
                self.query_database()
            elif choice == "3":
                self.start_auth_portal()
            elif choice == "4":
                self.run_sql_init()
            elif choice == "5":
                self.view_config()
            elif choice == "6":
                self.run_python_tests()
            elif choice == "7":
                print("\n[*] Exiting IELTS Study Assistant")
                print("Goodbye!\n")
                break
            else:
                print("✗ Invalid option. Please try again.")
            
            input("\nPress Enter to continue...")


def main():
    """Entry point"""
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
