# AI Quiz

Dịch vụ FastAPI độc lập với `auth-portal`. Pipeline đầy đủ (B1–B5, lưu SQL, moderation) được mô tả trong [README gốc](../README.md#workflow-ai-quiz-end-to-end).

- `quiz_api.py`: HTTP (`/api/quiz/generate`, `/api/quiz/generate/start`, `/api/quiz/generate/status/{job_id}`, `/api/quiz/health`, …)
- `graph.py`: LangGraph
- `tool.py` / `tools.py`: OCR, guardrail, LLM, POST SQL, export Word/Excel

The web UI starts quiz generation as a background job and polls its status endpoint
to display pipeline progress. `/api/quiz/generate` remains available for synchronous
clients. OpenRouter requests use a 15-second connect timeout and a 300-second read
timeout; transient network errors, HTTP 408/429, and server errors are retried with
backoff until the provider responds.

To assign generated quiz documents to student accounts and display them in the
personal knowledge base, apply [`knowledge_document_user_owner_migration.sql`](../knowledge_document_user_owner_migration.sql)
to the application database before deploying this version.

```powershell
python -m uvicorn AI_quiz.quiz_api:app --host 0.0.0.0 --port 8000 --reload
```

Frontend mặc định `http://localhost:8000`, dò thêm 8001–8009. Ghi đè bằng `VITE_AI_QUIZ_URL`.

OCR: [OCR_README.md](OCR_README.md). Model/config: [formodel.md](../formodel.md).
