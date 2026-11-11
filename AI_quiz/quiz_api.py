"""
IELTS Quiz Generation API - FastAPI Endpoint
Accepts document inputs (Text or Image OCR), runs the 5-step LangGraph workflow,
persists via C# parameterized backend, exports Word/Excel, and returns structured JSON.
"""

import os
import sys
import json
import logging
import tempfile
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional, List, Dict, Any, Literal
from fastapi import FastAPI, HTTPException, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import requests
import uvicorn

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s"
)
logger = logging.getLogger("ielts.ai_quiz")
_quiz_jobs: Dict[str, Dict[str, Any]] = {}
_quiz_jobs_lock = threading.Lock()
_quiz_executor = ThreadPoolExecutor(max_workers=4, thread_name_prefix="quiz-generation")
_QUIZ_JOB_TTL = timedelta(hours=1)

# Import the LangGraph runner
from .graph import run_quiz_pipeline
from .tools import export_to_word, export_to_excel


def _safe_request_for_log(payload: Dict[str, Any]) -> Dict[str, Any]:
    result = dict(payload)
    document = result.get("document")
    if isinstance(document, str) and document.startswith("data:image") and ";base64," in document:
        prefix, encoded = document.split(";base64,", 1)
        result["document"] = f"{prefix};base64,[redacted] ({len(encoded)} chars)"
    return result

# App initialization
app = FastAPI(
    title="IELTS AI Quiz Generation Engine",
    description="5-Step IELTS AI Pipeline: OCR/Ingest -> Guardrail -> Clean -> Multi-Teacher Orchestration -> Docx/Xlsx & Knowledge Storage",
    version="1.0.0"
)

# Enable CORS for cross-origin frontend calls
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --------------------------------------------------------------------------
# Request & Response Models
# --------------------------------------------------------------------------
class GenerateQuizRequest(BaseModel):
    document: str = Field(
        ...,
        description="Text content, file path to an image, or base64 encoded image data."
    )
    input_type: str = Field(
        default="text",
        description="Type of input: 'text' or 'image'."
    )
    skill: str = Field(
        default="Reading",
        description="Target skill: 'Reading', 'Speaking', 'Writing', 'Listening', or 'All' / 'Toàn bộ'."
    )
    question_type: Optional[str] = Field(
        default=None,
        description="Optional IELTS Reading or Listening question format code."
    )
    generation_mode: Literal["topic", "source"] = Field(
        default="source",
        description="Generate source material from a topic, or use supplied source material."
    )
    question_count: Optional[int] = Field(
        default=None,
        ge=40,
        le=40,
        description="Total question count for model-planned question-type streams."
    )
    tier: str = Field(
        default="Gold",
        description="User tier: 'Bronze' / 'Đồng', 'Silver' / 'Bạc', or 'Gold' / 'Vàng'."
    )
    user_id: Optional[str] = Field(
        default=None,
        description="Unique user identifier (GUID)."
    )
    title: Optional[str] = Field(
        default=None,
        description="Optional custom title for the generated quiz."
    )


class QuizResponseData(BaseModel):
    summary: Optional[str] = None
    detected_topic: Optional[str] = None
    target_level: Optional[str] = None
    allocated_teachers: List[str] = []
    quiz_id: Optional[str] = None
    passage_id: Optional[str] = None
    word_file_path: Optional[str] = None
    excel_file_path: Optional[str] = None
    knowledge_doc_id: Optional[str] = None
    backend_status: Optional[Dict[str, Any]] = None
    quiz_preview: Optional[Dict[str, Any]] = None


class GenerateQuizResponse(BaseModel):
    success: bool
    status: str
    step: int
    message: str
    data: Optional[QuizResponseData] = None


class DirectSaveQuizRequest(BaseModel):
    payload: Dict[str, Any] = Field(
        ...,
        description="Raw quiz payload object in the backend SQL insert schema."
    )


class ExportQuizRequest(BaseModel):
    quiz: Dict[str, Any] = Field(..., description="Generated quiz payload to export.")


