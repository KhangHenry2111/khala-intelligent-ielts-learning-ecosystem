# IELTS Study Assistant

Nền tảng học IELTS gồm React SPA, API ASP.NET Core, dịch vụ AI Quiz (FastAPI + LangGraph) và SQL Server. Một hệ thống đăng nhập dùng chung, dashboard tách theo vai trò **User**, **Teacher**, **Admin**.

Runtime: .NET 10, Node.js LTS, React 19, Vite 8, React Router 7, Python 3 (FastAPI, LangGraph, SQLAlchemy 2, pyodbc 5).

React là nguồn duy nhất của UI. `auth-portal/wwwroot` là output Vite; không sửa tay.

---

## Trạng thái hiện tại

**Đã chạy end-to-end**

- Đăng ký / đăng nhập theo role (User, Teacher, Admin)
- Session token in-memory sau login; UI lưu user ở `localStorage`
- User: so sánh gói Bronze / Silver / Gold, mở các trang feature
- User: tạo AI Quiz từ văn bản hoặc ảnh (OCR Tesseract)
- Pipeline AI 5 bước, lưu quiz SQL ở trạng thái Draft / Pending
- Teacher: hàng chờ kiểm duyệt AI, Approve / PendingReview / Reject
- Export Word/Excel và ghi metadata vào `KnowledgeDocument`

**UI đã có, nghiệp vụ chưa nối API**

- User: Available quizzes, Level test, Upload, Knowledge base, Results (trang mô tả + nút Get started)
- Teacher: Classes, Lessons, Grading (dữ liệu demo trên dashboard)
- Admin: Accounts, Teachers, Content, Feedback, Reports (dữ liệu demo)

---

## Kiến trúc hệ thống

```text
Browser (React SPA)
   │  Vite :5173  (dev, proxy /api → :5000)
   │  hoặc ASP.NET phục vụ wwwroot :5000
   │
   ├── /api/auth/*          AuthPortal (ASP.NET Core)
   ├── /api/quiz/*          AuthPortal → SQL Server
   │
   └── http://localhost:8000  AI Quiz (FastAPI)
            │
            ├── LangGraph  B1→B5
            ├── OpenRouter LLM
            ├── Tesseract OCR
            └── POST lại AuthPortal
                      /api/quiz/save
                      /api/quiz/knowledge
```

Ba tầng chính:

| Tầng | Vai trò |
| --- | --- |
| Presentation | `auth-portal/ClientApp` — route theo role, `MainLayout` sau login |
| Application | `AuthController`, `QuizController` — auth, lưu quiz, moderation, knowledge |
| AI | `AI_quiz/quiz_api.py` + `graph.py` — ingest, guardrail, sinh đề, export |

SQL Server (LocalDB `IELTS` mặc định) là nguồn dữ liệu tài khoản, gói, quiz, passage, knowledge.

---

## Cấu trúc thư mục

```text
ielts-study-assistant/
  auth-portal/
    ClientApp/                 React source + Vite
      src/app/                 router, auth context, API client
      src/features/auth/       login / register
      src/features/dashboard/  dashboard, profile, feature pages
      src/features/ai-quiz/    form tạo AI Quiz
    Controllers/               AuthController, QuizController
    Models/                    request / response
    Services/                  AuthService, session
    wwwroot/                   build output (không sửa tay)
  AI_quiz/
    quiz_api.py                FastAPI
    graph.py                   LangGraph pipeline
    tool.py / tools.py         OCR, guardrail, LLM, SQL POST, export
    tests/                     pytest pipeline
  tests/                       Python + xUnit AuthPortal
  scripts/run_all_tests.ps1
  SqlScripts.sql               schema
  config.cfg                   local config (không commit secret)
  main.py                      launcher menu
  requirements.txt
```

---

## Chạy local

Cần: SQL Server LocalDB (hoặc instance tương đương), .NET SDK, Node.js LTS, Python 3, Tesseract OCR (nếu dùng ảnh), khóa OpenRouter (nếu muốn LLM thật).

### 1. Database

Chạy schema để tạo database `IELTS` và các bảng:

