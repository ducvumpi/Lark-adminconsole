import { useEffect, useRef, useState, type FormEvent } from "react";
import { invokeDatabaseFunction } from "@lark-base-open/base-database-app-sdk/page";
import { openLink } from "@lark-base-open/base-site-channel/runtime";
import "./dealer-visits.css";

type Row = Record<string, unknown>;
type Position = { latitude: number; longitude: number; accuracy: number };
type Props = { partners: Row[]; visits: Row[]; onRefresh: () => Promise<void> };

const text = (row: Row, key: string) =>
  typeof row[key] === "string" ? (row[key] as string) : "";
const number = (row: Row, key: string) =>
  typeof row[key] === "number" ? (row[key] as number) : 0;
const formatTime = (value: string) => {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat("vi-VN", {
        timeZone: "Asia/Ho_Chi_Minh",
        dateStyle: "short",
        timeStyle: "medium",
      }).format(date)
    : value || "—";
};
const locationError = (error: unknown) => {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (code === 1)
      return "Bạn chưa cấp quyền vị trí. Hãy cho phép GPS trong trình duyệt rồi thử lại.";
    if (code === 2)
      return "Không lấy được vị trí. Hãy bật GPS/Location Services và thử lại.";
    if (code === 3)
      return "Lấy vị trí quá thời gian chờ. Hãy thử lại ở nơi có tín hiệu tốt hơn.";
  }
  return error instanceof Error ? error.message : "Không lấy được vị trí GPS.";
};
const capturePosition = () =>
  new Promise<Position>((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Trình duyệt này không hỗ trợ GPS."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        }),
      reject,
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 },
    );
  });
const dealerName = (partners: Row[], id: string) =>
  text(partners.find((row) => text(row, "id") === id) || {}, "name") ||
  "Không tìm thấy đại lý";
const mapUrl = (latitude: string, longitude: string) =>
  `https://www.google.com/maps?q=${encodeURIComponent(`${latitude},${longitude}`)}`;

