"""
IELTS Study Assistant - LangGraph Workflow Engine
Orchestrates the 5-step IELTS Quiz Generation Pipeline:
B1: Ingest & OCR
B2: Guardrails (Safety & Relevance)
B3: Data Preprocessing (Cleaning)
B4: Summarizer Agent (LLM-driven) & Orchestrator (Tier-based Teacher dispatch)
    -> Each teacher receives a shared context_bundle (summary, topic, key_concepts,
       prior_results) to avoid duplication and preserve cross-agent context.
    -> Parameterized SQL Sync (Draft / Pending review status)
B5: Word / Excel Export & Knowledge Base Storage
"""

import os
import re
import json
import uuid
import configparser
import logging
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
    generate_writing_chart,
    post_to_sql_backend,
    export_to_word,
    export_to_excel,
    save_to_knowledge_base
)

# LangGraph
from langgraph.graph import StateGraph, END

logger = logging.getLogger("ielts.ai_quiz")


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
        return response_json["choices"][0]["message"]["content"]


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
    input_type: str                  # "text" | "image"
    selected_skill: str              # "Reading" | "Speaking" | "Writing" | "Listening" | "All"
    user_tier: str                   # "Bronze" | "Silver" | "Gold" | "Đồng" | "Bạc" | "Vàng"
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
    key_concepts: List[str]           # Key vocabulary/concepts extracted by LLM or heuristic
    allocated_teachers: List[str]

    # Shared context bundle passed across all teacher agents to preserve cross-agent context
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
    used_fallback: bool


