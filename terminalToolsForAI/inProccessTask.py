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
STATUS_RE = re.compile(r"^\[Status\]:[ \t]*(.*)$", re.MULTILINE)
IN_PROGRESS_RE = re.compile(r"in\s*(process|progress)", re.IGNORECASE)


def main():
  parser = argparse.ArgumentParser(
      description="Liệt kê các block có Status In Process, mỗi block một dòng: Id, time, title."
  )
  parser.add_argument(
      "--file",
      default=DEFAULT_HISTORY_FILE,
      help=f"Đường dẫn file lịch sử (mặc định: {DEFAULT_HISTORY_FILE})",
  )
  args = parser.parse_args()

  try:
    sys.stdout.reconfigure(encoding="utf-8")
  except (AttributeError, OSError):
    pass

  if not os.path.exists(args.file):
    sys.exit(f"Khong tim thay file lich su: {args.file}")

  with open(args.file, "r", encoding="utf-8") as f:
    content = f.read()

  matches = list(BLOCK_RE.finditer(content))
  rows = []  # (id, time, title)
  for i, m in enumerate(matches):
    end = matches[i + 1].start() if i + 1 < len(matches) else len(content)
    body = content[m.end():end]
    st = STATUS_RE.search(body)
    if not (st and IN_PROGRESS_RE.fullmatch(st.group(1).strip())):
      continue
    t = TIME_RE.search(body)
    ti = TITLE_RE.search(body)
    rows.append((int(m.group(1)), t.group(1).strip() if t else "", ti.group(1).strip() if ti else ""))

  if not rows:
    print("Khong co block In Process")  # trạng thái bình thường, không phải lỗi
    return

  rows.sort(key=lambda r: r[0], reverse=True)  # mới nhất trước
  print("\n".join(f"[Id {i}] {t} | {title}" for i, t, title in rows))


if __name__ == "__main__":
  main()