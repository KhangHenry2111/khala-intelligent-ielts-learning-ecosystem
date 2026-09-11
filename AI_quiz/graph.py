"""
IELTS Study Assistant - LangGraph Workflow Engine
Orchestrates the 5-step IELTS Quiz Generation Pipeline:
B1: Ingest & OCR
B2: Guardrails (Safety & Relevance)
B3: Data Preprocessing (Cleaning)
B4: Summarizer Agent & Orchestrator (Tier-based Teacher dispatch: Reading, Speaking, Writing, Listening)
    -> Parameterized SQL Sync (Draft / Pending review status)
B5: Word / Excel Export & Knowledge Base Storage
"""

import os
import re
import json
import random
import uuid
import configparser
import logging
from pathlib import Path
from typing import Dict, List, Any, Optional, TypedDict, Union

import requests

# Import tools library via tool.py and tools.py
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

    api_key = os.getenv("OPENROUTER_API_KEY") or section.get("api_key", "").strip()
    model = os.getenv("OPENROUTER_MODEL_NAME") or section.get("model_name", "").strip()
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
    user_tier: str                  # "Bronze" | "Silver" | "Gold" | "Đồng" | "Bạc" | "Vàng"
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
    allocated_teachers: List[str]

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
    status: str                      # "SUCCESS" | "REJECTED" | "ERROR"
    error_message: Optional[str]


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
    
    check = guardrail_check(question=text, answer="", skill=skill, llm=state.get("llm"))
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
# Node 4: Summarizer & Topic Classifier Agent (B4)
# --------------------------------------------------------------------------
def summarizer_node(state: QuizState) -> Dict[str, Any]:
    _trace("TOOL CALLED: summarizer_node")
    cleaned = state.get("cleaned_text", "")
    sentences = [s.strip() for s in re.split(r"[.!?]+", cleaned) if len(s.strip()) > 15]

    # Determine topic
    topic = "Academic Studies & Technology"
    c_lower = cleaned.lower()
    if any(k in c_lower for k in ["environment", "climate", "energy", "pollution", "nature", "warming"]):
        topic = "Environment & Renewable Energy"
    elif any(k in c_lower for k in ["education", "school", "university", "student", "teacher", "learning"]):
        topic = "Higher Education & Academic Pedagogies"
    elif any(k in c_lower for k in ["technology", "ai", "artificial intelligence", "computer", "digital", "internet"]):
        topic = "Artificial Intelligence & Digital Innovation"
    elif any(k in c_lower for k in ["health", "medicine", "exercise", "diet", "wellbeing", "hospital"]):
        topic = "Public Health & Modern Healthcare Systems"
    elif any(k in c_lower for k in ["culture", "history", "art", "tradition", "language", "heritage"]):
        topic = "Cultural Heritage & Globalization"

    summary_preview = ". ".join(sentences[:3]) + "." if len(sentences) >= 3 else cleaned[:250] + "..."

    return {
        "summary": summary_preview,
        "detected_topic": topic,
        "target_level": "Band 7.0 - 7.5 (Advanced / Academic)"
    }


# --------------------------------------------------------------------------
# Node 5: Orchestrator Agent (B4 - Tier & Skill Routing)
# --------------------------------------------------------------------------
def orchestrator_node(state: QuizState) -> Dict[str, Any]:
    _trace("TOOL CALLED: orchestrator_node")
    selected_skill = state.get("selected_skill", "Reading").strip()
    tier_raw = state.get("user_tier", "Gold").lower()

    is_bronze = any(b in tier_raw for b in ["bronze", "đồng", "dong"])
    is_silver = any(s in tier_raw for s in ["silver", "bạc", "bac"])

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


