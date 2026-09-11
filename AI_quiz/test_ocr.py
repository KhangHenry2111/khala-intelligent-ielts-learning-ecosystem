"""OCR an image with Tesseract and export the extracted text to a file."""

from __future__ import annotations

import argparse
import os
import shutil
from pathlib import Path

import pytesseract
from PIL import Image
from pytesseract import TesseractNotFoundError


DEFAULT_IMAGE = Path(__file__).resolve().parents[1] / "123.jpg"
DEFAULT_OUTPUT = Path(__file__).resolve().parents[1] / "done.txt"
COMMON_TESSERACT_PATHS = (
    Path(r"C:\Program Files\Tesseract-OCR\tesseract.exe"),
    Path(r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe"),
)


def find_tesseract(explicit_path: str | None) -> str:
    if explicit_path:
        candidate = Path(explicit_path).expanduser()
        if not candidate.is_file():
            raise FileNotFoundError(f"Tesseract executable not found: {candidate}")
        return str(candidate)

    on_path = shutil.which("tesseract")
    if on_path:
        return on_path

    for candidate in COMMON_TESSERACT_PATHS:
        if candidate.is_file():
            return str(candidate)

    raise FileNotFoundError(
        "Tesseract executable was not found. Install Tesseract or pass "
        "--tesseract-cmd C:\\path\\to\\tesseract.exe."
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Read text from an image with Tesseract.")
    parser.add_argument("image", nargs="?", default=str(DEFAULT_IMAGE), help="Input image path.")
    parser.add_argument("--output", default=str(DEFAULT_OUTPUT), help="Output text file path.")
    parser.add_argument("--lang", default="eng", help="Tesseract language, for example eng.")
    parser.add_argument("--tesseract-cmd", help="Path to tesseract.exe when it is not on PATH.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    image_path = Path(args.image).expanduser().resolve()
    output_path = Path(args.output).expanduser().resolve()

    if not image_path.is_file():
        raise FileNotFoundError(f"Input image not found: {image_path}")

    pytesseract.pytesseract.tesseract_cmd = find_tesseract(args.tesseract_cmd)
    with Image.open(image_path) as image:
        text = pytesseract.image_to_string(image, lang=args.lang).strip()

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(text + "\n", encoding="utf-8")
    print(f"OCR completed: {image_path}")
    print(f"Text exported to: {output_path}")
    print(f"Characters: {len(text)}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (FileNotFoundError, TesseractNotFoundError, OSError) as error:
        print(f"OCR failed: {error}")
        raise SystemExit(1)
