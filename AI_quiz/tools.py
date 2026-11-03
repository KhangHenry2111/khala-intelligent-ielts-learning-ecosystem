"""Parameter-driven tools for the IELTS pipeline."""

import base64
import io
import json
import logging
import os
import re
import shutil
from typing import Any, Dict, List, Union

import docx
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import openpyxl
import requests
from PIL import Image
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.shared import Pt
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

logger = logging.getLogger("ielts.ai_quiz")
CONFIG_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "config.cfg"))


def _trace(label: str, value: Any = None) -> None:
    if value is None:
        logger.info("[AI TRACE] %s", label)
    else:
        logger.info("[AI TRACE] %s: %s", label, json.dumps(value, ensure_ascii=False, default=str))

try:
    import pytesseract
except ImportError:
    pytesseract = None

try:
    from pypdf import PdfReader
except ImportError:
    PdfReader = None


def _configure_tesseract() -> None:
    if pytesseract is None:
        return
    configured = ""
    try:
        import configparser
        config = configparser.ConfigParser()
        config.read(CONFIG_PATH)
        configured = config.get("ai_model", "tesseract_cmd", fallback="").strip()
    except (configparser.Error, OSError):
        configured = ""
    configured = configured or shutil.which("tesseract")
    if not configured:
        for candidate in (
            r"C:\Program Files\Tesseract-OCR\tesseract.exe",
            r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe",
        ):
            if os.path.exists(candidate):
                configured = candidate
                break
    if configured:
        pytesseract.pytesseract.tesseract_cmd = configured
        _trace("TESSERACT CONFIGURED", {"path": configured})


GUARDRAIL_PROMPT = """Review the supplied IELTS input as a safety and relevance guardrail.
Return JSON only with exactly these fields:
{"is_safe": true|false, "is_relevant": true|false, "passed": true|false, "reason": "..."}
Reject unsafe, malicious, irrelevant, empty, or unusable content. `passed` must be
true only when both `is_safe` and `is_relevant` are true.
"""


def _invoke_llm(llm: Any, prompt: str, **values: Any) -> Any:
    if llm is None:
        raise ValueError("guardrail_check requires an llm callable or an object with invoke().")
    if hasattr(llm, "invoke"):
        response = llm.invoke({"prompt": prompt, **values})
    elif callable(llm):
        response = llm(prompt=prompt, **values)
    else:
        raise TypeError("llm must be callable or expose invoke().")
    return getattr(response, "content", response)


def _parse_llm_json(response: Any) -> Dict[str, Any]:
    if isinstance(response, dict):
        result = response
    else:
        content = re.sub(r"^```(?:json)?\s*|\s*```$", "", str(response).strip(), flags=re.I)
        result = json.loads(content)
    required = ("is_safe", "is_relevant", "passed", "reason")
    if any(key not in result for key in required):
        raise ValueError("LLM guardrail response is missing required fields.")
    return {"is_safe": bool(result["is_safe"]), "is_relevant": bool(result["is_relevant"]),
            "passed": bool(result["passed"]), "reason": str(result["reason"])}


def _local_guardrail_fallback(question: str, answer: str, skill: str, allow_topic: bool = False) -> Dict[str, Any]:
    """Fallback safety/relevance heuristic when no LLM is configured."""
    text = (question or "") + " " + (answer or "")
    normalized = re.sub(r"\s+", " ", text).strip()
    lowered = normalized.lower()

    minimum_length = 3 if allow_topic else 20
    if not normalized or len(re.sub(r"[^a-z0-9]", "", lowered)) < minimum_length:
        return {"is_safe": False, "is_relevant": False, "passed": False, "reason": "Input is empty or unusable."}

    unsafe_patterns = [
        "ignore previous instructions", "ignore system prompt", "developer message", "override safety",
        "bypass restriction", "admin password", "exploit vulnerability", "build a bomb", "hack the system",
        "steal credentials", "illegal activity", "malware", "phishing", "self-harm", "kill yourself",
        "make a weapon", "exploit users"
    ]
    if any(pattern in lowered for pattern in unsafe_patterns):
        return {"is_safe": False, "is_relevant": False, "passed": False, "reason": "Unsafe or malicious content detected."}

    if allow_topic:
        return {"is_safe": True, "is_relevant": True, "passed": True, "reason": "Topic passed the local safety check."}

    relevant_keywords = [
        "education", "student", "university", "school", "teacher", "learning", "research", "technology",
        "ai", "environment", "climate", "energy", "health", "medicine", "culture", "history", "art",
        "language", "animals", "ecosystem", "reading", "listening", "speaking", "writing", "ielts",
        "economy", "society", "policy", "infrastructure", "innovation", "community", "science"
    ]
    has_relevant_signal = any(keyword in lowered for keyword in relevant_keywords)
    has_english_words = bool(re.findall(r"[a-z]{3,}", lowered))
    if not has_relevant_signal and not has_english_words:
        return {"is_safe": True, "is_relevant": False, "passed": False, "reason": "Content is not relevant to IELTS study or academic material."}

    if skill.lower() in {"reading", "listening", "speaking", "writing", "all"} and not has_relevant_signal:
        return {"is_safe": True, "is_relevant": False, "passed": False, "reason": "Content does not match the requested IELTS learning objective."}

    return {"is_safe": True, "is_relevant": True, "passed": True, "reason": "Content passed the local safety and relevance check."}


