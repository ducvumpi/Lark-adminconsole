import { createHash } from "node:crypto";

export const BUDGET_BASE = "ZszDbVpEEafitKsAWfRlTnRggpd";
export const BUDGET_APP_ID = "cli_aa881b5fa0781eea";
export const MODULES = [
  { key: "A03", title: "Ngân sách được duyệt", tableId: "tblFjyYCeYgHjs51" },
] as const;
export const DEFAULT_BUDGET_SHEET_URL = "https://tsgsifizy3jj.sg.larksuite.com/sheets/Ln5ysWfrhhgxShtPJs6lXyxmguh";
export type ModuleKey = typeof MODULES[number]["key"];
export type BaseRecord = { record_id: string; fields: Record<string, unknown> };
export type BaseField = { field_id: string; field_name: string; type: number; is_primary?: boolean; property?: { options?: { name: string }[]; multiple?: boolean } | null };
export type BrandAccess = { brand: string; roles: string[]; stopped: boolean; canManage: boolean };
export type BudgetLine = { recordId: string; brand: string; code: string; year: string; quarter: string; month: string; before: number; amount: number };
export type Snapshot = { version: 1; title: string; brand: string; sheetUrl: string; lines: BudgetLine[] };

export function displayText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(displayText).filter(Boolean).join(", ");
  if (typeof value === "object") {
    const item = value as Record<string, unknown>;
    return displayText(item.text ?? item.name ?? item.value ?? "");
  }
  return "";
}

export function parseVnd(value: unknown): number {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 1e13) return value;
  if (typeof value !== "string") throw Error("Số tiền phải là số nguyên VND, không âm.");
  const raw = value.trim().replace(/\s*(?:VND|VNĐ|₫|đ)$/i, "").trim();
  if (!/^\d+$/.test(raw) && !/^\d{1,3}(?:\.\d{3})+$/.test(raw) && !/^\d{1,3}(?:,\d{3})+$/.test(raw) && !/^\d{1,3}(?: \d{3})+$/.test(raw)) {
    throw Error("Số tiền VND không hợp lệ. Ví dụ: 1000000 hoặc 1.000.000.");
  }
  const amount = Number(raw.replace(/[., ]/g, ""));
  if (!Number.isSafeInteger(amount) || amount > 1e13) throw Error("Số tiền vượt giới hạn cho phép.");
  return amount;
}

export function brandPermissions(records: BaseRecord[], fields: BaseField[], openId: string): BrandAccess[] {
  const peopleFields = fields.filter(field => field.type === 11);
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const row of records) {
    const key = displayText(row.fields["Mã nhãn hàng"]).trim();
    if (seen.has(key)) duplicates.add(key);
    seen.add(key);
  }
  return records.flatMap(row => {
    const brand = displayText(row.fields["Mã nhãn hàng"]).trim();
    if (!brand || duplicates.has(brand)) return [];
    const roles = peopleFields.filter(field => {
      const members = row.fields[field.field_name];
      return Array.isArray(members) && members.some(member => typeof member === "object" && member !== null && (member as { id?: unknown }).id === openId);
    }).map(field => field.field_name);
    if (!roles.length) return [];
    return [{ brand, roles, stopped: row.fields["Dừng ngân sách"] === true, canManage: roles.some(role => ["Admin Product MKT", "BM", "GBM"].includes(role)) }];
  });
}

export function requireBrand(access: BrandAccess[], brand: string, write = false) {
  const found = access.find(item => item.brand === brand);
  if (!found) throw Error("Brand này không có trong trường Brand của bảng A03.");
  if (write && found.stopped) throw Error("Brand đang bật Dừng ngân sách; chỉ được xem, không được ghi ngân sách mới.");
  return found;
}

export function parseSheetUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.port || !/(?:^|\.)(?:larksuite\.com|feishu\.cn|larkoffice\.com)$/.test(url.hostname)) throw Error("Chỉ chấp nhận liên kết bảng tính HTTPS chính thức của Lark/Feishu.");
  const match = /^\/sheets\/([A-Za-z0-9]+)\/?$/.exec(url.pathname);
  if (!match) throw Error("Cần liên kết /sheets/ trực tiếp. File Excel hãy mở bằng Lark Sheets rồi lấy liên kết.");
  return { url: url.toString(), token: match[1] };
}

export function snapshotText(snapshot: Snapshot): string { return JSON.stringify(snapshot); }
export function snapshotHash(snapshot: Snapshot): string { return createHash("sha256").update(snapshotText(snapshot)).digest("hex"); }
export function approvalBinding(id: string, snapshot: Snapshot): string {
  return JSON.stringify({ budgetRequestId: id, sha256: snapshotHash(snapshot), snapshot });
}

export function validateApprovedForm(form: string, fieldId: string, expected: string) {
  let controls: unknown;
  try { controls = JSON.parse(form); } catch { throw Error("Không đọc được bản tiền trong phiếu Approval."); }
  if (!Array.isArray(controls)) throw Error("Phiếu Approval không chứa biểu mẫu hợp lệ.");
  const matches = controls.filter(c => typeof c === "object" && c !== null && (c as { id?: unknown }).id === fieldId);
  if (matches.length !== 1 || matches[0].value !== expected) throw Error("Bản tiền trong Approval khác phiên bản hồ sơ; không được ghi A03.");
}

export function sheetLines(values: unknown[][], records: BaseRecord[], brand: string): BudgetLine[] {
  if (values.length < 2 || values.length > 201) throw Error("Bảng tính phải có hàng tiêu đề và từ 1 đến 200 dòng tiền.");
  const headers = values[0].map(value => displayText(value).trim().toLowerCase());
  const idColumn = headers.indexOf("record_id"), moneyColumn = headers.indexOf("so_tien_duyet");
  if (idColumn < 0 || moneyColumn < 0 || headers.filter(h => h === "record_id").length !== 1 || headers.filter(h => h === "so_tien_duyet").length !== 1) throw Error("Bảng cần đúng một cột record_id và một cột so_tien_duyet. Dùng mẫu xuất từ A03.");
  const used = new Set<string>();
  const lines: BudgetLine[] = [];
  for (const cells of values.slice(1)) {
    if (cells.every(cell => cell == null || cell === "")) continue;
    const recordId = displayText(cells[idColumn]).trim();
    if (!/^rec[A-Za-z0-9]{1,32}$/.test(recordId) || used.has(recordId)) throw Error("record_id không hợp lệ hoặc bị trùng trong bảng tính.");
    const row = records.find(record => record.record_id === recordId);
    if (!row || displayText(row.fields.Brand) !== brand) throw Error("Có dòng không thuộc Brand hoặc không còn tồn tại trong A03.");
    used.add(recordId);
    lines.push({ recordId, brand, code: displayText(row.fields["Mã ngân sách"]), year: displayText(row.fields["Năm"]), quarter: displayText(row.fields["Quý ngân sách"]), month: displayText(row.fields["Tháng ngân sách"]), before: parseVnd(row.fields["Số tiền TGĐ duyệt"] ?? 0), amount: parseVnd(cells[moneyColumn]) });
  }
  if (!lines.length) throw Error("Không có dòng số tiền hợp lệ.");
  return lines;
}