```powershell
sqlcmd -S "(localdb)\MSSQLLocalDB" -d master -i SqlScripts.sql
```

Schema script phải chạy trên `master` để có thể tạo database `IELTS` nếu database chưa tồn tại. Launcher (`python main.py` → option 5) chạy được bằng `sqlcmd` nếu đã cài; nếu chưa, nó dùng `pyodbc` và SQL Server ODBC Driver có sẵn để chạy script.

Để đồng bộ các bảng mới có trong database nhưng chưa có trong schema gốc, chạy:

```powershell
python scripts\sync_new_tables.py
```

Script dùng connection string theo thứ tự cấu hình ở dưới và cập nhật trực tiếp một khối được đánh dấu ở cuối `sqlScripts.sql`. Nội dung schema hiện tại được giữ nguyên; mỗi lần chạy chỉ thay khối tự sinh, tránh nối lặp bảng. Khối này chứa DDL idempotent cho các bảng chưa có trong schema gốc (cột, khóa, constraint, foreign key và index). Script chỉ đọc database, không tự chạy DDL lên đó. Kiểm tra `sqlScripts.sql` sau khi cập nhật rồi dùng file này khi cần triển khai schema. Có thể dùng `--source` để chỉ định file schema khác, hoặc `--output` để sinh migration riêng thay vì sửa file nguồn.

Connection string đọc theo thứ tự:

1. `SQLSERVER_CONNECTION_STRING` / `ConnectionStrings__Default` / `USER_DB_CONNECTION`
2. `config.cfg` `[sqlserver] connection_string`
3. `auth-portal/appsettings.json`

### 2. Python

Từ `ielts-study-assistant` (hoặc venv ở `D:\IeltsApp\venv`):

```powershell
python -m pip install -r requirements.txt
python -m uvicorn AI_quiz.quiz_api:app --host 0.0.0.0 --port 8000 --reload
```

Health: `http://localhost:8000/api/quiz/health`

Nếu cổng 8000 bận, launcher tự chọn 8001–8009. Frontend lần lượt dò các cổng đó, hoặc set `VITE_AI_QUIZ_URL`.

### 3. ASP.NET

```powershell
cd auth-portal
dotnet run --urls http://localhost:5000
```

### 4. Frontend (dev)

```powershell
cd auth-portal/ClientApp
npm install
npm run dev
```

Vite: `http://localhost:5173`, proxy `/api` → `http://localhost:5000`.

### 5. Production SPA qua ASP.NET

```powershell
cd auth-portal/ClientApp
npm run build
cd ..
dotnet run --urls http://localhost:5000
```

Mở `http://localhost:5000`.

### 6. Launcher

```powershell
python main.py
```

| Option | Việc |
| --- | --- |
| 1 | Test kết nối SQL (Python) |
| 2 | Query tool C# |
| 3 | Auth Portal :5000 |
| 4 | AI Quiz API (cổng tự do nếu 8000 bận) |
| 5 | Chạy SQL init |
| 6 | Xem config |
| 7 | Python tests |
| 8 | Auth + AI Quiz cùng lúc |
| 9 | Thoát |

---

## Cấu hình

`config.cfg` (local). Không đưa API key hay connection string vào git/log/payload trình duyệt.

```ini
[sqlserver]
connection_string = Data Source=(localdb)\MSSQLLocalDB;Initial Catalog=IELTS;Integrated Security=True;...

[backend_api]
base_url = http://localhost:5000/api
save_quiz_url = http://localhost:5000/api/quiz/save
save_knowledge_url = http://localhost:5000/api/quiz/knowledge
user_tier_url = http://localhost:5000/api/quiz/user-tier

[storage]
export_dir = d:\IeltsApp\exports
charts_dir = d:\IeltsApp\exports\charts

[ai_model]
provider = openrouter
model_name = nvidia/nemotron-3-ultra-550b-a55b:free
temperature = 0.2
api_key =
base_url = https://openrouter.ai/api/v1/chat/completions
ocr_engine = tesseract
tesseract_cmd = C:\Program Files\Tesseract-OCR\tesseract.exe
```

