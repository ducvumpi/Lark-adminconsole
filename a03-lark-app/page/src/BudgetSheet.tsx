import { useState } from 'react';
import { openLink } from '@lark-base-open/base-database-app-sdk/page';

export const A03_SHEET_URL = 'https://tsgsifizy3jj.sg.larksuite.com/sheets/GHglsL11ihh6kTt1vn6l0jF6gge';

export default function BudgetSheet() {
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState('');
  function openSheet() {
    setError('');
    void openLink(A03_SHEET_URL).catch(() => setError('Lark chưa mở được tài liệu. Bạn có thể sao chép liên kết phía dưới và mở trong ứng dụng Lark.'));
  }
  return <section className="sheet-workspace">
    <div className="sheet-instructions">
      <div><strong>Nhập tiền ở cột I · so_tien_de_xuat</strong><p>4.040 dòng từ bản sao A03. Giữ nguyên record_id và các cột nhận diện; cột H là tiền hiện tại để đối chiếu.</p></div>
      <div className="actions"><button onClick={() => setRevision(value => value + 1)}>Tải lại khung</button><button className="primary" onClick={openSheet}>Mở Lark Sheets riêng ↗</button></div>
    </div>
    <p className="sheet-permission-note">Khung bên dưới là Lark Sheets thật. Khả năng xem/chỉnh sửa phụ thuộc đăng nhập, quyền tài liệu và chính sách nhúng của Lark. Nếu khung không mở được, dùng nút mở riêng.</p>
    <iframe key={revision} className="a03-sheet-frame" title="Lark Sheets nhập số tiền dự kiến A03" src={A03_SHEET_URL} sandbox="allow-scripts allow-same-origin allow-forms allow-downloads allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation" referrerPolicy="strict-origin-when-cross-origin" />
    <div className="sheet-reference"><span>Liên kết tài liệu</span><input aria-label="Liên kết bảng tính A03" readOnly value={A03_SHEET_URL} onFocus={event => event.currentTarget.select()} /></div>
    {error && <div className="error" role="alert">{error}</div>}
    <div className="notice neutral">Điền xong, mở hồ sơ → Đọc tiền từ Sheet → chọn các node và gửi duyệt. Server giữ bản tiền chốt; node cuối đồng ý sẽ ghi A03. Cần kết nối đọc Sheet ở server; nếu chưa cấu hình, hệ thống dừng trước khi gửi duyệt.</div>
  </section>;
}
