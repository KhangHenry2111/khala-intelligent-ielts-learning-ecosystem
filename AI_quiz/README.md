# AI Quiz

Standalone AI Quiz service, separate from the `auth-portal` project.

- `quiz_api.py`: FastAPI entry point
- `graph.py`: quiz generation pipeline
- `tool.py` / `tools.py`: tool exports and implementations

Run from `ielts-study-assistant` with:

```powershell
python -m uvicorn AI_quiz.quiz_api:app --host 0.0.0.0 --port 8000 --reload
```

The frontend uses `http://localhost:8000` by default. Override it with
`VITE_AI_QUIZ_URL` when the AI service runs on another host or port.