# --------------------------------------------------------------------------
# Helpers: Context Bundle
# --------------------------------------------------------------------------
def _build_context_bundle(
    summary: str,
    topic: str,
    level: str,
    tier: str,
    source_text: str,
    key_concepts: List[str],
    prior_results: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Build the shared context bundle passed between all teacher agents."""
    return {
        "summary": summary,
        "topic": topic,
        "level": level,
        "tier": tier,
        "source_text_preview": source_text[:1500],   # Compact preview for prompts
        "key_concepts": key_concepts,
        "prior_results": prior_results or {},
    }


def _compact_prior_context(state: "QuizState") -> str:
    """
    Return a compact JSON string of what teacher agents have already generated.
    Used to inject into subsequent teacher prompts so they avoid duplicating content.
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
def ingest_node(state: QuizState) -> Dict[str, Any]:
    _trace("TOOL CALLED: ingest_node", {"input_type": state.get("input_type", "text")})
    raw = state.get("raw_input", "")
    itype = state.get("input_type", "text").lower()

    if itype == "image" or isinstance(raw, bytes) or (isinstance(raw, str) and (raw.endswith(".png") or raw.endswith(".jpg") or raw.startswith("data:image"))):
        extracted = ocr_image_to_text(raw)
    elif itype == "pdf" or (isinstance(raw, str) and (raw.lower().endswith(".pdf") or raw.startswith("data:application/pdf") or raw.startswith("http") and raw.lower().endswith(".pdf"))):
        extracted = extract_document_text(raw, file_type="pdf", file_name=str(state.get("raw_input_name") or "document.pdf"))
    else:
        extracted = extract_document_text(raw, file_type=itype, file_name=str(state.get("raw_input_name") or ""))

    _trace("OCR RESULT", {
        "characters": len(extracted),
        "preview": extracted[:500],
        "has_error": extracted.startswith("[OCR_ERROR]")
    })

    return {
        "extracted_text": extracted,
        "status": "PROCESSING"
    }


# --------------------------------------------------------------------------
# Node 2: Guardrail Safety & Relevance (B2)
# --------------------------------------------------------------------------
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
    if state.get("guardrail_passed", False):
        return "preprocess_node"
    return END


# --------------------------------------------------------------------------
# Node 3: Clean Text / Data Preprocessing (B3)
# --------------------------------------------------------------------------
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


def summarizer_node(state: QuizState) -> Dict[str, Any]:
    """
    LLM-driven summarizer: extracts summary, topic, target_level, and key_concepts.
    Falls back to heuristic keyword matching when no LLM is available.
    Builds the initial context_bundle shared across all teacher agents.
    """
    _trace("TOOL CALLED: summarizer_node")
    cleaned = state.get("cleaned_text", "")
    llm = state.get("llm")
    tier = state.get("user_tier", "Gold")

    summary = ""
    topic = ""
    target_level = "Band 7.0 - 7.5 (Advanced / Academic)"
    key_concepts: List[str] = []

    # --- Attempt LLM-driven analysis ---
    used_fallback = state.get("used_fallback", False)
    if llm is not None:
        for attempt in range(3):
            try:
                # Limit source text to avoid token overflow while preserving meaning
                source_preview = cleaned[:4000] if len(cleaned) > 4000 else cleaned
                raw_response = tool._invoke_llm(
                    llm,
                    _SUMMARIZER_PROMPT,
                    source_text=source_preview,
                )
                text_resp = str(raw_response).strip()
                # Strip markdown fences if present
                text_resp = re.sub(r"^```(?:json)?\s*|\s*```$", "", text_resp, flags=re.I).strip()
                # Extract JSON object
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

    # Build the initial shared context_bundle for downstream teacher nodes
    context_bundle = _build_context_bundle(
        summary=summary,
        topic=topic,
        level=target_level,
        tier=tier,
        source_text=cleaned,
        key_concepts=key_concepts,
        prior_results={},
    )

    return {
        "summary": summary,
        "detected_topic": topic,
        "target_level": target_level,
        "key_concepts": key_concepts,
        "context_bundle": context_bundle,
        "used_fallback": used_fallback
    }


# --------------------------------------------------------------------------
# Node 5: Orchestrator Agent (B4 - Tier & Skill Routing)
# --------------------------------------------------------------------------
def orchestrator_node(state: QuizState) -> Dict[str, Any]:
    _trace("TOOL CALLED: orchestrator_node")
    selected_skill = state.get("selected_skill", "Reading").strip()
    tier_raw = state.get("user_tier", "Gold").lower()

    is_bronze = any(b in tier_raw for b in ["bronze", "đồng", "dong"])

    # Map skill selection
    if selected_skill.lower() in ["all", "toàn bộ", "toan bo"]:
        if is_bronze:
            # Bronze users get Reading & Listening
            teachers = ["Reading", "Listening"]
        else:
            # Silver and Gold get All 4 skills
            teachers = ["Reading", "Listening", "Speaking", "Writing"]
    else:
        # User selected 1 specific skill
        norm_skill = "Reading"
        for s in ["Reading", "Speaking", "Writing", "Listening"]:
            if s.lower() in selected_skill.lower():
                norm_skill = s
                break
        teachers = [norm_skill]

    return {
        "allocated_teachers": teachers
    }


# --------------------------------------------------------------------------
# Node 6: Teacher Execution Nodes (B4)
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


def _normalize_backend_payload(skill_name: str, payload: Dict[str, Any], source_text: str, topic: str, level: str) -> Dict[str, Any]:
    cleaned_payload = dict(payload or {})
    cleaned_payload["Skill"] = skill_name
    cleaned_payload["Title"] = str(cleaned_payload.get("Title") or f"IELTS {skill_name}: {topic}")
    cleaned_payload["Level"] = str(cleaned_payload.get("Level") or level)

    if skill_name == "Reading":
        passage = dict(cleaned_payload.get("Passage") or {})
        passage.setdefault("Title", f"Academic Reading: {topic}")
        passage.setdefault("Content", source_text or "Generated from source document.")
        passage.setdefault("Topic", topic)
        passage.setdefault("Level", "Academic")
        passage.setdefault("WordCount", len((source_text or "").split()))
        cleaned_payload["Passage"] = passage

        groups = list(cleaned_payload.get("QuestionGroups") or [])
        for idx, group in enumerate(groups):
            if not isinstance(group, dict):
                continue
            group.setdefault("QuestionTypeID", 1)
            group.setdefault("QuestionTypeCode", "MULTIPLE_CHOICE_SINGLE")
            group.setdefault("Instruction", f"Question set {idx + 1}")
            group.setdefault("OrderIndex", idx + 1)
            questions = list(group.get("Questions") or [])
            for q_idx, question in enumerate(questions):
                if isinstance(question, dict):
                    question.setdefault("QuestionType", "MULTIPLE_CHOICE_SINGLE")
                    question.setdefault("QuestionTypeID", 1)
                    question.setdefault("QuestionTypeCode", "MULTIPLE_CHOICE_SINGLE")
                    question.setdefault("OrderIndex", q_idx + 1)
            group["Questions"] = questions
        cleaned_payload["QuestionGroups"] = groups

    elif skill_name == "Listening":
        section = dict(cleaned_payload.get("ListeningSection") or {})
        section.setdefault("Transcript", source_text or "Generated from source document.")
        cleaned_payload["ListeningSection"] = section
        cleaned_payload["QuestionGroups"] = list(cleaned_payload.get("QuestionGroups") or [])

    elif skill_name == "Speaking":
        cleaned_payload.setdefault("WebSource", "Generated from source material")
        cleaned_payload.setdefault("Part1", [])
        cleaned_payload.setdefault("Part2_CueCard", f"Describe a relevant experience related to {topic}.")
        cleaned_payload.setdefault("Part2_Sample", f"This speaking sample is generated from the source material about {topic}.")
        cleaned_payload.setdefault("Part3", [])
        cleaned_payload.setdefault("Vocabulary", [])

    elif skill_name == "Writing":
        section = dict(cleaned_payload.get("WritingSection") or {})
        task1 = dict(section.get("Task1") or {})
        task2 = dict(section.get("Task2") or {})
        task1.setdefault("Prompt", f"Summarize the main trends and evidence related to {topic}.")
        task1.setdefault("ChartImagePath", "")
        task1.setdefault("ModelAnswer", f"This model answer is generated from the source material about {topic}.")
        task2.setdefault("Prompt", f"Discuss the role of {topic} in the modern context.")
        task2.setdefault("ModelEssay", f"This essay is generated from the source material about {topic}.")
        section["Task1"] = task1
        section["Task2"] = task2
        cleaned_payload["WritingSection"] = section

    return cleaned_payload


# --------------------------------------------------------------------------
# Skill Prompt Builders — Context-aware
# --------------------------------------------------------------------------

def _build_skill_prompt(
    skill_name: str,
    context_bundle: Dict[str, Any],
    prior_context_str: str,
) -> str:
    """
    Build a rich, context-aware prompt for each skill teacher agent.
    Each prompt carries:
      - context_bundle: summary, topic, level, tier, key_concepts, source_text_preview
      - prior_context_str: compact JSON of what previous teachers have already generated
    """
    topic = context_bundle.get("topic", "General Academic")
    level = context_bundle.get("level", "Band 7.0 - 7.5")
    tier = context_bundle.get("tier", "Gold")
    summary = context_bundle.get("summary", "")
    key_concepts = context_bundle.get("key_concepts", [])
    source_preview = context_bundle.get("source_text_preview", "")

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

    if skill_name == "Reading":
        return (
            base +
            "Generate an IELTS Academic Reading test. Schema:\n"
            "{\n"
            '  "Title": string,\n'
            '  "Skill": "Reading",\n'
            '  "Level": string,\n'
            '  "Passage": {\n'
            '    "Title": string,\n'
            '    "Content": string,  // Full passage 250-400 words drawn from or inspired by the source text\n'
            '    "Topic": string,\n'
            '    "Level": "Academic",\n'
            '    "WordCount": number\n'
            '  },\n'
            '  "QuestionGroups": [\n'
            '    {\n'
            '      "QuestionTypeID": 1,\n'
            '      "QuestionTypeCode": "MULTIPLE_CHOICE_SINGLE",\n'
            '      "Instruction": string,\n'
            '      "WordLimit": null,\n'
            '      "OrderIndex": 1,\n'
            '      "Questions": [\n'
            '        {\n'
            '          "QuestionType": "MULTIPLE_CHOICE_SINGLE",\n'
            '          "QuestionTypeID": 1,\n'
            '          "QuestionTypeCode": "MULTIPLE_CHOICE_SINGLE",\n'
            '          "Content": string,    // Non-empty question text\n'
            '          "Options": "A. ... | B. ... | C. ... | D. ...",  // 4 options\n'
            '          "CorrectAnswer": string,  // e.g. "A"\n'
            '          "Explanation": string,    // Brief reason\n'
            '          "OrderIndex": number\n'
            '        }\n'
            '      ]  // Include at least 4 questions\n'
            '    }\n'
            '  ]\n'
            "}"
        )

    if skill_name == "Listening":
        return (
            base +
            "Generate an IELTS Listening section. Create a realistic dialogue or monologue transcript (300-500 words) "
            "related to the topic, then write comprehension questions. Schema:\n"
            "{\n"
            '  "Title": string,\n'
            '  "Skill": "Listening",\n'
            '  "Level": string,\n'
            '  "ListeningSection": {\n'
            '    "Transcript": string  // 300-500 word dialogue/monologue grounded in the source topic\n'
            '  },\n'
            '  "QuestionGroups": [\n'
            '    {\n'
            '      "QuestionTypeID": 1,\n'
            '      "QuestionTypeCode": "MULTIPLE_CHOICE_SINGLE",\n'
            '      "Instruction": string,\n'
            '      "WordLimit": null,\n'
            '      "OrderIndex": 1,\n'
            '      "Questions": [\n'
            '        {\n'
            '          "QuestionType": "MULTIPLE_CHOICE_SINGLE",\n'
            '          "QuestionTypeID": 1,\n'
            '          "QuestionTypeCode": "MULTIPLE_CHOICE_SINGLE",\n'
            '          "Content": string,    // Non-empty comprehension question\n'
            '          "Options": "A. ... | B. ... | C. ... | D. ...",\n'
            '          "CorrectAnswer": string,\n'
            '          "Explanation": string,\n'
            '          "OrderIndex": number\n'
            '        }\n'
            '      ]  // Include at least 4 questions\n'
            '    }\n'
            '  ]\n'
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
# Core LLM Generation with Context
# --------------------------------------------------------------------------

def _generate_llm_skill_payload(
    state: QuizState,
    skill_name: str,
    fallback_factory,
) -> tuple[Dict[str, Any], bool]:
    """
    Call the LLM with a context-aware prompt for the given skill.
    Falls back to fallback_factory if LLM is unavailable or fails.
    """
    llm = state.get("llm")
    topic = state.get("detected_topic", "General Academic")
    source_text = state.get("cleaned_text", "")
    target_level = state.get("target_level", "Band 7.0 - 7.5")

    # Pull the shared context bundle; rebuild if missing (defensive)
    context_bundle = state.get("context_bundle") or _build_context_bundle(
        summary=state.get("summary", ""),
        topic=topic,
        level=target_level,
        tier=state.get("user_tier", "Gold"),
        source_text=source_text,
        key_concepts=state.get("key_concepts", []),
        prior_results={},
    )

    # Build prior context string from already-generated teacher results
    prior_context_str = _compact_prior_context(state)

    # Build the context-aware prompt
    prompt = _build_skill_prompt(skill_name, context_bundle, prior_context_str)

    used_fallback = state.get("used_fallback", False)
    if llm is not None:
        for attempt in range(3):
            try:
                raw_payload = tool._invoke_llm(
                    llm,
                    prompt,
                    skill=skill_name,
                    topic=topic,
                    source_text=source_text,
                    target_level=target_level,
                    user_tier=state.get("user_tier", "Gold"),
                )
                parsed = _parse_llm_json_payload(raw_payload)
                result = _normalize_backend_payload(skill_name, parsed, source_text, topic, target_level)
                _trace(f"LLM {skill_name.upper()} RESULT", {
                    "title": result.get("Title"),
                    "question_count": sum(
                        len(g.get("Questions", []))
                        for g in result.get("QuestionGroups", [])
                    ) if "QuestionGroups" in result else "N/A"
                })
                return result, used_fallback
            except Exception as exc:
                if attempt < 2:
                    logger.warning("LLM generation failed for %s (attempt %d/3); retrying: %s", skill_name, attempt + 1, exc)
                    time.sleep(2)
                else:
                    logger.warning("LLM generation failed for %s after 3 attempts; using fallback: %s", skill_name, exc)
                    used_fallback = True
    else:
        used_fallback = True

    return fallback_factory(state), used_fallback


# --------------------------------------------------------------------------
# Fallback Factories — Generate real questions, not empty arrays
# --------------------------------------------------------------------------

def _fallback_extract_sentences(text: str, max_sentences: int = 6) -> List[str]:
    """Extract meaningful sentences from source text for fallback question generation."""
    sentences = [s.strip() for s in re.split(r"[.!?]+", text) if len(s.strip()) > 30]
    return sentences[:max_sentences]


def _fallback_reading_questions(source_text: str, topic: str) -> List[Dict[str, Any]]:
    """Generate real MCQ questions from source text sentences as a non-LLM fallback."""
    sentences = _fallback_extract_sentences(source_text, 5)
    questions = []
    for idx, sentence in enumerate(sentences[:4]):
        # Create a fill-in-the-blank or paraphrase question from the sentence
        words = sentence.split()
        if len(words) < 6:
            continue
        # Mask the last meaningful word as the answer hint
        answer_word = words[-1].rstrip(".,;:")
        blank_sentence = " ".join(words[:-1]) + " ___"
        questions.append({
            "QuestionType": "MULTIPLE_CHOICE_SINGLE",
            "QuestionTypeID": 1,
            "QuestionTypeCode": "MULTIPLE_CHOICE_SINGLE",
            "Content": f"According to the passage, which word best completes the following: \"{blank_sentence}\"?",
            "Options": f"A. {answer_word} | B. however | C. therefore | D. although",
            "CorrectAnswer": "A",
            "Explanation": f"The passage states: \"{sentence}\", so '{answer_word}' is the correct completion.",
            "OrderIndex": idx + 1,
        })
    # Always return at least 1 question
    if not questions:
        questions.append({
            "QuestionType": "MULTIPLE_CHOICE_SINGLE",
            "QuestionTypeID": 1,
            "QuestionTypeCode": "MULTIPLE_CHOICE_SINGLE",
            "Content": f"What is the main theme of the passage about {topic}?",
            "Options": f"A. {topic} | B. Global economics | C. Sports and leisure | D. Historical architecture",
            "CorrectAnswer": "A",
            "Explanation": f"The passage is centered on the topic of {topic}.",
            "OrderIndex": 1,
        })
    return questions


def _fallback_listening_questions(topic: str) -> List[Dict[str, Any]]:
    """Generate listening comprehension questions as a non-LLM fallback."""
    return [
        {
            "QuestionType": "MULTIPLE_CHOICE_SINGLE",
            "QuestionTypeID": 1,
            "QuestionTypeCode": "MULTIPLE_CHOICE_SINGLE",
            "Content": f"What is the main topic discussed in the audio recording?",
            "Options": f"A. {topic} | B. Weather forecasting | C. Sports events | D. Cooking techniques",
            "CorrectAnswer": "A",
            "Explanation": f"The audio recording focuses on the subject of {topic}.",
            "OrderIndex": 1,
        },
        {
            "QuestionType": "MULTIPLE_CHOICE_SINGLE",
            "QuestionTypeID": 1,
            "QuestionTypeCode": "MULTIPLE_CHOICE_SINGLE",
            "Content": "What does the speaker suggest as the most important factor?",
            "Options": "A. Research and evidence | B. Personal opinion | C. Traditional methods | D. Historical data",
            "CorrectAnswer": "A",
            "Explanation": "The speaker emphasizes research and evidence as the foundation of their argument.",
            "OrderIndex": 2,
        },
    ]


# --------------------------------------------------------------------------
# Teacher Nodes
# --------------------------------------------------------------------------

def reading_teacher_node(state: QuizState) -> Dict[str, Any]:
    """Generate a full Reading test using LLM with context; falls back to heuristic questions."""
    _trace("TOOL CALLED: reading_teacher_node")
    topic = state.get("detected_topic", "General Academic")
    source_text = state.get("cleaned_text", "")
    target_level = state.get("target_level", "Band 7.0 - 7.5")

    def fallback_factory(_state):
        safe_text = (_state.get("cleaned_text") or "").strip()
        _topic = _state.get("detected_topic", "General Academic")
        _level = _state.get("target_level", "Band 7.0 - 7.5")
        questions = _fallback_reading_questions(safe_text, _topic)
        payload = {
            "Title": f"IELTS Reading: {_topic}",
            "Skill": "Reading",
            "Level": _level,
            "Passage": {
                "Title": f"Academic Reading: {_topic}",
                "Content": safe_text or f"This passage examines key aspects of {_topic} from an academic perspective.",
                "Topic": _topic,
                "Level": "Academic",
                "WordCount": len((safe_text or "").split())
            },
            "QuestionGroups": [
                {
                    "QuestionTypeID": 1,
                    "QuestionTypeCode": "MULTIPLE_CHOICE_SINGLE",
                    "Instruction": "Choose the best answer A, B, C, or D based on the passage.",
                    "WordLimit": None,
                    "OrderIndex": 1,
                    "Questions": questions,
                }
            ],
        }
        return _normalize_backend_payload("Reading", payload, safe_text, _topic, _level)

    payload, used_fallback = _generate_llm_skill_payload(state, "Reading", fallback_factory)

    # Update context_bundle with reading results for downstream teachers
    bundle = dict(state.get("context_bundle") or {})
    bundle.setdefault("prior_results", {})
    groups = payload.get("QuestionGroups", [])
    bundle["prior_results"]["reading"] = {
        "passage_title": (payload.get("Passage") or {}).get("Title", ""),
        "question_count": sum(len(g.get("Questions", [])) for g in groups),
    }

    return {"reading_result": payload, "context_bundle": bundle, "used_fallback": used_fallback}


def speaking_teacher_node(state: QuizState) -> Dict[str, Any]:
    """Generate a full Speaking test (Parts 1-3) using LLM with context."""
    _trace("TOOL CALLED: speaking_teacher_node")
    topic = state.get("detected_topic", "General Academic")
    target_level = state.get("target_level", "Band 7.5 - 8.5")

    # Fetch a web source for the speaking topic to enrich content
    web_source = "Generated from source material"
    try:
        search_results = search_web_tool(f"IELTS Speaking {topic}")
        if search_results and isinstance(search_results, list) and len(search_results) > 0:
            first = search_results[0]
            if isinstance(first, dict) and first.get("url"):
                web_source = first["url"]
    except Exception:
        pass

    def fallback_factory(_state):
        _topic = _state.get("detected_topic", "General Academic")
        _level = _state.get("target_level", "Band 7.5 - 8.5")
        payload = {
            "Title": f"IELTS Speaking: {_topic}",
            "Skill": "Speaking",
            "Level": _level,
            "WebSource": web_source,
            "Part1": [
                f"How interested are you in {_topic}?",
                f"Do you think {_topic} affects daily life? Why?",
                f"Have you ever studied or read about {_topic}?",
                f"What do most people in your country think about {_topic}?",
            ],
            "Part2_CueCard": (
                f"Describe an experience or situation related to {_topic}.\n"
                f"You should say:\n"
                f" - what it was\n"
                f" - when and where it happened\n"
                f" - why it was significant to you\n"
                f"And explain what you learned from it."
            ),
            "Part2_Sample": (
                f"I'd like to talk about an experience I had related to {_topic}. "
                f"It happened a few years ago when I was studying for my exams. "
                f"I came across a comprehensive article on {_topic} that really opened my eyes. "
                f"The key insight was that understanding {_topic} requires both theoretical knowledge and practical application. "
                f"Since then, I've tried to keep up with the latest developments in this area, "
                f"and I believe it has significantly enriched my understanding of the world around me."
            ),
            "Part3": [
                f"In what ways do you think {_topic} will change in the next decade?",
                f"Do governments have a responsibility to address issues related to {_topic}?",
                f"How does {_topic} differ across different cultures or countries?",
                f"Some people argue that {_topic} has both benefits and drawbacks. Do you agree?",
            ],
            "Vocabulary": [
                {"term": "pivotal", "meaning": "of crucial importance; central"},
                {"term": "encompass", "meaning": "to include or contain within itself"},
                {"term": "nuanced", "meaning": "characterized by subtle shades of meaning"},
                {"term": "proliferate", "meaning": "to increase rapidly in number"},
                {"term": "paradigm shift", "meaning": "a fundamental change in approach or assumptions"},
            ],
        }
        return _normalize_backend_payload("Speaking", payload, _state.get("cleaned_text", ""), _topic, _level)

    payload, used_fallback = _generate_llm_skill_payload(state, "Speaking", fallback_factory)

    # Ensure the web source from search is preserved in the final payload
    if web_source != "Generated from source material":
        payload["WebSource"] = web_source

    # Update context_bundle for downstream teachers
    bundle = dict(state.get("context_bundle") or {})
    bundle.setdefault("prior_results", {})
    bundle["prior_results"]["speaking"] = {
        "part1_sample": (payload.get("Part1") or [])[:2],
        "cue_card": payload.get("Part2_CueCard", "")[:100],
    }

    return {"speaking_result": payload, "context_bundle": bundle, "used_fallback": used_fallback}



def writing_teacher_node(state: QuizState) -> Dict[str, Any]:
    """Generate a full Writing test (Task 1 & 2) using LLM with context."""
    _trace("TOOL CALLED: writing_teacher_node")
    topic = state.get("detected_topic", "Technology and Education")
    tool_params = _resolve_tool_params(state.get("tool_params"))

    def fallback_factory(_state):
        _topic = _state.get("detected_topic", "Technology and Education")
        _level = _state.get("target_level", "Band 8.0+")
        chart_path = generate_writing_chart(
            "bar",
            title=f"Data Trends for {_topic}",
            x_labels=["2015", "2018", "2021", "2024"],
            series_data={"Growth (%)": [20, 35, 55, 72]},
            output_path=tool_params.get("chart_output_path") or str(Path(__file__).resolve().parents[1] / "exports" / "charts" / "writing_chart.png")
        )
        payload = {
            "Title": f"IELTS Writing: {_topic}",
            "Skill": "Writing",
            "Level": _level,
            "WritingSection": {
                "Task1": {
                    "Prompt": (
                        f"The bar chart below shows the growth trends related to {_topic} "
                        f"between 2015 and 2024. Summarize the information by selecting and "
                        f"reporting the main features, and make comparisons where relevant."
                    ),
                    "ChartImagePath": chart_path,
                    "ModelAnswer": (
                        f"The bar chart illustrates the growth trends associated with {_topic} "
                        f"over a nine-year period from 2015 to 2024. Overall, there was a significant "
                        f"and consistent upward trend throughout the period. "
                        f"In 2015, the growth rate stood at approximately 20%, which rose steadily to 35% by 2018. "
                        f"This upward momentum continued into 2021, reaching 55%, before peaking at 72% in 2024. "
                        f"The most notable increase occurred between 2021 and 2024, suggesting an acceleration "
                        f"in developments related to {_topic} in recent years."
                    ),
                },
                "Task2": {
                    "Prompt": (
                        f"Some people believe that {_topic} brings more benefits than drawbacks to modern society, "
                        f"while others argue the opposite. "
                        f"Discuss both views and give your own opinion."
                    ),
                    "ModelEssay": (
                        f"The role of {_topic} in contemporary society has sparked considerable debate. "
                        f"While proponents argue that it offers substantial advantages, critics highlight "
                        f"potential drawbacks that cannot be overlooked.\n\n"
                        f"On the one hand, {_topic} has undeniably transformed various aspects of modern life. "
                        f"It has enhanced efficiency, broadened access to information, and created new opportunities "
                        f"for economic and social development. Many experts contend that embracing this trend "
                        f"is essential for remaining competitive in a rapidly changing world.\n\n"
                        f"On the other hand, critics point to significant challenges. These include concerns about "
                        f"equity, the risk of dependency, and potential negative impacts on employment and traditional values. "
                        f"Without careful regulation, the benefits may only accrue to a privileged few.\n\n"
                        f"In conclusion, while {_topic} presents undeniable benefits, its drawbacks require serious "
                        f"consideration. A balanced, evidence-based approach — combining innovation with strong "
                        f"governance — appears to be the most prudent path forward."
                    ),
                },
            },
        }
        return _normalize_backend_payload("Writing", payload, _state.get("cleaned_text", ""), _topic, _level)

    payload, used_fallback = _generate_llm_skill_payload(state, "Writing", fallback_factory)

    # Update context_bundle for downstream teachers
    bundle = dict(state.get("context_bundle") or {})
    bundle.setdefault("prior_results", {})
    ws = payload.get("WritingSection") or {}
    bundle["prior_results"]["writing"] = {
        "task1_prompt": (ws.get("Task1") or {}).get("Prompt", "")[:100],
        "task2_prompt": (ws.get("Task2") or {}).get("Prompt", "")[:100],
    }

    return {"writing_result": payload, "context_bundle": bundle, "used_fallback": used_fallback}


def listening_teacher_node(state: QuizState) -> Dict[str, Any]:
    """Generate a full Listening section using LLM with context; falls back to heuristic questions."""
    _trace("TOOL CALLED: listening_teacher_node")
    topic = state.get("detected_topic", "Higher Education and Innovation")
    source_text = state.get("cleaned_text", "")
    target_level = state.get("target_level", "Band 7.0 - 8.0")

    def fallback_factory(_state):
        _topic = _state.get("detected_topic", "Higher Education and Innovation")
        _level = _state.get("target_level", "Band 7.0 - 8.0")
        transcript = (
            f"[Audio Transcript — {_topic}]\n\n"
            f"Host: Welcome to today's program. We'll be discussing the fascinating topic of {_topic}. "
            f"Joining me is Dr. Nguyen, an expert in this field.\n\n"
            f"Dr. Nguyen: Thank you. {_topic} is truly one of the most significant areas of study today. "
            f"Research has shown that understanding {_topic} requires a multi-disciplinary approach, "
            f"drawing on insights from science, policy, and social dynamics.\n\n"
            f"Host: Can you elaborate on the key challenges in this area?\n\n"
            f"Dr. Nguyen: Certainly. The primary challenges include resource allocation, public awareness, "
            f"and the need for international cooperation. Without addressing these, progress will remain limited.\n\n"
            f"Host: What do you recommend for students wanting to learn more?\n\n"
            f"Dr. Nguyen: I always advise students to read peer-reviewed research, engage with case studies, "
            f"and participate in community discussions. Active engagement is the best way to develop a "
            f"nuanced understanding of {_topic}."
        )
        questions = _fallback_listening_questions(_topic)
        payload = {
            "Title": f"IELTS Listening: {_topic}",
            "Skill": "Listening",
            "Level": _level,
            "ListeningSection": {"Transcript": transcript},
            "QuestionGroups": [
                {
                    "QuestionTypeID": 1,
                    "QuestionTypeCode": "MULTIPLE_CHOICE_SINGLE",
                    "Instruction": "Listen to the audio and choose the best answer.",
                    "WordLimit": None,
                    "OrderIndex": 1,
                    "Questions": questions,
                }
            ],
        }
        return _normalize_backend_payload("Listening", payload, source_text, _topic, _level)

    payload, used_fallback = _generate_llm_skill_payload(state, "Listening", fallback_factory)

    # Update context_bundle (Listening is typically last in the chain)
    bundle = dict(state.get("context_bundle") or {})
    bundle.setdefault("prior_results", {})
    groups = payload.get("QuestionGroups", [])
    bundle["prior_results"]["listening"] = {
        "transcript_preview": (payload.get("ListeningSection") or {}).get("Transcript", "")[:100],
        "question_count": sum(len(g.get("Questions", [])) for g in groups),
    }

    return {"listening_result": payload, "context_bundle": bundle, "used_fallback": used_fallback}


# --------------------------------------------------------------------------
# Node 7: Consolidation & Backend Parameterized SQL Sync (B4)
# --------------------------------------------------------------------------
def backend_sync_node(state: QuizState) -> Dict[str, Any]:
    """
    Consolidate results from all executed teachers into a single payload,
    then invoke C# backend API via parameterized POST.
    """
    selected_skill = state.get("selected_skill", "Reading")
    topic = state.get("detected_topic", "General Academic")
    teachers = state.get("allocated_teachers", ["Reading"])
    tool_params = _resolve_tool_params(state.get("tool_params"))

    reading = state.get("reading_result")
    speaking = state.get("speaking_result")
    writing = state.get("writing_result")
    listening = state.get("listening_result")

    # Combine question groups and passages
    consolidated_groups = []
    combined_passage = None

    if reading:
        consolidated_groups.extend(reading.get("QuestionGroups", []))
        combined_passage = reading.get("Passage")

    if listening:
        consolidated_groups.extend(listening.get("QuestionGroups", []))
        if not combined_passage:
            combined_passage = {
                "Title": f"Audio Transcript: {topic}",
                "Content": listening.get("ListeningSection", {}).get("Transcript", ""),
                "Topic": topic,
                "Level": "Band 7.0",
                "WordCount": len(listening.get("ListeningSection", {}).get("Transcript", "").split())
            }

    # Consolidated Quiz Object
    quiz_title = state.get("quiz_title") or f"IELTS Comprehensive Assessment: {topic} ({', '.join(teachers)})"
    consolidated_quiz = {
        "Title": quiz_title,
        "Skill": "All" if len(teachers) > 1 else teachers[0],
        "Level": state.get("target_level", "Band 7.0 - 7.5"),
        "Source": "AI_Generated",
        "CreatorId": state.get("user_id"),
        "Passage": combined_passage,
        "QuestionGroups": consolidated_groups,
        "SpeakingSection": speaking,
        "WritingSection": writing.get("WritingSection") if writing else None,
        "ListeningSection": listening.get("ListeningSection") if listening else None,
    }

    # Post to C# API with parameterized queries
    backend_url = tool_params.get("backend_url") or "http://localhost:5000/api/quiz/save"
    _trace("TOOL CALLED: post_to_sql_backend", {"url": backend_url})
    api_response = post_to_sql_backend(consolidated_quiz, url=backend_url)

    return {
        "consolidated_quiz": consolidated_quiz,
        "backend_save_result": api_response
    }


# --------------------------------------------------------------------------
# Node 8: Document Export & Knowledge Base Storage (B5)
# --------------------------------------------------------------------------
def export_knowledge_node(state: QuizState) -> Dict[str, Any]:
    """
    Exports the generated test into Word (.docx) and Excel (.xlsx),
    and records the exported file metadata into the KnowledgeDocument table.
    """
    quiz = state.get("consolidated_quiz")
    if not quiz:
        return {"status": "ERROR", "error_message": "No consolidated quiz data to export."}

    tool_params = _resolve_tool_params(state.get("tool_params"))

    # 1. Export Word
    _trace("TOOL CALLED: export_to_word")
    word_path = export_to_word(quiz, output_path=tool_params.get("word_output_path") or str(Path(__file__).resolve().parents[1] / "exports" / "ielts_quiz_output.docx"))

    # 2. Export Excel
    _trace("TOOL CALLED: export_to_excel")
    excel_path = export_to_excel(quiz, output_path=tool_params.get("excel_output_path") or str(Path(__file__).resolve().parents[1] / "exports" / "ielts_quiz_output.xlsx"))

    # 3. Save to Knowledge Document
    doc_summary = (
        f"IELTS Quiz: {quiz.get('Title')}\n"
        f"Skill: {quiz.get('Skill')} | Level: {quiz.get('Level')}\n"
        f"Passage Word Count: {quiz.get('Passage', {}).get('WordCount', 0) if quiz.get('Passage') else 0}\n"
        f"Total Question Groups: {len(quiz.get('QuestionGroups', []))}\n"
        f"Exported Files: Word ({os.path.basename(word_path)}), Excel ({os.path.basename(excel_path)})"
    )

    user_id = state.get("user_id")
    kb_payload = {
        "Title": quiz.get("Title", "IELTS Generated Quiz Document"),
        "Category": "AI_Quiz_Export",
        "Content": doc_summary,
        "FileURL": word_path,
        "Source": "System",
        "UploadedBy": None if not user_id or not str(user_id).strip() else str(user_id).strip()
    }
    knowledge_url = tool_params.get("knowledge_url") or "http://localhost:5000/api/quiz/knowledge"
    _trace("TOOL CALLED: save_to_knowledge_base", {"url": knowledge_url})
    kb_res = save_to_knowledge_base(kb_payload, url=knowledge_url)

    status = "SUCCESS_DEGRADED" if state.get("used_fallback") else "SUCCESS"
    return {
        "word_file_path": word_path,
        "excel_file_path": excel_path,
        "knowledge_doc_id": kb_res.get("docId"),
        "status": status
    }


# --------------------------------------------------------------------------
# LangGraph Workflow Construction
# --------------------------------------------------------------------------
def build_quiz_graph():
    workflow = StateGraph(QuizState)

    # Add all pipeline nodes
    workflow.add_node("ingest_node", ingest_node)
    workflow.add_node("guardrail_node", guardrail_node)
    workflow.add_node("preprocess_node", preprocess_node)
    workflow.add_node("summarizer_node", summarizer_node)
    workflow.add_node("orchestrator_node", orchestrator_node)

    # Teacher nodes
    workflow.add_node("reading_teacher_node", reading_teacher_node)
    workflow.add_node("speaking_teacher_node", speaking_teacher_node)
    workflow.add_node("writing_teacher_node", writing_teacher_node)
    workflow.add_node("listening_teacher_node", listening_teacher_node)

    # Persistence & Export nodes
    workflow.add_node("backend_sync_node", backend_sync_node)
    workflow.add_node("export_knowledge_node", export_knowledge_node)

    # Entry point
    workflow.set_entry_point("ingest_node")

    # Edges
    workflow.add_edge("ingest_node", "guardrail_node")
    workflow.add_conditional_edges(
        "guardrail_node",
        should_continue_after_guardrail,
        {
            "preprocess_node": "preprocess_node",
            END: END
        }
    )
    workflow.add_edge("preprocess_node", "summarizer_node")
    workflow.add_edge("summarizer_node", "orchestrator_node")

    # Routing from Orchestrator: execute teacher nodes based on allocated_teachers
    def route_teachers(state: QuizState):
        teachers = state.get("allocated_teachers", ["Reading"])
        if "Reading" in teachers:
            return "reading_teacher_node"
        elif "Speaking" in teachers:
            return "speaking_teacher_node"
        elif "Writing" in teachers:
            return "writing_teacher_node"
        elif "Listening" in teachers:
            return "listening_teacher_node"
        return "backend_sync_node"

    workflow.add_conditional_edges(
        "orchestrator_node",
        route_teachers,
        {
            "reading_teacher_node": "reading_teacher_node",
            "speaking_teacher_node": "speaking_teacher_node",
            "writing_teacher_node": "writing_teacher_node",
            "listening_teacher_node": "listening_teacher_node",
            "backend_sync_node": "backend_sync_node"
        }
    )

    # Chaining between teachers if multiple were allocated
    def after_reading(state: QuizState):
        teachers = state.get("allocated_teachers", [])
        if "Speaking" in teachers:
            return "speaking_teacher_node"
        if "Writing" in teachers:
            return "writing_teacher_node"
        if "Listening" in teachers:
            return "listening_teacher_node"
        return "backend_sync_node"

    def after_speaking(state: QuizState):
        teachers = state.get("allocated_teachers", [])
        if "Writing" in teachers:
            return "writing_teacher_node"
        if "Listening" in teachers:
            return "listening_teacher_node"
        return "backend_sync_node"

    def after_writing(state: QuizState):
        teachers = state.get("allocated_teachers", [])
        if "Listening" in teachers:
            return "listening_teacher_node"
        return "backend_sync_node"

    workflow.add_conditional_edges("reading_teacher_node", after_reading, {
        "speaking_teacher_node": "speaking_teacher_node",
        "writing_teacher_node": "writing_teacher_node",
        "listening_teacher_node": "listening_teacher_node",
        "backend_sync_node": "backend_sync_node"
    })

    workflow.add_conditional_edges("speaking_teacher_node", after_speaking, {
        "writing_teacher_node": "writing_teacher_node",
        "listening_teacher_node": "listening_teacher_node",
        "backend_sync_node": "backend_sync_node"
    })

    workflow.add_conditional_edges("writing_teacher_node", after_writing, {
        "listening_teacher_node": "listening_teacher_node",
        "backend_sync_node": "backend_sync_node"
    })

    workflow.add_edge("listening_teacher_node", "backend_sync_node")
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
    tool_params: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """Execute the compiled LangGraph workflow with input parameters."""
    _trace("PIPELINE START", {"skill": selected_skill, "tier": user_tier, "input_type": input_type})
    if llm is None:
        llm = _load_default_llm()
    initial_state: QuizState = {
        "raw_input": raw_input,
        "input_type": input_type,
        "selected_skill": selected_skill,
        "user_tier": user_tier,
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

    final_state = quiz_app.invoke(initial_state)
    _trace("PIPELINE END", {"status": final_state.get("status"), "allocated_teachers": final_state.get("allocated_teachers")})
    return final_state