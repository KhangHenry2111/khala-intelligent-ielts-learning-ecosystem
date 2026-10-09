"""
IELTS Study Assistant - LangGraph Workflow Engine
Orchestrates the 5-step IELTS Quiz Generation Pipeline:
B1: Ingest & OCR
B2: Guardrails (Safety & Relevance)
B3: Data Preprocessing (Cleaning)
B4: Summarizer Agent (LLM-driven) & Orchestrator (package-based Teacher dispatch)
    -> Each teacher receives a shared context_bundle plus a compact summary of what
       earlier teachers generated (built from state) to avoid duplication.
    -> Backend sync (POST to C# API; Draft status)
B5: Word / Excel Export & Knowledge Base Storage

Reliability notes:
    - Every node is wrapped by `_node_guard`: if the pipeline has already failed
      (status == "ERROR") the node is skipped, and any exception raised inside a
      node is caught, logged, and converted into a normal ERROR state.
    - Teacher output is validated (`_validate_payload`). Invalid / empty / placeholder
      output raises inside the retry loop; after 3 attempts the pipeline ends with
      status "ERROR" and nothing is persisted. There are no placeholder fallbacks.
    - Options / SharedOptions are always stored as valid JSON strings (DB has ISJSON checks).
    - Backend save failure ends the pipeline with "ERROR" (no export, no knowledge doc).
    - Skill access is decided by `allowed_skills` (computed by the backend from the
      user's Package), not by the caller-supplied `user_tier`.
    - Every AI-generated answer is printed to the console via `_print_ai_answer`.
"""

import os
import re
import json
import uuid
import configparser
import logging
from functools import wraps
from pathlib import Path
from typing import Dict, List, Any, Optional, TypedDict, Union

import requests

import time
from . import tool
from .tool import (
    ocr_image_to_text,
    guardrail_check,
    clean_text,
    extract_document_text,
    search_web_tool,
    post_to_sql_backend,
    export_to_word,
    export_to_excel,
    save_to_knowledge_base
)

# LangGraph
from langgraph.graph import StateGraph, END

logger = logging.getLogger("ielts.ai_quiz")

# Ensure this logger always prints somewhere, even if the host app never calls
# logging.basicConfig().
if not logger.handlers:
    _console_handler = logging.StreamHandler()
    _console_handler.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(message)s"))
    logger.addHandler(_console_handler)
logger.setLevel(logging.INFO)
logger.propagate = False


def _default_tool_params() -> Dict[str, Any]:
    """Return a config-backed fallback for all external tool endpoints and output paths."""
    config = configparser.ConfigParser()
    config_path = Path(__file__).resolve().parents[1] / "config.cfg"
    config.read(config_path)

    backend_cfg = config["backend_api"] if config.has_section("backend_api") else {}
    storage_cfg = config["storage"] if config.has_section("storage") else {}

    export_dir = os.getenv("IELTS_EXPORT_DIR", storage_cfg.get("export_dir", str(Path(__file__).resolve().parents[1] / "exports"))).strip()
    charts_dir = os.getenv("IELTS_CHARTS_DIR", storage_cfg.get("charts_dir", str(Path(__file__).resolve().parents[1] / "exports" / "charts"))).strip()
    Path(export_dir).mkdir(parents=True, exist_ok=True)
    Path(charts_dir).mkdir(parents=True, exist_ok=True)

    return {
        "backend_url": (os.getenv("IELTS_SAVE_QUIZ_URL") or backend_cfg.get("save_quiz_url") or backend_cfg.get("base_url") or "http://localhost:5000/api/quiz/save").strip(),
        "knowledge_url": (os.getenv("IELTS_SAVE_KNOWLEDGE_URL") or backend_cfg.get("save_knowledge_url") or "http://localhost:5000/api/quiz/knowledge").strip(),
        "search_url": os.getenv("IELTS_SEARCH_URL", "https://www.bing.com/search"),
        # Only the directory of these paths is used by export_knowledge_node;
        # the file name is generated per run to avoid collisions between users.
        "word_output_path": os.getenv("IELTS_WORD_OUTPUT_PATH", str(Path(export_dir) / "ielts_quiz_output.docx")),
        "excel_output_path": os.getenv("IELTS_EXCEL_OUTPUT_PATH", str(Path(export_dir) / "ielts_quiz_output.xlsx")),
        "chart_output_path": os.getenv("IELTS_CHART_OUTPUT_PATH", str(Path(charts_dir) / "writing_chart.png")),
    }