# --------------------------------------------------------------------------
# Endpoints
# --------------------------------------------------------------------------
@app.get("/health", tags=["Health"])
@app.get("/api/quiz/health", tags=["Health"])
def health_check():
    return {
        "status": "Healthy",
        "service": "IELTS AI Quiz Generation Engine",
        "supported_skills": ["Reading", "Speaking", "Writing", "Listening", "All"],
        "pipeline_steps": [
            "B1: Ingestion & OCR",
            "B2: Safety & Relevance Guardrail",
            "B3: Data Preprocessing",
            "B4: Summarizer & Tier-based Multi-Teacher Dispatch (Reading, Speaking, Writing, Listening) + Parameterized SQL Sync",
            "B5: Word/Excel Export & Knowledge Base Storage"
        ]
    }


@app.get("/api/quiz/skills", tags=["Catalog"])
def get_supported_skills():
    return {
        "skills": [
            {"id": "Reading", "name": "IELTS Reading", "description": "Academic passage with the selected IELTS question type, answers, and explanations"},
            {"id": "Speaking", "name": "IELTS Speaking", "description": "Web-searched Task 1, 2, 3 questions, cue cards, and vocabulary"},
            {"id": "Writing", "name": "IELTS Writing", "description": "Matplotlib Task 1 chart generator + Band 8+ model essay for Task 2"},
            {"id": "Listening", "name": "IELTS Listening", "description": "Audio dialogue or monologue with the selected IELTS question type, transcript, and explanations"},
            {"id": "All", "name": "Toàn bộ 4 kỹ năng (Full Test)", "description": "All 4 skills orchestrated based on user tier"}
        ]
    }


@app.get("/api/quiz/tiers", tags=["Catalog"])
def get_supported_tiers():
    return {
        "tiers": [
            {"tier": "Bronze", "vn_name": "Đồng", "allowed_skills": ["Reading", "Listening"], "limit": 8},
            {"tier": "Silver", "vn_name": "Bạc", "allowed_skills": ["Reading", "Listening", "Speaking", "Writing"], "limit": 60},
            {"tier": "Gold", "vn_name": "Vàng", "allowed_skills": ["Reading", "Listening", "Speaking", "Writing", "All"], "limit": 250}
        ]
    }


@app.post("/api/ai-quiz/export/{extension}", tags=["Quiz Export"])
def export_ai_quiz(extension: Literal["docx", "xlsx"], req: ExportQuizRequest):
    quiz = req.quiz
    if not str(quiz.get("Title") or quiz.get("title") or "").strip():
        raise HTTPException(status_code=422, detail="quiz.Title is required.")
    if not isinstance(quiz.get("QuestionGroups") or quiz.get("questionGroups") or [], list):
        raise HTTPException(status_code=422, detail="quiz.QuestionGroups must be an array.")

    content_types = {
        "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }
    exporter = export_to_word if extension == "docx" else export_to_excel
    try:
        with tempfile.TemporaryDirectory(prefix="ielts-quiz-export-") as temp_dir:
            output_path = Path(temp_dir) / f"ielts-ai-quiz.{extension}"
            exporter(quiz, str(output_path))
            file_content = output_path.read_bytes()
    except Exception as exc:
        logger.exception("[AI TRACE] QUIZ EXPORT ERROR")
        raise HTTPException(status_code=500, detail=f"Unable to export quiz: {exc}") from exc

    return Response(
        content=file_content,
        media_type=content_types[extension],
        headers={"Content-Disposition": f'attachment; filename="ielts-ai-quiz.{extension}"'},
    )


@app.post("/api/quiz/save-json", tags=["Quiz Generation"])
def save_quiz_json(req: DirectSaveQuizRequest):
    """Accept a raw quiz JSON object and forward it to the backend /api/quiz/save endpoint."""
    payload = req.payload or {}
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="payload must be a JSON object")

    backend_url = os.getenv("IELTS_SAVE_QUIZ_URL") or "http://localhost:5000/api/quiz/save"
    try:
        response = requests.post(backend_url, json=payload, timeout=20)
        response.raise_for_status()
        body = response.json()
        return {
            "success": True,
            "status": "SUCCESS",
            "message": "Quiz JSON saved to backend successfully.",
            "data": body,
            "backend_url": backend_url,
        }
    except Exception as exc:
        logger.exception("[AI TRACE] DIRECT SAVE ERROR")
        return {
            "success": False,
            "status": "ERROR",
            "message": f"Direct save failed: {exc}",
            "backend_url": backend_url,
        }


