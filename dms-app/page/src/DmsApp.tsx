import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  DatabaseUserMenu,
  invokeDatabaseFunction,
} from "@lark-base-open/base-database-app-sdk/page";
import DealerVisits from "./DealerVisits";
import "./generated/function-inputs";
import "./dms.css";
type Row = Record<string, unknown>;
type Tab =
  | "overview"
  | "partners"
  | "products"
  | "warehouses"
  | "orders"
  | "inventory"
  | "receivables"
  | "visits";
type Entity = "partners" | "products" | "warehouses";
type Modal = { kind: Entity | "order" | "movement" | "detail"; row?: Row };
type Data = {
  partners: Row[];
  products: Row[];
  warehouses: Row[];
  orders: Row[];
  movements: Row[];
  visits: Row[];
};
const empty: Data = {
  partners: [],
  products: [],
  warehouses: [],
  orders: [],
  movements: [],
  visits: [],
};
const text = (r: Row, k: string) =>
  typeof r[k] === "string" ? (r[k] as string) : "";
const number = (r: Row, k: string) =>
  typeof r[k] === "number" ? (r[k] as number) : 0;
const money = (v: number) =>
  new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(v);
const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
const statuses = [
  "Nháp",
  "Đã xác nhận",
  "Đang giao",
  "Hoàn tất",
  "Đã hủy",
] as const;
const transitions: Record<string, string[]> = {
  Nháp: ["Nháp", "Đã xác nhận", "Đã hủy"],
  "Đã xác nhận": ["Đã xác nhận", "Đang giao", "Đã hủy"],
  "Đang giao": ["Đang giao", "Hoàn tất"],
  "Hoàn tất": ["Hoàn tất"],
  "Đã hủy": ["Đã hủy"],
};
const nav: [Tab, string, string][] = [
  ["overview", "Tổng quan", "grid"],
  ["orders", "Đơn hàng", "bag"],
  ["partners", "Nhà phân phối & đại lý", "users"],
  ["products", "Sản phẩm", "box"],
  ["inventory", "Tồn kho & nhập xuất", "layers"],
  ["receivables", "Công nợ phải thu", "wallet"],
  ["visits", "Check-in đại lý", "pin"],
  ["warehouses", "Danh mục kho", "home"],
];
const paths: Record<string, string> = {
  grid: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
  bag: "M5 7h14l1 14H4L5 7z M9 7V5a3 3 0 016 0v2",
  users:
    "M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2 M16 3a4 4 0 010 8 M22 21v-2a4 4 0 00-3-3.87 M13 7a4 4 0 11-8 0 4 4 0 018 0",
  box: "M12 3L2 8l10 5 10-5-10-5z M2 8v10l10 5 10-5V8 M12 13v10 M7 5.5l10 5",
  layers: "M12 3L2 8l10 5 10-5-10-5z M2 12l10 5 10-5 M2 16l10 5 10-5",
  wallet: "M3 5h17v15H3z M3 5V3h14 M15 11h6v5h-6z",
  home: "M3 10l9-7 9 7v11H3z M9 21V12h6v9",
  pin: "M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1116 0z M12 10a2.5 2.5 0 110-5 2.5 2.5 0 010 5z",
  plus: "M12 5v14 M5 12h14",
  refresh: "M20 7v5h-5 M4 17v-5h5 M6 6a8 8 0 0113 3 M18 18a8 8 0 01-13-3",
  arrow: "M5 12h14 M14 7l5 5-5 5",
  search: "M21 21l-5-5 M18 10a8 8 0 11-16 0 8 8 0 0116 0",
  close: "M6 6l12 12 M6 18L18 6",
};
function Icon({ name, size = 18 }: { name: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name] || paths.box} />
    </svg>
  );
}
function Badge({ value }: { value: string }) {
  const color = [
    "Hoàn tất",
    "Hoạt động",
    "Đang bán",
    "Nhập kho",
    "Đủ hàng",
  ].includes(value)
    ? "green"
    : ["Đã hủy", "Tạm ngưng", "Ngừng bán", "Âm kho"].includes(value)
      ? "red"
      : ["Đang giao", "Thiếu hàng", "Xuất kho"].includes(value)
        ? "amber"
        : "neutral";
  return (
    <span className={`badge ${color}`}>
      <i />
      {value || "Chưa cập nhật"}
    </span>
  );
}
function parseRows(value: unknown): Row[] {
  if (
    !Array.isArray(value) ||
    value.some((r) => typeof r !== "object" || r === null || Array.isArray(r))
  )
    throw Error("Dữ liệu DMS trả về không hợp lệ.");
  return value as Row[];
}
function orderLines(row: Row) {
  try {
    return parseRows(JSON.parse(text(row, "lines") || "[]"));
  } catch {
    return [];
  }
}
async function loadList(
  id:
    | "list_partners"
    | "list_products"
    | "list_warehouses"
    | "list_orders"
    | "list_movements"
    | "list_visits",
) {
  const all: Row[] = [];
  for (let offset = 0; offset < 10000; offset += 200) {
    const response = await invokeDatabaseFunction(id, { offset });
    if (response.code !== 0 || !response.data)
      throw Error("Không tải được dữ liệu DMS.");
    const rows = parseRows(response.data.rows);
    all.push(...rows);
    if (rows.length < 200) return all;
  }
  throw Error(
    "Danh mục vượt 10.000 bản ghi; cần mở rộng phân trang để xem đầy đủ.",
  );
}
function checkWrite(result: {
  code: number;
  msg?: string;
  data?: { status: string; message: string; recordIds: string[] } | null;
}) {
  if (result.code !== 0)
    throw Error(result.msg || "Không thể lưu. Hãy tải lại trước khi gửi lại.");
  if (result.data?.status !== "success")
    throw Error(
      result.data?.message ||
        "Chưa xác định kết quả lưu. Tải lại dữ liệu để đối chiếu trước khi gửi lại.",
    );
}
const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .toLowerCase();
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
function Select({
  name,
  list,
  value,
}: {
  name: string;
  list: { value: string; label: string }[];
  value?: string;
}) {
  return (
    <select name={name} defaultValue={value || ""} required>
      <option value="" disabled>
        Chọn một mục
      </option>
      {list.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
const options = (list: readonly string[]) =>
  list.map((value) => ({ value, label: value }));
export default function DmsApp() {
  const [tab, setTab] = useState<Tab>("overview"),
    [data, setData] = useState<Data>(empty),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState(""),
    [page, setPage] = useState(0),
    [modal, setModal] = useState<Modal | null>(null),
    [saving, setSaving] = useState(false),
    [formError, setFormError] = useState(""),
    [draft, setDraft] = useState([{ productId: "", quantity: 1 }]);
  const dialog = useRef<HTMLDialogElement>(null),
    sequence = useRef(0);
  const refresh = useCallback(async () => {
    const seq = ++sequence.current;
    setLoading(true);
    setError("");
    try {
      const r = await Promise.all([
        loadList("list_partners"),
        loadList("list_products"),
        loadList("list_warehouses"),
        loadList("list_orders"),
        loadList("list_movements"),
        loadList("list_visits"),
      ]);
      if (seq === sequence.current)
        setData({
          partners: r[0],
          products: r[1],
          warehouses: r[2],
          orders: r[3],
          movements: r[4],
          visits: r[5],
        });
    } catch (e) {
      if (seq === sequence.current)
        setError(e instanceof Error ? e.message : "Không tải được dữ liệu.");
    } finally {
      if (seq === sequence.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
    return () => {
      sequence.current++;
    };
  }, [refresh]);
  useEffect(() => {
    if (modal && !dialog.current?.open) dialog.current?.showModal();
    if (!modal) dialog.current?.close();
  }, [modal]);
  const go = (next: Tab) => {
    setTab(next);
    setSearch("");
    setFilter("");
    setPage(0);
  };
  const open = (next: Modal) => {
    setModal(next);
    setFormError("");
    setDraft([{ productId: "", quantity: 1 }]);
  };
  const find = (kind: Entity, id: string) =>
    data[kind].find((r) => text(r, "id") === id) || {};
  const name = (kind: Entity, id: string) =>
    text(find(kind, id), "name") || "Không tìm thấy danh mục";
  const active = data.orders.filter(
    (o) => !["Nháp", "Đã hủy"].includes(text(o, "status")),
  );
  const value = active.reduce((a, o) => a + number(o, "total"), 0),
    debt = active.reduce(
      (a, o) => a + Math.max(0, number(o, "total") - number(o, "paid")),
      0,
    );
  const balance = new Map<string, number>();
  for (const m of data.movements) {
    const key = text(m, "warehouse_id") + "|" + text(m, "product_id");
    balance.set(
      key,
      (balance.get(key) || 0) +
        number(m, "quantity") * (text(m, "type") === "Nhập kho" ? 1 : -1),
    );
  }
  const stocks: Row[] = data.warehouses.flatMap((w) =>
    data.products.map((p) => {
      const id = text(w, "id") + "|" + text(p, "id"),
        quantity = balance.get(id) || 0;
      return {
        ...p,
        id,
        warehouse_id: text(w, "id"),
        warehouse_name: text(w, "name"),
        quantity,
        stock_status:
          quantity < 0
            ? "Âm kho"
            : quantity < number(p, "minimum")
              ? "Thiếu hàng"
              : "Đủ hàng",
      };
    }),
  );
  const low = stocks.filter((r) => text(r, "stock_status") !== "Đủ hàng");
  const debts: Row[] = data.partners
    .map((p) => {
      const orders = active.filter(
        (o) => text(o, "partner_id") === text(p, "id"),
      );
      return {
        ...p,
        count: orders.length,
        total: orders.reduce((a, o) => a + number(o, "total"), 0),
        paid: orders.reduce((a, o) => a + number(o, "paid"), 0),
        debt: orders.reduce(
          (a, o) => a + Math.max(0, number(o, "total") - number(o, "paid")),
          0,
        ),
      };
    })
    .filter((p) => p.count > 0);
  const source =
    tab === "inventory"
      ? stocks
      : tab === "receivables"
        ? debts
        : tab === "overview"
          ? data.orders
          : data[tab];
  const filtered = source.filter(
    (r) =>
      normalize(
        Object.values(r)
          .filter((v) => typeof v === "string")
          .join(" ") +
          " " +
          (r.partner_id ? name("partners", text(r, "partner_id")) : ""),
      ).includes(normalize(search)) &&
      (!filter ||
        (tab === "inventory"
          ? text(r, "warehouse_id") === filter
          : text(r, "status") === filter)),
  );
  const named = (kind: Entity) =>
    data[kind]
      .filter((r) =>
        kind === "partners"
          ? text(r, "status") === "Hoạt động"
          : kind === "products"
            ? text(r, "status") === "Đang bán"
            : true,
      )
      .map((r) => ({
        value: text(r, "id"),
        label: text(r, "name") + (text(r, "sku") ? " · " + text(r, "sku") : ""),
      }));
  const input = (
    key: string,
    label: string,
    type = "text",
    required = true,
    initial?: string | number,
  ) => (
    <Field key={key} label={label}>
      <input
        name={key}
        type={type}
        required={required}
        min={type === "number" ? 0 : undefined}
        step={type === "number" ? 1 : undefined}
        maxLength={type === "text" ? 500 : undefined}
        defaultValue={
          initial ??
          (modal?.row
            ? type === "number"
              ? number(modal.row, key)
              : text(modal.row, key)
            : "")
        }
      />
    </Field>
  );
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!modal || saving) return;
    setSaving(true);
    setFormError("");
    const f = new FormData(e.currentTarget),
      v = (key: string) => String(f.get(key) || "").trim(),
      amount = (key: string) => Number(v(key)),
      recordId = modal.row ? text(modal.row, "id") : undefined;
    try {
      if (modal.kind === "partners")
        checkWrite(
          await invokeDatabaseFunction("save_partners", {
            recordId,
            name: v("name"),
            code: v("code"),
            type: v("type") as "Nhà phân phối" | "Đại lý",
            region: v("region"),
            phone: v("phone"),
            address: v("address"),
            status: v("status") as "Hoạt động" | "Tạm ngưng",
            notes: v("notes"),
          }),
        );
      else if (modal.kind === "products")
        checkWrite(
          await invokeDatabaseFunction("save_products", {
            recordId,
            name: v("name"),
            sku: v("sku"),
            unit: v("unit"),
            category: v("category"),
            price: amount("price"),
            minimum: amount("minimum"),
            status: v("status") as "Đang bán" | "Ngừng bán",
          }),
        );
      else if (modal.kind === "warehouses")
        checkWrite(
          await invokeDatabaseFunction("save_warehouses", {
            recordId,
            name: v("name"),
            code: v("code"),
            address: v("address"),
            manager: v("manager"),
          }),
        );
      else if (modal.kind === "order")
        checkWrite(
          await invokeDatabaseFunction("create_order", {
            partnerId: v("partnerId"),
            warehouseId: v("warehouseId"),
            date: v("date"),
            notes: v("notes"),
            lines: draft,
          }),
        );
      else if (modal.kind === "movement")
        checkWrite(
          await invokeDatabaseFunction("create_movement", {
            productId: v("productId"),
            warehouseId: v("warehouseId"),
            date: v("date"),
            type: v("type") as "Nhập kho" | "Xuất kho",
            quantity: amount("quantity"),
            reference: v("reference"),
            notes: v("notes"),
          }),
        );
      else
        checkWrite(
          await invokeDatabaseFunction("update_order", {
            id: recordId!,
            status: v("status") as (typeof statuses)[number],
            paid: amount("paid"),
          }),
        );
      setModal(null);
      setNotice("Đã lưu vào Lark Base.");
      await refresh();
    } catch (err) {
      setFormError(
        err instanceof Error
          ? err.message
          : "Chưa xác định kết quả. Tải lại trước khi gửi lại.",
      );
    } finally {
      setSaving(false);
    }
  };
  const exportCsv = () => {
    const fields =
      tab === "orders"
        ? ["code", "date", "partner_id", "status", "total", "paid"]
        : tab === "inventory"
          ? [
              "name",
              "sku",
              "warehouse_name",
              "quantity",
              "minimum",
              "stock_status",
            ]
          : tab === "receivables"
            ? ["name", "code", "total", "paid", "debt"]
            : tab === "products"
              ? [
                  "name",
                  "sku",
                  "unit",
                  "category",
                  "price",
                  "minimum",
                  "status",
                ]
              : tab === "partners"
                ? [
                    "name",
                    "code",
                    "type",
                    "region",
                    "phone",
                    "address",
                    "status",
                  ]
                : ["name", "code", "address", "manager"];
    const cell = (v: unknown) =>
      '"' +
      String(v ?? "")
        .replace(/^[=+@\-]/, "'$&")
        .replace(/"/g, '""') +
      '"';
    const body =
      "\uFEFF" +
      [
        fields,
        ...filtered.map((r) =>
          fields.map((k) =>
            k === "partner_id" ? name("partners", text(r, k)) : r[k],
          ),
        ),
      ]
        .map((r) => r.map(cell).join(","))
        .join("\r\n");
    const url = URL.createObjectURL(
      new Blob([body], { type: "text/csv;charset=utf-8;" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `DMS-${tab}-${today()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const table = (list: Row[], kind: Tab) => {
    const headers =
      kind === "overview" || kind === "orders"
        ? [
            "Đơn hàng",
            "Đối tác",
            "Ngày đặt",
            "Trạng thái",
            "Tổng tiền",
            "Còn phải thu",
            "",
          ]
        : kind === "partners"
          ? ["Đối tác", "Loại", "Khu vực", "Điện thoại", "Trạng thái", ""]
          : kind === "products"
            ? [
                "Sản phẩm / SKU",
                "Nhóm hàng",
                "Đơn vị",
                "Giá bán",
                "Tồn tối thiểu",
                "Trạng thái",
                "",
              ]
            : kind === "inventory"
              ? [
                  "Sản phẩm",
                  "Kho",
                  "Tồn hiện tại",
                  "Mức tối thiểu",
                  "Tình trạng",
                ]
              : kind === "receivables"
                ? ["Đối tác", "Số đơn", "Giá trị đơn", "Đã thu", "Phải thu"]
                : ["Kho", "Mã kho", "Địa chỉ", "Phụ trách", ""];
    return (
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              {headers.map((h, i) => (
                <th key={i}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {list.map((r) => (
              <tr key={text(r, "id")}>
                {kind === "orders" || kind === "overview" ? (
                  <>
                    <td>
                      <button
                        className="link"
                        onClick={() => open({ kind: "detail", row: r })}
                      >
                        {text(r, "code")}
                      </button>
                      <small>{orderLines(r).length} sản phẩm</small>
                    </td>
                    <td>{name("partners", text(r, "partner_id"))}</td>
                    <td>{text(r, "date")}</td>
                    <td>
                      <Badge value={text(r, "status")} />
                    </td>
                    <td className="numeric">{money(number(r, "total"))}</td>
                    <td className="numeric">
                      {money(
                        text(r, "status") === "Đã hủy"
                          ? 0
                          : Math.max(0, number(r, "total") - number(r, "paid")),
                      )}
                    </td>
                    <td>
                      <button
                        className="icon-button"
                        aria-label="Xem đơn hàng"
                        onClick={() => open({ kind: "detail", row: r })}
                      >
                        <Icon name="arrow" />
                      </button>
                    </td>
                  </>
                ) : kind === "partners" ? (
                  <>
                    <td>
                      <strong>{text(r, "name")}</strong>
                      <small>{text(r, "code")}</small>
                    </td>
                    <td>{text(r, "type")}</td>
                    <td>{text(r, "region") || "—"}</td>
                    <td>{text(r, "phone") || "—"}</td>
                    <td>
                      <Badge value={text(r, "status")} />
                    </td>
                    <td>
                      <button
                        className="link"
                        onClick={() => open({ kind: "partners", row: r })}
                      >
                        Sửa
                      </button>
                    </td>
                  </>
                ) : kind === "products" ? (
                  <>
                    <td>
                      <strong>{text(r, "name")}</strong>
                      <small>{text(r, "sku")}</small>
                    </td>
                    <td>{text(r, "category") || "—"}</td>
                    <td>{text(r, "unit")}</td>
                    <td className="numeric">{money(number(r, "price"))}</td>
                    <td className="numeric">{number(r, "minimum")}</td>
                    <td>
                      <Badge value={text(r, "status")} />
                    </td>
                    <td>
                      <button
                        className="link"
                        onClick={() => open({ kind: "products", row: r })}
                      >
                        Sửa
                      </button>
                    </td>
                  </>
                ) : kind === "inventory" ? (
                  <>
                    <td>
                      <strong>{text(r, "name")}</strong>
                      <small>
                        {text(r, "sku")} · {text(r, "unit")}
                      </small>
                    </td>
                    <td>{text(r, "warehouse_name")}</td>
                    <td
                      className={`numeric ${number(r, "quantity") < 0 ? "danger" : ""}`}
                    >
                      <strong>{number(r, "quantity")}</strong>
                    </td>
                    <td className="numeric">{number(r, "minimum")}</td>
                    <td>
                      <Badge value={text(r, "stock_status")} />
                    </td>
                  </>
                ) : kind === "receivables" ? (
                  <>
                    <td>
                      <strong>{text(r, "name")}</strong>
                      <small>{text(r, "code")}</small>
                    </td>
                    <td>{number(r, "count")}</td>
                    <td className="numeric">{money(number(r, "total"))}</td>
                    <td className="numeric">{money(number(r, "paid"))}</td>
                    <td className="numeric">
                      <strong>{money(number(r, "debt"))}</strong>
                    </td>
                  </>
                ) : (
                  <>
                    <td>
                      <strong>{text(r, "name")}</strong>
                    </td>
                    <td>{text(r, "code")}</td>
                    <td>{text(r, "address") || "—"}</td>
                    <td>{text(r, "manager") || "—"}</td>
                    <td>
                      <button
                        className="link"
                        onClick={() => open({ kind: "warehouses", row: r })}
                      >
                        Sửa
                      </button>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {!list.length && (
          <div className="empty">
            <Icon name="box" size={32} />
            <h3>
              {search || filter ? "Không tìm thấy kết quả" : "Chưa có dữ liệu"}
            </h3>
            <p>
              {search || filter
                ? "Thử thay đổi từ khóa hoặc bộ lọc."
                : "Thêm dữ liệu đầu tiên để bắt đầu quản lý."}
            </p>
          </div>
        )}
      </div>
    );
  };
  const heading = nav.find((n) => n[0] === tab)?.[1];
  const modalTitle = modal
    ? modal.kind === "order"
      ? "Tạo đơn hàng"
      : modal.kind === "movement"
        ? "Ghi nhận nhập / xuất kho"
        : modal.kind === "detail"
          ? text(modal.row || {}, "code")
          : (modal.row ? "Chỉnh sửa " : "Thêm ") +
            { partners: "đối tác", products: "sản phẩm", warehouses: "kho" }[
              modal.kind
            ]
    : "";
  return (
    <div className="dms-shell">
      <aside className="sidebar">
        <div className="brand">
          <span>
            <Icon name="layers" size={25} />
          </span>
          <div>
            DMS<small>Distribution workspace</small>
          </div>
        </div>
        <p className="nav-caption">KHÔNG GIAN VẬN HÀNH</p>
        <nav>
          {nav.map(([id, label, icon]) => (
            <button
              key={id}
              className={id === tab ? "nav active" : "nav"}
              onClick={() => go(id)}
            >
              <Icon name={icon} />
              {label}
              {id === "orders" && (
                <b>
                  {
                    data.orders.filter((o) => text(o, "status") === "Nháp")
                      .length
                  }
                </b>
              )}
            </button>
          ))}
        </nav>
        <div className="connection">
          <i /> Lark Base đã kết nối
          <small>Dữ liệu lưu trên Base DMS riêng</small>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <span>
            Vận hành phân phối <em>/</em> <strong>{heading}</strong>
          </span>
          <div>
            <span className="preview">BẢN XEM TRƯỚC</span>
            <DatabaseUserMenu audience="enterprise" />
          </div>
        </header>
        <main className="content">
          <div className="page-heading">
            <div>
              <p className="eyebrow">DMS · PHÂN PHỐI</p>
              <h1>{heading}</h1>
              <p>
                {tab === "overview"
                  ? "Nắm bắt đơn hàng, công nợ và tình hình kho trong một nơi."
                  : tab === "inventory"
                    ? "Theo dõi tồn theo kho từ các phiếu nhập và xuất đã ghi nhận."
                    : tab === "receivables"
                      ? "Đơn đã xác nhận trở đi, loại trừ đơn nháp và đơn hủy."
                      : tab === "visits"
                        ? "Ghi nhận vị trí khi nhân viên chủ động check-in tại đại lý."
                        : "Quản lý dữ liệu phân phối của đội ngũ vận hành."}
              </p>
            </div>
            <div className="actions">
              <button
                className="button secondary"
                onClick={() => void refresh()}
                disabled={loading}
              >
                <Icon name="refresh" />
                {loading ? "Đang tải…" : "Làm mới"}
              </button>
              {tab === "inventory" ? (
                <button
                  className="button primary"
                  onClick={() => open({ kind: "movement" })}
                  disabled={loading || !!error}
                >
                  <Icon name="plus" />
                  Phiếu nhập / xuất
                </button>
              ) : tab === "partners" ||
                tab === "products" ||
                tab === "warehouses" ? (
                <button
                  className="button primary"
                  onClick={() => open({ kind: tab })}
                  disabled={loading || !!error}
                >
                  <Icon name="plus" />
                  Thêm{" "}
                  {tab === "partners"
                    ? "đối tác"
                    : tab === "products"
                      ? "sản phẩm"
                      : "kho"}
                </button>
              ) : (
                tab !== "receivables" &&
                tab !== "visits" && (
                  <button
                    className="button primary"
                    onClick={() => open({ kind: "order" })}
                    disabled={loading || !!error}
                  >
                    <Icon name="plus" />
                    Tạo đơn hàng
                  </button>
                )
              )}
            </div>
          </div>
          {error && (
            <div role="alert" className="alert error">
              {error}
              <button onClick={() => void refresh()}>Thử tải lại</button>
            </div>
          )}
          {notice && (
            <div role="status" className="alert success">
              {notice}
              <button onClick={() => setNotice("")} aria-label="Ẩn thông báo">
                ×
              </button>
            </div>
          )}
          {loading ? (
            <div className="loading" role="status">
              <i />
              Đang đồng bộ dữ liệu từ Lark Base…
            </div>
          ) : (
            !error && (
              <>
                {tab === "visits" ? (
                  <DealerVisits
                    partners={data.partners}
                    visits={data.visits}
                    onRefresh={refresh}
                  />
                ) : tab === "overview" ? (
                  <>
                    <div className="metrics">
                      <div>
                        <span>Giá trị đơn đã xác nhận</span>
                        <strong>{money(value)}</strong>
                        <small>
                          {active.length} đơn không bao gồm nháp / hủy
                        </small>
                      </div>
                      <div>
                        <span>Đơn đang xử lý</span>
                        <strong>
                          {
                            data.orders.filter((o) =>
                              ["Nháp", "Đã xác nhận", "Đang giao"].includes(
                                text(o, "status"),
                              ),
                            ).length
                          }
                        </strong>
                        <small>Cần xác nhận, giao hàng hoặc hoàn tất</small>
                      </div>
                      <div>
                        <span>Công nợ phải thu</span>
                        <strong>{money(debt)}</strong>
                        <small>Theo số tiền đã thu trên đơn</small>
                      </div>
                      <div>
                        <span>Đối tác hoạt động</span>
                        <strong>
                          {
                            data.partners.filter(
                              (p) => text(p, "status") === "Hoạt động",
                            ).length
                          }
                        </strong>
                        <small>Nhà phân phối và đại lý</small>
                      </div>
                    </div>
                    {low.length > 0 && (
                      <button
                        className="stock-alert"
                        onClick={() => go("inventory")}
                      >
                        <span>
                          <strong>
                            {low.length} mặt hàng tại kho cần kiểm tra
                          </strong>
                          <small>Tồn âm hoặc thấp hơn mức tối thiểu</small>
                        </span>
                        <span>
                          Xem tồn kho <Icon name="arrow" />
                        </span>
                      </button>
                    )}
                    <div className="section-heading">
                      <div>
                        <h2>Đơn hàng gần đây</h2>
                        <p>Các đơn mới được tạo trong hệ thống</p>
                      </div>
                      <button className="link" onClick={() => go("orders")}>
                        Tất cả đơn hàng <Icon name="arrow" />
                      </button>
                    </div>
                    {table(
                      [...data.orders]
                        .sort(
                          (a, b) =>
                            text(b, "date").localeCompare(text(a, "date")) ||
                            text(b, "id").localeCompare(text(a, "id")),
                        )
                        .slice(0, 8),
                      "overview",
                    )}
                    <div className="overview-bottom">
                      <section>
                        <h2>Phân bổ trạng thái đơn</h2>
                        {statuses.map((status) => {
                          const count = data.orders.filter(
                            (o) => text(o, "status") === status,
                          ).length;
                          return (
                            <div className="status-bar" key={status}>
                              <span>{status}</span>
                              <div>
                                <i
                                  style={{
                                    width: `${data.orders.length ? (count / data.orders.length) * 100 : 0}%`,
                                  }}
                                />
                              </div>
                              <b>{count}</b>
                            </div>
                          );
                        })}
                      </section>
                      <section className="workflow">
                        <p className="eyebrow">QUY TRÌNH LÀM VIỆC</p>
                        <h2>Từ đơn hàng đến đối soát</h2>
                        <p>1. Tạo đối tác, sản phẩm và kho.</p>
                        <p>2. Lập đơn, xác nhận và theo dõi giao hàng.</p>
                        <p>3. Ghi phiếu kho riêng, điền mã đơn để đối chiếu.</p>
                        <p>4. Cập nhật tổng tiền đã thu trên đơn hàng.</p>
                      </section>
                    </div>
                  </>
                ) : (
                  <>
                    {tab === "receivables" && (
                      <div className="summary">
                        Tổng phải thu <strong>{money(debt)}</strong>
                        <span>
                          {debts.filter((r) => number(r, "debt") > 0).length}{" "}
                          đối tác còn công nợ
                        </span>
                      </div>
                    )}
                    {tab === "inventory" && (
                      <p className="info">
                        Phiếu kho độc lập với trạng thái đơn hàng. Hệ thống cảnh
                        báo tồn âm, chưa khóa xuất vượt tồn.
                      </p>
                    )}
                    <div className="toolbar">
                      <label className="search">
                        <Icon name="search" />
                        <input
                          aria-label="Tìm kiếm"
                          placeholder="Tìm mã, tên hoặc khu vực…"
                          value={search}
                          onChange={(e) => {
                            setSearch(e.target.value);
                            setPage(0);
                          }}
                        />
                      </label>
                      {["orders", "partners", "products", "inventory"].includes(
                        tab,
                      ) && (
                        <select
                          aria-label="Bộ lọc"
                          value={filter}
                          onChange={(e) => {
                            setFilter(e.target.value);
                            setPage(0);
                          }}
                        >
                          <option value="">
                            {tab === "inventory"
                              ? "Tất cả kho"
                              : "Tất cả trạng thái"}
                          </option>
                          {(tab === "inventory"
                            ? data.warehouses.map((w) => ({
                                value: text(w, "id"),
                                label: text(w, "name"),
                              }))
                            : options(
                                tab === "orders"
                                  ? statuses
                                  : tab === "partners"
                                    ? ["Hoạt động", "Tạm ngưng"]
                                    : ["Đang bán", "Ngừng bán"],
                              )
                          ).map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      )}
                      <button
                        className="button secondary export"
                        onClick={exportCsv}
                      >
                        Xuất CSV
                      </button>
                    </div>
                    {table(filtered.slice(page * 15, page * 15 + 15), tab)}
                    <div className="pagination">
                      <span>
                        {filtered.length ? page * 15 + 1 : 0}–
                        {Math.min((page + 1) * 15, filtered.length)} /{" "}
                        {filtered.length} bản ghi
                      </span>
                      <div>
                        <button
                          disabled={!page}
                          onClick={() => setPage((p) => p - 1)}
                        >
                          Trước
                        </button>
                        <span>
                          {page + 1} /{" "}
                          {Math.max(1, Math.ceil(filtered.length / 15))}
                        </span>
                        <button
                          disabled={(page + 1) * 15 >= filtered.length}
                          onClick={() => setPage((p) => p + 1)}
                        >
                          Sau
                        </button>
                      </div>
                    </div>
                    {tab === "inventory" && (
                      <>
                        <div className="section-heading">
                          <div>
                            <h2>Lịch sử nhập / xuất kho</h2>
                            <p>
                              {data.movements.length} phiếu · Hiển thị 30 phiếu
                              gần nhất
                            </p>
                          </div>
                        </div>
                        <div className="table-scroll">
                          <table>
                            <thead>
                              <tr>
                                {[
                                  "Phiếu",
                                  "Ngày",
                                  "Sản phẩm",
                                  "Kho",
                                  "Loại",
                                  "Số lượng",
                                  "Tham chiếu",
                                ].map((h) => (
                                  <th key={h}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {[...data.movements]
                                .sort(
                                  (a, b) =>
                                    text(b, "date").localeCompare(
                                      text(a, "date"),
                                    ) ||
                                    text(b, "id").localeCompare(text(a, "id")),
                                )
                                .slice(0, 30)
                                .map((m) => (
                                  <tr key={text(m, "id")}>
                                    <td>{text(m, "code")}</td>
                                    <td>{text(m, "date")}</td>
                                    <td>
                                      {name("products", text(m, "product_id"))}
                                    </td>
                                    <td>
                                      {name(
                                        "warehouses",
                                        text(m, "warehouse_id"),
                                      )}
                                    </td>
                                    <td>
                                      <Badge value={text(m, "type")} />
                                    </td>
                                    <td className="numeric">
                                      {number(m, "quantity")}
                                    </td>
                                    <td>{text(m, "reference") || "—"}</td>
                                  </tr>
                                ))}
                            </tbody>
                          </table>
                          {!data.movements.length && (
                            <div className="empty">Chưa có phiếu kho.</div>
                          )}
                        </div>
                      </>
                    )}
                  </>
                )}
              </>
            )
          )}
          <footer className="page-footer">
            DMS Phân phối<span>Giờ Việt Nam · Đơn vị tiền tệ VND</span>
          </footer>
        </main>
      </div>
      <dialog
        ref={dialog}
        className="dialog"
        onCancel={(e) => {
          if (saving) e.preventDefault();
          else setModal(null);
        }}
        onClose={() => {
          if (!saving) setModal(null);
        }}
      >
        <form onSubmit={submit}>
          <div className="dialog-header">
            <div>
              <p className="eyebrow">DMS PHÂN PHỐI</p>
              <h2>{modalTitle}</h2>
            </div>
            <button
              type="button"
              className="icon-button"
              disabled={saving}
              onClick={() => setModal(null)}
              aria-label="Đóng"
            >
              <Icon name="close" />
            </button>
          </div>
          <div className="dialog-body">
            {modal?.kind === "partners" && (
              <div className="form-grid">
                {input("name", "Tên đối tác *")}
                {input("code", "Mã đối tác *")}
                <Field label="Loại đối tác *">
                  <Select
                    name="type"
                    list={options(["Nhà phân phối", "Đại lý"])}
                    value={text(modal.row || {}, "type") || "Đại lý"}
                  />
                </Field>
                {input("region", "Khu vực", "text", false)}
                {input("phone", "Điện thoại", "tel", false)}
                <Field label="Trạng thái *">
                  <Select
                    name="status"
                    list={options(["Hoạt động", "Tạm ngưng"])}
                    value={text(modal.row || {}, "status") || "Hoạt động"}
                  />
                </Field>
                {input("address", "Địa chỉ", "text", false)}
                {input("notes", "Ghi chú", "text", false)}
              </div>
            )}
            {modal?.kind === "products" && (
              <div className="form-grid">
                {input("name", "Tên sản phẩm *")}
                {input("sku", "SKU *")}
                {input("unit", "Đơn vị tính *")}
                {input("category", "Nhóm hàng", "text", false)}
                {input(
                  "price",
                  "Giá bán (VND) *",
                  "number",
                  true,
                  modal.row ? number(modal.row, "price") : 0,
                )}
                {input(
                  "minimum",
                  "Tồn tối thiểu / kho *",
                  "number",
                  true,
                  modal.row ? number(modal.row, "minimum") : 0,
                )}
                <Field label="Trạng thái *">
                  <Select
                    name="status"
                    list={options(["Đang bán", "Ngừng bán"])}
                    value={text(modal.row || {}, "status") || "Đang bán"}
                  />
                </Field>
              </div>
            )}
            {modal?.kind === "warehouses" && (
              <div className="form-grid">
                {input("name", "Tên kho *")}
                {input("code", "Mã kho *")}
                {input("address", "Địa chỉ", "text", false)}
                {input("manager", "Người phụ trách", "text", false)}
              </div>
            )}
            {modal?.kind === "order" && (
              <>
                <div className="form-grid">
                  <Field label="Đối tác *">
                    <Select name="partnerId" list={named("partners")} />
                  </Field>
                  <Field label="Kho giao hàng *">
                    <Select name="warehouseId" list={named("warehouses")} />
                  </Field>
                  {input("date", "Ngày đặt *", "date", true, today())}
                  {input("notes", "Ghi chú", "text", false)}
                </div>
                {(!named("partners").length ||
                  !named("products").length ||
                  !data.warehouses.length) && (
                  <p className="info">
                    Cần có đối tác hoạt động, sản phẩm đang bán và kho trước khi
                    lập đơn.
                  </p>
                )}
                <div className="section-heading">
                  <h3>Chi tiết đơn hàng</h3>
                  <button
                    type="button"
                    className="link"
                    disabled={draft.length >= 50}
                    onClick={() =>
                      setDraft((d) => [...d, { productId: "", quantity: 1 }])
                    }
                  >
                    + Thêm dòng
                  </button>
                </div>
                {draft.map((line, i) => (
                  <div className="order-line" key={i}>
                    <select
                      aria-label={`Sản phẩm dòng ${i + 1}`}
                      value={line.productId}
                      required
                      onChange={(e) =>
                        setDraft((d) =>
                          d.map((l, j) =>
                            i === j ? { ...l, productId: e.target.value } : l,
                          ),
                        )
                      }
                    >
                      <option value="" disabled>
                        Chọn sản phẩm
                      </option>
                      {named("products")
                        .filter(
                          (p) =>
                            p.value === line.productId ||
                            !draft.some((l) => l.productId === p.value),
                        )
                        .map((p) => (
                          <option key={p.value} value={p.value}>
                            {p.label}
                          </option>
                        ))}
                    </select>
                    <input
                      aria-label={`Số lượng dòng ${i + 1}`}
                      type="number"
                      required
                      min="1"
                      max="1000000"
                      step="1"
                      value={line.quantity}
                      onChange={(e) =>
                        setDraft((d) =>
                          d.map((l, j) =>
                            i === j
                              ? { ...l, quantity: Number(e.target.value) }
                              : l,
                          ),
                        )
                      }
                    />
                    <span>
                      {money(
                        number(find("products", line.productId), "price") *
                          line.quantity,
                      )}
                    </span>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`Xóa dòng ${i + 1}`}
                      disabled={draft.length === 1}
                      onClick={() =>
                        setDraft((d) => d.filter((_, j) => j !== i))
                      }
                    >
                      <Icon name="close" size={15} />
                    </button>
                  </div>
                ))}
                <div className="order-total">
                  <span>Tạm tính</span>
                  <strong>
                    {money(
                      draft.reduce(
                        (a, l) =>
                          a +
                          number(find("products", l.productId), "price") *
                            l.quantity,
                        0,
                      ),
                    )}
                  </strong>
                </div>
                <p className="hint">
                  Giá được kiểm tra lại khi lưu. Đơn mới ở trạng thái Nháp.
                </p>
              </>
            )}
            {modal?.kind === "movement" && (
              <>
                <div className="form-grid">
                  <Field label="Loại phiếu *">
                    <Select
                      name="type"
                      list={options(["Nhập kho", "Xuất kho"])}
                      value="Nhập kho"
                    />
                  </Field>
                  {input("date", "Ngày ghi nhận *", "date", true, today())}
                  <Field label="Sản phẩm *">
                    <Select
                      name="productId"
                      list={data.products.map((p) => ({
                        value: text(p, "id"),
                        label: text(p, "name"),
                      }))}
                    />
                  </Field>
                  <Field label="Kho *">
                    <Select name="warehouseId" list={named("warehouses")} />
                  </Field>
                  {input("quantity", "Số lượng *", "number", true, 1)}
                  {input("reference", "Mã đơn / chứng từ", "text", false)}
                  {input("notes", "Ghi chú", "text", false)}
                </div>
                <p className="hint">
                  Kiểm tra sản phẩm, kho và số lượng trước khi ghi phiếu. Phiếu
                  được giữ trong sổ kho để đối soát.
                </p>
              </>
            )}
            {modal?.kind === "detail" && modal.row && (
              <>
                <div className="detail-meta">
                  <div>
                    <span>Đối tác</span>
                    <strong>
                      {name("partners", text(modal.row, "partner_id"))}
                    </strong>
                  </div>
                  <div>
                    <span>Kho</span>
                    <strong>
                      {name("warehouses", text(modal.row, "warehouse_id"))}
                    </strong>
                  </div>
                  <div>
                    <span>Ngày đặt</span>
                    <strong>{text(modal.row, "date")}</strong>
                  </div>
                </div>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Sản phẩm</th>
                        <th>SL</th>
                        <th>Đơn giá</th>
                        <th>Thành tiền</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orderLines(modal.row).map((l, i) => (
                        <tr key={i}>
                          <td>
                            {text(l, "name")}
                            <small>{text(l, "sku")}</small>
                          </td>
                          <td>{number(l, "quantity")}</td>
                          <td>{money(number(l, "price"))}</td>
                          <td>{money(number(l, "amount"))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="order-total">
                  <span>Tổng đơn hàng</span>
                  <strong>{money(number(modal.row, "total"))}</strong>
                </div>
                <div className="form-grid">
                  <Field label="Trạng thái">
                    <Select
                      name="status"
                      list={options(
                        transitions[text(modal.row, "status")] || [
                          text(modal.row, "status"),
                        ],
                      )}
                      value={text(modal.row, "status")}
                    />
                  </Field>
                  <Field label="Tổng tiền đã thu (VND)">
                    <input
                      name="paid"
                      type="number"
                      required
                      min="0"
                      max={number(modal.row, "total")}
                      step="1"
                      defaultValue={number(modal.row, "paid")}
                    />
                  </Field>
                </div>
                {text(modal.row, "notes") && (
                  <p className="hint">Ghi chú: {text(modal.row, "notes")}</p>
                )}
                <p className="hint">
                  Đổi trạng thái không tự ghi phiếu kho. Ghi phiếu riêng, dùng
                  mã {text(modal.row, "code")} để đối soát.
                </p>
              </>
            )}
            {formError && (
              <div className="alert error" role="alert">
                {formError}
              </div>
            )}
          </div>
          <div className="dialog-footer">
            <button
              type="button"
              className="button secondary"
              disabled={saving}
              onClick={() => setModal(null)}
            >
              Hủy
            </button>
            <button type="submit" className="button primary" disabled={saving}>
              {saving
                ? "Đang lưu…"
                : modal?.kind === "order"
                  ? "Tạo đơn nháp"
                  : "Lưu vào Base"}
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
