# Ứng dụng ngân sách được duyệt A03

Mã nguồn: `C:\Users\Win10\Desktop\larkadmin\lark-adminconsole`.
Giao diện: `/ngan-sach`, ví dụ http://localhost:3000/ngan-sach.

Ứng dụng React/Next.js đọc bảng A03 (`tblFjyYCeYgHjs51`) trong Base `ZszDbVpEEafitKsAWfRlTnRggpd` bằng Lark OpenAPI phía server. Không cần Base Database site binding: người dùng đăng nhập OAuth và app gọi API bằng phiên của họ. Secret bot lấy từ profile server tương ứng, không gửi xuống trình duyệt. CLI chỉ hỗ trợ kiểm tra quyền/tài nguyên, không biên dịch ứng dụng.

## Chạy và cấu hình

1. Chạy `npm install` nếu chưa có dependencies. Xem `budget.env.example`, thêm các biến vào `.env.local`. Giữ nguyên `SESSION_SECRET` hiện tại nếu đã đủ 24 ký tự; thay khóa sẽ làm các phiên và hồ sơ mã hóa cũ không đọc được.
2. Trong Developer Console của đúng bot, thêm OAuth redirect URL: `http://localhost:3000/api/budget/auth/callback`. Khi dùng tên miền thật, đặt `BUDGET_PUBLIC_URL=https://ten-mien-cua-ban` và đăng ký callback tương ứng.
3. Cấu hình OAuth và các scope API cần dùng trong Lark Developer Console; admin phải duyệt/phát hành app và người dùng cấp quyền OAuth. Cần quyền đọc Base/fields, đọc Sheets, đọc/khởi tạo Approval và cập nhật record A03 sau nghiệm thu. Cấp quyền CLI không tự cấp quyền OAuth cho ứng dụng web. API thực tế có thể báo thiếu quyền; app hiển thị mã lỗi và LogID để đối chiếu.
4. `npm run dev`, mở `/ngan-sach`, đăng nhập bằng Lark. Đăng nhập CLI không tạo phiên đăng nhập web. Trong phần Kết nối, chọn cấp quyền nghiệp vụ khi sử dụng bảng tính/Approval/ghi Base.
5. Build: `npm run build`. Chạy bản build bằng `npm start`. Chỉ chạy **một tiến trình Node**, sử dụng ổ đĩa bền vững và HTTPS khi triển khai truy cập từ ngoài. Không dùng serverless có filesystem tạm thời cho phiên bản này.

## Phạm vi và quyền truy cập

Workspace chỉ hiển thị bảng A03. Danh sách Brand lấy từ các lựa chọn trên trường `Brand` của chính bảng A03; truy vấn dữ liệu lọc thêm theo Brand. Đây **chưa phải** cơ chế phân quyền theo Brand hay vai trò nghiệp vụ. Lark kiểm soát record access theo tài khoản OAuth hiện tại; quyền theo Brand, ai được lập hồ sơ và ai được đồng bộ cần được thiết kế, kiểm thử và nghiệm thu trước khi chia sẻ rộng/production. Các chức năng tạo record trực tiếp đã bị tắt.

## Bảng tính → Approval → A03

