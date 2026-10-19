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

Bot đọc Base/bảng đang chọn trong Cài đặt, trả tối đa 10 dòng, tối đa 12 cột/dòng và rút gọn giá trị dài cho lệnh `base`. Điều kiện `Tên cột=Giá trị` khớp chính xác, hỗ trợ cột văn bản và lựa chọn đơn. Bot bỏ qua chat nhóm và tài khoản ngoài danh sách. Tài khoản trong danh sách có thể đọc mọi cột của bảng đang chọn.

## Hỏi đáp bằng OpenAI

Trên Vercel → Settings → Environment Variables, thêm cho môi trường Production rồi triển khai mã mới:

```env
OPENAI_API_KEY=<API key của OpenAI Platform>
OPENAI_MODEL=gpt-4.1-mini
```

`OPENAI_MODEL` tùy chọn, mặc định `gpt-4.1-mini`; model được chọn phải hỗ trợ Responses API và function calling. Không đặt API key vào biến `NEXT_PUBLIC_*`, không gửi key trong tin nhắn. Cần API key hợp lệ và hạn mức API khả dụng.

Các tin nhắn không phải lệnh `base` sẽ dùng OpenAI. Ví dụ (thay tên/giá trị theo bảng thật):

- “Bảng hiện tại có những cột nào?”
- “Liệt kê Brand và Mã ngân sách của Brand ABC năm 2026.”
- “Có bao nhiêu bản ghi Brand ABC năm 2026?”
- “Tính tổng cột Số tiền TGĐ duyệt cho Brand ABC năm 2026.”

Luồng dùng [Responses API và function calling](https://developers.openai.com/api/docs/guides/function-calling): LLM nhìn schema, gọi công cụ `query_base` chỉ đọc; code xác thực và thực hiện lọc/đếm/tính tổng, sau đó LLM trình bày kết quả. Không cung cấp công cụ ghi/xóa, thực thi code hay chọn Base khác. Chỉ sau khi kiểm tra quyền người gửi, bot mới gọi OpenAI. Không có key thì bot báo chưa cấu hình; lệnh `base` vẫn hoạt động không cần OpenAI.

Mỗi câu hỏi gửi nội dung tin nhắn, tên/kiểu cột và kết quả truy vấn cần thiết tới OpenAI; không gửi App Secret hay token Lark. Với tổng/đếm chỉ gửi kết quả tổng hợp; với liệt kê gửi tối đa 10 dòng × 8 cột, mỗi giá trị tối đa 300 ký tự. Gửi `store: false` cho các yêu cầu Responses. Không lưu lịch sử hội thoại: cần nêu đủ điều kiện trong từng tin nhắn, không dựa vào câu trước.

Giới hạn: lọc AND tối đa 8 điều kiện; văn bản/lựa chọn hỗ trợ equals/contains, số/ngày hỗ trợ so sánh; ngày dùng Unix milliseconds do model suy ra. Tổng chỉ hỗ trợ cột số và công thức trả số; ô trống được bỏ qua và đếm riêng, ô có dữ liệu không phải số sẽ báo lỗi. Tổng là phép cộng bản ghi thỏa điều kiện, chưa tự loại trùng hay xử lý ngân sách cha/con. Chưa hỗ trợ group-by, sắp xếp hoặc thống kê giá trị phân biệt.

Mỗi lần dùng tối đa 3 yêu cầu OpenAI và 2 truy vấn công cụ, giới hạn xử lý AI/đọc Base 40 giây để còn thời gian gửi trả lời trong webhook 60 giây. Công cụ quét tối đa 10 trang × 500 dòng trên toàn bảng, lọc trong code; tổng/đếm chỉ trả khi đọc hết bảng. Bảng lớn hơn giới hạn sẽ báo chưa đủ dữ liệu thay vì trả tổng một phần (thêm điều kiện lọc không làm giảm số dòng phải quét). Khi đó cần bảng tổng hợp/bảng nhỏ hơn. API lỗi/quá hạn sẽ trả thông báo; kiểm tra log Vercel, API key, model và hạn mức.

Kiểm tra mô phỏng không gọi API thật: `node tests/lark-openai.cjs` và `node tests/lark-bot.cjs`. Sau khi deploy, thử các câu trên, đối chiếu tổng với Base và thử tài khoản ngoài danh sách để xác nhận không được truy vấn. Thử `base` để kiểm tra đường đọc trực tiếp nếu AI gặp lỗi.

Webhook phản hồi ngay và xử lý qua Next.js `after`; máy chủ triển khai phải hỗ trợ vòng đời này. Chống trùng trong bộ nhớ trong 1 giờ và dùng UUID cố định khi trả lời; nhiều máy chủ vẫn có thể đọc Base lặp lại. Tác vụ nền không có hàng đợi bền vững: nếu máy chủ dừng sau khi xác nhận sự kiện, kết quả có thể không được gửi; người dùng cần gửi lại lệnh. Khi đổi App ID của Base đang chọn, cần cấu hình lại sự kiện và Open ID tương ứng.

Kiểm tra cục bộ: `node tests/lark-bot.cjs`. Cần kiểm tra thực tế sau khi triển khai: xác minh URL, tài khoản được phép nhận dữ liệu, tài khoản ngoài danh sách/chat nhóm không nhận dữ liệu và Base thiếu quyền trả thông báo lỗi.

Tài liệu Lark: [Node SDK — sự kiện và bot](https://github.com/larksuite/node-sdk), [Reply message](https://open.larksuite.com/document/server-docs/im-v1/message/reply).