def _create_quiz_response(req: GenerateQuizRequest, progress_callback=None):
    try:
        logger.info(
            "[AI TRACE] API REQUEST JSON: %s",
            json.dumps(_safe_request_for_log(req.model_dump()), ensure_ascii=False, default=str)[:12000]
        )
        final_state = run_quiz_pipeline(
            raw_input=req.document,
            selected_skill=req.skill,
            selected_question_type=req.question_type,
            generation_mode=req.generation_mode,
            target_question_count=req.question_count,
            input_type=req.input_type,
            user_tier=req.tier,
            user_id=req.user_id,
            quiz_title=req.title,
            progress_callback=progress_callback,
        )

        if not final_state.get("guardrail_passed", False):
            logger.info("[AI TRACE] API RESPONSE: REJECTED at guardrail")
            return GenerateQuizResponse(
                success=False,
                status="REJECTED",
                step=2,
                message=final_state.get("guardrail_reason") or "Tài liệu không an toàn hoặc không liên quan đến nội dung ôn luyện IELTS.",
                data=None
            ), status.HTTP_200_OK

        if final_state.get("status") == "ERROR":
            logger.info("[AI TRACE] API RESPONSE: ERROR: %s", final_state.get("error_message"))
            return GenerateQuizResponse(
                success=False,
                status="ERROR",
                step=4,
                message=final_state.get("error_message") or "Đã xảy ra lỗi trong quá trình xử lý đề thi.",
                data=None
            ), status.HTTP_500_INTERNAL_SERVER_ERROR

        consolidated = final_state.get("consolidated_quiz") or {}
        backend_res = final_state.get("backend_save_result") or {}

        response_data = QuizResponseData(
            summary=final_state.get("summary"),
            detected_topic=final_state.get("detected_topic"),
            target_level=final_state.get("target_level"),
            allocated_teachers=final_state.get("allocated_teachers", []),
            quiz_id=backend_res.get("quizId") or backend_res.get("QuizId"),
            passage_id=backend_res.get("passageId") or backend_res.get("PassageId"),
            word_file_path=final_state.get("word_file_path"),
            excel_file_path=final_state.get("excel_file_path"),
            knowledge_doc_id=final_state.get("knowledge_doc_id"),
            backend_status=backend_res,
            quiz_preview=consolidated
        )

        pipeline_status = final_state.get("status", "SUCCESS")
        result = GenerateQuizResponse(
            success=True,
            status=pipeline_status,
            step=5,
            message="Đã tạo đề thi IELTS thành công, lưu database (trạng thái chờ kiểm duyệt) và xuất tài liệu Word/Excel." + (" (Phân tích chủ đề dùng dự phòng cục bộ)" if pipeline_status == "SUCCESS_DEGRADED" else ""),
            data=response_data
        )
        logger.info("[AI TRACE] API RESPONSE JSON: %s", json.dumps(result.model_dump(), ensure_ascii=False, default=str)[:12000])
        return result, status.HTTP_200_OK

    except Exception as ex:
        logger.exception("[AI TRACE] API ERROR")
        return GenerateQuizResponse(
            success=False,
            status="ERROR",
            step=1,
            message=f"Lỗi hệ thống: {str(ex)}",
            data=None
        ), status.HTTP_500_INTERNAL_SERVER_ERROR


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _prune_finished_jobs() -> None:
    expired_before = datetime.now(timezone.utc) - _QUIZ_JOB_TTL
    with _quiz_jobs_lock:
        expired_ids = []
        for job_id, job in _quiz_jobs.items():
            if job["status"] == "RUNNING":
                continue
            updated_at = datetime.fromisoformat(job["updated_at"])
            if updated_at < expired_before:
                expired_ids.append(job_id)
        for job_id in expired_ids:
            del _quiz_jobs[job_id]


