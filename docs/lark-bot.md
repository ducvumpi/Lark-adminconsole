# Bot Lark độc lập với cấu hình import

Webhook: `https://<domain>/api/bot/lark/events`. Bot gọi trực tiếp OpenRouter và API Lark, không cần MCP. Runtime không đọc `data/config.json`, `activeBaseId`, `activeTableId` hoặc `LARK_TABLE_ID` của giao diện import.

## Cấu hình riêng

Thiết lập các biến máy chủ sau, rồi khởi động lại/deploy:

```env
LARK_BOT_APP_ID=<App ID của ứng dụng bật Bot>
LARK_BOT_APP_SECRET=<App Secret của cùng ứng dụng>
LARK_BOT_BASE_APP_TOKENS=<Base token 1>,<Base token 2>
LARK_VERIFICATION_TOKEN=<Verification Token>
LARK_ENCRYPT_KEY=<Encrypt Key nếu bật mã hóa; nếu không thì bỏ biến>
LARK_BOT_ALLOWED_OPEN_IDS=ou_nguoi_dung_1,ou_nguoi_dung_2
LARK_BOT_WRITE_OPEN_IDS=ou_nguoi_dung_1
LARK_AI_PROVIDER=openrouter
OPENROUTER_API_KEY=<key OpenRouter>
OPENROUTER_MODEL=<ID vendor/model hỗ trợ tool calling>
```

Base token lấy từ `/base/TOKEN` trong URL Base, không phải tableId. Danh sách Base có thể để trống nếu người dùng gửi link Base trong mỗi yêu cầu. Bot gọi API liệt kê bảng trực tiếp, không lấy danh sách bảng đã nhập trong giao diện import. Quyền ứng dụng trên Lark quyết định khả năng truy cập thực tế.

Ưu tiên biến `LARK_BOT_*`; nếu chưa có thì App ID/Secret và Base token có thể dùng `LARK_APP_ID`, `LARK_APP_SECRET`, `LARK_BASE_APP_TOKEN` từ môi trường máy chủ. **Không fallback về bảng đang chọn trong giao diện.** `LARK_BOT_BASE_APP_TOKEN` (số ít) cũng được hỗ trợ. `LARK_BOT_TABLE_ID` là bảng mặc định tùy chọn riêng của bot; tuyệt đối không dùng `LARK_TABLE_ID`. `LARK_BOT_API_BASE_URL` tùy chọn cho API Lark/Feishu (mặc định `https://open.larksuite.com/open-apis`).

Để chuyển cấu hình đang có một lần sang môi trường cục bộ, chạy `node scripts/setup-lark-bot.cjs`. Script sao chép App ID/Secret và các Base cùng ứng dụng vào `.env.local`, không sao chép bảng đang chọn, không ghi đè biến đã có và không in secret. Sau bước này thay đổi bảng import không thay đổi bot. Trên Vercel, thêm các biến `LARK_BOT_*` tương ứng vào Production Environment Variables rồi redeploy; `.env.local` không được commit/upload.

Không đặt key/secret trong biến `NEXT_PUBLIC_*` hoặc tin nhắn. Khi không có App ID/Secret độc lập, webhook trả 503 cho sự kiện tin nhắn. Handshake challenge vẫn xác thực bằng Verification Token. App ID trong sự kiện phải khớp App ID cố định của bot.

## Quyền Lark và nhận sự kiện

Ứng dụng phải bật Bot, có quyền gửi tin nhắn (`im:message:send_as_bot`), nhận tin nhắn riêng (`im:message.p2p_msg:readonly`) và đọc metadata/bản ghi Base. Để ghi, cấp thêm quyền tạo/sửa bản ghi và quyền chỉnh sửa Base tương ứng. Phát hành ứng dụng và phê duyệt quyền nếu Lark yêu cầu. Đăng ký `im.message.receive_v1` với URL webhook trên.

Người gửi phải thuộc `LARK_BOT_ALLOWED_OPEN_IDS`; trống thì chặn mọi truy vấn. Muốn tạo/sửa phải đồng thời thuộc `LARK_BOT_WRITE_OPEN_IDS`; danh sách ghi trống chỉ cho đọc. Chỉ hỗ trợ chat riêng và tin nhắn văn bản. Quyền ứng dụng đầy đủ không thay thế danh sách tài khoản được dùng bot.

## Dùng trong chat

