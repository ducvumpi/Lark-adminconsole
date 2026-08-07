import Link from "next/link";
import { getSettingsAction, listFieldsAction } from "@/app/lib/action";

export default async function DashboardPage() {
  const settings = await getSettingsAction();
  const fieldsResult = settings.complete ? await listFieldsAction() : null;

  return (
    <div>
      <h1 className="page-title">Tổng quan</h1>
      <p className="page-subtitle">Trạng thái kết nối tới Lark Base của bạn</p>

      {!settings.complete && (
        <div className="alert alert-error">
          Chưa cấu hình đầy đủ App ID / App Secret / Base Token / Table ID.{" "}
          <Link href="/caidat" style={{ color: "inherit", textDecoration: "underline" }}>
            Vào Cài đặt để nhập ngay
          </Link>
          .
        </div>
      )}

      {settings.complete && fieldsResult && !fieldsResult.success && (
        <div className="alert alert-error">Kết nối Lark Base lỗi: {fieldsResult.message}</div>
      )}

      <div className="card-grid">
        <div className="stat-card">
          <div className="label">Trạng thái cấu hình</div>
          <div className="value">{settings.complete ? "Đã cấu hình" : "Chưa đủ"}</div>
        </div>
        <div className="stat-card">
          <div className="label">Số cột trong bảng</div>
          <div className="value">
            {fieldsResult?.success ? fieldsResult.data?.length ?? 0 : "—"}
          </div>
        </div>
        <div className="stat-card">
          <div className="label">Table ID</div>
          <div className="value" style={{ fontSize: 15, wordBreak: "break-all" }}>
            {settings.tableId || "—"}
          </div>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Truy cập nhanh</h3>
        <div className="row" style={{ flexWrap: "wrap" }}>
          <Link href="/fields" className="btn">
            📋 Xem danh sách cột
          </Link>
          <Link href="/records" className="btn">
            📂 Xem & quản lý dữ liệu
          </Link>
          <Link href="/import" className="btn btn-primary">
            ⬆️ Import Excel
          </Link>
        </div>
      </div>
    </div>
  );
}