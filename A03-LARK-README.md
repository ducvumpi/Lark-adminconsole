# A03 trên Lark AI-Friendly Database

Preview đã cập nhật ngày 26/10/2026: https://tsgsifizy3jj.sg.larksuite.com/baseapp/DpYlpukK7rwhddjOPfClC8Jcgae?mode=edit

Biên nhận: `pub_7700483465963409161`, draft revision 3. Chưa phát hành production.

## Dự án và dữ liệu

Mã nguồn: `C:\Users\Win10\Desktop\larkadmin\lark-adminconsole\a03-lark-app`. React và server được build rồi triển khai lên Lark bằng Base Database CLI.

- Base nguồn: `ZszDbVpEEafitKsAWfRlTnRggpd`, bảng `tblFjyYCeYgHjs51`.
- Base của app: `Tc4qbZqpJaBWKXsQ03VlaVgzgwr`, bảng A03 `tbljA87qUBDYVHYe`.
- Hồ sơ: `tblesB2lbyj7iN9e`.

Đã sao chép và đối chiếu 4.040 dòng, 169.680 ô chuẩn hóa, JSON nguồn và số tiền. Công thức/lookup giữ dưới dạng giá trị snapshot. Không tự đồng bộ hoặc ghi ngược về Base nguồn.

## Sử dụng

1. Mở Preview, chọn tối đa 50 dòng cùng Brand rồi lập và lưu hồ sơ nháp.
2. Mở hồ sơ, chọn 1–5 người duyệt theo thứ tự từ danh bạ.
3. Mở Sheet: https://tsgsifizy3jj.sg.larksuite.com/sheets/GHglsL11ihh6kTt1vn6l0jF6gge. Cột H là tiền hiện tại; nhập tiền đề xuất ở cột I đúng dòng, không đổi ID.
4. Đọc tiền từ Sheet trong hồ sơ, kiểm tra bản xem trước rồi gửi duyệt.
5. Người được giao node hiện tại xử lý; node cuối đồng ý mới ghi bản tiền đã chốt vào A03 của app.

Người lập không được tự duyệt, có thể rút hồ sơ chưa hoàn tất. Lưu SHA256 bản tiền, ý kiến, người xử lý và thời gian. Không tạo phiếu native Lark Approval hoặc gửi thông báo IM.

## Cấu hình và kiểm chứng

Config `A03_LARK_APP_ID` và Secret `A03_LARK_APP_SECRET` đã được cấu hình ở runtime Preview từ nguồn người dùng xác nhận, qua stdin; không đưa Secret vào Page hoặc log. Bot đã đọc Sheet qua API gốc.

Build và kiểm tra toàn project đã qua; 24 kiểm tra workflow và 10 kiểm tra lưu nháp giả lập đã qua. Sau triển khai, truy vấn đọc được đủ 4.040 dòng. Chưa có hồ sơ nháp để kiểm chứng đọc Sheet qua FaaS. Chưa nghiệm thu giao diện, iframe, nhiều tài khoản hoặc ghi tiền thực tế. Không tạo hồ sơ hoặc ghi tiền để thử.

## Giới hạn

Người vào app có cùng quyền đọc A03; chưa phân quyền B04.1 Brand. Hồ sơ chỉ trả cho người lập hoặc người được giao duyệt. Chọn người duyệt không tự cấp quyền mở Preview/Sheet. Chưa mở rộng chia sẻ.

Base chưa bảo đảm giao dịch nguyên tử hoặc khóa phân tán. Kiểm tra phiên bản, dữ liệu gốc, khóa trong một tiến trình và dấu đồng bộ chỉ giảm nguy cơ xung đột. Tránh duyệt đồng thời cùng hồ sơ hoặc sửa trực tiếp tiền khi đang trình. Ghi từng phần hoặc kết quả chưa rõ phải đối soát, không tự ghi lại.

## Các nơi thay đổi

- `a03-lark-app/page/src/BudgetApp.tsx`, `budget.css`: sổ A03 và hồ sơ.
- `a03-lark-app/page/src/BudgetSheet.tsx`: nhúng Sheet và mở riêng.
- `a03-lark-app/page/src/ApprovalFlow.tsx`, `approval-flow.css`: node duyệt.
- `a03-lark-app/database-functions/`: 6 truy vấn cố định, danh tính từ `CURRENT_USER_ID()`.
- `a03-lark-app/server/functions/save_draft/`: lưu nháp, kiểm tra dữ liệu gốc.
- `a03-lark-app/server/functions/budget_flow/`: đọc Sheet, chốt tiền, duyệt và ghi A03.
- `a03-lark-app/base-database.jsonc`, `catalog.json`, `agent-tools.json`: app, bảng và hàm.
- `scripts/test-a03-flow.cjs`, `scripts/test-a03-drafts.cjs`: kiểm tra giả lập.
- `scripts/verify-a03-flow-preview.cjs`: kiểm tra chỉ đọc Preview.
- `scripts/configure-a03-runtime.cjs`: cấu hình runtime bằng stdin.

Không chạy lại script tạo Base, sao chép dữ liệu hoặc tạo Sheet để cập nhật UI. Production cần trải nghiệm và xác nhận bản Preview tương ứng.

