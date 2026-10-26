import { getAllBaseProfiles } from "../config";
import { BUDGET_APP_ID, BUDGET_BASE, MODULES, displayText, requireBrand, parseSheetUrl, sheetLines, type BaseField, type BaseRecord, type ModuleKey, type BrandAccess } from "./domain";
import type { BudgetSession } from "./storage";

export class BudgetApiError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}
export function budgetCredentials() {
  const profile = getAllBaseProfiles().find(item => item.appId === BUDGET_APP_ID && item.baseAppToken === BUDGET_BASE);
  if (!profile?.appSecret) throw new BudgetApiError("Chưa cấu hình bot BOT MIN cho Base Ngân sách trong phần Cài đặt.", 503);
  return { appId: profile.appId, appSecret: profile.appSecret };
}
export function publicOrigin() {
  const url = new URL(process.env.BUDGET_PUBLIC_URL || "http://localhost:3000");
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) throw Error("BUDGET_PUBLIC_URL phải dùng HTTPS khi truy cập ngoài máy này.");
  return url.origin;
}
export async function lark<T>(token: string, path: string, options: { method?: string; body?: unknown; params?: Record<string, string> } = {}): Promise<T> {
  if (!path.startsWith("/open-apis/")) throw Error("Đường dẫn Lark không hợp lệ.");
  const url = new URL(path, "https://open.larksuite.com");
  for (const [key, value] of Object.entries(options.params || {})) url.searchParams.set(key, value);
  const response = await fetch(url, { method: options.method || "GET", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }), cache: "no-store", signal: AbortSignal.timeout(25000) });
  const envelope = await response.json() as { code?: number; msg?: string; data?: T };
  if (!response.ok || envelope.code !== 0 || envelope.data === undefined) {
    const logId = response.headers.get("x-tt-logid") || "";
    throw new BudgetApiError(`Lark chưa thực hiện được yêu cầu (mã ${envelope.code ?? response.status}). ${String(envelope.msg || "Kiểm tra quyền ứng dụng và quyền trên Base.").slice(0, 220)}${logId ? ` · LogID ${logId}` : ""}`, response.status === 401 ? 401 : 400);
  }
  return envelope.data;
}
const tablePath = (id: string) => `/open-apis/bitable/v1/apps/${BUDGET_BASE}/tables/${id}`;
export async function fields(session: BudgetSession, id: string): Promise<BaseField[]> {
  const result: BaseField[] = []; let page: string | undefined;
  do {
    const data: { items: BaseField[]; has_more?: boolean; page_token?: string } = await lark(session.token, tablePath(id) + "/fields", { params: { page_size: "100", ...(page ? { page_token: page } : {}) } });
    result.push(...data.items); page = data.has_more ? data.page_token : undefined;
  } while (page);
  return result;
}
export async function accessContext(session: BudgetSession) {
  if (session.appId !== BUDGET_APP_ID) throw new BudgetApiError("Phiên đăng nhập thuộc ứng dụng khác.", 401);
  const schema = await fields(session, MODULES[0].tableId);
  const brandField = schema.find(field => field.field_name === "Brand" && field.type === 3);
  if (!brandField) throw new BudgetApiError("Bảng A03 cần trường Brand kiểu chọn để phân loại dữ liệu.");
  const brands = [...new Set((brandField.property?.options || []).map(option => option.name.trim()).filter(Boolean))];
  const access = brands.map(brand => ({ brand, roles: ["Quyền truy cập Base"], stopped: false, canManage: false }));
  return { access, members: [] as { id: string; name: string; role: string; brand: string }[] };
}
export async function moduleRecords(session: BudgetSession, access: BrandAccess[], key: ModuleKey, brand: string, page = "") {
  const budgetModule = MODULES.find(item => item.key === key); if (!budgetModule) throw Error("Phân hệ không hợp lệ.");
  requireBrand(access, brand);
  const schema = await fields(session, budgetModule.tableId), brandField = schema.find(f => f.field_name === "Brand");
  if (!brandField || ![1, 3].includes(brandField.type)) throw new BudgetApiError("Phân hệ này cần cấu hình trường Brand trực tiếp trước khi cấp quyền; chưa hiển thị dữ liệu.");
  const data = await lark<{ items: BaseRecord[]; has_more: boolean; page_token?: string; total?: number }>(session.token, tablePath(budgetModule.tableId) + "/records/search", { method: "POST", params: { page_size: "50", ...(page ? { page_token: page } : {}) }, body: { filter: { conjunction: "and", conditions: [{ field_name: "Brand", operator: "is", value: [brand] }] }, automatic_fields: false } });
  // Enforce scope again even if the upstream filter changes semantics.
  const records = data.items.filter(record => displayText(record.fields.Brand) === brand);
  return { schema, records, hasMore: data.has_more, pageToken: data.page_token || "" };
}
export async function a03Record(session: BudgetSession, id: string) {
  if (!/^rec[A-Za-z0-9]{1,32}$/.test(id)) throw Error("ID A03 không hợp lệ.");
  const data = await lark<{ record: BaseRecord }>(session.token, tablePath(MODULES[0].tableId) + "/records/" + id);
  return data.record;
}
export async function readSheet(session: BudgetSession, sheetUrl: string, sheetId: string) {
  const parsed = parseSheetUrl(sheetUrl);
  const meta = await lark<{ sheets: { sheet_id: string; title: string; hidden?: boolean }[] }>(session.token, `/open-apis/sheets/v3/spreadsheets/${parsed.token}/sheets/query`);
  if (!sheetId) return { sheets: meta.sheets.map(s => ({ id: s.sheet_id, title: s.title })), values: [] as unknown[][] };
  if (!meta.sheets.some(sheet => sheet.sheet_id === sheetId)) throw Error("Sheet không thuộc bảng tính này.");
  const data = await lark<{ valueRange: { values: unknown[][] } }>(session.token, `/open-apis/sheets/v2/spreadsheets/${parsed.token}/values/${encodeURIComponent(sheetId + "!A1:Z202")}`, { params: { valueRenderOption: "UnformattedValue" } });
  const values = data.valueRange.values;
  if (values.length > 201) throw Error("Bảng tính vượt 200 dòng. Chia hồ sơ trước khi gửi duyệt.");
  return { sheets: meta.sheets.map(s => ({ id: s.sheet_id, title: s.title })), values };
}
export async function importLines(session: BudgetSession, brand: string, values: unknown[][]) {
  const headers = values[0]?.map(v => displayText(v).trim().toLowerCase()) || [], index = headers.indexOf("record_id");
  if (index < 0 || values.length > 201) throw Error("Bảng tính cần cột record_id và tối đa 200 dòng tiền.");
  const ids = [...new Set(values.slice(1).filter(row => row.some(cell => cell != null && cell !== "")).map(row => displayText(row[index]).trim()))];
  const rows: BaseRecord[] = [];
  for (let start = 0; start < ids.length; start += 8) {
    const result = await Promise.allSettled(ids.slice(start, start + 8).map(id => a03Record(session, id)));
    for (const item of result) { if (item.status === "rejected") throw item.reason; rows.push(item.value); }
  }
  return sheetLines(values, rows, brand);
}
export async function patchApprovedAmount(session: BudgetSession, id: string, amount: number, instanceCode: string) {
  const schema = await fields(session, MODULES[0].tableId);
  if (!schema.some(field => field.field_name === "Số tiền TGĐ duyệt" && field.type === 2)) throw Error("Trường Số tiền TGĐ duyệt không còn là trường số cho phép ghi.");
  const data = await lark<{ record: BaseRecord }>(session.token, tablePath(MODULES[0].tableId) + "/records/" + id, { method: "PUT", body: { fields: { "Số tiền TGĐ duyệt": amount, ...(schema.some(f => f.field_name === "Mã phiếu đề xuất" && f.type === 1) ? { "Mã phiếu đề xuất": instanceCode } : {}) } } });
  if (data.record?.record_id !== id) throw Error("Chưa xác định kết quả ghi A03. Cần đối soát trước khi thử lại.");
}
