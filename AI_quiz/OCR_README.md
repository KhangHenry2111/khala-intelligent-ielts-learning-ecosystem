# OCR test

`test_ocr.py` reads `123.jpg` and writes the OCR text to `done.txt`.

Install Tesseract OCR for Windows first, then run from `ielts-study-assistant`:

```powershell
.\venv\Scripts\python.exe .\AI_quiz\test_ocr.py
```

For a custom executable or output path:

```powershell
.\venv\Scripts\python.exe .\AI_quiz\test_ocr.py .\123.jpg --tesseract-cmd "C:\Program Files\Tesseract-OCR\tesseract.exe" --output .\done.txt
```

The script returns exit code `1` and does not create a fake OCR result when Tesseract is missing.