def _build_skill_prompt(skill_name: str, topic: str, source_text: str, target_level: str, user_tier: str) -> str:
    base = (
        "You are generating a fresh IELTS quiz from the provided source material. "
        "Return valid JSON only. Do not output markdown fences, comments, or explanations. "
        "Do not reuse canned templates or hardcoded dataset questions. Use only the source text, topic, level, and the user tier. "
    )
    if skill_name == "Reading":
        return (
            base +
            "Schema: {\n  \"Title\": string, \"Skill\": \"Reading\", \"Level\": string, \"Passage\": {\"Title\": string, \"Content\": string, \"Topic\": string, \"Level\": string, \"WordCount\": number}, \"QuestionGroups\": [{\"QuestionTypeID\": number, \"QuestionTypeCode\": string, \"Instruction\": string, \"WordLimit\": string|null, \"OrderIndex\": number, \"Questions\": [{\"QuestionType\": string, \"QuestionTypeID\": number, \"QuestionTypeCode\": string, \"Content\": string, \"Options\": string|null, \"CorrectAnswer\": string, \"Explanation\": string, \"OrderIndex\": number}]}]\n}. "
            f"Topic: {topic}. User tier: {user_tier}. Target level: {target_level}. Source text: {source_text}"
        )
    if skill_name == "Listening":
        return (
            base +
            "Schema: {\n  \"Title\": string, \"Skill\": \"Listening\", \"Level\": string, \"ListeningSection\": {\"Transcript\": string}, \"QuestionGroups\": [{\"QuestionTypeID\": number, \"QuestionTypeCode\": string, \"Instruction\": string, \"WordLimit\": string|null, \"OrderIndex\": number, \"Questions\": [{\"QuestionType\": string, \"QuestionTypeID\": number, \"QuestionTypeCode\": string, \"Content\": string, \"Options\": string|null, \"CorrectAnswer\": string, \"Explanation\": string, \"OrderIndex\": number}]}]\n}. "
            f"Topic: {topic}. User tier: {user_tier}. Target level: {target_level}. Source text: {source_text}"
        )
    if skill_name == "Speaking":
        return (
            base +
            "Schema: {\n  \"Title\": string, \"Skill\": \"Speaking\", \"Level\": string, \"WebSource\": string, \"Part1\": [string], \"Part2_CueCard\": string, \"Part2_Sample\": string, \"Part3\": [string], \"Vocabulary\": [{\"term\": string, \"meaning\": string}]\n}. "
            f"Topic: {topic}. User tier: {user_tier}. Target level: {target_level}. Source text: {source_text}"
        )
    if skill_name == "Writing":
        return (
            base +
            "Schema: {\n  \"Title\": string, \"Skill\": \"Writing\", \"Level\": string, \"WritingSection\": {\"Task1\": {\"Prompt\": string, \"ChartImagePath\": string, \"ModelAnswer\": string}, \"Task2\": {\"Prompt\": string, \"ModelEssay\": string}}\n}. "
            f"Topic: {topic}. User tier: {user_tier}. Target level: {target_level}. Source text: {source_text}"
        )
    raise ValueError(f"Unsupported skill: {skill_name}")


def _generate_llm_skill_payload(state: QuizState, skill_name: str, fallback_factory) -> Dict[str, Any]:
    llm = state.get("llm")
    topic = state.get("detected_topic", "General Academic")
    source_text = state.get("cleaned_text", "")
    target_level = state.get("target_level", "Band 7.0 - 7.5")
    user_tier = state.get("user_tier", "Gold")
    prompt = _build_skill_prompt(skill_name, topic, source_text, target_level, user_tier)
    if llm is not None:
        try:
            payload = tool._invoke_llm(
                llm,
                prompt,
                skill=skill_name,
                topic=topic,
                source_text=source_text,
                target_level=target_level,
                user_tier=user_tier,
            )
            parsed = _parse_llm_json_payload(payload)
            return _normalize_backend_payload(skill_name, parsed, source_text, topic, target_level)
        except Exception as exc:  # pragma: no cover - fallback only for unexpected LLM issues
            logger.warning("LLM generation failed for %s; using fallback structure: %s", skill_name, exc)
    return fallback_factory(state)


def reading_teacher_node(state: QuizState) -> Dict[str, Any]:
    """Generate a fresh Reading test payload from the live LLM, not a baked-in sample exam."""
    _trace("TOOL CALLED: reading_teacher_node")
    topic = state.get("detected_topic", "General Academic")

    def fallback_factory(_state):
        safe_text = (_state.get("cleaned_text") or "").strip()
        payload = {
            "Title": f"IELTS Reading: {topic}",
            "Skill": "Reading",
            "Level": _state.get("target_level", "Band 7.0 - 7.5"),
            "Passage": {
                "Title": f"Academic Reading: {topic}",
                "Content": safe_text or "This passage is generated from the provided source material.",
                "Topic": topic,
                "Level": "Academic",
                "WordCount": len((safe_text or "").split())
            },
            "QuestionGroups": []
        }
        return _normalize_backend_payload("Reading", payload, safe_text, topic, _state.get("target_level", "Band 7.0 - 7.5"))

    payload = _generate_llm_skill_payload(state, "Reading", fallback_factory)
    return {"reading_result": payload}