1. Trong A03, xuất mẫu Excel cho trang đang xem; mẫu giữ `record_id` và thêm cột `so_tien_duyet`.
2. Mở/chuyển bảng tính thành Lark Sheets và dùng URL `/sheets/...`. Chọn đúng tab dữ liệu; không tự đoán tab khi workbook có nhiều tab. App đọc qua phiên OAuth người dùng và không tự thay đổi chia sẻ.
3. Lưu Sheet trước khi đọc số tiền. Có thể dùng iframe hoặc mở Sheet riêng; nhúng phụ thuộc chính sách tenant. Không hỗ trợ chỉnh trực tiếp file `.xlsx` chưa chuyển thành Lark Sheets.
4. Tạo bản chốt tối đa 200 dòng, số nguyên VND không âm, không trùng `record_id`; mỗi dòng phải tồn tại trong A03 và thuộc Brand đang chọn. Hồ sơ là snapshot; sửa Sheet sau đó không thay nội dung đã chốt.
5. Gửi Approval **đang bị khóa**: chưa xác minh được định nghĩa mẫu/ba cấp duyệt (quản lý trực tiếp → TGĐ → kế toán) và danh sách người duyệt theo Brand chưa cấu hình. Không gửi phiếu thật, không ghi tiền vào A03 cho đến khi cung cấp/xác minh mẫu native và nghiệm thu luồng.
6. Sau khi xác minh mẫu, mới cấu hình `BUDGET_APPROVAL_CODE`, `BUDGET_APPROVAL_TITLE_FIELD`, `BUDGET_APPROVAL_SNAPSHOT_FIELD`, `BUDGET_APPROVAL_NODE_KEY`. Kiểm tra tất cả trường bắt buộc, node và định tuyến trước khi mở khóa. Luồng đồng bộ hiện có đối chiếu trạng thái Approval, snapshot và giá trị gốc A03 trước ghi.

Hiện tại app đọc A03 và hỗ trợ chuẩn bị hồ sơ/snapshot từ Sheet. Chưa phát hành production, chưa tự sinh A03 từ Sheet/A02, chưa tự tạo phiếu thanh toán/kế toán.

## An toàn ghi và giới hạn triển khai

Không có giao dịch nguyên tử/CAS của Lark Base. App kiểm tra giá trị gốc trước khi ghi, ghi tuần tự và dừng khi chưa rõ kết quả. Không tự thử lại hồ sơ `unknown`/`partial`. Không thể loại bỏ hoàn toàn xung đột khi người khác sửa Base giữa kiểm tra và ghi. Cần đối soát thủ công dòng lỗi; không nhấn tạo lại phiếu chỉ vì timeout.

Phiên đăng nhập và hồ sơ lưu AES-256-GCM trong `data/budget-app/`, đã gitignore. Cần sao lưu cả thư mục lẫn khóa `SESSION_SECRET` một cách an toàn. Khóa trong bộ nhớ chỉ bảo vệ cùng hồ sơ trong một tiến trình, không phải khóa phân tán. Chưa có job nền tự theo dõi Approval, refresh token hay lịch sử phục hồi hồ sơ lỗi trong giao diện. Phiên hết hạn cần đăng nhập lại. Chưa phát hành production; OAuth, iframe và đồng bộ tiền thật cần nghiệm thu sau khi cấu hình tenant/mẫu.

## Các nơi thay đổi

- `app/ngan-sach/`: giao diện React, CSS, trang đăng nhập, A03, hồ sơ và bảng tính.
- `app/api/budget/`: API và OAuth callback, kiểm tra phiên/quyền trước thao tác.
- `app/lib/budget/domain.ts`: ánh xạ Base/table, quyền Brand, tiền VND, kiểm tra bảng tính và bản được duyệt.
- `app/lib/budget/lark.ts`: truy vấn Base A03, Sheets, ghi A03 sau khi Approval được xác minh.
- `app/lib/budget/workflow.ts`: gửi/đối chiếu native Approval, đồng bộ và dừng khi lỗi.
- `app/lib/budget/storage.ts`: lưu mã hóa và khóa hồ sơ trong một tiến trình.
- `proxy.ts`: mở đường vào workspace với lớp OAuth riêng; màn hình quản trị cũ giữ cơ chế đăng nhập hiện tại.
- `app/components/SpaDashboard.tsx`: liên kết vào workspace.
- `tests/budget-workspace.cjs`: kiểm tra mapping A03, tiền, kiểm tra snapshot và chặn ghi sai trạng thái bằng API giả lập.

Chạy kiểm tra: `node tests/budget-workspace.cjs`, `npx tsc --noEmit --incremental false`, `npm run build`. Các bài kiểm tra không gửi Approval hoặc ghi tiền lên Base thật.