Ghi đè bằng biến môi trường khi có: `OPENROUTER_API_KEY`, `OPENROUTER_MODEL_NAME`, `OPENROUTER_BASE_URL`, `IELTS_SAVE_QUIZ_URL`, `IELTS_SAVE_KNOWLEDGE_URL`, `IELTS_EXPORT_DIR`, `IELTS_CHARTS_DIR`.

**Không đổi tên model** trừ khi được yêu cầu rõ. OCR luôn là Tesseract, không thay bằng LLM.

Chi tiết model/OCR: `formodel.md`. OCR test: `AI_quiz/OCR_README.md`.

---

## Gói dịch vụ (Package)

Khớp schema `Package` và UI so sánh trên User dashboard.

| | Bronze (Đồng) | Silver (Bạc) | Gold (Vàng) |
| --- | --- | --- | --- |
| Giá (UI) | Free | 199.000đ / tháng | 399.000đ / tháng |
| AI Quiz | 8 / tháng | 60 / tháng | 250 / tháng |
| Level test | 1 / tháng | 4 / tháng | 12 / tháng |
| Upload | 5 MB | 20 MB | 50 MB |
| Knowledge base | Basic | Full | Full |
| Speaking AI | Không | Có | Có |
| Writing AI | Limited | Có | Có |
| Teacher Speaking/Writing | Không | Không | Có |
| Skill khi chọn “All” | Reading + Listening | 4 kỹ năng | 4 kỹ năng |

Orchestrator đọc `user_tier` từ form AI Quiz (`user.rank` / `details.Rank`). Guest gọi `/api/quiz/user-tier` không khớp user thì fallback Gold (chỉ để dev).

---

## Workflow theo vai trò

### User

```text
Register (/user/register)
    → Login (/user/login)
    → Dashboard gói (Plans)
    → Sidebar feature
         ├── Available quizzes     (placeholder)
         ├── AI quiz generator     (live)
         ├── Level test            (placeholder)
         ├── Upload document       (placeholder)
         ├── Knowledge base        (placeholder)
         └── Results               (placeholder)
    → Profile
```

Đăng ký User: username, password, email, full name tùy chọn. Header bắt buộc `X-Frontend-Client: auth-portal`. Không tạo Admin qua API.

Sau login, SPA lưu object `user` (không có password) vào `localStorage` key `ielts.auth.user`. Logout xóa localStorage; backend có `POST /api/auth/logout` (token in-memory, SPA hiện chưa gọi).

### Teacher

```text
Register (/teacher/register)   # đủ profile giảng viên
    → Login
    → Dashboard
         ├── Profile / Classes / Lessons / Grading   (demo UI)
         └── AI Review                               (live)
                GET  /api/quiz/moderation-queue
                POST /api/quiz/moderation-decision
```

Đăng ký Teacher bắt buộc: FullName, PhoneNumber, Avatar, Biography, Qualification, QualificationFileURL, Specialization, IELTSBand, ExperienceYears.

Hàng chờ: quiz `Source = AI`, skill Reading hoặc Reading+Writing, `Status` Draft/PendingReview hoặc passage Pending/Rejected.

Quyết định: `Approved` | `PendingReview` | `Pending` | `Rejected`. Quiz.Status và ReadingPassage.ModerationStatus được cập nhật cùng transaction; `ApprovedBy` / `ModeratedBy` = TeacherID nếu parse được.

### Admin

```text
Login (/admin/login)     # không có form register trên UI
    → Dashboard quản trị (UI demo)
```

Admin chỉ tạo ngoài UI (SQL / quy trình nội bộ). API register từ chối `userType=admin`.

---

## Workflow AI Quiz (end-to-end)

Đây là luồng nghiệp vụ đầy đủ đã implement.

```text
User mở /user/feature/ai-quiz
  → chọn skill: Reading | Speaking | Writing | Listening | All
  → dán text hoặc upload ảnh/txt
  → POST FastAPI /api/quiz/generate
        document, input_type, skill, tier, user_id
  → LangGraph
        B1 Ingest / OCR
        B2 Guardrail  ──fail──► REJECTED, dừng
        B3 Clean text
        B4 Summarizer + Orchestrator + Teacher agents + SQL save
        B5 Word + Excel + KnowledgeDocument
  → JSON về SPA (preview / status)
  → Teacher thấy quiz Draft trên moderation queue
  → Approve / Reject
```

