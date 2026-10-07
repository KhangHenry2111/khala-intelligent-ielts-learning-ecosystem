import argparse
import os
import re
import sys

# File history nằm ở thư mục cha của thư mục chứa script, chạy từ đâu cũng đúng
DEFAULT_HISTORY_FILE = os.path.normpath(
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "sessionHistory.md")
)

BLOCK_RE = re.compile(r"^\[Id\s+(\d+)\]:[ \t]*$", re.MULTILINE)
SEPARATOR_RE = re.compile(r"^_{5,}[ \t]*$", re.MULTILINE)


def main():
  parser = argparse.ArgumentParser(
      description="In nội dung đầy đủ của block theo Id (không in dòng ngăn cách)."
  )
  parser.add_argument(
      "ids",
      nargs="+",
      type=int,
      help="Id block cần xem, vd: 12 hoặc 12 14",
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

  blocks = {}  # id -> danh sách nội dung block
  matches = list(BLOCK_RE.finditer(content))
  for i, m in enumerate(matches):
    end = matches[i + 1].start() if i + 1 < len(matches) else len(content)
    body = content[m.end():end]
    sep = SEPARATOR_RE.search(body)
    if sep:
      body = body[: sep.start()]
    blocks.setdefault(int(m.group(1)), []).append(f"[Id {m.group(1)}]:{body.rstrip()}")

  outputs, missing = [], []
  for block_id in dict.fromkeys(args.ids):  # bỏ Id trùng, giữ thứ tự
    if block_id in blocks:
      outputs.extend(blocks[block_id])
    else:
      missing.append(block_id)

  if outputs:
    print("\n\n".join(outputs))
  if missing:
    print("Khong co Id: " + ", ".join(map(str, missing)))
    sys.exit(1)


if __name__ == "__main__":
  main()