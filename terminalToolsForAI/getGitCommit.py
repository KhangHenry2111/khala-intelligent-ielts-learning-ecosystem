import argparse
import os
import subprocess
import sys

# File history nằm ở thư mục cha của thư mục chứa script, chạy từ đâu cũng đúng
DEFAULT_HISTORY_FILE = os.path.normpath(
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "sessionHistory.md")
)


def git(where, *args):
  try:
    r = subprocess.run(
        ["git", *args], cwd=where, capture_output=True, text=True, encoding="utf-8"
    )
  except FileNotFoundError:
    sys.exit("Loi: khong tim thay lenh git")
  if r.returncode != 0:
    sys.exit(f"Loi git ({' '.join(args)}): {r.stderr.strip()}")
  return r.stdout


def main():
  parser = argparse.ArgumentParser(
      description=(
          "In danh sách file đã đổi trong git so với REF (gồm file mới chưa track và file đã xóa), "
          "mỗi file một dòng, đường dẫn tính từ gốc repo."
      )
  )
  parser.add_argument(
      "ref",
      nargs="?",
      default="HEAD",
      help="So sánh với REF (mặc định: HEAD). Nếu đã commit, dùng vd: HEAD~1",
  )
  parser.add_argument(
      "--file",
      default=DEFAULT_HISTORY_FILE,
      help=f"File lịch sử: dùng để xác định repo và loại khỏi danh sách (mặc định: {DEFAULT_HISTORY_FILE})",
  )
  args = parser.parse_args()

  try:
    sys.stdout.reconfigure(encoding="utf-8")
  except (AttributeError, OSError):
    pass

  start = os.path.dirname(os.path.abspath(args.file))
  cwd = start if os.path.isdir(start) else os.getcwd()

  top = git(cwd, "rev-parse", "--show-toplevel").strip()
  changed = git(top, "diff", "--name-only", "-z", args.ref, "--").split("\0")
  untracked = git(top, "ls-files", "--others", "--exclude-standard", "-z").split("\0")

  # Bỏ chính file history ra khỏi danh sách
  try:
    history_rel = os.path.relpath(os.path.abspath(args.file), top).replace("\\", "/").lower()
  except ValueError:  # khác ổ đĩa trên Windows
    history_rel = None

  files = [p for p in dict.fromkeys(changed + untracked) if p and p.lower() != history_rel]

  if not files:
    print(f"Khong co file nao thay doi so voi {args.ref}", file=sys.stderr)
    return
  print("\n".join(files))


if __name__ == "__main__":
  main()