def _update_quiz_job(
    job_id: str,
    stage: str,
    message: str,
    job_status: str = "RUNNING",
    result: Optional[Dict[str, Any]] = None,
) -> None:
    with _quiz_jobs_lock:
        job = _quiz_jobs.get(job_id)
        if job is None:
            return
        job.update({
            "stage": stage,
            "message": message,
            "status": job_status,
            "updated_at": _now_iso(),
        })
        if result is not None:
            job["result"] = result
    logger.info(
        "[AI TRACE] JOB PROGRESS: %s",
        json.dumps({"job_id": job_id, "stage": stage, "status": job_status, "message": message}, ensure_ascii=False),
    )


def _run_quiz_job(job_id: str, req: GenerateQuizRequest) -> None:
    try:
        result, http_status = _create_quiz_response(
            req,
            progress_callback=lambda stage, message, pipeline_status: _update_quiz_job(
                job_id,
                stage,
                message,
                "RUNNING",
            ),
        )
        payload = result.model_dump()
        terminal_status = result.status
        if http_status >= status.HTTP_500_INTERNAL_SERVER_ERROR:
            terminal_status = "ERROR"
        _update_quiz_job(
            job_id,
            "complete",
            result.message,
            terminal_status,
            payload,
        )
    except Exception as exc:
        logger.exception("[AI TRACE] ASYNC QUIZ JOB ERROR: %s", job_id)
        failure = GenerateQuizResponse(
            success=False,
            status="ERROR",
            step=1,
            message=f"Lỗi hệ thống: {exc}",
            data=None,
        )
        _update_quiz_job(job_id, "complete", failure.message, "ERROR", failure.model_dump())


@app.post(
    "/api/quiz/generate/start",
    status_code=status.HTTP_202_ACCEPTED,
    tags=["Quiz Generation"],
)
def start_quiz_generation(req: GenerateQuizRequest):
    """Start generation in the background so clients can poll live pipeline progress."""
    _prune_finished_jobs()
    job_id = uuid.uuid4().hex
    with _quiz_jobs_lock:
        _quiz_jobs[job_id] = {
            "job_id": job_id,
            "status": "RUNNING",
            "stage": "queued",
            "message": "Đã nhận yêu cầu, đang chờ bắt đầu tạo quiz…",
            "updated_at": _now_iso(),
            "result": None,
        }
    logger.info("[AI TRACE] JOB START: %s", job_id)
    _quiz_executor.submit(_run_quiz_job, job_id, req)
    return {
        "job_id": job_id,
        "status": "RUNNING",
        "stage": "queued",
        "message": "Đã nhận yêu cầu, đang chờ bắt đầu tạo quiz…",
    }


@app.get("/api/quiz/generate/status/{job_id}", tags=["Quiz Generation"])
def get_quiz_generation_status(job_id: str, response: Response):
    response.headers["Cache-Control"] = "no-store"
    with _quiz_jobs_lock:
        job = _quiz_jobs.get(job_id)
        if job is None:
            raise HTTPException(status_code=404, detail="Quiz generation task was not found or has expired.")
        return dict(job)


@app.post("/api/quiz/generate", response_model=GenerateQuizResponse, tags=["Quiz Generation"])
def generate_quiz(req: GenerateQuizRequest, response: Response):
    """Synchronous compatibility endpoint for existing API clients."""
    result, http_status = _create_quiz_response(req)
    response.status_code = http_status
    return result


if __name__ == "__main__":
    uvicorn.run("AI_quiz.quiz_api:app", host="0.0.0.0", port=8000, reload=False)