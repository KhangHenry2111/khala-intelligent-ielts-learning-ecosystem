import argparse
import os
import re
import sys

# File history nằm ở thư mục cha của thư mục chứa script, chạy từ đâu cũng đúng
DEFAULT_HISTORY_FILE = os.path.normpath(
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "sessionHistory.md")
)

BLOCK_RE = re.compile(r"^\[Id\s+(\d+)\]:[ \t]*$", re.MULTILINE)
TIME_RE = re.compile(r"^\[Time[^\]]*\]:[ \t]*(.*)$", re.MULTILINE)  # nhận cả [Time] lẫn [Time (Vietnam)]
TITLE_RE = re.compile(r"^\[Title\]:[ \t]*(.*)$", re.MULTILINE)


def parse_files(body):
  """Lấy danh sách file trong mục [Changed_File(s)] của một block."""
  files, in_files = [], False
  for line in body.splitlines():
    if line.startswith(("[Changed_File]", "[Changed_Files]")):
      in_files = True
    elif in_files:
      if line.startswith("- "):
        files.append(line[2:].strip())
      else:  # gặp [Description] hoặc dòng khác thì dừng
        break
  return files


def main():
  parser = argparse.ArgumentParser(
      description="Liệt kê top k block mới nhất toàn file, mỗi block một dòng: Id, time, title."
  )
  parser.add_argument(
      "-k",
      "--top",
      type=int,
      default=5,
      help="Số block mới nhất cần lấy (mặc định: 5)",
  )
  parser.add_argument(
      "--file",
      default=DEFAULT_HISTORY_FILE,
      help=f"Đường dẫn file lịch sử (mặc định: {DEFAULT_HISTORY_FILE})",
  )
  args = parser.parse_args()

  if args.top < 1:
    parser.error("-k phải >= 1")

  try:
    sys.stdout.reconfigure(encoding="utf-8")
  except (AttributeError, OSError):
    pass

  if not os.path.exists(args.file):
    sys.exit(f"Khong tim thay file lich su: {args.file}")

  with open(args.file, "r", encoding="utf-8") as f:
    content = f.read()

  matches = list(BLOCK_RE.finditer(content))
  if not matches:
    print("Lich su trong")
    sys.exit(1)

  rows = []  # (id, time, title, files)
  for i, m in enumerate(matches):
    end = matches[i + 1].start() if i + 1 < len(matches) else len(content)
    body = content[m.end():end]
    t = TIME_RE.search(body)
    ti = TITLE_RE.search(body)
    rows.append((
        int(m.group(1)),
        t.group(1).strip() if t else "",
        ti.group(1).strip() if ti else "",
        parse_files(body),
    ))

  rows.sort(key=lambda r: r[0], reverse=True)  # mới nhất trước

  outputs = []
  for block_id, time, title, files in rows[: args.top]:
    lines = [f"[Id {block_id}] {time} | {title}"]
    if files:
      lines.append("Changed_Files:")
      lines.extend(f"- {p}" for p in files)
    outputs.append("\n".join(lines))
  print("\n\n".join(outputs))


if __name__ == "__main__":
  main()