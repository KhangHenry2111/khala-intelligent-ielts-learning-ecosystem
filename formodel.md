# Formodel and app configuration notes

## 1) Correct model name to use

Use the exact OpenRouter model name below:

- nvidia/nemotron-3-ultra-550b-a55b:free
- OpenRouter page: https://openrouter.ai/nvidia/nemotron-3-ultra-550b-a55b:free#performance

This is the model currently used by the project for AI-generated IELTS content. The app must not silently replace it with `openai/gpt-4o-mini` or any other model unless the user explicitly instructs a different one.

## 2) OCR model

For text extraction from image input, use:

- Tesseract OCR
- binary path: `C:\Program Files\Tesseract-OCR\tesseract.exe`

This is the OCR engine configured in the project and is not interchangeable with the LLM model.

## 3) App structure and responsibilities

This project is a multi-service IELTS study assistant with these main components:

1. Python AI pipeline
   - `AI_quiz/graph.py`
   - orchestrates the LangGraph workflow
   - handles ingestion, guardrails, summarization, topic detection, teacher generation, and export

2. FastAPI AI quiz API
   - `AI_quiz/quiz_api.py`
   - exposes `/api/quiz/generate`, `/api/quiz/health`, etc.
   - calls the LangGraph workflow and returns structured JSON to the frontend/backend

3. ASP.NET auth portal
   - `auth-portal/Program.cs`
   - hosts the frontend and exposes admin/auth endpoints
   - reads database connection information from env or config file

4. SQL Server database
   - configured in `config.cfg` under `[sqlserver]`
   - actual secret values should not be committed to source control

5. Output storage
   - export directory: `d:\IeltsApp\exports`
   - chart directory: `d:\IeltsApp\exports\charts`

## 4) Required project behavior

The application should do the following:

- generate IELTS content using the configured LLM model
- use Tesseract OCR for image-based input extraction
- send generated quiz payloads to the backend API via HTTP POST
- store the actual database connection string only in protected local environment variables or secret storage
- keep generated exports in the configured export folders
- never silently overwrite the configured model name without explicit user direction

## 5) Security note

The connection string in `config.cfg` is a local secret and must be treated as sensitive. The project should prefer:

- environment variables
- OS secret storage
- user secrets during local development

Do not copy secrets into logs, browser payloads, or API request bodies.

## 6) Configuration contract

The project config is expected to carry:

- SQL Server connection string
- backend endpoints
- export paths
- OpenRouter model name
- OCR path

Example sections:

```ini
[sqlserver]
connection_string = Data Source=(localdb)\MSSQLLocalDB;Initial Catalog=IELTS;Integrated Security=True;...

[backend_api]
base_url = http://localhost:5000/api
save_quiz_url = http://localhost:5000/api/quiz/save
save_knowledge_url = http://localhost:5000/api/quiz/knowledge

[ai_model]
provider = openrouter
model_name = nvidia/nemotron-3-ultra-550b-a55b:free
base_url = https://openrouter.ai/api/v1/chat/completions
api_key =
tesseract_cmd = C:\Program Files\Tesseract-OCR\tesseract.exe
```

## 7) Explicit instruction for future edits

If any future session or automatic tool modifies this file, the following must be preserved:

- `model_name = nvidia/nemotron-3-ultra-550b-a55b:free`
- `tesseract_cmd = C:\Program Files\Tesseract-OCR\tesseract.exe`
- no silent replacement of the model name with `openai/gpt-4o-mini`
- no secret leakage into request payloads or logs

## 8) What “real generation” means in this app

This application should aim to generate IELTS tasks from live LLM output, not only static templates. In practice, the app may still use templates as scaffolding, but the actual model must be responsible for:

- topic expansion
- question generation
- tailored prompts for reading, speaking, writing, and listening
- output formatting in JSON
- content personalization based on the selected skill and user tier

The current code should be treated as a working baseline, not as the final instruction set. The project should continue to evolve toward a real model-driven generation pipeline while preserving the backend and security model.
