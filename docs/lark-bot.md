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

## OpenRouter: đọc, tạo và sửa bản ghi, không cần MCP

Bot gọi trực tiếp OpenRouter Chat Completions và API Lark. Không cần chạy `mcp-server.ts` hay kết nối MCP. Model chọn công cụ; code kiểm tra tham số, thực hiện API và trả kết quả. Đây là luồng agent cho Base, chưa phải bộ tính năng đầy đủ của AnyGen.

Thêm các biến phía máy chủ rồi triển khai lại:

```env
LARK_AI_PROVIDER=openrouter
OPENROUTER_API_KEY=<key OpenRouter>
OPENROUTER_MODEL=<model ID vendor/model hỗ trợ tool calling>
LARK_BOT_ALLOWED_OPEN_IDS=ou_nguoi_dung_1,ou_nguoi_dung_2
LARK_BOT_WRITE_OPEN_IDS=ou_nguoi_dung_1
```

`OPENROUTER_MODEL` là bắt buộc, dùng ID chính xác từ danh sách model OpenRouter. Không dùng biến `NEXT_PUBLIC_*` cho key. Khi có `OPENROUTER_API_KEY` hoặc chọn `LARK_AI_PROVIDER=openrouter`, tin nhắn AI dùng OpenRouter; lỗi cấu hình không tự chuyển dữ liệu sang OpenAI. Lệnh `base` vẫn đọc trực tiếp Lark.

Người gửi phải nằm trong `LARK_BOT_ALLOWED_OPEN_IDS`; muốn tạo/sửa phải đồng thời nằm trong `LARK_BOT_WRITE_OPEN_IDS`. Danh sách ghi trống chỉ cho phép đọc. Ứng dụng Lark cần quyền tạo/sửa bản ghi và quyền chỉnh sửa bảng Base tương ứng, ngoài các quyền nhận/gửi tin nhắn. Phát hành lại quyền ứng dụng nếu cần.

Ví dụ (thay tên cột và recordId theo bảng thật):

- `Tạo bản ghi mới: Tên = ABC, Số tiền = 1500000`.
- `Tìm bản ghi Tên = ABC rồi sửa Số tiền thành 2000000`.
- `Sửa bản ghi recXXXX: Trạng thái = Đã duyệt`.

Mỗi tin nhắn tối đa một lần tạo/sửa thành công và tối đa ba lượt công cụ trong 40 giây. Bot thực hiện ghi trực tiếp theo yêu cầu, chưa có bước xem trước/xác nhận trong chat. Sửa cần recordId người dùng đưa trong tin nhắn hoặc kết quả tra cứu hoàn chỉnh có đúng một bản ghi; nếu nhiều kết quả, cần chỉ rõ recordId trong yêu cầu tiếp theo. Không lưu hội thoại. Ghi hỗ trợ văn bản, số, lựa chọn đơn có sẵn, ngày Unix milliseconds, checkbox và điện thoại; chưa ghi người dùng, tệp đính kèm, liên kết, lựa chọn nhiều, công thức hay xóa bản ghi. Không tự tạo lựa chọn mới. Chưa hỗ trợ xóa giá trị ô bằng null.

Thông tin gửi tới OpenRouter và nhà cung cấp model gồm yêu cầu, tên/kiểu cột, lựa chọn có sẵn và kết quả công cụ cần thiết; không gửi App Secret/token Lark. Chính sách lưu trữ phụ thuộc OpenRouter và nhà cung cấp model, không áp dụng cam kết `store:false` của luồng OpenAI bên dưới.

Kết quả ghi được trả trực tiếp từ code sau khi API thành công, không gọi lại model để ghi lần hai. Nếu API ghi mất kết nối, bot báo chưa xác minh kết quả: kiểm tra Base trước khi gửi lại. Nếu gửi trả lời Lark thất bại sau tác vụ có quyền ghi, tiến trình giữ dấu chống trùng để không tự thực hiện lại cùng sự kiện. Chống trùng vẫn chỉ ở bộ nhớ một tiến trình trong một giờ, chưa bảo đảm ghi đúng một lần khi có nhiều máy chủ hoặc khởi động lại; triển khai cần độ tin cậy cao phải bổ sung hàng đợi và kho chống trùng dùng chung.

Kiểm tra mô phỏng: `node tests/lark-openrouter.cjs`, `node tests/lark-openai.cjs`, `node tests/lark-bot.cjs`. Sau triển khai, thử tạo/sửa một bản ghi thử nghiệm, đối chiếu dữ liệu thực và kiểm tra tài khoản chỉ đọc không thể ghi.

