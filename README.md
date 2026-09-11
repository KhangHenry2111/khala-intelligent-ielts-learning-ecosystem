# IELTS Study Assistant

Ứng dụng gồm backend ASP.NET Core, React SPA và các công cụ kiểm tra SQL/Python. React là nguồn duy nhất của UI; `wwwroot` chỉ là thư mục output được Vite build để ASP.NET phục vụ.

Runtime hiện tại: .NET 10, Node.js LTS, React 19, Vite 8, React Router 7, Python với SQLAlchemy 2 và pyodbc 5.

## Chuẩn thư mục

```text
ielts-study-assistant/
	auth-portal/
		ClientApp/                 # React source và tooling
			src/app/                 # router, auth context, API client
			src/features/auth/       # login/register theo role
			src/features/dashboard/  # dashboard/profile
			src/styles.css           # design system của SPA
		Controllers/               # HTTP API controllers
		Models/                    # request/response models
		Services/                  # business logic và database access
		wwwroot/                   # React build output, không sửa tay
   AI_quiz/                    # AI Quiz service độc lập
      quiz_api.py                # FastAPI entry point
      graph.py                   # LangGraph quiz pipeline
      tool.py / tools.py         # Tool exports và implementations
      tests/                     # Test riêng của AI Quiz
		AuthPortal.csproj
	tests/                       # Python và .NET tests
	SqlScripts.sql               # schema database
	config.cfg                   # local database config, không commit secret
	main.py                      # launcher tùy chọn
```

## UI endpoints

Mỗi UI là một route React riêng biệt được phân quyền trong bộ định tuyến:

| Route | Mục đích |
| --- | --- |
| `/user/login` | Học viên (User) đăng nhập |
| `/user/register` | Học viên (User) đăng ký |
| `/teacher/login` | Giảng viên (Teacher) đăng nhập |
| `/teacher/register` | Giảng viên (Teacher) đăng ký |
| `/admin/login` | Quản trị viên (Admin) đăng nhập |
| `/:role/dashboard` | Dashboard sau đăng nhập (Có MainLayout chung, nội dung riêng) |
| `/:role/profile` | Hồ sơ người dùng |

`Protected`, `RoleRoute`, và `MainLayout` trong `ClientApp/src/app/AppRouter.jsx` quản lý toàn bộ giao diện sau đăng nhập. Trạng thái user hiện được lưu ở localStorage để duy trì phiên UI. Dashboard đã được nâng cấp với giao diện Dark Mode Glassmorphism hiện đại cho cả 3 nhóm người dùng.

## Chạy frontend

Cài Node.js LTS trước, sau đó:

```powershell
cd auth-portal/ClientApp
npm install
npm run dev
```

Vite chạy tại `http://localhost:5173` và proxy `/api` tới ASP.NET tại port 5000.

Build production vào `auth-portal/wwwroot`:

```powershell
cd auth-portal/ClientApp
npm run build
cd ..
dotnet run --urls http://localhost:5000
```

Mở `http://localhost:5000`. Không chỉnh trực tiếp file trong `wwwroot`; hãy sửa `ClientApp/src` rồi build lại.

Các package frontend được khóa trong `ClientApp/package-lock.json`. Dependency Python được khai báo trong `requirements.txt`; cài bằng `python -m pip install -r requirements.txt`.

## Backend API

| Method | Endpoint | Ghi chú |
| --- | --- | --- |
| POST | `/api/auth/login` | Body: `username`, `password`, `userType` |
| POST | `/api/auth/register` | Có header `X-Frontend-Client: auth-portal`; cấm role Admin |

Login tìm user active trong database và trả `user` không bao gồm password. Register student và instructor giữ nguyên field contract của backend hiện tại.

## Kiểm tra

