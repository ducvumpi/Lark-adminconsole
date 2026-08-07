import { getSettingsAction } from "@/app/lib/action";
import SettingsForm from "@/app/components/SettingsForm";

export default async function SettingsPage() {
  const settings = await getSettingsAction();

  return (
    <div>
      <h1 className="page-title">Cài đặt</h1>
      <p className="page-subtitle">
        Cấu hình kết nối tới Lark Base. Dữ liệu được lưu ở phía server (data/config.json), không lộ ra trình duyệt.
      </p>
      <SettingsForm initial={settings} />
    </div>
  );
}