def _resolve_tool_params(tool_params: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    default_params = _default_tool_params()
    merged = default_params.copy()
    if isinstance(tool_params, dict):
        for key, value in tool_params.items():
            if value not in (None, ""):
                merged[key] = value
    return merged


def _trace_safe(value: Any) -> Any:
    if isinstance(value, dict):
        return {key: _trace_safe(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_trace_safe(item) for item in value]
    if isinstance(value, str):
        if value.startswith("data:image") and ";base64," in value:
            prefix, encoded = value.split(";base64,", 1)
            return f"{prefix};base64,[redacted] ({len(encoded)} chars)"
        return value
    return value


def _trace(label: str, value: Any = None) -> None:
    if value is None:
        logger.info("[AI TRACE] %s", label)
    else:
        logger.info("[AI TRACE] %s: %s", label, json.dumps(_trace_safe(value), ensure_ascii=False, default=str))


def _print_ai_answer(label: str, content: Any) -> None:
    """
    Explicitly print AI-generated content to stdout. Plain `print` (not the logger)
    on purpose, so it shows up regardless of logging configuration/level.
    """
    banner = f" AI ANSWER: {label} "
    print(f"\n{banner:=^80}")
    if isinstance(content, (dict, list)):
        print(json.dumps(_trace_safe(content), ensure_ascii=False, indent=2, default=str))
    else:
        print(content)
    print("=" * 80)


class OpenRouterLLM:
    """Small OpenRouter client for the guardrail's OpenAI-compatible endpoint."""

    def __init__(self, model: str, temperature: float, api_key: str, base_url: str):
        self.model = model
        self.temperature = temperature
        self.api_key = api_key
        self.base_url = base_url

    def invoke(self, values: Dict[str, Any]) -> str:
        prompt = values.get("prompt", "")
        user_content = "\n\n".join(
            f"{key}: {value}" for key, value in values.items() if key != "prompt"
        )
        request_json = {
            "model": self.model,
            "temperature": self.temperature,
            "messages": [
                {"role": "system", "content": prompt},
                {"role": "user", "content": user_content},
            ],
        }
        _trace("MODEL REQUEST JSON", request_json)
        response = requests.post(
            self.base_url,
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
                "HTTP-Referer": "http://localhost",
                "X-Title": "IELTS Study Assistant",
            },
            json=request_json,
            timeout=60,
        )
        response.raise_for_status()
        response_json = response.json()
        _trace("MODEL RESPONSE JSON", response_json)
        content = response_json["choices"][0]["message"]["content"]
        _print_ai_answer("Raw LLM response", content)
        return content


def _load_default_llm() -> Optional[OpenRouterLLM]:
    config = configparser.ConfigParser()
    config.read(Path(__file__).resolve().parents[1] / "config.cfg")
    section = config["ai_model"] if config.has_section("ai_model") else {}

    api_key = os.getenv("OPENROUTER_API_KEY") or section.get("OPENROUTER_API_KEY", "").strip() or section.get("api_key", "").strip()
    model = os.getenv("OPENROUTER_MODEL_NAME") or section.get("OPENROUTER_MODEL_NAME", "").strip() or section.get("model_name", "").strip()
    base_url = os.getenv("OPENROUTER_BASE_URL") or section.get("base_url", "https://openrouter.ai/api/v1/chat/completions")
    temperature_raw = os.getenv("OPENROUTER_TEMPERATURE") or section.get("temperature", "0.2") or "0.2"

    if not api_key or not model:
        _trace("MODEL NOT CONFIGURED", {
            "model": model or None,
            "api_key_present": bool(api_key)
        })
        return None
    return OpenRouterLLM(
        model=model,
        temperature=float(temperature_raw),
        api_key=api_key,
        base_url=base_url,
    )


# --------------------------------------------------------------------------
# Pipeline State Definition
# --------------------------------------------------------------------------
class QuizState(TypedDict):
    # Inputs
    raw_input: Union[str, bytes]
    raw_input_name: Optional[str]    # Original file name (helps extract_document_text pick a parser)
    input_type: str                  # "text" | "image" | "pdf"
    selected_skill: str              # "Reading" | "Speaking" | "Writing" | "Listening" | "All"
    selected_question_type: Optional[str]
    selected_question_type_skill: Optional[str]
    question_type_description: str
    question_type_instruction: str
    user_tier: str                   # Informational only (prompt context); NOT used for access control
    allowed_skills: List[str]        # Skills the user's Package allows (computed by backend)
    user_id: Optional[str]
    quiz_title: Optional[str]
    llm: Any
    tool_params: Dict[str, Any]

    # Step 1: Ingest / OCR
    extracted_text: str

    # Step 2: Guardrail
    guardrail_passed: bool
    guardrail_reason: str

    # Step 3: Data Preprocessing
    cleaned_text: str

    # Step 4: Summarizer & Orchestrator
    summary: str
    detected_topic: str
    target_level: str
    key_concepts: List[str]
    allocated_teachers: List[str]

    # Shared context bundle passed to all teacher agents
    context_bundle: Optional[Dict[str, Any]]

    # Teacher Results
    reading_result: Optional[Dict[str, Any]]
    speaking_result: Optional[Dict[str, Any]]
    writing_result: Optional[Dict[str, Any]]
    listening_result: Optional[Dict[str, Any]]

    # Backend Persistence
    consolidated_quiz: Optional[Dict[str, Any]]
    backend_save_result: Optional[Dict[str, Any]]

    # Step 5: Export & Knowledge Base
    word_file_path: Optional[str]
    excel_file_path: Optional[str]
    knowledge_doc_id: Optional[str]

    # Global status
    status: str                      # "SUCCESS" | "REJECTED" | "ERROR" | "SUCCESS_DEGRADED"
    error_message: Optional[str]
    used_fallback: bool              # True only when the summarizer fell back to heuristics


# --------------------------------------------------------------------------
# Node-level exception guard
# --------------------------------------------------------------------------
def _node_guard(node_name: str):
    """
    Wrap a node so that:
      - if the pipeline has already failed (status == "ERROR"), the node is skipped;
      - any unhandled exception inside the node is caught, logged, and turned into
        a normal ERROR state update instead of crashing the whole LangGraph run.
    """
    def decorator(fn):
        @wraps(fn)
        def wrapper(state: "QuizState") -> Dict[str, Any]:
            if state.get("status") == "ERROR":
                return {}
            try:
                return fn(state)
            except Exception as exc:
                logger.exception("Node '%s' failed", node_name)
                return {
                    "status": "ERROR",
                    "error_message": f"{node_name} failed: {exc}",
                }
        return wrapper
    return decorator


# --------------------------------------------------------------------------
# Helpers: Level mapping, Context Bundle
# --------------------------------------------------------------------------
def _band_to_level(level: str) -> str:
    """'Band 7.0 - 7.5 (...)' -> Beginner | Intermediate | Advanced (matches DB CHECK constraints)."""
    m = re.search(r"\d+(?:\.\d+)?", level or "")
    band = float(m.group()) if m else 6.5
    return "Beginner" if band < 6.0 else "Intermediate" if band < 7.0 else "Advanced"


def _build_context_bundle(
    summary: str,
    topic: str,
    level: str,
    tier: str,
    source_text: str,
    key_concepts: List[str],
) -> Dict[str, Any]:
    """Build the shared context bundle passed to all teacher agents."""
    return {
        "summary": summary,
        "topic": topic,
        "level": level,
        "tier": tier,
        "source_text_preview": source_text[:1500],   # Compact preview for prompts
        "key_concepts": key_concepts,
    }


def _compact_prior_context(state: "QuizState") -> str:
    """
    Compact JSON of what earlier teacher agents already generated, built directly
    from state. Injected into later teacher prompts so they avoid duplicating content.
    """
    prior: Dict[str, Any] = {}

    reading = state.get("reading_result")
    if reading:
        groups = reading.get("QuestionGroups", [])
        questions = [q.get("Content", "") for g in groups for q in g.get("Questions", [])]
        prior["reading_questions_generated"] = questions[:5]
        prior["reading_passage_title"] = (reading.get("Passage") or {}).get("Title", "")

    speaking = state.get("speaking_result")
    if speaking:
        prior["speaking_part1_questions"] = (speaking.get("Part1") or [])[:3]
        prior["speaking_cue_card"] = speaking.get("Part2_CueCard", "")

    writing = state.get("writing_result")
    if writing:
        ws = writing.get("WritingSection") or {}
        prior["writing_task1_prompt"] = (ws.get("Task1") or {}).get("Prompt", "")
        prior["writing_task2_prompt"] = (ws.get("Task2") or {}).get("Prompt", "")

    listening = state.get("listening_result")
    if listening:
        groups = listening.get("QuestionGroups", [])
        questions = [q.get("Content", "") for g in groups for q in g.get("Questions", [])]
        prior["listening_questions_generated"] = questions[:5]

    if not prior:
        return "None yet — this is the first teacher in the pipeline."
    return json.dumps(prior, ensure_ascii=False)


# --------------------------------------------------------------------------
# Node 1: Ingestion & OCR (B1)
# --------------------------------------------------------------------------
@_node_guard("ingest_node")
def ingest_node(state: QuizState) -> Dict[str, Any]:
    _trace("TOOL CALLED: ingest_node", {"input_type": state.get("input_type", "text")})
    raw = state.get("raw_input", "")
    itype = state.get("input_type", "text").lower()

    # raw must be content (bytes / data URL / plain text) — never a file path or URL.
    is_image = itype == "image" or (isinstance(raw, str) and raw.startswith("data:image"))

    if is_image:
        extracted = ocr_image_to_text(raw)
    else:
        extracted = extract_document_text(
            raw, file_type=itype, file_name=str(state.get("raw_input_name") or "")
        )

    _trace("OCR RESULT", {
        "characters": len(extracted),
        "preview": extracted[:500],
        "has_error": extracted.startswith("[OCR_ERROR]")
    })

    if extracted.startswith("[OCR_ERROR]"):
        return {"extracted_text": extracted, "status": "ERROR", "error_message": extracted}
    if not extracted.strip():
        return {"extracted_text": "", "status": "ERROR", "error_message": "No text could be extracted from the input."}

    return {
        "extracted_text": extracted,
        "status": "PROCESSING"
    }


# --------------------------------------------------------------------------
# Node 2: Guardrail Safety & Relevance (B2)
# --------------------------------------------------------------------------
@_node_guard("guardrail_node")
def guardrail_node(state: QuizState) -> Dict[str, Any]:
    _trace("TOOL CALLED: guardrail_check", {"skill": state.get("selected_skill", "Reading")})
    text = state.get("extracted_text", "")
    skill = state.get("selected_skill", "Reading")

    check = None
    if state.get("llm") is not None:
        for attempt in range(3):
            try:
                check = guardrail_check(question=text, answer="", skill=skill, llm=state.get("llm"))
                break
            except Exception as exc:
                if attempt < 2:
                    logger.warning("Guardrail LLM call failed (attempt %d/3); retrying: %s", attempt + 1, exc)
                    time.sleep(2)
                else:
                    logger.warning("Guardrail LLM call failed (%s); falling back to local check.", exc)
    if check is None:
        check = guardrail_check(question=text, answer="", skill=skill, llm=None)

    _trace("GUARDRAIL RESULT", check)

    if not check["passed"]:
        return {
            "guardrail_passed": False,
            "guardrail_reason": check["reason"],
            "status": "REJECTED",
            "error_message": check["reason"]
        }

    return {
        "guardrail_passed": True,
        "guardrail_reason": check["reason"]
    }


def should_continue_after_guardrail(state: QuizState) -> str:
    if state.get("status") == "ERROR":
        return END
    if state.get("guardrail_passed", False):
        return "preprocess_node"
    return END


# --------------------------------------------------------------------------
# Node 3: Clean Text / Data Preprocessing (B3)
# --------------------------------------------------------------------------
@_node_guard("preprocess_node")
def preprocess_node(state: QuizState) -> Dict[str, Any]:
    _trace("TOOL CALLED: clean_text")
    text = state.get("extracted_text", "")
    cleaned = clean_text(text)
    return {
        "cleaned_text": cleaned
    }


# --------------------------------------------------------------------------
# Node 4: Summarizer & Topic Classifier Agent (B4) — LLM-driven
# --------------------------------------------------------------------------

_SUMMARIZER_PROMPT = """\
You are an expert IELTS academic content analyst. Analyze the provided source text and return a JSON object with EXACTLY these fields:
{
  "summary": "<2-3 sentence academic summary of the main content>",
  "topic": "<concise topic label, e.g. 'Artificial Intelligence & Digital Innovation'>",
  "target_level": "<IELTS band range, e.g. 'Band 7.0 - 7.5 (Advanced / Academic)'>",
  "key_concepts": ["<concept 1>", "<concept 2>", ..., "<concept 6>"]
}

Rules:
- Return ONLY valid JSON. No markdown, no extra text.
- "summary" must reflect the actual content of the source text.
- "topic" must be a short academic label (3-7 words).
- "target_level" must be one of: "Band 5.5 - 6.0 (Intermediate)", "Band 6.5 - 7.0 (Upper-Intermediate)", "Band 7.0 - 7.5 (Advanced / Academic)", "Band 8.0+ (Expert / Proficiency)".
- "key_concepts" must list 4-6 domain-specific terms or phrases from the source text.
"""


def _heuristic_topic(text: str) -> str:
    """Keyword-based topic fallback when no LLM is configured."""
    c = text.lower()
    if any(k in c for k in ["environment", "climate", "energy", "pollution", "nature", "warming"]):
        return "Environment & Renewable Energy"
    if any(k in c for k in ["education", "school", "university", "student", "teacher", "learning"]):
        return "Higher Education & Academic Pedagogies"
    if any(k in c for k in ["technology", "ai", "artificial intelligence", "computer", "digital", "internet"]):
        return "Artificial Intelligence & Digital Innovation"
    if any(k in c for k in ["health", "medicine", "exercise", "diet", "wellbeing", "hospital"]):
        return "Public Health & Modern Healthcare Systems"
    if any(k in c for k in ["culture", "history", "art", "tradition", "language", "heritage"]):
        return "Cultural Heritage & Globalization"
    return "Academic Studies & Technology"


def _heuristic_key_concepts(text: str, topic: str) -> List[str]:
    """Extract key noun phrases as a heuristic fallback."""
    words = re.findall(r"\b[A-Z][a-z]{3,}(?:\s+[A-Z][a-z]{3,})*\b", text)
    seen: Dict[str, int] = {}
    for w in words:
        seen[w] = seen.get(w, 0) + 1
    top = sorted(seen.items(), key=lambda x: -x[1])[:6]
    concepts = [w for w, _ in top]
    if not concepts:
        concepts = [topic]
    return concepts


@_node_guard("summarizer_node")
def summarizer_node(state: QuizState) -> Dict[str, Any]:
    """
    LLM-driven summarizer: extracts summary, topic, target_level, and key_concepts.
    Falls back to heuristic keyword matching when no LLM is available.
    Builds the shared context_bundle used by all teacher agents.
    """
    _trace("TOOL CALLED: summarizer_node")
    cleaned = state.get("cleaned_text", "")
    llm = state.get("llm")
    tier = state.get("user_tier", "Gold")

    summary = ""
    topic = ""
    target_level = "Band 7.0 - 7.5 (Advanced / Academic)"
    key_concepts: List[str] = []

    used_fallback = state.get("used_fallback", False)
    if llm is not None:
        for attempt in range(3):
            try:
                source_preview = cleaned[:4000]
                raw_response = tool._invoke_llm(
                    llm,
                    _SUMMARIZER_PROMPT,
                    source_text=source_preview,
                )
                text_resp = str(raw_response).strip()
                text_resp = re.sub(r"^```(?:json)?\s*|\s*```$", "", text_resp, flags=re.I).strip()
                first_brace = text_resp.find("{")
                last_brace = text_resp.rfind("}")
                if first_brace != -1 and last_brace > first_brace:
                    text_resp = text_resp[first_brace:last_brace + 1]
                parsed = json.loads(text_resp)
                summary = str(parsed.get("summary") or "").strip()
                topic = str(parsed.get("topic") or "").strip()
                target_level = str(parsed.get("target_level") or target_level).strip()
                key_concepts = [str(c) for c in (parsed.get("key_concepts") or []) if c]
                _trace("SUMMARIZER LLM RESULT", {
                    "topic": topic,
                    "level": target_level,
                    "key_concepts": key_concepts,
                    "summary_preview": summary[:200]
                })
                break
            except Exception as exc:
                if attempt < 2:
                    logger.warning("LLM summarizer failed (attempt %d/3); retrying: %s", attempt + 1, exc)
                    time.sleep(2)
                else:
                    logger.warning("LLM summarizer failed after 3 attempts; falling back to heuristic: %s", exc)
                    used_fallback = True
    else:
        used_fallback = True

    # --- Heuristic fallback ---
    if not topic:
        topic = _heuristic_topic(cleaned)
    if not summary:
        sentences = [s.strip() for s in re.split(r"[.!?]+", cleaned) if len(s.strip()) > 15]
        summary = ". ".join(sentences[:3]) + "." if len(sentences) >= 3 else cleaned[:250] + "..."
    if not key_concepts:
        key_concepts = _heuristic_key_concepts(cleaned, topic)

    context_bundle = _build_context_bundle(
        summary=summary,
        topic=topic,
        level=target_level,
        tier=tier,
        source_text=cleaned,
        key_concepts=key_concepts,
    )

    _print_ai_answer("Summarizer output (summary / topic / level / key concepts)", {
        "summary": summary,
        "topic": topic,
        "target_level": target_level,
        "key_concepts": key_concepts,
        "used_fallback": used_fallback,
    })

    return {
        "summary": summary,
        "detected_topic": topic,
        "target_level": target_level,
        "key_concepts": key_concepts,
        "context_bundle": context_bundle,
        "used_fallback": used_fallback
    }


# --------------------------------------------------------------------------
# Node 5: Question type resolution + Orchestrator (B4 - Package-based Skill Routing)
# --------------------------------------------------------------------------
_ALL_SKILLS = ["Reading", "Listening", "Speaking", "Writing"]
# Execution order of teachers (Speaking/Writing run before Listening, which is last)
_TEACHER_ORDER = ["Reading", "Speaking", "Writing", "Listening"]
_TEACHER_NODES = {
    "Reading": "reading_teacher_node",
    "Speaking": "speaking_teacher_node",
    "Writing": "writing_teacher_node",
    "Listening": "listening_teacher_node",
}

_QUESTION_TYPE_DETAILS = {
    "MULTIPLE_CHOICE_SINGLE": {
        "skills": ("Reading", "Listening"),
        "description": "Select the single best answer from four options.",
        "instruction": "Write clear A-D options with one unambiguously correct answer. Use plausible distractors based on likely misreadings, not unsupported facts.",
    },
    "MULTIPLE_CHOICE_MULTI": {
        "skills": ("Reading", "Listening"),
        "description": "Select exactly two correct answers from four options.",
        "instruction": "Write four A-D options and exactly two correct answers. State that two answers are required and separate their answer letters with a comma.",
    },
    "TRUE_FALSE_NOT_GIVEN": {
        "skills": ("Reading",),
        "description": "Classify each statement as True, False, or Not Given by comparing it with explicit passage facts.",
        "instruction": "Write factual statements. True means the passage explicitly supports the statement; False means it explicitly contradicts it; Not Given means the passage provides insufficient information. Never treat a plausible inference as stated fact.",
    },
    "YES_NO_NOT_GIVEN": {
        "skills": ("Reading",),
        "description": "Classify each statement as Yes, No, or Not Given against the writer's expressed views or claims.",
        "instruction": "Focus on the writer's opinions, claims, or attitudes rather than objective facts. Yes agrees with the writer, No contradicts the writer, and Not Given is not expressed.",
    },
    "MATCHING_HEADINGS": {
        "skills": ("Reading",),
        "description": "Match each paragraph to a heading that summarizes its central idea.",
        "instruction": "Give each paragraph a label and provide a shared list of concise headings with unique labels. Include more headings than paragraphs so some remain unused. The correct heading must capture the paragraph's main idea, not a minor detail.",
    },
    "MATCHING_INFORMATION": {
        "skills": ("Reading",),
        "description": "Match a specific fact, example, explanation, or detail to the paragraph where it appears.",
        "instruction": "Provide paragraph labels and a shared list of distinct information statements. Questions must ask where a particular detail is mentioned, not which paragraph has the main idea. Allow paragraph labels to be reused when appropriate.",
    },
    "MATCHING_FEATURES": {
        "skills": ("Reading", "Listening"),
        "description": "Match statements to people, places, items, or theories from a shared option list.",
        "instruction": "Provide a shared list of clearly labelled features and ask which feature is associated with each statement. Make each answer traceable to the passage or recording; state whether options may be reused.",
    },
    "MATCHING_SENTENCE_ENDINGS": {
        "skills": ("Reading",),
        "description": "Match each sentence beginning to the ending that completes its meaning.",
        "instruction": "Provide sentence beginnings as prompts and a shared labelled list of endings. Only one ending should fit each beginning based on the passage; include plausible extra endings where suitable.",
    },
    "SENTENCE_COMPLETION": {
        "skills": ("Reading", "Listening"),
        "description": "Complete a sentence with exact words or a short phrase from the source, within the stated word limit.",
        "instruction": "Put one blank in each complete sentence. The answer must use the exact word(s) found in the passage or transcript, preserve grammatical fit, and contain no more than TWO WORDS.",
    },
    "SUMMARY_COMPLETION": {
        "skills": ("Reading", "Listening"),
        "description": "Fill gaps in a short summary using source wording or a defined set of options.",
        "instruction": "Use a concise summary that follows the source's meaning and sequence. Each blank must have a uniquely supported answer of no more than TWO WORDS; if using options, include their labelled shared list.",
    },
    "NOTE_COMPLETION": {
        "skills": ("Reading", "Listening"),
        "description": "Complete structured notes with key names, facts, dates, or phrases from the source.",
        "instruction": "Present concise notes with one clear blank per question. Answers must be stated in the source and contain no more than TWO WORDS.",
    },
    "TABLE_COMPLETION": {
        "skills": ("Reading", "Listening"),
        "description": "Fill missing table cells with source details that fit the row and column headings.",
        "instruction": "Provide meaningful row and column context in each prompt. Each answer must be an exact source detail of no more than TWO WORDS and fit its cell grammatically and logically.",
    },
    "FLOW_CHART_COMPLETION": {
        "skills": ("Reading", "Listening"),
        "description": "Complete missing steps in a process in the order described by the source.",
        "instruction": "Show the process sequence and leave a clear blank for each missing step. Answers must be supported by the source, appear in the correct order, and contain no more than TWO WORDS.",
    },
    "DIAGRAM_LABEL_COMPLETION": {
        "skills": ("Reading",),
        "description": "Label parts of a diagram using names or short phrases supported by the passage.",
        "instruction": "Describe the relevant diagram structure and identify each label position in the prompt because no image is supplied. Answers must be source-based and contain no more than TWO WORDS.",
    },
    "SHORT_ANSWER": {
        "skills": ("Reading", "Listening"),
        "description": "Answer focused factual questions briefly using source information.",
        "instruction": "Ask direct questions with a concise, uniquely supported answer. Set the word limit to NO MORE THAN THREE WORDS and do not require explanation beyond the answer.",
    },
    "MAP_PLAN_LABELING": {
        "skills": ("Listening",),
        "description": "Identify locations on a map or plan from spoken directions and match them to labelled options.",
        "instruction": "Describe a coherent map or plan layout in the prompts, give labelled location options in SharedOptions, and make every answer depend on spoken directional clues in the transcript.",
    },
    "FORM_COMPLETION": {
        "skills": ("Listening",),
        "description": "Complete form fields such as names, dates, contact details, and requirements from the recording.",
        "instruction": "Create a realistic form with clearly labelled fields. The transcript must state every missing value explicitly; answers must contain no more than TWO WORDS.",
    },
}

_WORD_LIMITS = {
    "SENTENCE_COMPLETION": "NO MORE THAN TWO WORDS",
    "SUMMARY_COMPLETION": "NO MORE THAN TWO WORDS",
    "NOTE_COMPLETION": "NO MORE THAN TWO WORDS",
    "TABLE_COMPLETION": "NO MORE THAN TWO WORDS",
    "FLOW_CHART_COMPLETION": "NO MORE THAN TWO WORDS",
    "DIAGRAM_LABEL_COMPLETION": "NO MORE THAN TWO WORDS",
    "FORM_COMPLETION": "NO MORE THAN TWO WORDS",
    "SHORT_ANSWER": "NO MORE THAN THREE WORDS",
}

# Types whose Options must be a JSON array of choices
_NEEDS_OPTIONS = {"MULTIPLE_CHOICE_SINGLE", "MULTIPLE_CHOICE_MULTI"}
# Types whose group must carry a shared option list
_NEEDS_SHARED_OPTIONS = {
    "MATCHING_HEADINGS", "MATCHING_INFORMATION", "MATCHING_FEATURES",
    "MATCHING_SENTENCE_ENDINGS", "MAP_PLAN_LABELING",
}


def _canonical_skill(name: Any) -> Optional[str]:
    """Case-insensitive skill match -> canonical skill name or None."""
    s = str(name or "").strip().lower()
    return next((k for k in _ALL_SKILLS if k.lower() == s), None)


@_node_guard("question_type_node")
def question_type_node(state: QuizState) -> Dict[str, Any]:
    """Resolve the requested IELTS question format into detailed generation guidance."""
    skill = _canonical_skill(state.get("selected_skill"))
    if skill not in ("Reading", "Listening"):
        # Speaking / Writing / All: no single question type applies
        return {
            "selected_question_type": None,
            "selected_question_type_skill": None,
            "question_type_description": "",
            "question_type_instruction": "",
        }

    code = str(state.get("selected_question_type") or "MULTIPLE_CHOICE_SINGLE").strip().upper()
    details = _QUESTION_TYPE_DETAILS.get(code)
    if details is None or skill not in details["skills"]:
        raise ValueError(f"Question type '{code}' is not supported for {skill}.")

    return {
        "selected_question_type": code,
        "selected_question_type_skill": skill,
        "question_type_description": details["description"],
        "question_type_instruction": details["instruction"],
    }


@_node_guard("orchestrator_node")
def orchestrator_node(state: QuizState) -> Dict[str, Any]:
    _trace("TOOL CALLED: orchestrator_node")
    selected = str(state.get("selected_skill", "Reading")).strip()
    # Least privilege by default; the backend passes the real entitlement from Package.
    allowed = set(state.get("allowed_skills") or ["Reading", "Listening"])

    if selected.lower() in ("all", "toàn bộ", "toan bo"):
        requested = _ALL_SKILLS
    else:
        match = next((s for s in _ALL_SKILLS if s.lower() in selected.lower()), None)
        if match is None:
            return {
                "allocated_teachers": [],
                "status": "ERROR",
                "error_message": f"Unknown skill: '{selected}'",
            }
        requested = [match]

    teachers = [s for s in requested if s in allowed]
    if not teachers:
        return {
            "allocated_teachers": [],
            "status": "ERROR",
            "error_message": f"Skill '{selected}' is not included in the user's package.",
        }

    return {
        "allocated_teachers": teachers
    }


# --------------------------------------------------------------------------
# Payload parsing / normalization / validation
# --------------------------------------------------------------------------
def _parse_llm_json_payload(raw_response: Any) -> Dict[str, Any]:
    """Convert LLM output into a JSON dictionary. Accepts plain JSON, code fences, or nested strings."""
    if isinstance(raw_response, dict):
        return raw_response

    text = str(raw_response).strip()
    if not text:
        raise ValueError("LLM response is empty.")

    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text, flags=re.I)

    first_brace = text.find("{")
    last_brace = text.rfind("}")
    if first_brace != -1 and last_brace > first_brace:
        text = text[first_brace:last_brace + 1]

    return json.loads(text)