Chạy toàn bộ kiểm thử và build frontend bằng một lệnh từ thư mục `ielts-study-assistant`:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\run_all_tests.ps1
```

Script in kết quả riêng cho Python, .NET và frontend, sau đó in bảng tổng hợp. Nó trả exit code `1` nếu có nhóm thất bại.

Các test được sắp xếp như sau:

- `tests/test_connection_helpers.py`: unit test Python, chạy offline.
- `tests/test_sql_scripts.py`: integration test SQL Server; tự skip nếu thiếu SQLAlchemy, driver, config hoặc database.
- `tests/AuthPortal.Tests/`: unit test xUnit cho `AuthService` và `AuthController`; không cần dữ liệu demo.
- `scripts/run_all_tests.ps1`: test runner thống nhất.

Có thể chạy riêng:

```powershell
python -m unittest discover -s tests -p "test_*.py" -v
dotnet test tests/AuthPortal.Tests/AuthPortal.Tests.csproj --no-restore
cd auth-portal\ClientApp
npm run build
```

SQL integration test cần `pyodbc`, driver SQL Server và cấu hình hợp lệ trong `config.cfg`. Build frontend ghi output vào `auth-portal/wwwroot`; không sửa trực tiếp thư mục này.

## Kiến trúc tổng thể hệ thống IELTS AI Learning Platform

Dưới đây là mô hình kiến trúc hệ thống theo hướng học tập IELTS, tích hợp AI, giáo viên và quản trị. Mục tiêu là xây dựng một nền tảng thống nhất, dùng chung một hệ thống đăng nhập nhưng có dashboard riêng theo từng vai trò.

```text
                     IELTS AI Learning Platform
                                │
            ┌───────────────────────┼───────────────────────┐
            │                       │                       │
         User                    Teacher                 Admin
            │                       │                       │
      Learning UI            Teaching UI            Management UI
            │                       │                       │
      - Learn                 - Profile               - Accounts
      - Practice             - Classes               - Teachers
      - Test                 - Lessons               - Content
      - AI Quiz              - Grading               - Feedback
      - Progress             - AI Review             - Reports
```

### 1. Tổng quan vai trò

Hệ thống có 3 role chính, mỗi role sử dụng cùng một hệ thống authentication nhưng giao diện và quyền truy cập khác nhau:

- User: học viên thực hiện đăng ký, kiểm tra trình độ, học bài, luyện tập, làm bài test, tạo AI Quiz, theo dõi tiến độ.
- Teacher: giảng viên quản lý lớp học, upload bài giảng, chấm bài, review nội dung AI sinh ra.
- Admin: quản trị hệ thống, quản lý tài khoản, giảng viên, nội dung, phản hồi và báo cáo.

Mỗi role có dashboard riêng nhưng share cùng một login flow và user identity.

### 2. Luồng chính của User

```text
Đăng ký
  ↓
Test trình độ
  ↓
Xác định Level
  ↓
Chọn Package
  ↓
Dashboard
  ↓
Học tập / Luyện tập / Test / AI
```

#### 2.1. Đăng ký và Placement Test

Khi học viên đăng ký tài khoản mới, hệ thống không cho vào ngay dashboard chính mà bắt đầu bằng một bài Placement Test để đánh giá năng lực ban đầu theo 4 kỹ năng:

- Reading
- Listening
- Writing
- Speaking

Kết quả của bài test giúp xác định:

- Band hiện tại của học viên
- Mức độ phù hợp với bài học tiếp theo
- Độ khó của quiz và bài tập AI
- Khuyến nghị level: Beginner, Intermediate, Advanced

Ví dụ output sau test:

```text
Your Estimated IELTS Level
Reading     5.5
Listening   5.0
Writing     5.0
Speaking    4.5
Overall     5.0
Recommended Level: Intermediate
```

### 3. User Dashboard

Sau khi đăng nhập, User sẽ thấy màn hình dashboard chính với các thành phần sau:

| Khu vực | Nội dung |
| --- | --- |
| Header | Logo, tìm kiếm, thông báo, avatar |
| Sidebar | Dashboard, Learn, Practice, Test, AI Quiz, Lessons, Progress, Package |
| Main Dashboard | Trình độ hiện tại, mục tiêu IELTS, tiến độ học |
| Quick Actions | Làm Quiz, Test trình độ, AI Quiz, xem bài giảng |
| Progress | Reading, Listening, Writing, Speaking |
| Recent Activity | Các bài vừa làm |
| Recommended | Bài học/câu hỏi AI đề xuất |

Ví dụ bố cục UI:

```text
┌─────────────────────────────────────────────────────────────┐
│ Logo   Search        Notification        Avatar            │
├──────────────┬──────────────────────────────────────────────┤
│ Dashboard    │ Welcome, User                              │
│ Learn        │                                            │
│ Practice     │ Current Band: 5.5      Target: 7.0          │
│ Test         │                                            │
│ AI Quiz      │ [Reading] [Listening] [Writing] [Speaking] │
│ Lessons      │                                            │
│ Progress     │ [Làm Quiz] [AI Quiz] [Test trình độ]       │
│ Package      │                                            │
│              │ Recommended Lessons                         │
└──────────────┴──────────────────────────────────────────────┘
```

### 4. User Feature Modules

#### 4.1. AI Quiz

AI Quiz là chức năng đặc trưng của hệ thống. Người dùng có thể tạo bộ câu hỏi từ:

- My Documents
- Knowledge Base

Và tùy chọn:

- Skill: Reading / Writing / Reading + Writing
- Difficulty: Beginner / Intermediate / Advanced
- Number of questions: ví dụ 20

Sau khi AI sinh câu hỏi, người dùng làm bài trong giao diện dạng multiple choice:

```text
AI Generated Quiz
Question 1 / 20
According to the passage, ...
A. ...
B. ...
C. ...
D. ...
[Previous] [Next]
```

Sau khi hoàn thành, hệ thống hiển thị:

- Correct: 16 / 20
- Score: 80%
- phân tích theo kỹ năng: Reading/Writing
- AI Analysis: điểm yếu chính, gợi ý bài tập tiếp theo

Ví dụ:

```text
Your main weakness:
Reading inference questions