Tham khảo: [OpenRouter tool calling](https://openrouter.ai/docs/guides/features/tool-calling).

### OpenRouter báo lỗi dù đã có key/model

Bot trả mã lỗi và hướng dẫn theo nguyên nhân; log `Lark OpenRouter request failed` có `httpStatus`, `apiCode` (nếu có) và `reason`, không ghi key hay nội dung lỗi thô.

| Mã/lý do | Cách xử lý |
| --- | --- |
| 404 / `unsupported_parameters` | Không có endpoint hỗ trợ đủ tham số. Đã bỏ `strict` và `parallel_tool_calls` khỏi yêu cầu OpenRouter để tương thích các endpoint như Nemotron free; triển khai lại mã mới. Code vẫn xác thực schema và chặn nhiều công cụ trong cùng lượt. |
| 404 / `no_endpoint` hoặc `invalid_model` | Kiểm tra model ID chính xác, model còn hoạt động và hỗ trợ tools; kiểm tra cài đặt định tuyến. |
| `data_policy` | Không có nhà cung cấp đáp ứng chính sách Privacy hiện tại; kiểm tra model/chính sách, không tự động nới chính sách dữ liệu. |
| 401 | Key không hợp lệ/đã vô hiệu hóa; kiểm tra biến môi trường đúng môi trường triển khai. |
| 402 | Kiểm tra credits và giới hạn chi tiêu của key. |
| 403 | Kiểm tra quyền truy cập, giới hạn ngân sách và guardrails. |
| 429 | Giới hạn lượt gọi, kể cả quota model miễn phí; chờ hoặc chọn model phù hợp. |
| 5xx | Nhà cung cấp đang lỗi/không khả dụng; thử lại sau. |

`im.message.message_read_v1` và `im.chat.access_event.bot_p2p_chat_entered_v1` bị bỏ qua là bình thường. Bot chỉ xử lý `im.message.receive_v1`. Log `replied` nghĩa là đã gửi tin nhắn qua Lark thành công, kể cả khi nội dung trả lời là thông báo lỗi OpenRouter.

## Hỏi đáp bằng OpenAI (luồng cũ, chỉ đọc)

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

## Bot không trả lời

Gửi `base` trong chat riêng (không cần OpenAI), mở Vercel → Logs và tìm `/api/bot/lark/events` hoặc `Lark bot:`. POST trả 200 chỉ xác nhận đã nhận sự kiện; xem log để biết sự kiện được xử lý hay bỏ qua:

| Log/lý do | Cách kiểm tra |
| --- | --- |
| Không có POST mới khi nhắn bot | Kiểm tra đăng ký `im.message.receive_v1`, đúng ứng dụng/URL Production, quyền nhận tin nhắn và phiên bản ứng dụng đã phát hành. Xác minh challenge thành công chưa chứng minh tin nhắn được chuyển tới webhook. |
| `allowed_users_not_configured` | Thêm `LARK_BOT_ALLOWED_OPEN_IDS` vào môi trường Production rồi redeploy. Log có `senderOpenId` của người gửi để quản trị viên đối chiếu và đưa đúng tài khoản vào danh sách. |
| `sender_not_allowed` | Đối chiếu `senderOpenId` với danh sách; không dùng user ID/union ID thay cho Open ID. Không mở quyền cho mọi tài khoản để thử. |
| `app_id_mismatch` | App ID trong sự kiện phải khớp ứng dụng của Base đang chọn; log ghi `receivedAppId` và `configuredAppId`. |
| `invalid_event_auth` | Kiểm tra Verification Token và Encrypt Key của đúng ứng dụng trong môi trường Production. |
| `not_private_chat` / `unsupported_message_type` | Gửi tin nhắn văn bản trong chat riêng với bot. Mention trong tin nhắn văn bản được loại bỏ trước khi phân tích lệnh. |
| `accepted` rồi `lookup failed` | Kiểm tra cấu hình/quyền đọc Base, mã `apiCode`/`httpStatus` nếu có. Bot sẽ thử gửi thông báo lỗi. |
| `failed to send reply` | Kiểm tra `apiCode`/`httpStatus` và quyền gửi tin nhắn của bot. Log chỉ ghi mã lỗi, không ghi token, nội dung hay toàn bộ lỗi Axios. |
| `replied` | API Lark đã chấp nhận gửi trả lời cho message ID ghi trong log. |

Sau mỗi lần đổi biến môi trường cần redeploy, rồi gửi một tin nhắn mới. Log có Open ID/message ID để chẩn đoán; chỉ chia sẻ phần mã lỗi cần thiết, không chia sẻ API key/token.

Tài liệu Lark: [Node SDK — sự kiện và bot](https://github.com/larksuite/node-sdk), [Reply message](https://open.larksuite.com/document/server-docs/im-v1/message/reply).