- `tables`: liệt kê tên, tableId và Base trực tiếp từ Lark.
- `base A03`: đọc tối đa 10 dòng đầu của bảng có tên/mã A03.
- `base tblXXXX`: chọn chính xác bằng tableId.
- `Tổng cột Số tiền TGĐ duyệt của tháng 11 năm 2026 trong A03?`
- `Tạo bản ghi trong A03: Nội dung chi tiêu = ABC, Số tiền TGĐ duyệt = 1500000`.
- `Trong A03, tìm Mã ngân sách = ABC rồi sửa Note thành Đã kiểm tra`.
- Gửi `https://tenant.larksuite.com/base/TOKEN?table=tblXXXX` cùng yêu cầu để dùng Base/bảng khác mà bot có quyền truy cập. Bot chỉ lấy token và tableId từ link hợp lệ trên `larksuite.com`/`feishu.cn`; không tải URL tùy ý.

`base` không có tên bảng chỉ chạy khi có bảng mặc định riêng, link chỉ rõ bảng, hoặc Base có đúng một bảng. Nhiều bảng thì phải chỉ rõ, không tự chọn bảng đầu tiên. Lệnh cũ `base Brand=ABC` áp dụng cùng quy tắc đó; dùng câu hỏi tự nhiên nếu cần tên bảng và bộ lọc cùng lúc.

OpenRouter có công cụ `list_tables`, `open_table`, `query_base`, `write_base`. Model mở bảng, nhận schema thật rồi truy vấn/ghi. Chỉ chấp nhận tên khớp chính xác, mã đầu tên như `A03. ...`, hoặc tableId thật. Nếu trùng tên ở nhiều Base, cần tableId và Base token. Base mới phải có trong cấu hình bot hoặc được người dùng đưa link trong tin nhắn; model không tự mở token lấy từ nội dung bản ghi. Không có công cụ liệt kê toàn bộ Base trong tổ chức chỉ từ quyền ứng dụng; cần Base token/link để bắt đầu khám phá bảng.

Mỗi tin nhắn độc lập, không lưu bảng/hội thoại theo người dùng. Chuyển bảng xóa các recordId suy ra từ truy vấn bảng trước. Nếu mở bảng mới thất bại, bảng trước không còn được dùng để ghi. Không chỉnh sửa cấu hình import và không chuyển bảng import khi bot mở bảng.

## Giới hạn và kết quả ghi

OpenRouter tối đa 6 lượt model, 5 lượt công cụ, mỗi lượt đúng một công cụ, trong 40 giây. Mỗi tin nhắn tối đa một lần tạo/sửa thành công, không tự retry ghi hoặc gọi model lần nữa sau ghi. Chỉ sửa recordId người dùng cung cấp hoặc truy vấn hoàn chỉnh trả đúng một bản ghi. Không có công cụ xóa hoặc chạy code. Không có bước xem trước/xác nhận trong chat.

Ghi hỗ trợ văn bản, số, lựa chọn đơn có sẵn, ngày Unix milliseconds, checkbox và điện thoại; tối đa 20 cột/lần. Không tự tạo option, ghi công thức, người dùng, tệp hoặc xóa giá trị bằng null. Khi API ghi mất kết nối, kiểm tra Base trước khi gửi lại vì kết quả có thể đã ghi thành công.

Truy vấn hỗ trợ list/count/sum, AND tối đa 8 điều kiện; số/ngày dùng so sánh, văn bản/lựa chọn dùng equals/contains. List tối đa 10 dòng × 8 cột, giá trị tối đa 300 ký tự. Quét tối đa 10 trang × 500 dòng ứng viên; count/sum không trả kết quả một phần. Bộ lọc lựa chọn đơn phù hợp được đẩy xuống API để giảm số dòng. Không tự loại trùng hay loại bỏ ngân sách cha/con.

Type `1001` là thời gian tạo, `1002` là thời gian sửa, `1003`/`1004` là người tạo/sửa. “Hôm qua” được code tính theo Asia/Ho_Chi_Minh, từ 00:00 hôm qua đến trước 00:00 hôm nay. Bot chưa đọc lịch sử import hoặc xác định người import: ngày tạo bản ghi không chứng minh ngày import vì import có thể cập nhật dòng cũ. Với câu “tôi import hôm qua”, cần làm rõ đợt import/danh sách bản ghi hoặc xác nhận dùng thời gian tạo làm tiêu chí thay thế.