def _json_text_or_none(value: Any, what: str) -> Optional[str]:
    """
    Return value as a valid JSON string (or None). list/dict are dumped; a string must
    already be valid JSON, otherwise ValueError (so the retry loop asks the LLM again).
    """
    if value is None:
        return None
    if isinstance(value, (dict, list)):
        return json.dumps(value, ensure_ascii=False) if value else None
    text = str(value).strip()
    if not text:
        return None
    try:
        json.loads(text)
    except ValueError:
        raise ValueError(f"{what} is not valid JSON: {text[:80]}")
    return text


def _normalize_question_groups(groups: Any, selected_question_type: Optional[str]) -> List[Any]:
    normalized_groups = list(groups or [])
    for idx, group in enumerate(normalized_groups):
        if not isinstance(group, dict):
            raise ValueError("QuestionGroup must be an object.")

        code = str(
            selected_question_type or group.get("QuestionTypeCode") or "MULTIPLE_CHOICE_SINGLE"
        ).strip().upper()
        if code not in _QUESTION_TYPE_DETAILS:
            raise ValueError(f"Unknown QuestionTypeCode '{code}'.")

        # The backend resolves QuestionTypeCode -> QuestionTypeID via QuestionTypeCatalog.Code;
        # never send a hardcoded ID.
        group.pop("QuestionTypeID", None)
        group["QuestionTypeCode"] = code
        group["Instruction"] = str(
            group.get("Instruction") or _QUESTION_TYPE_DETAILS[code]["description"]
        ).strip()
        group["OrderIndex"] = idx + 1
        if code in _WORD_LIMITS:
            group["WordLimit"] = group.get("WordLimit") or _WORD_LIMITS[code]
        group["SharedOptions"] = _json_text_or_none(group.get("SharedOptions"), "SharedOptions")

        questions = list(group.get("Questions") or [])
        for q_idx, question in enumerate(questions):
            if not isinstance(question, dict):
                raise ValueError("Question must be an object.")
            question.pop("QuestionTypeID", None)
            question["QuestionType"] = code
            question["QuestionTypeCode"] = code
            question["OrderIndex"] = q_idx + 1
            question["Options"] = _json_text_or_none(question.get("Options"), "Options")
            answer = question.get("CorrectAnswer")
            if isinstance(answer, list):
                answer = ",".join(str(a).strip() for a in answer)
            question["CorrectAnswer"] = str(answer or "").strip()
            question["Content"] = str(question.get("Content") or "").strip()
            question["Explanation"] = str(question.get("Explanation") or "").strip()
        group["Questions"] = questions
    return normalized_groups