Frontend: `AiQuizGenerator.jsx` → `aiQuizApi.generate` (`ClientApp/src/app/api.js`). Header `X-User-ID`, `X-User-Tier`. Ảnh gửi `data:<mime>;base64,...` với `input_type: image`.

Nút download Word/Excel trên SPA gọi `/api/ai-quiz/export/{ext}` — endpoint này **chưa có** trên FastAPI. File thật được pipeline ghi vào `export_dir` ở bước B5.

### Pipeline LangGraph (`AI_quiz/graph.py`)

```text
ingest_node
    → guardrail_node ──[fail]──► END (REJECTED)
    → preprocess_node
    → summarizer_node
    → orchestrator_node
    → [Reading → Speaking → Writing → Listening] theo allocated_teachers
    → backend_sync_node     POST /api/quiz/save
    → export_knowledge_node Word/Excel + POST /api/quiz/knowledge
    → END
```

| Bước | Node | Việc |
| --- | --- | --- |
| B1 | `ingest_node` | Text / PDF / ảnh. Ảnh → `ocr_image_to_text` (Tesseract). |
| B2 | `guardrail_node` | An toàn + liên quan IELTS (`guardrail_check`, LLM nếu có). Fail thì không sinh đề. |
| B3 | `preprocess_node` | `clean_text` (markdown, icon, punct). |
| B4a | `summarizer_node` | Tóm tắt + topic heuristic + target level. |
| B4b | `orchestrator_node` | Skill + tier → danh sách teacher. Bronze + All = Reading + Listening. |
| B4c | `*_teacher_node` | Prompt JSON theo skill qua OpenRouter. LLM lỗi → skeleton fallback, không dataset cứng. |
| B4d | `backend_sync_node` | Gộp passage/groups/sections, POST C#. |
| B5 | `export_knowledge_node` | `.docx`, `.xlsx`, metadata knowledge. |

Teacher Reading: passage + QuestionGroups (MCQ schema catalog).  
Speaking: Part 1/2/3 + vocabulary.  
Writing: Task 1 (có thể sinh chart matplotlib) + Task 2 essay.  
Listening: transcript + QuestionGroups.

Quiz lưu SQL: `Quiz.Status = Draft`, `ReadingPassage.ModerationStatus = Pending`, `Source = AI`. Skill được C# chuẩn hóa vào CHECK (`Reading`, `Writing`, `Reading+Writing`, …).

---

## Auth workflow (chi tiết)

```text
SPA AuthPage
  login    POST /api/auth/login     { username, password, userType }
  register POST /api/auth/register  header X-Frontend-Client: auth-portal
AuthService
  tìm user Active trong [User] | Teacher | Admin
  so khớp password (PBKDF2 hoặc plaintext legacy)
  CreateSession → token in-memory
  trả user + details, ẩn Password
SPA signIn(user) → localStorage → /:role/dashboard
Protected / RoleRoute chặn sai role
```

`userType` trên form: `User` | `Teacher` | `Admin` (alias student/instructor được chuẩn hóa ở router).

---

## API

### Auth (`http://localhost:5000`)

| Method | Path | Ghi chú |
| --- | --- | --- |
| POST | `/api/auth/login` | Body: `username`, `password`, `userType`. 401 nếu sai. |
| POST | `/api/auth/register` | Cấm Admin. Teacher cần đủ field. Duplicate: Username / Email / PhoneNumber. |
| POST | `/api/auth/logout` | `{ "token" }` hoặc `Authorization: Bearer`. |

### Quiz persistence (`http://localhost:5000`)

| Method | Path | Ghi chú |
| --- | --- | --- |
| GET | `/api/quiz/catalog` | `QuestionTypeCatalog` active |
| GET | `/api/quiz/user-tier` | `?userId=` hoặc `?username=` + Package |
| POST | `/api/quiz/save` | Passage + Quiz Draft + QuestionGroup + Question |
| GET | `/api/quiz/moderation-queue` | Hàng chờ AI Reading |
| POST | `/api/quiz/moderation-decision` | `{ quizId, status, teacherId, rejectionReason }` |
| POST | `/api/quiz/knowledge` | `KnowledgeDocument` (Source System/Teacher) |

