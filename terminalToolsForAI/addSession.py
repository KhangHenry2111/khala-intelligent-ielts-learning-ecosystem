import argparse
import os
import re
import sys
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone

# Múi giờ Việt Nam (UTC+7)
VN_TZ = timezone(timedelta(hours=7))

# File history nằm ở thư mục cha của thư mục chứa script, chạy từ đâu cũng đúng
DEFAULT_HISTORY_FILE = os.path.normpath(
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "sessionHistory.md")
)

# Dòng ngăn cách ghi ở cuối mỗi block (39 ký tự "_", đổi số này nếu cần dài/ngắn hơn)
SEPARATOR = "_" * 39

# Chỉ khớp tiêu đề block ở đầu dòng, tránh bắt nhầm nội dung mô tả
ID_PATTERN = re.compile(r"^\[Id\s+(\d+)\]:", re.MULTILINE)
STATUS_RE = re.compile(r"^(\[Status\]:[ \t]*)(.*)$", re.MULTILINE)


@contextmanager
def file_lock(f):
  """Khóa file (cross-platform) để tránh trùng ID khi chạy song song."""
  if os.name == "nt":
    import msvcrt

    f.seek(0)
    msvcrt.locking(f.fileno(), msvcrt.LK_LOCK, 1)
    try:
      yield
    finally:
      f.seek(0)
      msvcrt.locking(f.fileno(), msvcrt.LK_UNLCK, 1)
  else:
    import fcntl

    fcntl.flock(f, fcntl.LOCK_EX)
    try:
      yield
    finally:
      fcntl.flock(f, fcntl.LOCK_UN)


def get_max_id(content):
  """Tìm ID lớn nhất trong nội dung file."""
  ids = ID_PATTERN.findall(content)
  return max(map(int, ids)) if ids else 0


def set_status(content, block_id, new_status):
  """Đổi dòng [Status] của block có Id chỉ định. Trả về (nội dung mới, trạng thái cũ)."""
  matches = list(ID_PATTERN.finditer(content))
  found = [i for i, m in enumerate(matches) if int(m.group(1)) == block_id]
  if not found:
    sys.exit(f"Khong co Id {block_id}")
  if len(found) > 1:
    sys.exit(f"Id {block_id} bi trung {len(found)} lan, hay sua tay truoc")

  i = found[0]
  start = matches[i].end()
  end = matches[i + 1].start() if i + 1 < len(matches) else len(content)
  s = STATUS_RE.search(content, start, end)
  if not s:
    sys.exit(f"Id {block_id} khong co dong [Status]")

  old = s.group(2).strip()
  return content[: s.start(2)] + new_status + content[s.end(2):], old


def update_block(content, block_id, status=None, files=None, descriptions=None, model=None):
  """Cập nhật trạng thái và bổ sung file/mô tả cho block mà không ghi đè lịch sử."""
  matches = list(ID_PATTERN.finditer(content))
  found = [i for i, m in enumerate(matches) if int(m.group(1)) == block_id]
  if len(found) != 1:
    sys.exit(f"Id {block_id} không tồn tại hoặc bị trùng")
  i = found[0]
  start = matches[i].start()
  end = matches[i + 1].start() if i + 1 < len(matches) else len(content)
  block = content[start:end]

  if model:
    block, count = re.subn(r"(?m)^\[Model_name\]:[ \t]*.*$", f"[Model_name]: {model}", block, count=1)
    if not count:
      sys.exit(f"Id {block_id} không có dòng [Model_name]")

  if status is not None:
    block, _ = set_status(block, block_id, status)

  added_files = [p.strip() for p in (files or []) if p.strip()]
  if added_files:
    lines = block.splitlines(keepends=True)
    header = next((n for n, line in enumerate(lines) if line.strip().startswith(("[Changed_File]:", "[Changed_Files]:"))), None)
    desc = next((n for n, line in enumerate(lines) if line.strip() == "[Description]"), len(lines) - 1)
    if header is None:
      lines.insert(desc, "[Changed_File]:\n")
      desc += 1
      header = desc - 1
    section_end = next((n for n in range(header + 1, len(lines)) if lines[n].lstrip().startswith("[")), len(lines))
    existing = {line.strip()[2:].strip() for line in lines[header + 1:section_end] if line.strip().startswith("- ")}
    additions = [f"- {clean(path)}\n" for path in added_files if path not in existing]
    lines[section_end:section_end] = additions
    block = "".join(lines)

  added_desc = [d.strip() for d in (descriptions or []) if d.strip()]
  if added_desc:
    lines = block.splitlines(keepends=True)
    separator = next((n for n, line in enumerate(lines) if line.strip() == SEPARATOR), len(lines))
    lines[separator:separator] = [f"- {clean(item)}\n" for item in added_desc]
    block = "".join(lines)

  return content[:start] + block + content[end:]


