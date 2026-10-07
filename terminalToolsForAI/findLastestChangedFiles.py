import argparse
import os
import re
import sys

# File history nằm ở thư mục cha của thư mục chứa script, chạy từ đâu cũng đúng
DEFAULT_HISTORY_FILE = os.path.normpath(
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "sessionHistory.md")
)

BLOCK_RE = re.compile(r"^\[Id\s+(\d+)\]:[ \t]*$", re.MULTILINE)
SEPARATOR_RE = re.compile(r"_{5,}")
FIELD_RE = re.compile(r"\[\w[^\]]*\]")


def norm(path):
  return path.replace("\\", "/").strip().lower()


def parse_blocks(content):
  """Tách file thành các block: (id, nội dung block)."""
  matches = list(BLOCK_RE.finditer(content))
  for i, m in enumerate(matches):
    end = matches[i + 1].start() if i + 1 < len(matches) else len(content)
    yield int(m.group(1)), content[m.end():end]


def parse_body(body):
  """Lấy time, title, changed files, description từ một block."""
  time = title = ""
  files, desc = [], []
  section = None
  for line in body.splitlines():
    if SEPARATOR_RE.fullmatch(line.strip()):
      break
    if m := re.match(r"\[Time[^\]]*\]:\s*(.*)", line):  # nhận cả [Time] lẫn [Time (Vietnam)]
      time = m.group(1).strip()
    elif m := re.match(r"\[Title\]:\s*(.*)", line):
      title = m.group(1).strip()
    elif line.startswith(("[Changed_File]", "[Changed_Files]")):
      section = "files"
    elif line.startswith("[Description]"):
      section = "desc"
    elif FIELD_RE.match(line):
      section = None
    elif section == "files" and line.startswith("- "):
      files.append(line[2:].strip())
    elif section == "desc":
      desc.append(line.rstrip())
  while desc and not desc[-1]:
    desc.pop()
  return time, title, files, desc


def matches_file(changed_files, query):
  """Khớp đường dẫn đầy đủ, hoặc chỉ tên file/đuôi đường dẫn (vd: QuizController.cs)."""
  q = norm(query)
  for p in changed_files:
    n = norm(p)
    if n == q or n.endswith("/" + q):
      return True
  return False


def main():
  parser = argparse.ArgumentParser(
      description="Lấy top k block mới nhất có sửa file chỉ định (Id, time, title, description)."
  )
  parser.add_argument(
      "changed_file",
      help='Tên hoặc đường dẫn file cần tra, vd: "QuizController.cs"',
  )
  parser.add_argument(
      "-k",
      "--top",
      type=int,
      default=1,
      help="Số block mới nhất cần lấy (mặc định: 1)",
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

  results = []  # (id, time, title, files, desc)
  for block_id, body in parse_blocks(content):
    time, title, files, desc = parse_body(body)
    if matches_file(files, args.changed_file):
      results.append((block_id, time, title, files, desc))

  if not results:
    print(f"Khong co lich su nao sua file: {args.changed_file}")
    sys.exit(1)

  results.sort(key=lambda r: r[0], reverse=True)  # mới nhất trước

  outputs = []
  for block_id, time, title, files, desc in results[: args.top]:
    lines = [f"[Id {block_id}] {time}", f"Title: {title}"]
    if files:
      lines.append("Changed_Files:")
      lines.extend(f"- {p}" for p in files)
    lines.append("Description:")
    lines.extend(desc)
    outputs.append("\n".join(lines))
  print("\n\n".join(outputs))


if __name__ == "__main__":
  main()