Recommended:
- Practice inference questions
- Read Lesson #24
- Generate another practice set
```

Điểm mạnh của tính năng này nằm ở khả năng sử dụng AI để tạo bài luyện tập theo mức độ và mục tiêu của từng học viên, đồng thời cung cấp phản hồi cá nhân hóa.

#### 4.2. Package & Subscription

Hệ thống có mô hình gói dịch vụ linh hoạt, phù hợp với vấn đề token/quota AI:

- Free: 0đ
- Silver: 199,000đ
- Gold: 399,000đ

Mỗi gói có quota khác nhau, ví dụ:

```text
Free:
- AI Quiz: 8/month
- Placement Test: 1/month
- Reading / Listening / Free Lessons

Silver:
- 4 Skills
- AI Speaking
- AI Writing
- 60 AI Quiz/month
- 4 Tests/month
- Advanced Lessons

Gold:
- 4 Skills
- Teacher Speaking/Writing
- 250 AI Quiz/month
- 12 Tests/month
- Premium Lessons
```

Tại dashboard nên hiển thị quota còn lại như:

```text
AI Quiz: 42/60 lượt còn lại
```

#### 4.3. Lessons

Người học xem các bài giảng do Teacher đóng góp. Mỗi lesson có thể chứa:

- Tên bài
- Teacher
- Kỹ năng
- Level
- Free/Premium
- Nội dung
- Tài liệu đính kèm

UI có thể sắp xếp theo filter:

```text
[All] [Reading] [Listening] [Writing] [Speaking]
```

#### 4.4. Progress Tracking

User có thể theo dõi tiến độ học tập theo từng kỹ năng:

```text
My Progress
Current Band: 5.5
Target Band: 7.0

Reading   ███████░░░ 5.5
Listening ██████░░░░ 5.0
Writing   ██████░░░░ 5.0
Speaking  █████░░░░░ 4.5

