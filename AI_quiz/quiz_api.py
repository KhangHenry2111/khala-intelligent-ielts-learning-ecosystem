"""
IELTS Quiz Generation API - FastAPI Endpoint
Accepts document inputs (Text or Image OCR), runs the 5-step LangGraph workflow,
persists via C# parameterized backend, exports Word/Excel, and returns structured JSON.
"""

import os
import sys
import json
import logging
from typing import Optional, List, Dict, Any
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

# Import the LangGraph runner
from .graph import run_quiz_pipeline


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
            {"id": "Reading", "name": "IELTS Reading", "description": "Academic passage with up to 3 randomized IELTS question types"},
            {"id": "Speaking", "name": "IELTS Speaking", "description": "Web-searched Task 1, 2, 3 questions, cue cards, and vocabulary"},
            {"id": "Writing", "name": "IELTS Writing", "description": "Matplotlib Task 1 chart generator + Band 8+ model essay for Task 2"},
            {"id": "Listening", "name": "IELTS Listening", "description": "Audio dialog script, comprehension questions, and timestamp explanations"},
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


@app.post("/api/quiz/generate", response_model=GenerateQuizResponse, tags=["Quiz Generation"])
def generate_quiz(req: GenerateQuizRequest, response: Response):
    """
    Step 1 -> Step 5 IELTS Quiz Generation Pipeline:
    - B1: Ingest document (OCR if image).
    - B2: Guardrail check. If unsafe/irrelevant, returns invalid response.
    - B3: Clean markdown, icons, and punctuation.
    - B4: Summarizer -> Orchestrator dispatches to tier-appropriate teacher agents.
          Persists to SQL Server via C# backend API with Status = 'Draft' / 'Pending'.
    - B5: Exports to Word (.docx) & Excel (.xlsx) and records to KnowledgeDocument.

    NOTE: the response body always carries `success`/`status` so existing frontend
    logic that reads those fields keeps working unchanged. The HTTP status code is
    additionally set to 500 on real system errors (pipeline exception, or a global
    ERROR status) so monitoring/log tooling that only looks at the status code can
    also detect failures. Guardrail rejection is a valid business outcome, not a
    system error, so it intentionally stays 200.
    """
    try:
        logger.info(
            "[AI TRACE] API REQUEST JSON: %s",
            json.dumps(_safe_request_for_log(req.model_dump()), ensure_ascii=False, default=str)[:12000]
        )
        final_state = run_quiz_pipeline(
            raw_input=req.document,
            selected_skill=req.skill,
            input_type=req.input_type,
            user_tier=req.tier,
            user_id=req.user_id,
            quiz_title=req.title
        )

        # Handle Guardrail Failure (B2) — a valid business rejection, not a system error.
        if not final_state.get("guardrail_passed", False):
            logger.info("[AI TRACE] API RESPONSE: REJECTED at guardrail")
            return GenerateQuizResponse(
                success=False,
                status="REJECTED",
                step=2,
                message=final_state.get("guardrail_reason") or "Tài liệu không an toàn hoặc không liên quan đến nội dung ôn luyện IELTS.",
                data=None
            )

        # Check Global Error
        if final_state.get("status") == "ERROR":
            logger.info("[AI TRACE] API RESPONSE: ERROR: %s", final_state.get("error_message"))
            response.status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
            return GenerateQuizResponse(
                success=False,
                status="ERROR",
                step=4,
                message=final_state.get("error_message") or "Đã xảy ra lỗi trong quá trình xử lý đề thi.",
                data=None
            )

        # Build Success Response (B5 completed)
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
            message="Đã tạo đề thi IELTS thành công, lưu database (trạng thái chờ kiểm duyệt) và xuất tài liệu Word/Excel." + (" (Chế độ giả lập/mock)" if pipeline_status == "SUCCESS_DEGRADED" else ""),
            data=response_data
        )
        logger.info("[AI TRACE] API RESPONSE JSON: %s", json.dumps(result.model_dump(), ensure_ascii=False, default=str)[:12000])
        return result

    except Exception as ex:
        logger.exception("[AI TRACE] API ERROR")
        response.status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
        return GenerateQuizResponse(
            success=False,
            status="ERROR",
            step=1,
            message=f"Lỗi hệ thống: {str(ex)}",
            data=None
        )


if __name__ == "__main__":
    uvicorn.run("AI_quiz.quiz_api:app", host="0.0.0.0", port=8000, reload=False)