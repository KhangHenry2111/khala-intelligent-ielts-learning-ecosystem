# AI Quiz

Dịch vụ FastAPI độc lập với `auth-portal`. Pipeline đầy đủ (B1–B5, lưu SQL, moderation) được mô tả trong [README gốc](../README.md#workflow-ai-quiz-end-to-end).

- `quiz_api.py`: HTTP (`/api/quiz/generate`, `/api/quiz/health`, …)
- `graph.py`: LangGraph
- `tool.py` / `tools.py`: OCR, guardrail, LLM, POST SQL, export Word/Excel

```powershell
python -m uvicorn AI_quiz.quiz_api:app --host 0.0.0.0 --port 8000 --reload
```

Frontend mặc định `http://localhost:8000`, dò thêm 8001–8009. Ghi đè bằng `VITE_AI_QUIZ_URL`.

OCR: [OCR_README.md](OCR_README.md). Model/config: [formodel.md](../formodel.md).