def _validate_question_groups(groups: List[Any]) -> None:
    total = 0
    for group in groups:
        code = group.get("QuestionTypeCode")
        if code in _NEEDS_SHARED_OPTIONS and not group.get("SharedOptions"):
            raise ValueError(f"{code} requires SharedOptions.")
        for q in group.get("Questions", []):
            for field in ("Content", "CorrectAnswer", "Explanation"):
                if not q.get(field):
                    raise ValueError(f"Question has empty '{field}'.")
            if code in _NEEDS_OPTIONS:
                options = json.loads(q["Options"]) if q.get("Options") else None
                if not isinstance(options, list) or len(options) < 2:
                    raise ValueError(f"{code} requires Options as a JSON array of choices.")
            total += 1
    if total < 4:
        raise ValueError(f"Only {total} questions generated; at least 4 required.")


def _require_text(value: Any, field: str, min_words: int = 1) -> str:
    text = str(value or "").strip()
    if len(text.split()) < min_words:
        raise ValueError(f"'{field}' is empty or too short.")
    return text


def _require_str_list(value: Any, field: str, min_items: int) -> List[str]:
    items = [str(v).strip() for v in (value or []) if str(v).strip()]
    if len(items) < min_items:
        raise ValueError(f"'{field}' needs at least {min_items} items.")
    return items