def speaking_teacher_node(state: QuizState) -> Dict[str, Any]:
    _trace("TOOL CALLED: speaking_teacher_node")
    topic = state.get("detected_topic", "General Academic")

    def fallback_factory(_state):
        payload = {
            "Title": f"IELTS Speaking: {topic}",
            "Skill": "Speaking",
            "Level": _state.get("target_level", "Band 7.5 - 8.5"),
            "WebSource": "Generated from source material",
            "Part1": [],
            "Part2_CueCard": f"Describe an experience related to {topic}.",
            "Part2_Sample": f"This sample answer is based on the source material about {topic}.",
            "Part3": [],
            "Vocabulary": []
        }
        return _normalize_backend_payload("Speaking", payload, _state.get("cleaned_text", ""), topic, _state.get("target_level", "Band 7.5 - 8.5"))

    payload = _generate_llm_skill_payload(state, "Speaking", fallback_factory)
    return {"speaking_result": payload}


def writing_teacher_node(state: QuizState) -> Dict[str, Any]:
    _trace("TOOL CALLED: writing_teacher_node")
    topic = state.get("detected_topic", "Technology and Education")
    tool_params = _resolve_tool_params(state.get("tool_params"))

    def fallback_factory(_state):
        chart_path = generate_writing_chart(
            "bar",
            title=f"Data Trends for {topic}",
            x_labels=["Start", "Mid", "End"],
            series_data={"Series A": [30, 50, 70]},
            output_path=tool_params.get("chart_output_path") or str(Path(__file__).resolve().parents[1] / "exports" / "charts" / "writing_chart.png")
        )
        payload = {
            "Title": f"IELTS Writing: {topic}",
            "Skill": "Writing",
            "Level": _state.get("target_level", "Band 8.0+"),
            "WritingSection": {
                "Task1": {
                    "Prompt": f"Summarize the main trends in {topic} using the source material.",
                    "ChartImagePath": chart_path,
                    "ModelAnswer": f"This writing task is generated from the source material about {topic}."
                },
                "Task2": {
                    "Prompt": f"Discuss the role of {topic} in modern education and policy.",
                    "ModelEssay": f"This essay is generated from the source material about {topic}."
                }
            }
        }
        return _normalize_backend_payload("Writing", payload, _state.get("cleaned_text", ""), topic, _state.get("target_level", "Band 8.0+"))

    payload = _generate_llm_skill_payload(state, "Writing", fallback_factory)
    return {"writing_result": payload}


def listening_teacher_node(state: QuizState) -> Dict[str, Any]:
    _trace("TOOL CALLED: listening_teacher_node")
    topic = state.get("detected_topic", "Higher Education and Innovation")

    def fallback_factory(_state):
        transcript = f"This listening transcript is generated from the source text about {topic}."
        payload = {
            "Title": f"IELTS Listening: {topic}",
            "Skill": "Listening",
            "Level": _state.get("target_level", "Band 7.0 - 8.0"),
            "ListeningSection": {"Transcript": transcript},
            "QuestionGroups": []
        }
        return _normalize_backend_payload("Listening", payload, _state.get("cleaned_text", ""), topic, _state.get("target_level", "Band 7.0 - 8.0"))

    payload = _generate_llm_skill_payload(state, "Listening", fallback_factory)
    return {"listening_result": payload}


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
        "ListeningSection": listening.get("ListeningSection") if listening else None
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

    return {
        "word_file_path": word_path,
        "excel_file_path": excel_path,
        "knowledge_doc_id": kb_res.get("docId"),
        "status": "SUCCESS"
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

    # Routing from Orchestrator: execute teacher nodes in succession for allocated teachers
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
        "allocated_teachers": [],
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
        "error_message": None
    }

    final_state = quiz_app.invoke(initial_state)
    _trace("PIPELINE END", {"status": final_state.get("status"), "allocated_teachers": final_state.get("allocated_teachers")})
    return final_state
