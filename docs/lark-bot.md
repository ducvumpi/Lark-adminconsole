# Nhận kết quả Base qua bot Lark

Webhook: `https://<domain-cua-ban>/api/bot/lark/events`.

1. Dùng ứng dụng Lark tự xây dựng có bật Bot, cùng App ID/App Secret với Base đang chọn trong trang Cài đặt. Webhook bot nhóm dạng Incoming Webhook không nhận được lệnh tra cứu.
2. Cấp quyền đọc bản ghi Base (`bitable:app:readonly` hoặc quyền đọc tương ứng trong Developer Console), gửi tin nhắn bot (`im:message:send_as_bot`) và nhận tin nhắn riêng (`im:message.p2p_msg:readonly`). Cấp quyền truy cập Base cho ứng dụng, phát hành phiên bản và hoàn thành phê duyệt quyền nếu được yêu cầu.
3. Thiết lập các biến môi trường phía máy chủ rồi khởi động lại ứng dụng:

   ```env
   LARK_VERIFICATION_TOKEN=<Verification Token trong Events & Callbacks>
   LARK_ENCRYPT_KEY=<Encrypt Key nếu bật mã hóa; nếu không thì bỏ biến này>
   LARK_BOT_ALLOWED_OPEN_IDS=ou_nguoi_dung_1,ou_nguoi_dung_2
   ```

   Open ID phải thuộc cùng ứng dụng; lấy qua thông tin người dùng/sự kiện của ứng dụng Lark. Danh sách trống sẽ chặn mọi truy vấn dữ liệu. Không gửi App Secret hoặc Verification Token trong chat.
4. Trong Events & Callbacks, chọn gửi sự kiện tới máy chủ, nhập URL HTTPS ở trên và đăng ký `im.message.receive_v1`. Verification Token/Encrypt Key phải khớp với máy chủ.
5. Tài khoản được cho phép mở chat riêng với bot và gửi `base`. Thử thêm `base Brand=ABC` hoặc `base Mã ngân sách=ADS001`.

Bot đọc Base/bảng đang chọn trong Cài đặt, trả tối đa 10 dòng, tối đa 12 cột/dòng và rút gọn giá trị dài. Điều kiện `Tên cột=Giá trị` khớp chính xác, hỗ trợ cột văn bản và lựa chọn đơn. Tin nhắn khác trả hướng dẫn; bot bỏ qua chat nhóm và tài khoản ngoài danh sách. Tài khoản trong danh sách có thể đọc mọi cột của bảng đang chọn. Hiện chưa hỗ trợ hỏi đáp ngôn ngữ tự nhiên, phân trang hay tổng hợp toàn bảng.

Webhook phản hồi ngay và xử lý qua Next.js `after`; máy chủ triển khai phải hỗ trợ vòng đời này. Chống trùng trong bộ nhớ trong 1 giờ và dùng UUID cố định khi trả lời; nhiều máy chủ vẫn có thể đọc Base lặp lại. Tác vụ nền không có hàng đợi bền vững: nếu máy chủ dừng sau khi xác nhận sự kiện, kết quả có thể không được gửi; người dùng cần gửi lại lệnh. Khi đổi App ID của Base đang chọn, cần cấu hình lại sự kiện và Open ID tương ứng.

Kiểm tra cục bộ: `node tests/lark-bot.cjs`. Cần kiểm tra thực tế sau khi triển khai: xác minh URL, tài khoản được phép nhận dữ liệu, tài khoản ngoài danh sách/chat nhóm không nhận dữ liệu và Base thiếu quyền trả thông báo lỗi.

Tài liệu Lark: [Node SDK — sự kiện và bot](https://github.com/larksuite/node-sdk), [Reply message](https://open.larksuite.com/document/server-docs/im-v1/message/reply).