def _normalize_and_validate_payload(
    skill_name: str,
    payload: Dict[str, Any],
    topic: str,
    level: str,
    selected_question_type: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Normalize a teacher payload into the backend shape and validate it.
    Raises ValueError for invalid/empty/placeholder content — no defaults are invented
    for real content (passage, transcript, questions, sample answers).
    """
    result = dict(payload or {})
    level_enum = _band_to_level(level)
    result["Skill"] = skill_name
    result["Title"] = str(result.get("Title") or f"IELTS {skill_name}: {topic}").strip()
    result["Level"] = str(result.get("Level") or level)

    if skill_name == "Reading":
        passage = dict(result.get("Passage") or {})
        content = _require_text(passage.get("Content"), "Passage.Content", min_words=100)
        passage["Title"] = str(passage.get("Title") or f"Academic Reading: {topic}").strip()
        passage["Content"] = content
        passage["Topic"] = str(passage.get("Topic") or topic).strip()
        passage["Level"] = level_enum
        passage["WordCount"] = len(content.split())
        result["Passage"] = passage
        result["QuestionGroups"] = _normalize_question_groups(result.get("QuestionGroups"), selected_question_type)
        _validate_question_groups(result["QuestionGroups"])

    elif skill_name == "Listening":
        section = dict(result.get("ListeningSection") or {})
        section["Transcript"] = _require_text(section.get("Transcript"), "ListeningSection.Transcript", min_words=100)
        result["ListeningSection"] = section
        result["QuestionGroups"] = _normalize_question_groups(result.get("QuestionGroups"), selected_question_type)
        _validate_question_groups(result["QuestionGroups"])

    elif skill_name == "Speaking":
        result["WebSource"] = str(result.get("WebSource") or "Generated from source material")
        result["Part1"] = _require_str_list(result.get("Part1"), "Part1", 3)
        result["Part2_CueCard"] = _require_text(result.get("Part2_CueCard"), "Part2_CueCard", 5)
        result["Part2_Sample"] = _require_text(result.get("Part2_Sample"), "Part2_Sample", 50)
        result["Part3"] = _require_str_list(result.get("Part3"), "Part3", 3)
        vocab = [v for v in (result.get("Vocabulary") or []) if isinstance(v, dict) and v.get("term")]
        result["Vocabulary"] = vocab

    elif skill_name == "Writing":
        section = dict(result.get("WritingSection") or {})
        task1 = dict(section.get("Task1") or {})
        task2 = dict(section.get("Task2") or {})
        task1["Prompt"] = _require_text(task1.get("Prompt"), "Task1.Prompt", 8)
        task1["ModelAnswer"] = _require_text(task1.get("ModelAnswer"), "Task1.ModelAnswer", 80)
        task1.setdefault("ChartImagePath", "")
        task2["Prompt"] = _require_text(task2.get("Prompt"), "Task2.Prompt", 8)
        task2["ModelEssay"] = _require_text(task2.get("ModelEssay"), "Task2.ModelEssay", 150)
        section["Task1"] = task1
        section["Task2"] = task2
        result["WritingSection"] = section

    return result


# --------------------------------------------------------------------------
# Skill Prompt Builders — Context-aware
# --------------------------------------------------------------------------
def _format_guidance(context_bundle: Dict[str, Any], skill_name: str) -> str:
    if context_bundle.get("question_type_skill") != skill_name:
        return ""
    return (
        f"Required question type: {context_bundle.get('question_type_code')}\n"
        f"What this format tests: {context_bundle.get('question_type_description', '')}\n"
        f"Format-specific construction rules: {context_bundle.get('question_type_instruction', '')}\n"
        "For matching formats, SharedOptions must be a JSON array of strings (e.g. [\"A. ...\", \"B. ...\"]).\n"
        "Use this format for every question in the generated group; do not substitute another question type.\n\n"
    )


def _build_skill_prompt(
    skill_name: str,
    context_bundle: Dict[str, Any],
    prior_context_str: str,
) -> str:
    """Build a context-aware prompt for each skill teacher agent."""
    topic = context_bundle.get("topic", "General Academic")
    level = context_bundle.get("level", "Band 7.0 - 7.5")
    tier = context_bundle.get("tier", "Gold")
    summary = context_bundle.get("summary", "")
    key_concepts = context_bundle.get("key_concepts", [])
    source_preview = context_bundle.get("source_text_preview", "")
    question_type_code = context_bundle.get("question_type_code") or "MULTIPLE_CHOICE_SINGLE"

    key_concepts_str = ", ".join(key_concepts) if key_concepts else "N/A"

    base = (
        "You are generating a REAL IELTS quiz from the provided source material. "
        "Return ONLY valid JSON — no markdown fences, no comments, no extra text. "
        "Generate REAL questions directly based on the source content. "
        "Do NOT use placeholder text like 'Question 1' or empty strings. "
        "Every question MUST have a non-empty 'Content', 'CorrectAnswer', and 'Explanation'.\n\n"
        f"--- SHARED CONTEXT ---\n"
        f"Topic: {topic}\n"
        f"Summary: {summary}\n"
        f"Key Concepts: {key_concepts_str}\n"
        f"Target Level: {level}\n"
        f"User Tier: {tier}\n"
        f"Source Text Preview:\n{source_preview}\n\n"
        f"--- PRIOR GENERATED CONTENT (avoid duplicating these) ---\n"
        f"{prior_context_str}\n\n"
        f"--- TASK ---\n"
    )

    question_group_schema = (
        '  "QuestionGroups": [\n'
        '    {\n'
        f'      "QuestionTypeCode": "{question_type_code}",\n'
        '      "Instruction": string,\n'
        '      "SharedOptions": [string] or null,   // JSON array, never a plain string\n'
        '      "WordLimit": string or null,\n'
        '      "Questions": [\n'
        '        {\n'
        f'          "QuestionTypeCode": "{question_type_code}",\n'
        '          "Content": string,    // Non-empty question text\n'
        '          "Options": [string] or null,  // JSON array e.g. ["A. ...","B. ...","C. ...","D. ..."] for multiple choice; otherwise null\n'
        '          "CorrectAnswer": string,  // e.g. "A" (multi-answer: "A,C")\n'
        '          "Explanation": string     // Brief reason\n'
        '        }\n'
        '      ]  // Include at least 4 questions\n'
        '    }\n'
        '  ]\n'
    )

    if skill_name == "Reading":
        return (
            base +
            _format_guidance(context_bundle, skill_name) +
            "Generate an IELTS Academic Reading test. Schema:\n"
            "{\n"
            '  "Title": string,\n'
            '  "Skill": "Reading",\n'
            '  "Level": string,\n'
            '  "Passage": {\n'
            '    "Title": string,\n'
            '    "Content": string,  // Full passage 250-400 words drawn from or inspired by the source text\n'
            '    "Topic": string\n'
            '  },\n'
            + question_group_schema +
            "}"
        )

    if skill_name == "Listening":
        return (
            base +
            _format_guidance(context_bundle, skill_name) +
            "Generate an IELTS Listening section. Create a realistic dialogue or monologue transcript (300-500 words) "
            "related to the topic, then write comprehension questions. Schema:\n"
            "{\n"
            '  "Title": string,\n'
            '  "Skill": "Listening",\n'
            '  "Level": string,\n'
            '  "ListeningSection": {\n'
            '    "Transcript": string  // 300-500 word dialogue/monologue grounded in the source topic\n'
            '  },\n'
            + question_group_schema +
            "}"
        )

    if skill_name == "Speaking":
        return (
            base +
            "Generate an IELTS Speaking test (Parts 1, 2, 3) based on the topic. Schema:\n"
            "{\n"
            '  "Title": string,\n'
            '  "Skill": "Speaking",\n'
            '  "Level": string,\n'
            '  "WebSource": string,\n'
            '  "Part1": [string],      // 4-5 general questions related to the topic\n'
            '  "Part2_CueCard": string, // 1 individual long-turn cue card prompt (2-3 sentences)\n'
            '  "Part2_Sample": string,  // 150-200 word band 7+ sample answer\n'
            '  "Part3": [string],       // 4-5 analytical discussion questions related to Part 2\n'
            '  "Vocabulary": [\n'
            '    {"term": string, "meaning": string}\n'
            '  ]  // 5-6 topic-specific vocabulary items with clear meanings\n'
            "}"
        )

    if skill_name == "Writing":
        return (
            base +
            "Generate an IELTS Writing test (Task 1 & Task 2). Schema:\n"
            "{\n"
            '  "Title": string,\n'
            '  "Skill": "Writing",\n'
            '  "Level": string,\n'
            '  "WritingSection": {\n'
            '    "Task1": {\n'
            '      "Prompt": string,       // Describe/summarize a chart, graph, or process related to the topic\n'
            '      "ChartImagePath": "",\n'
            '      "ModelAnswer": string   // 160-200 word Band 7+ Task 1 model answer\n'
            '    },\n'
            '    "Task2": {\n'
            '      "Prompt": string,       // IELTS essay question: discuss, argue, or evaluate related to topic\n'
            '      "ModelEssay": string    // 260-300 word Band 7+ model essay with intro, body, conclusion\n'
            '    }\n'
            '  }\n'
            "}"
        )

    raise ValueError(f"Unsupported skill: {skill_name}")


# --------------------------------------------------------------------------
# Core LLM Generation with Context (validated, no placeholder fallback)
# --------------------------------------------------------------------------
def _generate_llm_skill_payload(state: QuizState, skill_name: str) -> Dict[str, Any]:
    """
    Call the LLM with a context-aware prompt for the given skill and validate the result.
    Raises RuntimeError if the LLM is unavailable or output stays invalid after 3 attempts;
    `_node_guard` turns that into status == "ERROR" so nothing is persisted.
    """
    llm = state.get("llm")
    if llm is None:
        raise RuntimeError("LLM is not configured; cannot generate quiz content.")

    topic = state.get("detected_topic", "General Academic")
    source_text = state.get("cleaned_text", "")
    target_level = state.get("target_level", "Band 7.0 - 7.5")

    context_bundle = dict(state.get("context_bundle") or _build_context_bundle(
        summary=state.get("summary", ""),
        topic=topic,
        level=target_level,
        tier=state.get("user_tier", "Gold"),
        source_text=source_text,
        key_concepts=state.get("key_concepts", []),
    ))

    selected_question_type = None
    if state.get("selected_question_type_skill") == skill_name:
        selected_question_type = state.get("selected_question_type")
        context_bundle.update({
            "question_type_skill": skill_name,
            "question_type_code": selected_question_type,
            "question_type_description": state.get("question_type_description", ""),
            "question_type_instruction": state.get("question_type_instruction", ""),
        })

    prompt = _build_skill_prompt(skill_name, context_bundle, _compact_prior_context(state))

    last_exc: Optional[Exception] = None
    for attempt in range(3):
        try:
            raw_payload = tool._invoke_llm(
                llm,
                prompt,
                skill=skill_name,
                topic=topic,
                # The prompt already has a preview; cap the full text to limit tokens.
                source_text=source_text[:4000],
                target_level=target_level,
                user_tier=state.get("user_tier", "Gold"),
            )
            parsed = _parse_llm_json_payload(raw_payload)
            result = _normalize_and_validate_payload(
                skill_name,
                parsed,
                topic,
                target_level,
                selected_question_type=selected_question_type,
            )
            _trace(f"LLM {skill_name.upper()} RESULT", {
                "title": result.get("Title"),
                "question_count": sum(
                    len(g.get("Questions", []))
                    for g in result.get("QuestionGroups", [])
                ) if "QuestionGroups" in result else "N/A"
            })
            return result
        except Exception as exc:
            last_exc = exc
            logger.warning("LLM generation failed for %s (attempt %d/3): %s", skill_name, attempt + 1, exc)
            if attempt < 2:
                time.sleep(2)

    raise RuntimeError(f"{skill_name} generation failed after 3 attempts: {last_exc}")


# --------------------------------------------------------------------------
# Teacher Nodes
# --------------------------------------------------------------------------
@_node_guard("reading_teacher_node")
def reading_teacher_node(state: QuizState) -> Dict[str, Any]:
    _trace("TOOL CALLED: reading_teacher_node")
    payload = _generate_llm_skill_payload(state, "Reading")
    _print_ai_answer("Reading teacher output", payload)
    return {"reading_result": payload}


@_node_guard("speaking_teacher_node")
def speaking_teacher_node(state: QuizState) -> Dict[str, Any]:
    _trace("TOOL CALLED: speaking_teacher_node")
    topic = state.get("detected_topic", "General Academic")

    # Fetch a web source for the speaking topic to enrich content
    web_source = "Generated from source material"
    try:
        search_results = search_web_tool(f"IELTS Speaking {topic}")
        if search_results and isinstance(search_results, list) and len(search_results) > 0:
            first = search_results[0]
            if isinstance(first, dict) and first.get("url"):
                web_source = first["url"]
    except Exception as exc:
        logger.warning("search_web_tool failed for Speaking topic '%s': %s", topic, exc)

    payload = _generate_llm_skill_payload(state, "Speaking")
    if web_source != "Generated from source material":
        payload["WebSource"] = web_source

    _print_ai_answer("Speaking teacher output", payload)
    return {"speaking_result": payload}


@_node_guard("writing_teacher_node")
def writing_teacher_node(state: QuizState) -> Dict[str, Any]:
    _trace("TOOL CALLED: writing_teacher_node")
    payload = _generate_llm_skill_payload(state, "Writing")
    _print_ai_answer("Writing teacher output", payload)
    return {"writing_result": payload}


@_node_guard("listening_teacher_node")
def listening_teacher_node(state: QuizState) -> Dict[str, Any]:
    _trace("TOOL CALLED: listening_teacher_node")
    payload = _generate_llm_skill_payload(state, "Listening")
    _print_ai_answer("Listening teacher output", payload)
    return {"listening_result": payload}


# --------------------------------------------------------------------------
# Node 7: Consolidation & Backend Sync (B4)
# --------------------------------------------------------------------------
def _backend_ok(response: Any) -> bool:
    """
    Decide whether the backend accepted the save. Adjust to the real shape returned by
    `post_to_sql_backend` if it differs (e.g. HTTP status field).
    """
    if not isinstance(response, dict) or not response:
        return False
    if response.get("success") is False:
        return False
    if response.get("error"):
        return False
    if str(response.get("status", "")).lower() in ("error", "failed", "fail"):
        return False
    return True


@_node_guard("backend_sync_node")
def backend_sync_node(state: QuizState) -> Dict[str, Any]:
    """
    Consolidate results from all executed teachers into a single payload, then POST
    to the C# backend. Values are mapped to the DB CHECK constraints
    (Level: Beginner/Intermediate/Advanced, Source: AI). A failed save ends the
    pipeline with status "ERROR" (nothing is exported).
    """
    topic = state.get("detected_topic", "General Academic")
    teachers = state.get("allocated_teachers") or ["Reading"]
    tool_params = _resolve_tool_params(state.get("tool_params"))
    level_enum = _band_to_level(state.get("target_level", ""))

    reading = state.get("reading_result")
    speaking = state.get("speaking_result")
    writing = state.get("writing_result")
    listening = state.get("listening_result")

    # Combine question groups (Reading first, then Listening)
    consolidated_groups: List[Dict[str, Any]] = []
    combined_passage = None

    if reading:
        consolidated_groups.extend(reading.get("QuestionGroups", []))
        combined_passage = reading.get("Passage")
    if listening:
        consolidated_groups.extend(listening.get("QuestionGroups", []))

    # Renumber globally: each teacher numbered from 1, which would collide when combined
    q_no = 0
    for g_idx, group in enumerate(consolidated_groups, start=1):
        group["OrderIndex"] = g_idx
        for question in group.get("Questions", []):
            q_no += 1
            question["OrderIndex"] = q_no

    if combined_passage:
        combined_passage = {**combined_passage, "Level": level_enum}

    listening_section = (listening or {}).get("ListeningSection") or {}

    quiz_title = state.get("quiz_title") or f"IELTS Comprehensive Assessment: {topic} ({', '.join(teachers)})"
    consolidated_quiz = {
        "Title": quiz_title,
        "Skill": "All" if len(teachers) > 1 else teachers[0],
        "Level": level_enum,
        "Source": "AI",
        "CreatorId": state.get("user_id"),
        "Passage": combined_passage,
        "Audio": {
            "AudioURL": None,
            "Transcript": listening_section.get("Transcript", ""),
            "Topic": topic,
        } if listening else None,
        "QuestionGroups": consolidated_groups,
        "SpeakingSection": speaking,
        "WritingSection": writing.get("WritingSection") if writing else None,
        "ListeningSection": listening.get("ListeningSection") if listening else None,
    }

    backend_url = tool_params.get("backend_url") or "http://localhost:5000/api/quiz/save"
    _trace("TOOL CALLED: post_to_sql_backend", {"url": backend_url})
    api_response = post_to_sql_backend(consolidated_quiz, url=backend_url)
    _trace("BACKEND SAVE RESPONSE", api_response)

    if not _backend_ok(api_response):
        return {
            "consolidated_quiz": consolidated_quiz,
            "backend_save_result": api_response,
            "status": "ERROR",
            "error_message": f"Backend save failed: {api_response}",
        }

    return {
        "consolidated_quiz": consolidated_quiz,
        "backend_save_result": api_response
    }


# --------------------------------------------------------------------------
# Node 8: Document Export & Knowledge Base Storage (B5)
# --------------------------------------------------------------------------
@_node_guard("export_knowledge_node")
def export_knowledge_node(state: QuizState) -> Dict[str, Any]:
    """
    Exports the generated test into Word (.docx) and Excel (.xlsx) with a per-run
    file name, and records the exported file metadata into the KnowledgeDocument table.
    """
    quiz = state.get("consolidated_quiz")
    if not quiz:
        return {"status": "ERROR", "error_message": "No consolidated quiz data to export."}

    tool_params = _resolve_tool_params(state.get("tool_params"))

    run_id = uuid.uuid4().hex[:12]
    export_dir = Path(tool_params["word_output_path"]).parent
    export_dir.mkdir(parents=True, exist_ok=True)
    word_name = f"ielts_quiz_{run_id}.docx"
    excel_name = f"ielts_quiz_{run_id}.xlsx"

    _trace("TOOL CALLED: export_to_word")
    word_path = export_to_word(quiz, output_path=str(export_dir / word_name))

    _trace("TOOL CALLED: export_to_excel")
    excel_path = export_to_excel(quiz, output_path=str(export_dir / excel_name))

    # Never store absolute server paths in the DB
    public_base = os.getenv("IELTS_EXPORT_PUBLIC_URL", "").rstrip("/")
    file_url = f"{public_base}/{word_name}" if public_base else word_name

    doc_summary = (
        f"IELTS Quiz: {quiz.get('Title')}\n"
        f"Skill: {quiz.get('Skill')} | Level: {quiz.get('Level')}\n"
        f"Passage Word Count: {quiz.get('Passage', {}).get('WordCount', 0) if quiz.get('Passage') else 0}\n"
        f"Total Question Groups: {len(quiz.get('QuestionGroups', []))}\n"
        f"Exported Files: Word ({word_name}), Excel ({excel_name})"
    )

    user_id = state.get("user_id")
    kb_payload = {
        "Title": quiz.get("Title", "IELTS Generated Quiz Document"),
        "Category": "AI_Quiz_Export",
        "Content": doc_summary,
        "FileURL": file_url,
        "Source": "System",
        "UploadedBy": None if not user_id or not str(user_id).strip() else str(user_id).strip()
    }
    knowledge_url = tool_params.get("knowledge_url") or "http://localhost:5000/api/quiz/knowledge"
    _trace("TOOL CALLED: save_to_knowledge_base", {"url": knowledge_url})
    kb_res = save_to_knowledge_base(kb_payload, url=knowledge_url)
    kb_doc_id = kb_res.get("docId") if isinstance(kb_res, dict) else None

    status = "SUCCESS_DEGRADED" if state.get("used_fallback") else "SUCCESS"
    return {
        "word_file_path": word_path,
        "excel_file_path": excel_path,
        "knowledge_doc_id": kb_doc_id,
        "status": status
    }


# --------------------------------------------------------------------------
# LangGraph Workflow Construction
# --------------------------------------------------------------------------
def _next_teacher_node(state: QuizState, after: Optional[str] = None) -> str:
    """Next allocated teacher in _TEACHER_ORDER (after `after`), else backend_sync_node."""
    teachers = state.get("allocated_teachers") or []
    start = 0 if after is None else _TEACHER_ORDER.index(after) + 1
    for skill in _TEACHER_ORDER[start:]:
        if skill in teachers:
            return _TEACHER_NODES[skill]
    return "backend_sync_node"


def build_quiz_graph():
    workflow = StateGraph(QuizState)

    workflow.add_node("ingest_node", ingest_node)
    workflow.add_node("guardrail_node", guardrail_node)
    workflow.add_node("preprocess_node", preprocess_node)
    workflow.add_node("summarizer_node", summarizer_node)
    workflow.add_node("question_type_node", question_type_node)
    workflow.add_node("orchestrator_node", orchestrator_node)

    workflow.add_node("reading_teacher_node", reading_teacher_node)
    workflow.add_node("speaking_teacher_node", speaking_teacher_node)
    workflow.add_node("writing_teacher_node", writing_teacher_node)
    workflow.add_node("listening_teacher_node", listening_teacher_node)

    workflow.add_node("backend_sync_node", backend_sync_node)
    workflow.add_node("export_knowledge_node", export_knowledge_node)

    workflow.set_entry_point("ingest_node")

    # An ingest failure (e.g. OCR error) ends the run immediately
    workflow.add_conditional_edges(
        "ingest_node",
        lambda s: END if s.get("status") == "ERROR" else "guardrail_node",
        {"guardrail_node": "guardrail_node", END: END},
    )
    workflow.add_conditional_edges(
        "guardrail_node",
        should_continue_after_guardrail,
        {"preprocess_node": "preprocess_node", END: END},
    )
    workflow.add_edge("preprocess_node", "summarizer_node")
    workflow.add_edge("summarizer_node", "question_type_node")
    workflow.add_edge("question_type_node", "orchestrator_node")

    # Orchestrator -> first allocated teacher; each teacher -> next allocated teacher
    all_targets = {name: name for name in [*_TEACHER_NODES.values(), "backend_sync_node"]}
    workflow.add_conditional_edges(
        "orchestrator_node",
        lambda s: _next_teacher_node(s, None),
        all_targets,
    )
    for skill in _TEACHER_ORDER:
        workflow.add_conditional_edges(
            _TEACHER_NODES[skill],
            lambda s, _skill=skill: _next_teacher_node(s, _skill),
            all_targets,
        )

    workflow.add_edge("backend_sync_node", "export_knowledge_node")
    workflow.add_edge("export_knowledge_node", END)

    return workflow.compile()


# Compile global app instance
quiz_app = build_quiz_graph()


# --------------------------------------------------------------------------
# Runner Function
# --------------------------------------------------------------------------
def run_quiz_pipeline(
    raw_input: Union[str, bytes],
    selected_skill: str = "Reading",
    input_type: str = "text",
    user_tier: str = "Gold",
    user_id: Optional[str] = None,
    quiz_title: Optional[str] = None,
    llm: Any = None,
    tool_params: Optional[Dict[str, Any]] = None,
    allowed_skills: Optional[List[str]] = None,
    selected_question_type: Optional[str] = None,
    raw_input_name: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Execute the compiled LangGraph workflow with input parameters.

    raw_input must be content (bytes / data URL / plain text), not a file path or URL.
    raw_input_name is the original file name (optional, helps pick a document parser).
    allowed_skills comes from the backend (Package.HasSpeakingAI / HasWritingAI);
    when omitted only Reading and Listening are allowed.
    """
    _trace("PIPELINE START", {"skill": selected_skill, "tier": user_tier, "input_type": input_type,
                              "allowed_skills": allowed_skills})
    if llm is None:
        llm = _load_default_llm()
    initial_state: QuizState = {
        "raw_input": raw_input,
        "raw_input_name": raw_input_name,
        "input_type": input_type,
        "selected_skill": selected_skill,
        "selected_question_type": selected_question_type,
        "selected_question_type_skill": None,
        "question_type_description": "",
        "question_type_instruction": "",
        "user_tier": user_tier,
        "allowed_skills": allowed_skills or ["Reading", "Listening"],
        "user_id": user_id,
        "quiz_title": quiz_title,
        "llm": llm,
        "tool_params": _resolve_tool_params(tool_params),
        "extracted_text": "",
        "guardrail_passed": False,
        "guardrail_reason": "",
        "cleaned_text": "",
        "summary": "",
        "detected_topic": "",
        "target_level": "",
        "key_concepts": [],
        "allocated_teachers": [],
        "context_bundle": None,
        "reading_result": None,
        "speaking_result": None,
        "writing_result": None,
        "listening_result": None,
        "consolidated_quiz": None,
        "backend_save_result": None,
        "word_file_path": None,
        "excel_file_path": None,
        "knowledge_doc_id": None,
        "status": "INIT",
        "error_message": None,
        "used_fallback": False
    }

    try:
        final_state = quiz_app.invoke(initial_state)
    except Exception as exc:
        # Last-resort catch-all: covers anything raised outside the node guards
        # (e.g. a routing function, or LangGraph itself).
        logger.exception("Pipeline crashed outside node-level guards")
        final_state = {
            **initial_state,
            "status": "ERROR",
            "error_message": f"Pipeline crashed: {exc}",
        }

    _trace("PIPELINE END", {"status": final_state.get("status"), "allocated_teachers": final_state.get("allocated_teachers")})
    return final_state