def guardrail_check(question: str, answer: str, skill: str, llm: Any, prompt: str = GUARDRAIL_PROMPT, allow_topic: bool = False) -> Dict[str, Any]:
    """Validate model-provided question and answer through the supplied LLM, with a local fallback when no model is configured."""
    if llm is None:
        return _local_guardrail_fallback(question, answer, skill, allow_topic=allow_topic)
    try:
        response = _invoke_llm(llm, prompt, question=question, answer=answer, skill=skill)
        return _parse_llm_json(response)
    except (TypeError, ValueError, json.JSONDecodeError) as exc:
        return {"is_safe": False, "is_relevant": False, "passed": False,
                "reason": f"Invalid LLM guardrail response: {exc}"}


def ocr_image_to_text(image_input: Union[str, bytes, Image.Image]) -> str:
    """Extract text from bytes, a data URL / base64 string, or a PIL image. File paths are NOT accepted."""
    try:
        if isinstance(image_input, Image.Image):
            image = image_input
        elif isinstance(image_input, bytes):
            image = Image.open(io.BytesIO(image_input))
        elif isinstance(image_input, str):
            image = Image.open(io.BytesIO(base64.b64decode(image_input.split(";base64,")[-1])))
        else:
            raise ValueError("Unsupported image input.")
        if pytesseract is None:
            raise RuntimeError("pytesseract is not installed.")
        _configure_tesseract()
        return pytesseract.image_to_string(image).strip()
    except Exception as exc:
        return f"[OCR_ERROR] {exc}"


def extract_document_text(raw_input: Union[str, bytes], file_type: str = "text", file_name: str = "") -> str:
    """
    Return the full text from bytes, a data URL, or a plain text string.
    Never reads local file paths and never fetches URLs (prevents arbitrary file read / SSRF).
    """
    if isinstance(raw_input, str) and raw_input.startswith("data:"):
        if ";base64," not in raw_input:
            return raw_input.strip()
        raw_input = base64.b64decode(raw_input.split(";base64,", 1)[1])

    if isinstance(raw_input, bytes):
        is_pdf = (
            (file_type or "").lower() == "pdf"
            or (file_name or "").lower().endswith(".pdf")
            or raw_input[:5] == b"%PDF-"
        )
        if is_pdf:
            if PdfReader is None:
                raise RuntimeError("pypdf is required to extract PDF text.")
            reader = PdfReader(io.BytesIO(raw_input))
            return "\n\n".join((page.extract_text() or "") for page in reader.pages).strip()
        return raw_input.decode("utf-8", errors="ignore")

    return str(raw_input).strip()


def clean_text(raw_text: str) -> str:
    """Remove presentation markup and normalize text without changing content."""
    if not raw_text:
        return ""
    text = re.sub(r"```[\s\S]*?```|`[^`]*`", " ", raw_text)
    text = re.sub(r"!\[.*?\]\(.*?\)|\[(.*?)\]\(.*?\)", lambda match: match.group(1) or " ", text)
    text = re.sub(r"^[ \t]*[#>]+[ \t]*", "", text, flags=re.M)
    text = re.sub(r"[*_~]{1,3}|<[^>]+>", "", text)
    text = re.sub(r"^[ \t]*[-*_]{3,}[ \t]*$", "", text, flags=re.M)
    text = re.sub("[\\U00010000-\\U0010ffff\\u2600-\\u26ff\\u2700-\\u27bf\\ufe00-\\ufe0f\\u200d]+", " ", text)
    text = re.sub(r"\.{4,}", "...", text)
    text = re.sub(r"\?{2,}", "?", text)
    text = re.sub(r"!{2,}", "!", text)
    return "\n\n".join(line for line in (re.sub(r"[ \t]+", " ", item).strip() for item in text.splitlines()) if line)


def search_web_tool(query: str, search_url: str, num_results: int) -> List[Dict[str, str]]:
    """Search an explicitly supplied endpoint; return only remote results."""
    _trace("TOOL CALLED: search_web_tool", {"query": query, "url": search_url, "num_results": num_results})
    response = requests.get(search_url, params={"q": query}, headers={"User-Agent": "IELTS-Study-Assistant"}, timeout=10)
    response.raise_for_status()
    snippets = re.findall(r'<a class="result__snippet[^>]*>(.*?)</a>', response.text, re.DOTALL)
    titles = re.findall(r'<a class="result__url[^>]*>(.*?)</a>', response.text, re.DOTALL)
    return [{"title": re.sub(r"<[^>]+>", "", titles[i]).strip() if i < len(titles) else "",
             "url": search_url, "snippet": re.sub(r"<[^>]+>", "", snippets[i]).strip()}
            for i in range(min(num_results, len(snippets)))]