Webhook phản hồi ngay và dùng Next.js `after` để xử lý. Chống trùng trong bộ nhớ một tiến trình trong một giờ, UUID cố định cho tin trả lời; chưa có queue/kho chống trùng dùng chung. Nếu gửi trả lời thất bại sau tác vụ có quyền ghi, giữ dấu chống trùng để không tự lặp ghi. Nhiều máy chủ/khởi động lại chưa bảo đảm xử lý đúng một lần.

## Chẩn đoán

`Lark OpenRouter request failed` ghi `httpStatus`, `apiCode`, `reason`. `Lark OpenRouter: operation failed` ghi `stage`, `round`, `reason`. Không log secret, nội dung chat, lỗi Axios hoặc body provider thô.

| Lý do/mã | Kiểm tra |
| --- | --- |
| `bot_credentials_missing` | Cấu hình App ID/Secret của bot trên máy chủ; không lấy từ trang import. |
| `app_id_mismatch` | App ID sự kiện phải khớp `LARK_BOT_APP_ID`/`LARK_APP_ID`. |
| `allowed_users_not_configured` / `sender_not_allowed` | Đối chiếu Open ID với danh sách cho phép của cùng ứng dụng. |
| `base_transport` | Base token/link, quyền ứng dụng và kết nối Lark. |
| 404 / `unsupported_parameters` | Model/endpoint không hỗ trợ tham số; code đã bỏ strict và parallel_tool_calls để tương thích Nemotron free. |
| 401 / 402 / 403 / 429 | Lần lượt kiểm tra key, credits, quyền/ngân sách/guardrails, giới hạn lượt gọi. |
| `data_policy` | Cài đặt Privacy và model; không tự nới chính sách dữ liệu. |
| `output_limit` | Mặc định 4096 token; tùy chọn `OPENROUTER_MAX_OUTPUT_TOKENS` từ 1024 đến 8192. Token suy luận cũng tiêu thụ ngân sách đầu ra. Không chạy công cụ bị cắt. |
| `tool_budget` | Chia nhỏ yêu cầu hoặc model đang gọi nhiều công cụ cùng lượt. |
| `invalid_response` / `invalid_tool` | Model trả cấu trúc không hợp lệ; thử lại/model hỗ trợ tool calling. |
| `model_transport` / `timeout` | Kết nối model hoặc vượt 40 giây. |

Sự kiện `im.message.message_read_v1` và `im.chat.access_event.bot_p2p_chat_entered_v1` bị bỏ qua là bình thường. Log `replied` chỉ xác nhận đã gửi tin nhắn Lark, kể cả nội dung là thông báo lỗi.

Luồng OpenAI cũ chỉ đọc dùng `OPENAI_API_KEY` và `OPENAI_MODEL` (mặc định `gpt-4.1-mini`). Nó vẫn nhận client độc lập của bot, nhưng chưa khám phá/chọn bảng tự nhiên như OpenRouter: cần Base chỉ có một bảng hoặc `LARK_BOT_TABLE_ID`. Không có key thì lệnh `tables`/`base A03` vẫn hoạt động trực tiếp qua Lark.

## Dữ liệu và kiểm tra

OpenRouter/nhà cung cấp model nhận tin nhắn, tên bảng, schema/options và kết quả công cụ cần thiết. Không gửi App Secret/token truy cập Lark. Chính sách lưu trữ phụ thuộc OpenRouter/provider. App token trong URL Base là định danh tài nguyên, không phải tenant access token.

Kiểm tra mô phỏng không gọi API thật:

```sh
node tests/lark-bot-tables.cjs
node tests/lark-client-config.cjs
node tests/lark-openrouter.cjs
node tests/lark-bot.cjs
node tests/lark-openai.cjs
```

Sau deploy: đổi bảng import sang A01, hỏi bot về A03 để kiểm tra bot vẫn chọn đúng A03; thử `tables`, bảng trùng tên, tài khoản ngoài danh sách và tài khoản chỉ đọc. Đối chiếu kết quả với Base thật trước khi dùng dữ liệu vận hành.

Tài liệu: [Liệt kê bảng Lark](https://open.larksuite.com/document/server-docs/docs/bitable-v1/app-table/list), [OpenRouter tool calling](https://openrouter.ai/docs/guides/features/tool-calling), [Token suy luận](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens).
