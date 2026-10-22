# DMS Phân phối — tài liệu dự án

## 1. Dự án được lưu ở đâu?

Thư mục làm việc chung trên máy:

```text
C:\Users\Win10\Desktop\larkadmin\lark-adminconsole
```

Mã nguồn **ứng dụng DMS chạy trong Lark**:

```text
C:\Users\Win10\Desktop\larkadmin\lark-adminconsole\dms-app
```

Dự án Next.js quản trị cũ nằm ở thư mục gốc, với mã nguồn trong `app/`. DMS là một dự án React/Vite riêng trong `dms-app/`, được Lark CLI đóng gói và triển khai. Chạy `npm run dev` ở thư mục gốc sẽ mở ứng dụng quản trị cũ, không phải DMS trong Lark.

## 2. Các liên kết

- [Bản Preview DMS](https://tsgsifizy3jj.sg.larksuite.com/baseapp/DENAp0kOirKIGijXz80lxDkggqx?mode=edit)
- [Base dữ liệu DMS mới](https://tsgsifizy3jj.sg.larksuite.com/base/D4kXbl3y6aLftVsDCTTlhBkfgpe)

Profile CLI: `lark-test`.

App ID của ứng dụng tích hợp: `cli_aa881b5fa0781eea`.

Ứng dụng DMS có appToken riêng: `DENAp0kOirKIGijXz80lxDkggqx`. App ID, appToken của ứng dụng DMS và token của Base là ba loại định danh khác nhau.

## 3. Kiến trúc

```text
Người dùng mở DMS trong Lark
          |
React + TypeScript + CSS
          |
Lark Base App SDK 0.3.2
          |
          +-- 11 Database Functions: đọc dữ liệu bằng SQL
          |
          +-- 7 server Functions: kiểm tra và ghi dữ liệu
                         |
                   6 bảng Lark Base
```

UI được viết trực tiếp bằng React và CSS theo nghiệp vụ DMS; không sinh tự động từ bảng và không dùng Figma. Vite đóng gói phần giao diện, Lark CLI đóng gói server và triển khai ứng dụng.

## 4. Chức năng hiện có

- Tổng quan đơn hàng, giá trị đơn đã xác nhận, công nợ và cảnh báo tồn thấp.
- Thêm/sửa nhà phân phối và đại lý; tìm kiếm, lọc trạng thái.
- Thêm/sửa sản phẩm, SKU, giá bán, đơn vị tính và tồn tối thiểu.
- Thêm/sửa kho và người phụ trách.
- Tạo đơn nhiều sản phẩm. Server đọc lại giá sản phẩm, tính tổng và lưu giá tại thời điểm tạo đơn.
- Chuyển trạng thái đơn theo luồng cho phép, cập nhật tổng tiền đã thu.
- Ghi phiếu nhập/xuất độc lập; xem tồn theo sản phẩm và kho, lịch sử 30 phiếu gần nhất.
- Xem công nợ theo đối tác và xuất CSV từ danh sách đang lọc.
- Check-in GPS theo lượt ghé đại lý: lấy vị trí hiện tại sau khi nhân viên chủ động bấm nút và cấp quyền; lưu tọa độ, độ chính xác, thời gian server ghi nhận và ID nhân viên.

## 5. Đọc và sửa mã nguồn ở đâu?

Các đường dẫn dưới đây tính từ thư mục làm việc chung.

| File/thư mục | Vai trò | Khi nào cần sửa? |
| --- | --- | --- |
| `dms-app/page/src/DmsApp.tsx` | Giao diện chính: menu, dashboard, danh sách, tìm kiếm, biểu mẫu, xuất CSV và gọi Function | Thêm màn hình, đổi biểu mẫu hoặc thao tác người dùng |
| `dms-app/page/src/DealerVisits.tsx` | Danh sách lượt ghé, yêu cầu quyền GPS khi check-in và lưu tọa độ | Đổi quy trình check-in đại lý |
| `dms-app/page/src/dms.css` | Màu sắc, sidebar, bảng, hộp thoại, bố cục điện thoại | Đổi thiết kế UI |
| `dms-app/page/src/App.tsx` | Xuất component `DmsApp` cho điểm khởi động | Đổi component gốc |
| `dms-app/page/src/main.tsx` | Khởi động bằng `startBaseApp`, xử lý lifecycle và HMR | Điều chỉnh tích hợp SDK với Lark |
| `dms-app/page/src/index.css` | CSS nền tối thiểu | Điều chỉnh reset toàn trang |
| `dms-app/page/index.html` | Tiêu đề DMS và ngôn ngữ tiếng Việt | Đổi tên trang |
| `dms-app/base-app.config.ts` | Cấu hình component gốc và QueryClientProvider do template tạo | Điều chỉnh provider |
| `dms-app/database-functions/` | Truy vấn SQL cùng metadata tham số | Đổi dữ liệu đọc hoặc điều kiện truy vấn |
| `dms-app/server/functions/` | Function xử lý ghi dữ liệu | Đổi nghiệp vụ, tính tiền hoặc kiểm tra đầu vào |
| `dms-app/catalog.json` | Schema thật: tên, ID, kiểu trường và bảng đã liên kết | Tra cứu; không tự bịa ID hoặc chỉnh file để giả lập thay đổi Base |
| `dms-app/base-database.jsonc` | appToken, profile CLI và sáu bảng được liên kết | Kiểm tra cấu hình ứng dụng đích |
| `dms-app/agent-tools.json` | Loại truy vấn nội bộ và các hàm GPS khỏi danh sách công cụ cho agent ngoài | Điều chỉnh khả năng công khai cho agent; đây không phải lớp phân quyền |
| `dms-app/README.md` | Mô tả nghiệp vụ tiếng Anh nằm trong gói nguồn triển khai | Cập nhật khi chức năng hoặc giới hạn thay đổi |
| `dms-app/page/src/generated/` | Kiểu TypeScript và client do CLI sinh | Không sửa tay; chạy lại `contracts generate` |
| `dms-app/server/contracts.generated.json` | Hợp đồng Function do CLI sinh | Không sửa tay |
| `dms-app/.base-database-cli/state/` | Biên nhận khởi tạo, kiểm tra dữ liệu và triển khai | Tra cứu lỗi/trạng thái; được Git bỏ qua |

### Database Functions

`list_partners`, `list_products`, `list_warehouses`, `list_orders`, `list_movements`: dữ liệu danh sách cho giao diện. Mỗi lần truy vấn tối đa 200 bản ghi, UI đọc lần lượt các trang, tối đa 10.000 bản ghi mỗi danh mục.

`get_order`: chi tiết đơn hàng.

`order_products`, `order_partner`, `order_warehouse`: kiểm tra sản phẩm, đối tác và kho phía server.

`list_visits`: danh sách lượt ghé, phân trang 200 bản ghi.

`visit_partner`: kiểm tra đại lý hoạt động và lấy ID nhân viên hiện tại; chỉ dùng nội bộ.

### Server Functions

| Function | Nghiệp vụ |
| --- | --- |
| `save_partners` | Thêm/sửa đối tác |
| `save_products` | Thêm/sửa sản phẩm |
| `save_warehouses` | Thêm/sửa kho |
| `create_order` | Kiểm tra đối tác/kho/sản phẩm, tính tổng, tạo đơn nháp |
| `update_order` | Kiểm tra chuyển trạng thái và tiền đã thu |
| `create_movement` | Kiểm tra sản phẩm/kho và tạo phiếu nhập/xuất |
| `create_visit` | Kiểm tra đại lý, gắn ID nhân viên hiện tại và lưu tọa độ GPS check-in |

Mỗi Function có `index.ts` chứa xử lý, `contract.ts` chứa schema đầu vào/đầu ra và `meta.json` chứa mô tả cùng hợp đồng được sinh khi build.

## 6. Những thay đổi để build được trên máy Windows này

### Chạy công cụ bằng Node 22

Máy đang dùng Node 24.16.0. CLI 1.5.0 gọi worker với cờ `--experimental-permission` mà Node 24 trên máy không nhận. Vì vậy, các lệnh sinh hợp đồng, kiểm tra và triển khai DMS được chạy bằng Node 22.23.4 tải riêng trong npm cache. Node mặc định của máy không bị thay thế.

### Chuẩn hóa đường dẫn artifact Windows

CLI tạo tên artifact bằng `node:path.relative`, cho ra dấu `\` trên Windows, trong khi bộ kiểm tra artifact yêu cầu dấu `/`.

Hai file hỗ trợ nằm ngoài mã nguồn DMS:

```text
scripts/dms-cli-windows.mjs
scripts/dms-cli-windows-loader.mjs
```

Loader chỉ chuẩn hóa đầu ra `relative` của bộ build artifact trong CLI. Không sửa bản CLI trong npm cache; kiểm tra đường dẫn tuyệt đối, traversal và symlink vẫn được giữ. Loader dừng nếu nội dung CLI không còn khớp phiên bản đã kiểm tra, nên phải xem lại khi đổi phiên bản CLI.

### Điều chỉnh schema Function

Chuyển `.trim()` và kiểm tra regex từ schema công khai sang handler, vì bộ sinh hợp đồng của CLI hiện tại không biểu diễn đầy đủ các ràng buộc đó. Server vẫn kiểm tra ngày hợp lệ, ID bản ghi và chuỗi bắt buộc sau khi bỏ khoảng trắng.

### Tách dự án DMS khỏi kiểm tra Next.js ở thư mục gốc

- `tsconfig.json`: thêm `dms-app` vào `exclude`. DMS dùng cấu hình TypeScript riêng.
- `eslint.config.mjs`: bỏ qua `dms-app/**` trong bộ lint Next.js; cho phép `require()` trong các script `.cjs`.
- Đã kiểm tra TypeScript của dự án gốc thành công sau thay đổi này.

### Múi giờ Base

Lark từ chối `Asia/Ho_Chi_Minh` ở bước tạo Base; Base được tạo thành công bằng tên tương đương `Asia/Saigon`. Giao diện hiển thị ngày theo múi giờ Việt Nam.

## 7. Lệnh build và triển khai đã dùng

Chạy trong PowerShell. Đây là các đường dẫn đã xác nhận trên máy này; npm cache có thể thay đổi hoặc bị dọn sau này.

```powershell
Set-Location 'C:\Users\Win10\Desktop\larkadmin\lark-adminconsole\dms-app'

$dmsNode = 'C:\Users\Win10\AppData\Local\npm-cache\_npx\52027bd8fc0022aa\node_modules\node\node_modules\node-win-x64\bin\node.exe'
$dmsCli = 'C:\Users\Win10\AppData\Local\npm-cache\_npx\2fa7f77791b5d55e\node_modules\@lark-base-open\base-database-cli\dist\cli.js'

# Chạy lại khi sửa SQL, Function hoặc hợp đồng tham số
& $dmsNode $dmsCli contracts generate

# Kiểm tra hợp đồng, SQL trên Lark, build UI và server
& $dmsNode --import ../scripts/dms-cli-windows.mjs $dmsCli check --json

# Triển khai bản Preview sau khi check thành công
& $dmsNode --import ../scripts/dms-cli-windows.mjs $dmsCli deploy
```

Sau `deploy`, dùng đúng `baseAppUrl` CLI trả về để mở bản mới. Không cần khởi tạo lại Base hoặc chạy lại script tạo bảng khi chỉ sửa UI.

Chỉnh sửa tài liệu/mã nguồn trong `dms-app/` sau Preview sẽ làm thay đổi đầu vào của gói nguồn. Phải triển khai Preview mới trước khi nâng bản đó lên production. Chỉ phát hành chính thức sau khi người dùng đã trải nghiệm và xác nhận phiên bản cụ thể.

## 8. Script hỗ trợ và kiểm tra

Chạy các lệnh bên dưới từ thư mục làm việc chung, không phải trong `dms-app`:

```powershell
node scripts/test-dms-actions.cjs
node scripts/verify-dms-preview.cjs
```

- `test-dms-actions.cjs`: 11 kiểm tra nghiệp vụ bằng runtime giả lập cục bộ; không ghi dữ liệu từ xa.
- `test-dms-cli-windows.mjs`: kiểm tra chuẩn hóa đường dẫn và việc tiếp tục chặn đường dẫn không an toàn; chạy bằng Node 22 với `--import ./scripts/dms-cli-windows.mjs`.
- `verify-dms-preview.cjs`: đọc hợp đồng thật và dữ liệu của năm Function Preview; đối chiếu số lượng, quan hệ, tiền và tồn kho với bộ dữ liệu ví dụ ban đầu. Sau khi người dùng sửa dữ liệu ví dụ, các kỳ vọng cố định có thể không còn khớp.
- `seed-dms-preview.cjs`: đã dùng để tạo dữ liệu ví dụ một lần. Có biên nhận chặn chạy lại; không chạy lại chỉ để kiểm tra UI.
- `generate-dms-app.cjs`: script khởi tạo SQL/Function và README nghiệp vụ. Chạy lại sẽ ghi đè các file nó quản lý; sau khi sửa tay các Function, không dùng lại script này để build thông thường.
- `setup-dms-base.cjs`: script lịch sử tạo năm bảng trong Base cũ. Chế độ `--schema-only` tạo schema đầu vào cục bộ. Không cần chạy khi build DMS hiện tại.

## 9. Kết quả kiểm tra và giới hạn

Đã hoàn thành:

- Kiểm tra đầy đủ bằng CLI: metadata, SQL phía Lark, dependency, build UI và build server đều thành công.
- 11 kiểm tra nghiệp vụ cục bộ: giá do server đọc, tổng tiền, đối tác tạm ngưng, dòng sản phẩm trùng, ngày không hợp lệ, số lượng âm/không hợp lệ, chuyển trạng thái, thu vượt giá trị đơn, tên trống và kết quả ghi chưa xác định.
- Triển khai Preview thành công; publish ID `pub_7699124331582705420`.
- Đọc lại qua các Database Function mà UI sử dụng: 2 đối tác, 3 sản phẩm, 2 kho, 2 đơn, 7 phiếu; giá trị đơn đã xác nhận 900.000 VND; phải thu 300.000 VND; tồn cà phê tại kho TP.HCM 95 gói; một vị trí dưới mức tồn tối thiểu.

Chưa kiểm thử trực tiếp thao tác UI trong trình duyệt và hành vi nhiều người dùng đồng thời. Không coi kiểm tra build hoặc runtime giả lập là kiểm thử giao diện hoàn chỉnh.

Giới hạn nghiệp vụ hiện tại:

- Chưa phát hành production.
- Người được phép vào ứng dụng có cùng quyền vận hành; chưa tách vai trò hoặc dữ liệu riêng theo đại lý.
- Trạng thái đơn không tự tạo phiếu kho. Người vận hành ghi phiếu riêng và điền mã đơn để đối soát.
- Tồn kho là sổ ghi nhận; cảnh báo tồn âm nhưng chưa có giữ hàng nguyên tử hoặc khóa xuất vượt tồn.
- Tiền đã thu là tổng hiện tại trên đơn, chưa phải sổ giao dịch thanh toán/kế toán.
- Check-in GPS hiện là ghi nhận theo lượt ghé từ trình duyệt; không theo dõi liên tục, không xác minh khoảng cách tới vị trí đại lý đã lưu và không chống giả mạo tọa độ.
- Chưa có hóa đơn thuế, mua hàng, quy trình đổi trả hoặc offline.
- Không có bảo đảm duy nhất cho mã/SKU hay khóa cập nhật đồng thời. Sau lỗi ghi không rõ kết quả, tải lại để đối chiếu trước khi gửi lại.

## 10. Các thư mục thử nghiệm trước đó

| Thư mục | Tình trạng |
| --- | --- |
| `dms-app/` | Dự án đang dùng; Base mới đã khởi tạo và Preview đã triển khai |
| `dms/` | Biên nhận lần thử liên kết Base cũ, bị Lark từ chối tương thích; không phải dự án để build |
| `dms-new/` | Biên nhận lần tạo bị từ chối tham số múi giờ; không phải dự án để build |
| `dms-setup/` | Schema đầu vào và ID năm bảng đã tạo trong Base cũ |

Năm bảng DMS trong Base ngân sách cũ vẫn được giữ lại; ứng dụng hiện tại sử dụng Base mới riêng. Không cần xóa các bảng hoặc biên nhận để tiếp tục phát triển.