export default function DealerVisits({ partners, visits, onRefresh }: Props) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [partnerId, setPartnerId] = useState("");
  const [position, setPosition] = useState<Position | null>(null);
  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [mapError, setMapError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [notes, setNotes] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const dealers = partners.filter(
    (row) =>
      text(row, "type") === "Đại lý" && text(row, "status") === "Hoạt động",
  );

  useEffect(() => {
    if (dialogOpen && !dialog.current?.open) dialog.current?.showModal();
    if (!dialogOpen) dialog.current?.close();
  }, [dialogOpen]);

  const openDialog = () => {
    setPartnerId("");
    setPosition(null);
    setNotes("");
    setError("");
    setDialogOpen(true);
  };
  const getPosition = async () => {
    setLocating(true);
    setError("");
    try {
      setPosition(await capturePosition());
    } catch (reason) {
      setError(locationError(reason));
    } finally {
      setLocating(false);
    }
  };
  const openMap = async (latitude: string, longitude: string) => {
    setMapError("");
    try {
      const result = await openLink(mapUrl(latitude, longitude));
      if (!result.opened)
        setMapError(
          "Lark không mở được bản đồ. Tọa độ GPS vẫn có thể xem và sao chép.",
        );
    } catch {
      setMapError(
        "Lark không mở được bản đồ. Tọa độ GPS vẫn có thể xem và sao chép.",
      );
    }
  };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!position || !partnerId || saving) return;
    setSaving(true);
    setError("");
    try {
      const result = await invokeDatabaseFunction("create_visit", {
        partnerId,
        latitude: position.latitude,
        longitude: position.longitude,
        accuracy: position.accuracy,
        notes: notes.trim(),
      });
      if (result.code !== 0)
        throw Error(result.msg || "Không thể lưu lượt ghé.");
      if (result.data?.status !== "success")
        throw Error(
          result.data?.message ||
            "Chưa xác định kết quả lưu. Tải lại để đối chiếu trước khi gửi lại.",
        );
      setDialogOpen(false);
      setNotice("Đã ghi nhận lượt ghé GPS.");
      await onRefresh();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Chưa xác định kết quả. Tải lại và đối chiếu trước khi gửi lại.",
      );
    } finally {
      setSaving(false);
    }
  };

  const rows = [...visits]
    .filter((row) =>
      `${text(row, "code")} ${text(row, "latitude")} ${text(row, "longitude")} ${text(row, "notes")} ${dealerName(partners, text(row, "partner_id"))}`
        .toLocaleLowerCase("vi")
        .includes(search.trim().toLocaleLowerCase("vi")),
    )
    .sort(
      (a, b) =>
        text(b, "visited_at").localeCompare(text(a, "visited_at")) ||
        text(b, "id").localeCompare(text(a, "id")),
    );
  const pageRows = rows.slice(page * 15, page * 15 + 15);

  return (
    <>
      <div className="gps-info">
        <strong>Check-in GPS theo lượt ghé</strong>
        <span>
          Chỉ lấy vị trí khi nhân viên bấm nút và cấp quyền. Đây là tọa độ do
          trình duyệt cung cấp, không phải theo dõi liên tục hoặc xác minh chống
          giả mạo.
        </span>
      </div>
      {notice && (
        <div role="status" className="alert success">
          {notice}
          <button onClick={() => setNotice("")} aria-label="Ẩn thông báo">
            ×
          </button>
        </div>
      )}
      {mapError && (
        <div role="alert" className="alert error">
          {mapError}
          <button onClick={() => setMapError("")} aria-label="Ẩn thông báo">
            ×
          </button>
        </div>
      )}
      <div className="toolbar">
        <label className="search gps-search">
          <input
            aria-label="Tìm lượt ghé"
            placeholder="Tìm đại lý, mã lượt ghé hoặc ghi chú…"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(0);
            }}
          />
        </label>
        <button
          className="button primary"
          onClick={openDialog}
          disabled={!dealers.length}
        >
          <span aria-hidden="true">+</span>Check-in đại lý
        </button>
      </div>
      {!dealers.length && (
        <p className="info">Chưa có đại lý nào đang hoạt động để check-in.</p>
      )}
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Thời gian</th>
              <th>Đại lý</th>
              <th>Tọa độ GPS</th>
              <th>Độ chính xác</th>
              <th>Ghi chú</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row) => {
              const latitude = text(row, "latitude"),
                longitude = text(row, "longitude");
              const validCoordinates =
                latitude !== "" &&
                longitude !== "" &&
                Number.isFinite(Number(latitude)) &&
                Number.isFinite(Number(longitude)) &&
                Number(latitude) >= -90 &&
                Number(latitude) <= 90 &&
                Number(longitude) >= -180 &&
                Number(longitude) <= 180;
              const accuracy = row.accuracy;
              return (
                <tr key={text(row, "id")}>
                  <td>
                    <strong>{formatTime(text(row, "visited_at"))}</strong>
                    <small>{text(row, "code")}</small>
                  </td>
                  <td>{dealerName(partners, text(row, "partner_id"))}</td>
                  <td className="gps-coordinates">
                    {validCoordinates ? (
                      <>
                        <span>{latitude}</span>
                        <small>{longitude}</small>
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>
                    {typeof accuracy === "number" && Number.isFinite(accuracy)
                      ? `±${accuracy.toLocaleString("vi-VN", { maximumFractionDigits: 1 })} m`
                      : "—"}
                  </td>
                  <td>{text(row, "notes") || "—"}</td>
                  <td>
                    {validCoordinates && (
                      <button
                        className="link"
                        type="button"
                        onClick={() => void openMap(latitude, longitude)}
                      >
                        Bản đồ
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!rows.length && (
          <div className="empty">
            <h3>
              {search ? "Không tìm thấy lượt ghé" : "Chưa có lượt ghé nào"}
            </h3>
            <p>
              {search
                ? "Thử từ khóa khác."
                : "Check-in tại đại lý để lưu vị trí và thời gian."}
            </p>
          </div>
        )}
      </div>
      <div className="pagination">
        <span>
          {rows.length ? page * 15 + 1 : 0}–
          {Math.min((page + 1) * 15, rows.length)} / {rows.length} lượt ghé
        </span>
        <div>
          <button
            disabled={!page}
            onClick={() => setPage((current) => current - 1)}
          >
            Trước
          </button>
          <span>
            {page + 1} / {Math.max(1, Math.ceil(rows.length / 15))}
          </span>
          <button
            disabled={(page + 1) * 15 >= rows.length}
            onClick={() => setPage((current) => current + 1)}
          >
            Sau
          </button>
        </div>
      </div>
      <dialog
        ref={dialog}
        className="dialog"
        onCancel={(event) => {
          if (saving || locating) event.preventDefault();
          else setDialogOpen(false);
        }}
        onClose={() => {
          if (!saving && !locating) setDialogOpen(false);
        }}
      >
        <form onSubmit={submit}>
          <div className="dialog-header">
            <div>
              <p className="eyebrow">DMS · ĐẠI LÝ</p>
              <h2>Check-in GPS</h2>
            </div>
            <button
              type="button"
              className="icon-button"
              disabled={saving || locating}
              onClick={() => setDialogOpen(false)}
              aria-label="Đóng"
            >
              ×
            </button>
          </div>
          <div className="dialog-body">
            {error && (
              <div role="alert" className="alert error">
                {error}
              </div>
            )}
            {mapError && (
              <div role="alert" className="alert error">
                {mapError}
              </div>
            )}
            <label className="field">
              <span>Đại lý *</span>
              <select
                required
                value={partnerId}
                onChange={(event) => setPartnerId(event.target.value)}
              >
                <option value="" disabled>
                  Chọn đại lý đang hoạt động
                </option>
                {dealers.map((dealer) => (
                  <option key={text(dealer, "id")} value={text(dealer, "id")}>
                    {text(dealer, "name")} · {text(dealer, "code")}
                  </option>
                ))}
              </select>
            </label>
            <div className="gps-capture">
              <div>
                <strong>
                  {position ? "Đã lấy được vị trí" : "Chưa lấy vị trí"}
                </strong>
                <small>
                  {position
                    ? `Độ chính xác ước tính ±${Math.round(position.accuracy)} m`
                    : "Nhấn nút để yêu cầu vị trí hiện tại từ thiết bị."}
                </small>
              </div>
              <button
                type="button"
                className="button secondary"
                onClick={() => void getPosition()}
                disabled={!partnerId || locating || saving}
              >
                {locating
                  ? "Đang lấy GPS…"
                  : position
                    ? "Lấy lại GPS"
                    : "Lấy vị trí GPS"}
              </button>
            </div>
            {position && (
              <div className="gps-position">
                <span>
                  Vĩ độ <strong>{position.latitude}</strong>
                </span>
                <span>
                  Kinh độ <strong>{position.longitude}</strong>
                </span>
                <button
                  className="link"
                  type="button"
                  onClick={() =>
                    void openMap(
                      String(position.latitude),
                      String(position.longitude),
                    )
                  }
                >
                  Mở bản đồ
                </button>
              </div>
            )}
            <label className="field">
              <span>Ghi chú</span>
              <textarea
                value={notes}
                maxLength={2000}
                rows={3}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Trao đổi, tình trạng điểm bán…"
              />
            </label>
            <p className="hint">
              Thời gian do server ghi nhận khi lưu. Vị trí được gửi sau thao tác
              chủ động; ứng dụng không chạy nền.
            </p>
          </div>
          <div className="dialog-footer">
            <button
              type="button"
              className="button secondary"
              disabled={saving || locating}
              onClick={() => setDialogOpen(false)}
            >
              Hủy
            </button>
            <button
              type="submit"
              className="button primary"
              disabled={!position || !partnerId || saving || locating}
            >
              {saving ? "Đang lưu…" : "Lưu check-in"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