Tests completed: 12
Questions: 348
Learning streak: 7 days
```

Hệ thống có thể mở rộng thêm biểu đồ tiến độ theo thời gian để ghi nhận sự tăng trưởng qua từng tuần/tháng.

### 5. Teacher UI

Teacher không nên dùng dashboard giống User. Teacher dashboard tập trung vào các tác vụ giảng dạy và đánh giá.

```text
Teacher Dashboard
├── Profile
├── Classes
├── Lessons
├── Grading
└── AI Review
```

#### 5.1. Teacher Profile

Teacher có profile riêng với thông tin:

- Avatar
- Name
- Biography
- IELTS Score
- Qualification
- Experience
- Specialization: Reading, Writing

#### 5.2. Classes

Teacher có thể:

- Tạo lớp
- Xem lớp
- Xem học viên
- Tạo lịch học
- Upload tài liệu

Một lớp có thể hiển thị:

```text
IELTS Writing 6.5
24 Students
Next lesson: 19:00 - 20:30
[Google Meet]
[Manage Class]
```

#### 5.3. Lessons

Teacher upload bài giảng với các trường:

- Title
- Skill
- Level
- Description
- Upload Material
- Access: Free / Premium

#### 5.4. Grading

Đây là chức năng dành cho học viên gói Gold hoặc các học viên có yêu cầu chấm bài giảng dạy. Teacher xem bài nộp và chấm band theo các tiêu chí như:

- Fluency
- Vocabulary
- Grammar
- Pronunciation

Sau đó đưa ra Overall Band và feedback chi tiết.

#### 5.5. AI Review (Human-in-the-loop)

Đây là phần rất quan trọng để giảm rủi ro AI sinh nội dung sai. Teacher được xem các câu hỏi do AI tạo ra và có quyền:

- Approve
- Edit
- Reject

Mục tiêu là đảm bảo chất lượng câu hỏi và đáp án trước khi phát cho học viên. Đây là cơ chế kiểm soát kiểm định để hệ thống vừa tự động hóa vừa vẫn đảm bảo chuyên gia con người đóng vai trò xác nhận.

### 6. Admin UI

Admin là vai trò quản trị nội bộ, không cần hiển thị các chức năng kỹ thuật như database, server, source code hay API key. Admin tập trung vào các hoạt động quản lý người dùng và nội dung.

```text
Admin Dashboard
├── Accounts
├── Teachers
├── Content
├── Feedback
└── Reports
```

#### 6.1. Dashboard

Admin nhìn thấy tổng quan hệ thống như:

- Users
- Teachers
- Lessons
- Pending Reports
- Recent Activities

#### 6.2. Account Management

Admin có thể:

- Xem tài khoản
- Chỉnh sửa
- Khóa / đình chỉ
- Xóa theo quyền hạn

#### 6.3. Teacher Management

Theo yêu cầu, Admin có thể tạo tài khoản Teacher thủ công. Tuy nhiên, tài khoản Admin không xuất hiện trong UI tạo Admin; quyền nâng cấp Admin phải do phòng Tech thực hiện theo quy trình nội bộ.

#### 6.4. Content Management

Admin quản lý nội dung do Teacher phát hành, bao gồm:

- Kiểm duyệt bài giảng
- Ẩn hoặc xoá nội dung vi phạm chính sách
- Theo dõi trạng thái Published / Reported / Hidden

#### 6.5. Feedback & Reports

Admin xử lý các vấn đề từ người dùng như:

- Góp ý
- Khiếu nại
- Báo cáo bài giảng
- Báo cáo tài khoản
- Vấn đề sử dụng website

### 7. Mô hình dữ liệu và nghiệp vụ gợi ý

Trong bối cảnh nền tảng IELTS, hệ thống nên có các entity cơ bản sau:

- User
- Teacher
- Admin
- Course / Lesson
- Class
- Package / Subscription
- Test / Placement Test
- Quiz / Question / Answer
- Progress / Band Score
- Feedback / Report
- AI Review Item

Các mối quan hệ chính:

```text
User ── has one ── Package
User ── takes ─── Test / Quiz / Lesson
User ── has ─── Progress
Teacher ── teaches ─── Classes
Teacher ── creates ─── Lessons
Admin ── manages ─── Users / Content / Reports
AI ── generates ─── Quiz Questions
Teacher ── reviews ─── AI-generated questions
```

### 8. Định hướng thiết kế hệ thống

Về mặt kiến trúc kỹ thuật, hệ thống nên được tổ chức theo các tầng sau:

1. Presentation Layer
   - React SPA
   - Route theo role
   - Dashboard riêng cho từng role

2. Application Layer
   - ASP.NET Core API
   - Auth, profile, lesson, quiz, grading, admin management

3. Business Logic Layer
   - Placement test evaluation
   - AI quiz generation logic
   - Band calculation
   - Quota subscription enforcement
   - Content moderation workflow

4. Data Layer
   - SQL Server / database schema
   - user data, lessons, tests, reports

5. AI Layer
   - quiz generation
   - content recommendation
   - skill analysis
   - evaluation support

### 9. Kết luận

Hệ thống này không chỉ là một ứng dụng học IELTS đơn thuần, mà là một nền tảng học tập cá nhân hóa kết hợp AI, giáo viên và quản trị chuyên nghiệp. Mỗi role có một phần trách nhiệm riêng nhưng cùng chia sẻ một hệ thống dữ liệu và đăng nhập. Từ trải nghiệm người học đến hoạt động chấm điểm và quản lý nội dung, hệ thống hướng tới mục tiêu tối ưu hóa trải nghiệm học tập, độ chính xác AI và tính khả thi vận hành sản phẩm thực tế.

## Quy ước phát triển

- UI mới đặt trong `auth-portal/ClientApp/src/features/<domain>` và phải có route rõ ràng.
- API calls đặt trong `src/app/api.js` hoặc module API theo domain, không gọi `fetch` rải trong component.
- Backend đặt controller, model và service đúng thư mục tương ứng.
- Không commit `node_modules`, `bin`, `obj`, secret hoặc file build trung gian.
- Trước khi chạy ASP.NET production, luôn chạy `npm run build` để đồng bộ `wwwroot`.

## Lưu ý kỹ thuật

Password service hiện còn dùng cơ chế so sánh plaintext và auth chưa có token/authorization thực sự. Trước production cần chuyển sang hash verification, session/JWT, policy authorization, rate limiting và API thật cho dashboard.