### AI Quiz (`http://localhost:8000`)

| Method | Path | Ghi chú |
| --- | --- | --- |
| GET | `/health` hoặc `/api/quiz/health` | Service + danh sách bước |
| GET | `/api/quiz/skills` | Catalog skill |
| GET | `/api/quiz/tiers` | Bronze / Silver / Gold |
| POST | `/api/quiz/generate` | Chạy pipeline B1–B5 |
| POST | `/api/quiz/save-json` | Forward payload thô tới C# `/api/quiz/save` |

Ví dụ generate:

```json
{
  "document": "Academic passage text...",
  "input_type": "text",
  "skill": "Reading",
  "tier": "Gold",
  "user_id": "00000000-0000-0000-0000-000000000000",
  "title": "Optional title"
}
```

`input_type`: `text` | `image` | `pdf`. Response: `success`, `status` (`SUCCESS` | `REJECTED` | `ERROR`), `step`, `message`, `data` (summary, topic, quiz_id, file paths, quiz_preview).

---

## Mô hình dữ liệu

Schema: `SqlScripts.sql`.

```text
User ── Package / Subscription / Transaction
User ── UserDocument, QuizAttempt, LevelTest, AIQuizRequest
Teacher ── Classroom, Material, Speaking/WritingSubmission
Admin ── AdminActionLog
Quiz ── QuestionGroup ── Question
Quiz ── ReadingPassage (moderation)
Quiz ── QuizAttempt ── AnswerRecord / QuizAIAnalysis
KnowledgeDocument
Feedback / ContentReport / Notification / LearningActivity
```

Entity dùng trong luồng live: `User`, `Teacher`, `Admin`, `Package`, `Quiz`, `ReadingPassage`, `QuestionGroup`, `Question`, `QuestionTypeCatalog`, `KnowledgeDocument`.

---

## Kiểm tra

Từ `ielts-study-assistant`:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\run_all_tests.ps1
```

Chạy pytest (`AI_quiz/tests`, `tests`), xUnit AuthPortal, rồi `npm run build`. Exit `1` nếu một nhóm fail.

Tách lẻ:

```powershell
python -m pytest AI_quiz/tests tests -v
dotnet test tests/AuthPortal.Tests/AuthPortal.Tests.csproj
cd auth-portal\ClientApp
npm run build
```

- `tests/test_connection_helpers.py` — unit Python, offline
- `tests/test_sql_scripts.py` — SQL integration; skip nếu thiếu driver/config
- `AI_quiz/tests/test_quiz_pipeline.py` — graph / tools
- `tests/AuthPortal.Tests` — AuthService, AuthController

SQL test cần pyodbc, ODBC SQL Server, `config.cfg` hợp lệ.

OCR:

```powershell
python AI_quiz\test_ocr.py
```

---

## Quy ước phát triển

- UI mới: `ClientApp/src/features/<domain>` + route trong `AppRouter.jsx`
- Gọi HTTP: `src/app/api.js` (hoặc module API domain), không `fetch` rải component trừ endpoint đã gắn sẵn (moderation trên Teacher dashboard)
- Backend: controller / model / service đúng thư mục
- Không commit `node_modules`, `bin`, `obj`, secret, `wwwroot` sửa tay
- Trước khi chạy SPA qua ASP.NET: `npm run build`
- Pipeline AI: LLM sinh JSON; template chỉ là fallback khi model lỗi

---

## Bảo mật (còn hạn chế)

- Password: PBKDF2 khi đăng ký mới; còn nhánh so sánh plaintext cho dữ liệu cũ
- Session token in-memory, mất khi restart process; SPA chưa gắn Bearer cho API quiz
- Register chỉ chặn Admin + header client, chưa JWT/policy đầy đủ
- CORS AI Quiz đang `allow_origins=["*"]`
- Trước production: hash-only, JWT hoặc cookie session, authorization theo role, rate limit login, không log PII, secret chỉ env/user-secrets