def clean(text):
  """Giữ mỗi mục trên một khối, dòng tiếp theo thụt lề để không phá cấu trúc."""
  return text.strip().replace("\r\n", "\n").replace("\n", "\n  ")


def build_block(new_id, args):
  current_time = datetime.now(VN_TZ).strftime("%Y-%m-%d %H:%M")
  lines = [
      f"[Id {new_id}]:",
      f"[Model_name]: {args.model or os.environ.get('SESSION_LOG_MODEL', 'Codex')}",
      f"[Time]: {current_time}",
      f"[Title]: {clean(args.title)}",
      f"[Status]: {args.status}",
  ]
  if args.files:
    lines.append("[Changed_File]:")
    lines.extend(f"- {clean(p)}" for p in args.files)
  lines.append("[Description]")
  lines.extend(f"- {clean(d)}" for d in args.desc if d.strip())
  lines.append(SEPARATOR)
  return "\n".join(lines) + "\n"


def main():
  parser = argparse.ArgumentParser(
      description="Tool CLI tự động ghi log session vào file history."
  )
  parser.add_argument(
      "--file",
      default=DEFAULT_HISTORY_FILE,
      help=f"Đường dẫn tới file lịch sử (mặc định: {DEFAULT_HISTORY_FILE})",
  )
  parser.add_argument(
      "--model",
      default=os.environ.get(
        "SESSION_LOG_MODEL", "Codex"
      ),
      help="Tên model AI (mặc định: biến môi trường SESSION_LOG_MODEL)",
  )
  parser.add_argument(
      "--title", help="Tiêu đề tóm tắt nội dung làm việc (bắt buộc khi ghi block mới)"
  )
  parser.add_argument(
      "--status",
      default=None,
      choices=["Done", "In Process", "Cancel"],
      help="Trạng thái công việc (mặc định khi ghi mới: Done; khi dùng --id: trạng thái mới)",
  )
  parser.add_argument(
      "--id",
      type=int,
      default=None,
      help="Cập nhật block hiện tại bằng --status, --model, --files và/hoặc --desc",
  )
  parser.add_argument(
      "--files",
      nargs="*",
      default=[],
      help='Danh sách file thay đổi, bọc đường dẫn có dấu cách trong nháy "..."',
  )
  parser.add_argument(
      "--desc",
      nargs="+",
      help='Các ý mô tả, MỖI Ý bọc trong nháy: --desc "ý 1" "ý 2" (bắt buộc khi ghi block mới)',
  )
  args = parser.parse_args()

  # Chế độ đổi trạng thái: --id N --status X
  if args.id is not None:
    if args.status is None and not args.files and not args.desc and not args.model:
      parser.error("--id cần có ít nhất một trong --status, --model, --files hoặc --desc")
    if args.title:
      parser.error("--id không dùng cùng --title")
    if not os.path.exists(args.file):
      sys.exit(f"Khong tim thay file lich su: {args.file}")

    with open(args.file, "r+", encoding="utf-8") as f:
      with file_lock(f):
        f.seek(0)
        new_content = update_block(f.read(), args.id, args.status, args.files, args.desc, args.model)
        f.seek(0)
        f.write(new_content)
        f.truncate()
        f.flush()
        os.fsync(f.fileno())

    print(f"Da cap nhat [Id {args.id}] trong `{args.file}`")
    return

  # Chế độ ghi block mới
  if not args.title or not args.title.strip():
    parser.error("--title bắt buộc và không được để trống")
  if not args.desc or not any(d.strip() for d in args.desc):
    parser.error("--desc bắt buộc và không được để trống")
  args.status = args.status or "Done"

  # Tạo thư mục cha nếu chưa có
  parent = os.path.dirname(os.path.abspath(args.file))
  os.makedirs(parent, exist_ok=True)

  # Đọc ID + ghi trong cùng một lần khóa file
  with open(args.file, "a+", encoding="utf-8") as f:
    with file_lock(f):
      f.seek(0)
      content = f.read()
      new_id = get_max_id(content) + 1

      # Dòng trống ngăn cách giữa các block; file rỗng thì không thêm
      if not content.strip():
        sep = ""
      elif content.endswith("\n"):
        sep = "\n"
      else:
        sep = "\n\n"

      f.write(sep + build_block(new_id, args))
      f.flush()
      os.fsync(f.fileno())

  print(f"Da ghi thanh cong [Id {new_id}] vao file `{args.file}`")


if __name__ == "__main__":
  try:
    main()
  except OSError as e:
    sys.exit(f"Loi ghi file: {e}")
