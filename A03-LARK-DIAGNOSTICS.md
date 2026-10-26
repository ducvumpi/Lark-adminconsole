# Kiểm tra liên kết A03 với Lark AI-Friendly Database

Ngày kiểm tra: 23/10/2026. Phạm vi người dùng chốt: chỉ xử lý A03, không bổ sung A01–A07 hay bảng Brand lúc này.

## Kết quả thực tế

- Cùng CLI, profile `lark-test`, app ID `cli_aa881b5fa0781eea`, danh tính user.
- Base A03: `ZszDbVpEEafitKsAWfRlTnRggpd`, tên `Ngân sách - Test A03`, table `tblFjyYCeYgHjs51`, 4.040 dòng tại thời điểm đọc.
- Base DMS: `D4kXbl3y6aLftVsDCTTlhBkfgpe`, app `DENAp0kOirKIGijXz80lxDkggqx`. Có biên nhận khởi tạo thành công và Preview đã triển khai thành công.
- Đọc metadata Base A03 thành công, nên không có cơ sở kết luận lỗi lần này là thiếu quyền đọc Base.
- `is_advanced=false` ở cả hai Base. Không cần tắt phân quyền nâng cao để thử.
- A03 có `workspace_token=NlELsO9K5pu30ScRi7RlG7mygu7`; DMS trả workspace_token rỗng. Khác biệt này **chưa chứng minh nguyên nhân**.
- DMS được tạo mới bằng CLI theo schema; A03 là Base có sẵn được liên kết bằng `--base-token`.

## Thử lại theo yêu cầu

Gửi lại đúng một lần `POST /open-apis/base/v3/sites/create`, cùng Base/table, không sửa dữ liệu hoặc tạo Base thay thế. Kết quả vẫn là:

```
code: 800004319
This Base is not currently supported for site binding.
Executed: no. Retry: after resolving compatibility.
Base ID: 7699695517951987472
LogID lần đầu: 202610231628013DD92201E5BCC54CC6C2
LogID thử lại: 2026102316304837AA002CB980974F8CBC
```

Lỗi xảy ra tại bước tạo app và liên kết Base, trước `read-catalog`, scaffold hoặc build Page/FaaS. Không phải lỗi React, Next.js hay biên dịch app. Không có mã app A03 được trả về. Danh sách site sau lần khởi tạo đầu chỉ có DMS; không lấy điều này làm bằng chứng tuyệt đối rằng không tồn tại tài nguyên khác.

## Kết luận và phần chưa xác định

Nguyên nhân trực tiếp đã xác nhận: dịch vụ Lark từ chối khả năng site binding của riêng Base nguồn. API công khai không cung cấp chi tiết điều kiện lưu trữ/phiên bản/rollout đằng sau mã này. Chưa thể kết luận do Workspace, phiên bản engine, số dòng hay công thức. Không có bằng chứng cho rằng cấp thêm scope hoặc đổi bot sẽ sửa được.

Cần Lark Support kiểm tra Base ID và LogID trên để biết điều kiện tương thích và khả năng bật hỗ trợ cho Base này. Không tự chuyển Workspace, bỏ công thức, sao chép dữ liệu hay thử liên kết vào app DMS đang dùng để tìm cách vượt giới hạn.

Biên nhận gốc giữ tại `budget-lark-source-app/.base-database-cli/state/init.json`; không sửa trạng thái unknown của CLI để ép chạy tiếp.