def generate_writing_chart(chart_type: str, title: str, x_labels: List[str], series_data: Dict[str, List[float]], output_path: str) -> str:
    """Render caller-provided chart data to the caller-provided path."""
    _trace("TOOL CALLED: generate_writing_chart", {"chart_type": chart_type, "title": title, "output_path": output_path})
    if not x_labels or not series_data or not output_path:
        raise ValueError("chart_type, title, x_labels, series_data and output_path are required.")
    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    figure, axis = plt.subplots(figsize=(9, 5.2), dpi=150)
    chart_type = chart_type.lower()
    if chart_type == "line":
        for label, values in series_data.items():
            axis.plot(x_labels[:len(values)], values, marker="o", label=label)
    elif chart_type == "pie":
        values = next(iter(series_data.values()))
        axis.pie(values[:len(x_labels)], labels=x_labels[:len(values)], autopct="%1.1f%%")
    elif chart_type == "bar":
        width = 0.8 / max(len(series_data), 1)
        positions = list(range(len(x_labels)))
        for index, (label, values) in enumerate(series_data.items()):
            offset = (index - (len(series_data) - 1) / 2) * width
            axis.bar([position + offset for position in positions], values[:len(x_labels)], width, label=label)
        axis.set_xticks(positions, x_labels)
    else:
        plt.close(figure)
        raise ValueError(f"Unsupported chart type: {chart_type}")
    axis.set_title(title)
    if chart_type != "pie":
        axis.legend()
    figure.tight_layout()
    figure.savefig(output_path)
    plt.close(figure)
    return os.path.abspath(output_path)


def post_to_sql_backend(payload: Dict[str, Any], url: str, timeout: float = 20) -> Dict[str, Any]:
    """POST a model-produced payload to an explicitly supplied URL."""
    _trace("BACKEND REQUEST JSON", {"url": url, "payload": payload})
    response = requests.post(url, json=payload, timeout=timeout)
    response.raise_for_status()
    response_json = response.json()
    _trace("BACKEND RESPONSE JSON", response_json)
    return response_json


def _quiz_title(quiz_data: Dict[str, Any]) -> str:
    if not quiz_data.get("Title"):
        raise ValueError("quiz_data['Title'] is required.")
    return str(quiz_data["Title"])


def export_to_word(quiz_data: Dict[str, Any], output_path: str) -> str:
    """Export caller-provided questions and answers to Word."""
    _trace("TOOL CALLED: export_to_word", {"output_path": output_path})
    document = docx.Document()
    title = document.add_paragraph()
    title.alignment = WD_ALIGN_PARAGRAPH.CENTER
    title_run = title.add_run(_quiz_title(quiz_data))
    title_run.bold = True
    title_run.font.size = Pt(20)
    for group in quiz_data.get("QuestionGroups", []):
        document.add_heading(group.get("Instruction", "Questions"), level=1)
        for question in group.get("Questions", []):
            document.add_paragraph(f"Question: {question.get('Content', '')}")
            document.add_paragraph(f"Answer: {question.get('CorrectAnswer', '')}")
            if question.get("Explanation"):
                document.add_paragraph(f"Explanation: {question['Explanation']}")
    document.save(output_path)
    return os.path.abspath(output_path)


def export_to_excel(quiz_data: Dict[str, Any], output_path: str) -> str:
    """Export caller-provided questions and answers to Excel."""
    _trace("TOOL CALLED: export_to_excel", {"output_path": output_path})
    workbook = openpyxl.Workbook()
    sheet = workbook.active
    sheet.title = "Questions and Answers"
    for column, header in enumerate(["No", "Question", "Answer", "Explanation"], 1):
        cell = sheet.cell(1, column, header)
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill("solid", fgColor="1F3864")
    row = number = 2
    for group in quiz_data.get("QuestionGroups", []):
        for question in group.get("Questions", []):
            for column, value in enumerate([number, question.get("Content", ""), question.get("CorrectAnswer", ""), question.get("Explanation", "")], 1):
                sheet.cell(row, column, value).alignment = Alignment(wrap_text=True)
            number += 1
            row += 1
    for column in sheet.columns:
        width = max(len(str(cell.value or "")) for cell in column)
        sheet.column_dimensions[get_column_letter(column[0].column)].width = min(max(width + 3, 12), 60)
    workbook.save(output_path)
    return os.path.abspath(output_path)


def save_to_knowledge_base(doc_data: Dict[str, Any], url: str, timeout: float = 20) -> Dict[str, Any]:
    """Send caller-provided document metadata to the supplied endpoint."""
    return post_to_sql_backend(doc_data, url=url, timeout=timeout)