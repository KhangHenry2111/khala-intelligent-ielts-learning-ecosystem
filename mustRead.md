sqlScript.sql: Script tạo db
config.cfg: Lưu toàn bộ cấu hình bao gồm API key. sql connection string
main.py: chứa toàn bộ các microservices của chương trình giúp khởi động cùng 1 lúc
sessionHistory.md: không được truy cập trực tiếp mà phải thông qua terminalToolForAI
Terminal Cli tools (trong folder terminalToolsForAI):
1. addSession.py: Cập nhật trạng thái phiên làm việc hiện tại, tự tăng Id (Bắt buộc phải làm khi thực hiện 1 yêu cầu)
Cập nhật nội dung làm việc của toàn bộ session này và ghi phía bên dưới theo định dạng:
[Id]: Tự lấy ID gần nhất và +1
[Model_name]: Tên model, nếu không xác định thì ghi tên ide vào(Ví dụ codex)
[Time]: Tự lấy theo giờ Việt Nam
[Title]: Model điền tiêu đề phiên làm việc
[Status]:  (Cancel/In Process/Done) chọn 1 trong 3 trạng thái, nếu bắt đầu 1 session thì chọn in progress
[Changed_File]: Liệt kê các files đã thay đổi
[Description]: Mô tả
2. getGitCommit.py: In file đã đổi trong git (Tuỳ chọn khi cần xem)	
3. inProccessTask.py: Liệt kê block In Process (Tuỳ chọn, làm khi được yêu cầu)
4. seeDetailBlock.py: In nguyên block theo Id (Tuỳ chọn khi cần xem)
5. findLastestChangedFiles.py: Tìm file đã được chỉnh sửa gần nhất (Tuỳ chọn khi cần xem)	
6. topKFiles.py: Top k block mới nhất cần xem (Tuỳ chọn khi cần xem)
