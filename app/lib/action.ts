"use server";
import axios from "axios";
import { randomUUID } from "crypto";
import { cookies } from "next/headers";
import * as XLSX from "xlsx";
import fs from "fs/promises";
import path from "path";
import { SESSION_COOKIE, getExpectedSessionValue } from "./auth";
import { getLarkClient, LarkField, LarkRecord } from "./lark-client";
import {
  getConfig,
  isConfigComplete,
  LarkConfig,
  getAllBaseProfiles,
  setActiveBase,
  setActiveTable,
  getConfigStorage,
  LarkBaseProfile,
  deleteBaseProfile,
  saveBaseProfile,
  saveTableProfile,
  deleteTableProfile,
} from "./config";
export type ActionResult<T = undefined> = { success: true; data?: T } | { success: false; message: string };

/** Ép dữ liệu về plain object/array thuần túy (loại bỏ mọi class instance, method, prototype lạ)
 * trước khi trả về cho Client Component, tránh lỗi "Only plain objects can be passed...". */
function toPlain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

// ─── Auth ────────────────────────────────────────────────────────────────────

export async function loginAction(formData: FormData): Promise<ActionResult> {
  const password = String(formData.get("password") || "");
  const expectedPassword = process.env.SITE_PASSWORD || "";
  const sessionValue = getExpectedSessionValue();

  if (!expectedPassword || !sessionValue) {
    return { success: false, message: "Server chưa cấu hình SITE_PASSWORD / SESSION_SECRET trong .env" };
  }
  if (password !== expectedPassword) {
    return { success: false, message: "Sai mật khẩu." };
  }

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, sessionValue, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 7 ngày
  });

  return { success: true };
}

export async function logoutAction(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

// ─── Settings ────────────────────────────────────────────────────────────────




export async function getSettingsAction(): Promise<(LarkConfig & { complete: boolean }) & { profiles: LarkBaseProfile[]; activeBaseId?: string; activeTableId?: string; }> {
  const cfg = getConfig();
  const storage = getConfigStorage();
  return {
    ...cfg,
    complete: isConfigComplete(cfg),
    profiles: storage.bases,
    activeBaseId: storage.activeBaseId,
    activeTableId: storage.activeTableId,
  };
}

/** Lưu credentials cấp Base (không đụng danh sách Table). */
export async function saveBaseSettingsAction(formData: FormData): Promise<ActionResult> {
  const rawBaseId = String(formData.get("baseId") || "");
  const baseId = rawBaseId || `base-${Date.now()}`;
  saveBaseProfile({
    baseId,
    name: String(formData.get("name") || ""),
    appId: String(formData.get("appId") || ""),
    appSecret: String(formData.get("appSecret") || ""),
    baseAppToken: String(formData.get("baseAppToken") || ""),
    apiBaseUrl: String(formData.get("apiBaseUrl") || ""),
  });
  return { success: true };
}


export async function saveTableSettingsAction(formData: FormData): Promise<ActionResult> {
  const baseId = String(formData.get("baseId") || "");
  if (!baseId) return { success: false, message: "Chưa xác định Base để thêm bảng." };

  const tableProfileId = String(formData.get("tableProfileId") || "") || undefined;
  const name = String(formData.get("tableName") || "");
  const tableId = String(formData.get("tableId") || "");

  if (!tableId) return { success: false, message: "Table ID không được để trống." };

  saveTableProfile(baseId, { tableProfileId, name: name || "Bảng mới", tableId });
  return { success: true };
}

export async function switchBaseAction(baseId: string): Promise<ActionResult> {
  setActiveBase(baseId);
  return { success: true };
}

export async function switchTableAction(baseId: string, tableProfileId: string): Promise<ActionResult> {
  setActiveTable(baseId, tableProfileId);
  return { success: true };
}

export async function deleteBaseProfileAction(baseId: string): Promise<ActionResult> {
  deleteBaseProfile(baseId);
  return { success: true };
}

export async function deleteTableProfileAction(baseId: string, tableProfileId: string): Promise<ActionResult> {
  deleteTableProfile(baseId, tableProfileId);
  return { success: true };
}

export async function getAllProfilesAction(): Promise<ActionResult<LarkBaseProfile[]>> {
  return { success: true, data: getAllBaseProfiles() };
}


// ─── Fields ──────────────────────────────────────────────────────────────────

export async function listFieldsAction(): Promise<ActionResult<LarkField[]>> {
  try {
    const client = getLarkClient();
    const fields = await client.listFields();

    console.table(
      fields.map((f) => ({
        name: f.field_name,
        type: f.type,
      }))
    );
    return {
      success: true,
      data: JSON.parse(JSON.stringify(fields)),
    };
  } catch (err: any) {
    return { success: false, message: err.message || "Lỗi không xác định" };
  }
}

// ─── Records ─────────────────────────────────────────────────────────────────

export async function listRecordsAction(options: {
  filter?: string;
  pageSize?: number;
  pageToken?: string;
}) {
  try {
    const client = getLarkClient();

    const result = await client.listRecords({
      ...options,
      pageSize: options.pageSize ?? 100,
    });

    return {
      success: true as const,
      data: result,
    };
  } catch (err: any) {
    return {
      success: false as const,
      message: err.message || "Lỗi không xác định",
    };
  }
}

export async function findDuplicateBudgetRecordsAction(): Promise<ActionResult<{ budgetName: string; records: LarkRecord[] }[]>> {
  try {
    const client = getLarkClient();
    const allRecords: LarkRecord[] = [];
    let pageToken: string | undefined;
    do {
      const result = await client.listRecords({
        pageSize: 500,
        pageToken,
        fieldNames: ["Tên ngân sách"], // đúng field hàm này cần, không phải Link Air
      });
      allRecords.push(...result.items);
      pageToken = result.hasMore ? result.pageToken : undefined;
    } while (pageToken);

    const groups = new Map<string, LarkRecord[]>();
    for (const record of allRecords) {
      const rawValue = record.fields["Tên ngân sách"];
      if (rawValue === null || rawValue === undefined) continue;
      const value = String(rawValue).trim();
      if (!value) continue;
      const group = groups.get(value) ?? [];
      group.push(record);
      groups.set(value, group);
    }

    const duplicates = Array.from(groups.entries())
      .filter(([, items]) => items.length > 1)
      .map(([budgetName, records]) => ({ budgetName, records }));

    return { success: true, data: duplicates };
  } catch (err: any) {
    return { success: false, message: err.message || "Lỗi không xác định" };
  }
}

export async function createRecordAction(
  fields: Record<string, unknown>
): Promise<ActionResult<LarkRecord>> {
  try {
    const client = getLarkClient();
    const record = await client.createRecord(fields);
    return { success: true, data: record };
  } catch (err: any) {
    return { success: false, message: err.message || "Lỗi không xác định" };
  }
}

export async function updateRecordAction(
  recordId: string,
  fields: Record<string, unknown>
): Promise<ActionResult<LarkRecord>> {
  try {
    const client = getLarkClient();
    const record = await client.updateRecord(recordId, fields);
    return { success: true, data: record };
  } catch (err: any) {
    return { success: false, message: err.message || "Lỗi không xác định" };
  }
}

export async function deleteRecordAction(recordId: string): Promise<ActionResult> {
  try {
    const client = getLarkClient();
    await client.deleteRecord(recordId);
    return { success: true };
  } catch (err: any) {
    return { success: false, message: err.message || "Lỗi không xác định" };
  }
}

/** Debug: tra trực tiếp 1 record theo ID trong đúng Base/Table đang cấu hình.
 * Dùng để xác minh 1 recordId lấy từ audit log có thật sự tồn tại trong Base không. */
export async function getRecordByIdAction(recordId: string): Promise<ActionResult<LarkRecord | null>> {
  try {
    const client = getLarkClient();
    const record = await client.getRecord(recordId);
    return { success: true, data: record ? JSON.parse(JSON.stringify(record)) : null };
  } catch (err: any) {
    return { success: false, message: err.message || "Lỗi không xác định" };
  }
}
// ─── Quản lý record: Tìm / Thêm / Sửa / Xóa (dùng cho UI quản lý và Botpress) ──

export interface BudgetRecordView {
  recordId: string;
  brand: string;
  quy: string;
  nam: string;
  thang: string;
  maNganSach: string;
  hangMuc: string;
  soTien: number;
}

export interface BudgetRecordFilter {
  brand?: string;
  quy?: string;
  nam?: string;
  thang?: string;
  maNganSach?: string;
  soTien?: number;
}
function larkRecordToView(r: LarkRecord): BudgetRecordView {
  return {
    recordId: r.record_id,
    brand: String(r.fields["Brand"] ?? ""),
    quy: String(r.fields["Quý ngân sách"] ?? ""),
    nam: String(r.fields["Năm"] ?? ""),
    thang: String(r.fields["Tháng ngân sách"] ?? ""),
    maNganSach: String(r.fields["Mã ngân sách"] ?? ""),
    hangMuc: String(r.fields["Hạng mục"] ?? ""),
    soTien: Number(r.fields["Số tiền TGĐ duyệt"]) || 0,
  };
}

/** Lọc record trong memory (contains, không phân biệt hoa thường/dấu). */

export async function listBudgetRecordsAction(
  filter: BudgetRecordFilter
): Promise<ActionResult<BudgetRecordView[]>> {
  try {
    const client = getLarkClient();

    const allRecords: LarkRecord[] = [];
    let pageToken: string | undefined;
    do {
      const result = await client.listRecords({
        pageSize: 500,
        pageToken,
        fieldNames: ["Brand", "Quý ngân sách", "Năm", "Tháng ngân sách", "Mã ngân sách", "Số tiền TGĐ duyệt"],
      });
      allRecords.push(...result.items);
      pageToken = result.hasMore ? result.pageToken : undefined;
    } while (pageToken);

    const matchContains = (fieldValue: unknown, filterValue?: string) => {
      if (!filterValue) return true;
      return normalizeText(fieldValue).includes(normalizeText(filterValue));
    };

    const filtered = allRecords.filter((r) => {
      const soTien = Number(r.fields["Số tiền TGĐ duyệt"]) || 0;
      const filterSoTien = filter.soTien !== undefined ? Number(filter.soTien) : undefined;
      return (
        matchContains(r.fields["Brand"], filter.brand) &&
        matchContains(r.fields["Quý ngân sách"], filter.quy) &&
        matchContains(r.fields["Năm"], filter.nam) &&
        matchContains(r.fields["Tháng ngân sách"], filter.thang) &&
        matchContains(r.fields["Mã ngân sách"], filter.maNganSach) &&
        (filterSoTien === undefined || soTien === filterSoTien)
      );
    });

    return { success: true, data: filtered.map(larkRecordToView) };
  } catch (err: any) {
    return { success: false, message: err.message || "Lỗi không xác định" };
  }
}
// ─── Phát hiện & sửa vi phạm cấp ngân sách ───────────────────────────────────
/** Trích năm đi kèm ngay sau "Tháng X" trong tiêu đề khối, vd "THÁNG 8.2026" -> "2026".
 * Trả null nếu tiêu đề không có năm (khi đó vẫn fallback về namOverride/năm hệ thống). */
function extractYearFromMonthText(text: string): string | null {
  const match = text.match(/tháng\s*\d{1,2}\s*[.\/-]\s*(\d{4})/i);
  return match ? match[1] : null;
}
export type BudgetLevelViolationCandidate = {
  recordId: string;
  maNganSachHienTai: string;
  hangMucHienTai: string;
  soTien: number;
  loaiDeXuatNguon: string;
  createdTime: string;

  proposedFields: {
    maNganSach: string;
    hangMuc: string;
    maNganSachMe: string;
    maNganSachCon: string;
  };
};

export type BudgetLevelViolationGroup = {
  groupKey: string;

  loaiNganSach: string;
  brand: string;
  quy: string;
  nam: string;
  thang: string;

  anchorChildRecordId: string;
  anchorChildCode: string;
  anchorChildHangMuc: string;
  anchorChildCreatedTime: string;

  parentCode: string;

  candidates: BudgetLevelViolationCandidate[];
};
// export type BudgetLevelGroupDebug = {
//   key: string;
//   recordCount: number;
//   childCodesFound: string[];      // các mã đã nhận diện là mã con (chứa "-")
//   parentCodesInferred: string[];  // các mã cha suy ra từ mã con
//   exactParentCodeRecords: { recordId: string; maNganSach: string; coNsCapCon: boolean }[];
//   // ^ những record có mã trùng CHÍNH XÁC với 1 mã cha suy ra được — đây là ứng viên vi phạm tiềm năng
// };
export async function findBudgetLevelViolationsAction(): Promise<
  ActionResult<BudgetLevelViolationGroup[]>
> {
  try {
    const client = getLarkClient();
    const F = await buildFieldNameResolver(client);
    const allFields = await client.listFields(); // cần để lấy option map

    // Field D06 là Lựa chọn đơn/formula tham chiếu lựa chọn -> Lark trả về option_id,
    // không phải text. Build map id -> tên hiển thị thật để dịch ngược.
    const d06FieldName = F("D06 Hạng mục đề xuất");
    const d06Field = allFields.find((f) => f.field_name === d06FieldName);
    const optionIdToName = new Map<string, string>();
    for (const opt of d06Field?.property?.options ?? []) {
      if (opt.id && opt.name) optionIdToName.set(opt.id, opt.name);
    }

    const allRecords: LarkRecord[] = [];
    let pageToken: string | undefined;
    do {
      const result = await client.listRecords({
        pageSize: 500,
        pageToken,
        fieldNames: [
          F("Loại ngân sách"),
          F("Brand"),
          F("Quý ngân sách"),
          F("Năm"),
          F("Tháng ngân sách"),
          F("Mã ngân sách"),
          F("Hạng mục"),
          F("Mã ngân sách mẹ"),
          F("Mã ngân sách con"),
          F("Có NS cấp con"),
          F("Số tiền TGĐ duyệt"),
          d06FieldName,
        ],
      });
      allRecords.push(...result.items);
      pageToken = result.hasMore ? result.pageToken : undefined;
    } while (pageToken);

    const getGroupKey = (r: LarkRecord) =>
      [
        normalizeText(r.fields[F("Loại ngân sách")]),
        normalizeText(r.fields[F("Brand")]),
        normalizeText(r.fields[F("Quý ngân sách")]),
        normalizeText(r.fields[F("Năm")]),
        normalizeText(r.fields[F("Tháng ngân sách")]),
      ].join("|");

    // Chuẩn hoá mã: gộp mọi kiểu phân cách (- _ . khoảng trắng) về "-", viết hoa toàn bộ
    const getCode = (r: LarkRecord) =>
      normalizeText(r.fields[F("Mã ngân sách")]).replace(/[_.\s]+/g, "-").toUpperCase();

    const isUmbrella = (r: LarkRecord) => {
      const raw = r.fields[F("Có NS cấp con")];
      if (raw === true || raw === 1) return true;
      return extractGopThangValues(raw).some(
        (v) => normalizeText(v).toLowerCase() === "true"
      );
    };
    // Chỉ coi là vi phạm khi nguồn tạo KHÔNG phải "Import từ BOT" / "Điều chuyển từ Admin".
    // Đổi "Loại đề xuất" thành đúng tên cột thật trong Base nếu khác (vd "Hạng mục đề xuất").
    const trustedSet = new Set(TRUSTED_SOURCE_VALUES.map((v) => normalizeText(v)));

    // Dịch option_id -> tên hiển thị, rồi so khớp
    const isFromTrustedSource = (r: LarkRecord) => {
      const rawValues = extractGopThangValues(r.fields[d06FieldName]);
      if (rawValues.length === 0) return false;
      const displayNames = rawValues.map((id) => optionIdToName.get(id) ?? id);
      return displayNames.some((v) => trustedSet.has(normalizeText(v)));
    };
    const groupMap = new Map<string, LarkRecord[]>();
    for (const r of allRecords) {
      const key = getGroupKey(r);
      const arr = groupMap.get(key) ?? [];
      arr.push(r);
      groupMap.set(key, arr);
    }

    const violationGroups: BudgetLevelViolationGroup[] = [];

    for (const [key, records] of groupMap.entries()) {
      // Bước 1: gom mọi mã CON (chứa "-") theo mã cha (phần trước dấu "-" đầu tiên)
      const childrenByParent = new Map<string, LarkRecord[]>();
      for (const r of records) {
        const code = getCode(r);
        if (!code.includes("-")) continue;
        const parent = code.split("-")[0];
        if (!parent) continue;
        const arr = childrenByParent.get(parent) ?? [];
        arr.push(r);
        childrenByParent.set(parent, arr);
      }
      if (childrenByParent.size === 0) continue;

      // Bước 2: với mỗi mã cha có con thật, tìm record nào đang mang ĐÚNG mã cha đó
      // mà KHÔNG được đánh dấu "Có NS cấp con" = true -> vi phạm
      for (const [parentCode, children] of childrenByParent.entries()) {
        const violating = records.filter((r) => {
          if (getCode(r) !== parentCode) return false;
          if (isUmbrella(r)) return false;

          const trusted = isFromTrustedSource(r);
          if (!trusted) {
            // TẠM: log để soi giá trị D06 thật — xoá sau khi xác nhận đúng
            console.log("D06 RAW:", r.record_id, JSON.stringify(r.fields[F("D06 Hạng mục đề xuất")]));
          }
          return !trusted;
        });
        if (violating.length === 0) continue;

        const anchor = children[0];
        const anchorCode = getCode(anchor);
        const anchorHangMuc = String(anchor.fields[F("Hạng mục")] ?? "");

        const candidates: BudgetLevelViolationCandidate[] = violating.map((r) => ({
          recordId: r.record_id,
          maNganSachHienTai: String(r.fields[F("Mã ngân sách")] ?? ""),
          hangMucHienTai: String(r.fields[F("Hạng mục")] ?? ""),
          soTien: Number(r.fields[F("Số tiền TGĐ duyệt")]) || 0,
          loaiDeXuatNguon: extractGopThangValues(r.fields[d06FieldName])
            .map((id) => optionIdToName.get(id) ?? id)
            .join(", "),
          createdTime: "",
          proposedFields: {
            maNganSach: anchorCode,
            hangMuc: anchorHangMuc,
            maNganSachMe: parentCode,
            maNganSachCon: extractGopThangValues(r.fields[F("Mã ngân sách con")]).join(","),
          },
        }));
        const first = violating[0];
        violationGroups.push({
          groupKey: key,
          loaiNganSach: String(first.fields[F("Loại ngân sách")] ?? ""),
          brand: String(first.fields[F("Brand")] ?? ""),
          quy: String(first.fields[F("Quý ngân sách")] ?? ""),
          nam: String(first.fields[F("Năm")] ?? ""),
          thang: String(first.fields[F("Tháng ngân sách")] ?? ""),
          anchorChildRecordId: anchor.record_id,
          anchorChildCode: anchorCode,
          anchorChildHangMuc: anchorHangMuc,
          anchorChildCreatedTime: "",
          parentCode,
          candidates,
        });
      }
    }

    return { success: true, data: violationGroups };
  } catch (err: any) {
    return {
      success: false,
      message: err?.message || "Không thể kiểm tra vi phạm cấp ngân sách.",
    };
  }
}

export interface BudgetLevelViolationFixInput {
  recordId: string;
  maNganSach: string;
  hangMuc: string;
  maNganSachMe: string;
  maNganSachCon: string;
}

export async function applyBudgetLevelViolationFixesAction(
  fixes: BudgetLevelViolationFixInput[]
): Promise<ActionResult<{ updated: number; failed: { recordId: string; reason: string }[] }>> {
  try {
    if (!fixes || fixes.length === 0) {
      return { success: false, message: "Danh sách cần sửa đang trống." };
    }

    const client = getLarkClient();
    const F = await buildFieldNameResolver(client);

    let updated = 0;
    const failed: { recordId: string; reason: string }[] = [];

    for (const fix of fixes) {
      try {
        const before = await client.getRecord(fix.recordId);
        const soTien = before ? Number(before.fields[F("Số tiền TGĐ duyệt")]) || 0 : 0;

        await client.updateRecord(fix.recordId, {
          [F("Mã ngân sách")]: fix.maNganSach,
          [F("Hạng mục")]: fix.hangMuc,
          [F("Mã ngân sách mẹ")]: fix.maNganSachMe,
          [F("Mã ngân sách con")]: fix.maNganSachCon,
        });

        await appendAuditLog({
          timestamp: new Date().toISOString(),
          wasCreated: false,
          action: "edit",
          recordId: fix.recordId,
          brand: before ? String(before.fields[F("Brand")] ?? "") : "",
          quy: before ? String(before.fields[F("Quý ngân sách")] ?? "") : "",
          nam: before ? String(before.fields[F("Năm")] ?? "") : "",
          thang: before ? String(before.fields[F("Tháng ngân sách")] ?? "") : "",
          maNganSach: fix.maNganSach,
          hangMuc: fix.hangMuc,
          soTienLanNay: 0,
          giaTriTruoc: soTien,
          giaTriSau: soTien,
          ghiChu: `Sửa vi phạm cấp ngân sách: mã cha đúng="${fix.maNganSach}"`,
        });

        updated++;
      } catch (err: any) {
        failed.push({ recordId: fix.recordId, reason: err.message || "Lỗi không xác định" });
      }
    }

    return { success: true, data: { updated, failed } };
  } catch (err: any) {
    return { success: false, message: err.message || "Sửa vi phạm thất bại." };
  }
}
export interface CreateBudgetRecordInput {
  brand: string;
  quarterRaw: string; // "Q3/2026"
  thang: string; // "Tháng 7"
  maNganSach: string;
  soTien: number;
}
export async function deleteBudgetRecordAction(recordId: string): Promise<ActionResult> {
  try {
    const client = getLarkClient();

    const before = await client.getRecord(recordId);
    if (before) {
      await appendAuditLog({
        timestamp: new Date().toISOString(),
        wasCreated: false,
        action: "delete",
        recordId,
        brand: String(before.fields["Brand"] ?? ""),
        quy: String(before.fields["Quý ngân sách"] ?? ""),
        nam: String(before.fields["Năm"] ?? ""),
        thang: String(before.fields["Tháng ngân sách"] ?? ""),
        maNganSach: String(before.fields["Mã ngân sách"] ?? ""),
        soTienLanNay: 0,
        giaTriTruoc: Number(before.fields["Số tiền TGĐ duyệt"]) || 0,
        giaTriSau: 0,
      });
    }

    await client.deleteRecord(recordId);
    return { success: true };
  } catch (err: any) {
    return { success: false, message: err.message || "Xóa record thất bại." };
  }
}
export async function createBudgetRecordAction(
  input: CreateBudgetRecordInput
): Promise<ActionResult<BudgetRecordView>> {
  try {
    const client = getLarkClient();
    const F = await buildFieldNameResolver(client);
    const { nam } = parseQuarterYear(input.quarterRaw);

    const newRecord = await client.createRecord({
      [F("Brand")]: input.brand,
      [F("Quý ngân sách")]: input.quarterRaw,
      [F("Năm")]: nam,
      [F("Tháng ngân sách")]: input.thang,
      [F("Mã ngân sách")]: input.maNganSach,
      [F("Số tiền TGĐ duyệt")]: input.soTien,
    });

    await appendAuditLog({
      timestamp: new Date().toISOString(),
      wasCreated: true,
      action: "edit",
      recordId: newRecord.record_id,
      brand: input.brand,
      quy: input.quarterRaw,
      nam,
      thang: input.thang,
      maNganSach: input.maNganSach,
      soTienLanNay: input.soTien,
      giaTriTruoc: 0,
      giaTriSau: input.soTien,
    });

    return { success: true, data: larkRecordToView(newRecord) };
  } catch (err: any) {
    return { success: false, message: err.message || "Tạo record thất bại." };
  }
}

export async function updateBudgetRecordAmountAction(
  recordId: string,
  soTienMoi: number
): Promise<ActionResult<BudgetRecordView>> {
  try {
    const client = getLarkClient();
    const F = await buildFieldNameResolver(client);

    const before = await client.getRecord(recordId);
    if (!before) {
      return { success: false, message: `Không tìm thấy record '${recordId}'.` };
    }
    const giaTriTruoc = Number(before.fields["Số tiền TGĐ duyệt"]) || 0;

    const updated = await client.updateRecord(recordId, {
      [F("Số tiền TGĐ duyệt")]: soTienMoi,
    });

    await appendAuditLog({
      timestamp: new Date().toISOString(),
      wasCreated: false,
      action: "edit",
      recordId,
      brand: String(before.fields["Brand"] ?? ""),
      quy: String(before.fields["Quý ngân sách"] ?? ""),
      nam: String(before.fields["Năm"] ?? ""),
      thang: String(before.fields["Tháng ngân sách"] ?? ""),
      maNganSach: String(before.fields["Mã ngân sách"] ?? ""),
      soTienLanNay: soTienMoi,
      giaTriTruoc,
      giaTriSau: soTienMoi,
    });

    return { success: true, data: larkRecordToView(updated) };
  } catch (err: any) {
    return { success: false, message: err.message || "Sửa record thất bại." };
  }
}

export async function deleteBudgetRecordsByFilterAction(
  filter: BudgetRecordFilter
): Promise<ActionResult<{ deletedCount: number; deleted: BudgetRecordView[] }>> {
  try {
    const hasFilter =
      filter.brand || filter.quy || filter.nam || filter.thang || filter.maNganSach || filter.soTien !== undefined;

    if (!hasFilter) {
      return { success: false, message: "Cần ít nhất 1 điều kiện lọc để tránh xóa toàn bộ dữ liệu." };
    }

    const searchRes = await listBudgetRecordsAction(filter);
    if (!searchRes.success) {
      return { success: false, message: searchRes.message };
    }

    const toDelete = searchRes.data ?? [];
    const client = getLarkClient();
    const deleted: BudgetRecordView[] = [];

    for (const record of toDelete) {
      try {
        await appendAuditLog({
          timestamp: new Date().toISOString(),
          wasCreated: false,
          action: "delete",
          recordId: record.recordId,
          brand: record.brand,
          quy: record.quy,
          nam: record.nam,
          thang: record.thang,
          maNganSach: record.maNganSach,
          soTienLanNay: 0,
          giaTriTruoc: record.soTien,
          giaTriSau: 0,
        });
        await client.deleteRecord(record.recordId);
        deleted.push(record);
      } catch {
        // Ghi nhận record nào xóa thất bại nhưng vẫn tiếp tục các record khác
      }
    }

    return { success: true, data: { deletedCount: deleted.length, deleted } };
  } catch (err: any) {
    return { success: false, message: err.message || "Xóa theo điều kiện thất bại." };
  }
}
export interface TiktokProfileStats {
  username: string;
  nickname: string;
  followerCount: number;
  followingCount: number;
  heartCount: number;
  videoCount: number;
  profileUrl: string;
}

export interface TiktokVideoMetrics {
  title: string;
  uploader: string;
  viewCount: number;
  commentCount: number;
  collectionCount: number;
  likeCount: number;
  totalInteractionCount: number;
  releaseTime: string;
  shareCount: number;
  dataRetrievalTime: string;
  errorMessage: string;
}

function normalizeTiktokProfileInput(input: string): { handle: string; profileUrl: string } {
  const value = input.trim();
  if (!value) {
    throw new Error("Vui lòng nhập TikTok profile hoặc URL TikTok.");
  }

  const urlMatch = value.match(/tiktok\.com\/(?:@)?([^/?#]+)/i);
  if (urlMatch?.[1]) {
    const handle = urlMatch[1].replace(/^@/, "").trim();
    return {
      handle,
      profileUrl: `https://www.tiktok.com/@${handle}`,
    };
  }

  const plainHandle = value.replace(/^@/, "").trim();
  if (!plainHandle) {
    throw new Error("Định dạng TikTok không hợp lệ. Ví dụ: @tiktok hoặc https://www.tiktok.com/@tiktok.");
  }

  return {
    handle: plainHandle,
    profileUrl: `https://www.tiktok.com/@${plainHandle}`,
  };
}

function getNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const cleaned = value.replace(/[^0-9.-]/g, "");
    if (cleaned) {
      const asNumber = Number(cleaned);
      if (Number.isFinite(asNumber)) return asNumber;
    }
  }
  return 0;
}

function lookupNestedScriptObject(pageText: string): Record<string, any> | null {
  const scriptMatch = pageText.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application\/json">([\s\S]*?)<\/script>/i);
  if (!scriptMatch?.[1]) return null;

  try {
    return JSON.parse(scriptMatch[1]);
  } catch {
    return null;
  }
}

function deepFindValue(value: unknown, key: string): unknown {
  if (!value || typeof value !== "object") return undefined;

  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = deepFindValue(entry, key);
      if (found !== undefined) return found;
    }
    return undefined;
  }

  const record = value as Record<string, unknown>;
  if (key in record) return record[key];

  for (const entry of Object.values(record)) {
    const found = deepFindValue(entry, key);
    if (found !== undefined) return found;
  }

  return undefined;
}



function extractTiktokStatsFromPage(pageText: string, fallbackHandle: string): TiktokProfileStats {
  const hydration = lookupNestedScriptObject(pageText);
  const scope = hydration?.["__DEFAULT_SCOPE__"] ?? hydration ?? {};
  const userDetail = scope["webapp.user-detail"] as Record<string, any> | undefined;
  const user = userDetail?.userInfo?.user as Record<string, any> | undefined;
  const stats = (userDetail?.statsV2 ?? userDetail?.stats ?? {}) as Record<string, unknown>;

  if (!user || !stats) {
    throw new Error("Không tìm thấy dữ liệu stats trong HTML public của TikTok.");
  }

  const username = String(user.uniqueId || fallbackHandle || "").trim();
  const nickname = String(user.nickname || username || "").trim();

  return {
    username,
    nickname,
    followerCount: getNumber(stats.followerCount),
    followingCount: getNumber(stats.followingCount),
    heartCount: getNumber(stats.heartCount ?? stats.heart),
    videoCount: getNumber(stats.videoCount),
    profileUrl: `https://www.tiktok.com/@${username}`,
  };
}

function normalizeFieldLabel(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function buildFieldAliasMap(fields: LarkField[]): Map<string, string> {
  const fieldMap = new Map<string, string>();
  for (const field of fields) {
    const key = normalizeFieldLabel(field.field_name);
    if (!fieldMap.has(key)) {
      fieldMap.set(key, field.field_name);
    }
  }
  return fieldMap;
}

function pickRealFieldName(fieldMap: Map<string, string>, aliases: string[]): string | null {
  for (const alias of aliases) {
    const resolved = fieldMap.get(normalizeFieldLabel(alias));
    if (resolved) return resolved;
  }
  return null;
}

interface UaProfile {
  userAgent: string;
  secChUa: string;
  secChUaPlatform: string;
  isMobile: boolean;
}

const TIKTOK_UA_PROFILES: UaProfile[] = [
  {
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    secChUa: '"Chromium";v="126", "Google Chrome";v="126", "Not.A/Brand";v="24"',
    secChUaPlatform: '"Windows"',
    isMobile: false,
  },
  {
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
    secChUa: '',
    secChUaPlatform: '"macOS"',
    isMobile: false,
  },
  {
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0",
    secChUa: '"Microsoft Edge";v="124", "Chromium";v="124", "Not.A/Brand";v="24"',
    secChUaPlatform: '"Windows"',
    isMobile: false,
  },
  {
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
    secChUa: '',
    secChUaPlatform: '"iOS"',
    isMobile: true,
  },
];

function pickUaProfile(attempt: number): UaProfile {
  return TIKTOK_UA_PROFILES[attempt % TIKTOK_UA_PROFILES.length];
}

function buildTiktokHeaders(profile: UaProfile, extra?: Record<string, string>): Record<string, string> {
  return {
    "User-Agent": profile.userAgent,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Upgrade-Insecure-Requests": "1",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    ...(profile.secChUa ? { "sec-ch-ua": profile.secChUa } : {}),
    "sec-ch-ua-mobile": profile.isMobile ? "?1" : "?0",
    "sec-ch-ua-platform": profile.secChUaPlatform,
    Referer: "https://www.tiktok.com/",
    ...extra,
  };
}

/** Gọi trang chủ TikTok trước để lấy cookie (tt_chain_token, msToken...), rồi gắn cookie đó
 * vào request video thật — thiếu cookie warm-up là dấu hiệu bot rõ ràng với TikTok. */
async function fetchTiktokPageWithWarmup(
  url: string,
  profile: UaProfile
): Promise<{ html: string; finalUrl: string; status: number }> {
  let cookieHeader = "";
  try {
    const warmup = await fetch("https://www.tiktok.com/", {
      headers: buildTiktokHeaders(profile),
      redirect: "follow",
    });
    cookieHeader = warmup.headers.get("set-cookie") ?? "";
  } catch {
    // Warm-up thất bại không nên chặn luồng chính — tiếp tục không kèm cookie
  }

  const response = await fetch(url, {
    headers: buildTiktokHeaders(profile, cookieHeader ? { Cookie: cookieHeader } : {}),
    redirect: "follow",
  });

  return { html: await response.text(), finalUrl: response.url, status: response.status };
}
export async function fetchTiktokVideoMetricsAction(
  input: string,
  attempt: number = 0
): Promise<ActionResult<TiktokVideoMetrics>> {
  const profile = pickUaProfile(attempt);
  try {
    let videoUrl = normalizeTikTokInput(input);

    if (!videoUrl) {
      throw new Error("Link TikTok đang trống.");
    }

    if (!/^https?:\/\//i.test(videoUrl)) {
      videoUrl = `https://${videoUrl}`;
    }

    console.log(
      "TikTok URL ban đầu:",
      videoUrl
    );

    // ============================================================
    // Resolve TikTok short URL
    // ============================================================

    const isShortTikTokUrl =
      /^(https?:\/\/)?(vt|vm)\.tiktok\.com\//i.test(
        videoUrl
      );

    if (isShortTikTokUrl) {
      const redirectResponse = await fetch(videoUrl, {
        method: "GET",
        headers: buildTiktokHeaders(profile),
        redirect: "follow",
      });

      console.log("Short URL response:", redirectResponse.status);
      console.log("Resolved URL:", redirectResponse.url);

      if (redirectResponse.url) {
        videoUrl = redirectResponse.url;
      }
    }

    console.log(
      "TikTok URL sau resolve:",
      videoUrl
    );

    // ============================================================
    // Lấy Video ID
    // ============================================================

    const videoIdMatch =
      videoUrl.match(
        /tiktok\.com\/@[^/]*\/video\/(\d+)/i
      ) ||
      videoUrl.match(
        /tiktok\.com\/video\/(\d+)/i
      ) ||
      videoUrl.match(
        /[?&](?:share_item_id|item_id)=(\d+)/i
      );

    if (!videoIdMatch) {
      throw new Error(
        `Không lấy được video ID từ URL TikTok: ${videoUrl}`
      );
    }

    const videoId =
      videoIdMatch[1];

    console.log(
      "TikTok video ID:",
      videoId
    );

    // ============================================================
    // 4. Đọc trang TikTok
    // ============================================================

    const retrievalTime = new Date().toISOString();

    const { html, status } = await fetchTiktokPageWithWarmup(videoUrl, profile);

    if (status < 200 || status >= 400) {
      throw new Error(
        `TikTok trả về trạng thái ${status} khi đọc video ${videoId}.`
      );
    }

    // ============================================================
    // 5. Parse HTML
    // ============================================================

    const hydration = lookupNestedScriptObject(html);

    // Phát hiện trang chặn bot / captcha / trang rút gọn không có dữ liệu SSR
    if (!hydration) {
      const looksLikeChallenge =
        html.includes("captcha") ||
        html.includes("verify") ||
        html.length < 5000; // trang thật luôn rất nặng, trang chặn thường rất nhẹ
      throw new Error(
        looksLikeChallenge
          ? "TikTok trả về trang xác minh/chặn bot (không có dữ liệu SSR). Thử lại sau hoặc đổi User-Agent."
          : "Không tìm thấy script __UNIVERSAL_DATA_FOR_REHYDRATION__ trong HTML."
      );
    }

    const scope = hydration["__DEFAULT_SCOPE__"] ?? hydration ?? {};

    // CHỈ lấy đúng key video-detail, KHÔNG fallback về `scope` (rỗng vẫn truthy → dữ liệu giả)
    const candidateVideo =
      (scope["webapp.video-detail"] as Record<string, unknown> | undefined) ??
      (deepFindValue(scope, "itemInfo") as Record<string, unknown> | undefined);

    if (!candidateVideo) {
      throw new Error(
        "TikTok không trả về dữ liệu video-detail (có thể do rate-limit/bot detection). Thử lại sau vài giây."
      );
    }

    // ============================================================
    // 6. Đọc chỉ số
    // ============================================================
    console.log("===== TIKTOK DEBUG =====");

    console.log(
      "Video URL:",
      videoUrl
    );

    console.log(
      "Video ID:",
      videoId
    );

    console.log(
      "Candidate video:"
    );

    console.dir(
      candidateVideo,
      { depth: 8 }
    );

    console.log(
      "playCount:",
      deepFindValue(
        candidateVideo,
        "playCount"
      )
    );

    console.log(
      "viewCount:",
      deepFindValue(
        candidateVideo,
        "viewCount"
      )
    );

    console.log(
      "diggCount:",
      deepFindValue(
        candidateVideo,
        "diggCount"
      )
    );

    console.log(
      "commentCount:",
      deepFindValue(
        candidateVideo,
        "commentCount"
      )
    );

    console.log(
      "shareCount:",
      deepFindValue(
        candidateVideo,
        "shareCount"
      )
    );

    console.log(
      "collectCount:",
      deepFindValue(
        candidateVideo,
        "collectCount"
      )
    );

    console.log(
      "========================"
    );
    const title =
      String(
        deepFindValue(
          candidateVideo,
          "title"
        ) ??
        deepFindValue(
          candidateVideo,
          "desc"
        ) ??
        ""
      ) || "—";

    const uploader =
      String(
        deepFindValue(
          candidateVideo,
          "authorName"
        ) ??
        deepFindValue(
          candidateVideo,
          "uniqueId"
        ) ??
        deepFindValue(
          candidateVideo,
          "nickname"
        ) ??
        ""
      ) || "—";

    const viewCount =
      getNumber(
        deepFindValue(
          candidateVideo,
          "playCount"
        ) ??
        deepFindValue(
          candidateVideo,
          "viewCount"
        )
      );

    const commentCount =
      getNumber(
        deepFindValue(
          candidateVideo,
          "commentCount"
        )
      );

    const collectionCount =
      getNumber(
        deepFindValue(
          candidateVideo,
          "collectCount"
        ) ??
        deepFindValue(
          candidateVideo,
          "favoriteCount"
        )
      );

    const likeCount =
      getNumber(
        deepFindValue(
          candidateVideo,
          "diggCount"
        ) ??
        deepFindValue(
          candidateVideo,
          "likeCount"
        )
      );

    const shareCount =
      getNumber(
        deepFindValue(
          candidateVideo,
          "shareCount"
        )
      );

    const releaseTime =
      String(
        deepFindValue(
          candidateVideo,
          "createTime"
        ) ??
        deepFindValue(
          candidateVideo,
          "releaseTime"
        ) ??
        ""
      ) || "—";

    const totalInteractionCount =
      viewCount +
      commentCount +
      likeCount +
      shareCount +
      collectionCount;

    // ============================================================
    // 7. Tạo payload
    // ============================================================

    const payload: TiktokVideoMetrics = {
      title:
        String(title).trim() || "—",

      uploader:
        String(uploader).trim() || "—",

      viewCount,

      commentCount,

      collectionCount,

      likeCount,

      totalInteractionCount,

      releaseTime:
        String(releaseTime).trim() || "—",

      shareCount,

      dataRetrievalTime:
        retrievalTime,

      errorMessage: "",
    };

    console.log(
      "TikTok metrics:",
      payload
    );

    return {
      success: true,
      data: toPlain(payload),
    };

  } catch (err: any) {
    console.error(
      "TikTok metrics error:",
      err
    );

    return {
      success: false,
      message:
        err?.message ||
        "Lỗi không xác định khi đọc dữ liệu video TikTok.",
    };
  }
}

export interface SyncTiktokRecordResult {
  recordId: string;
  linkAir: string;
  success: boolean;

  title?: string;
  uploader?: string;

  viewCount?: number;
  commentCount?: number;
  collectionCount?: number;
  likeCount?: number;
  shareCount?: number;
  totalInteractionCount?: number;

  releaseTime?: string;
  dataRetrievalTime?: string;

  errorMessage?: string;
}
export interface GopThangOption {
  value: string;
  count: number; // số record có tháng này, để UI hiển thị "Tháng 7 (12 record)"
}

/** Quét toàn bộ record, trả về danh sách các giá trị "Gộp tháng" khác nhau đang tồn tại,
 * sắp xếp theo số tháng tăng dần, kèm số lượng record ứng với mỗi tháng. */
export async function getGopThangOptionsAction(): Promise<ActionResult<GopThangOption[]>> {
  try {
    const client = getLarkClient();
    const allRecords: LarkRecord[] = [];
    let pageToken: string | undefined;
    do {
      const result = await client.listRecords({
        pageSize: 500,
        pageToken,
        fieldNames: ["Gộp tháng"],
      });
      allRecords.push(...result.items);
      pageToken = result.hasMore ? result.pageToken : undefined;
    } while (pageToken);

    const counts = new Map<string, number>();
    for (const record of allRecords) {
      const values = extractGopThangValues(record.fields["Gộp tháng"]);
      for (const v of values) {
        counts.set(v, (counts.get(v) ?? 0) + 1);
      }
    }

    const options = Array.from(counts.entries())
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => {
        const na = parseInt(a.value.match(/\d+/)?.[0] ?? "0", 10);
        const nb = parseInt(b.value.match(/\d+/)?.[0] ?? "0", 10);
        return na - nb;
      });

    return { success: true, data: toPlain(options) };
  } catch (err: any) {
    return { success: false, message: err.message || "Không lấy được danh sách tháng." };
  }
}
/** Trích (tháng, năm) từ chuỗi bất kỳ — chấp nhận "Tháng 8", "Tháng 8/2026",
 * "T8/2026", "T8", "08/2026", "8-2026"... Trả null nếu không parse được. */
function parseMonthYear(text: string): { month: number; year: number | null } | null {
  const normalized = text.trim().toLowerCase();
  const match = normalized.match(/(?:tháng|t)?\s*(\d{1,2})\s*[\/\-.]?\s*(\d{4})?/);
  if (!match) return null;
  const month = parseInt(match[1], 10);
  if (!month || month < 1 || month > 12) return null;
  const year = match[2] ? parseInt(match[2], 10) : null;
  return { month, year };
}

/** So khớp 2 giá trị tháng, chấp nhận định dạng khác nhau. Nếu 1 trong 2 có năm
 * mà năm khác nhau -> không khớp. Nếu không parse được cả 2 -> fallback so chuỗi thường. */
function monthKeysMatch(recordValue: string, selectedValue: string): boolean {
  const a = parseMonthYear(recordValue);
  const b = parseMonthYear(selectedValue);
  if (!a || !b) return normalizeText(recordValue) === normalizeText(selectedValue);
  if (a.year !== null && b.year !== null && a.year !== b.year) return false;
  return a.month === b.month;
}
function extractGopThangValues(value: unknown): string[] {
  if (value === null || value === undefined) {
    return [];
  }

  // Array
  if (Array.isArray(value)) {
    return value.flatMap((item) =>
      extractGopThangValues(item)
    );
  }

  // Object
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;

    // Lark có thể trả:
    // { text: "OTH003" }
    if (typeof obj.text === "string") {
      return extractGopThangValues(obj.text);
    }

    // Một số field trả:
    // { name: "OTH003" }
    if (typeof obj.name === "string") {
      return extractGopThangValues(obj.name);
    }

    // Một số field trả:
    // { value: "OTH003" }
    // hoặc:
    // { value: [{ text: "OTH003" }] }
    if (obj.value !== undefined) {
      return extractGopThangValues(obj.value);
    }

    // Một số cấu trúc lookup có thể có values
    if (obj.values !== undefined) {
      return extractGopThangValues(obj.values);
    }

    return [];
  }

  // Text
  return String(value)
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean);
}
function extractLinkAir(value: unknown): string {
  if (!value) {
    return "";
  }

  // String
  if (typeof value === "string") {
    return value.trim();
  }

  // Array
  if (Array.isArray(value)) {
    for (const item of value) {
      const result = extractLinkAir(item);

      if (result) {
        return result;
      }
    }

    return "";
  }

  // Object
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;

    // URL trực tiếp
    const keys = [
      "link",
      "url",
      "href",
      "text",
      "value",
    ];

    for (const key of keys) {
      const child = obj[key];

      if (typeof child === "string") {
        if (
          child.includes("tiktok.com") ||
          child.includes("vm.tiktok.com")
        ) {
          return child.trim();
        }
      }
    }

    // Tìm đệ quy bên trong object
    for (const child of Object.values(obj)) {
      const result = extractLinkAir(child);

      if (result) {
        return result;
      }
    }
  }

  return "";
}
function isTikTokVideoUrl(url: string): boolean {
  if (!url) return false;
  const normalized = url.trim().toLowerCase();

  try {
    const parsed = new URL(normalized);
    const hostname = parsed.hostname;

    if (hostname === "www.tiktok.com" || hostname === "tiktok.com") {
      return (
        parsed.pathname.includes("/video/") ||
        parsed.pathname.startsWith("/@") ||
        parsed.pathname.startsWith("/t/")      // ✅ thêm dạng link rút gọn mới
      );
    }

    if (
      hostname === "vt.tiktok.com" ||
      hostname === "vm.tiktok.com" ||
      hostname.endsWith(".tiktok.com")          // ✅ phòng thêm subdomain khác
    ) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}
function normalizeTikTokInput(input: string): string {
  let value = input.trim();

  // Markdown link:
  // [https://example.com](https://example.com)
  const markdownMatch = value.match(
    /^\[([^\]]+)\]\((https?:\/\/[^)]+)\)$/
  );

  if (markdownMatch) {
    value = markdownMatch[2];
  }

  // Nếu có text thừa trước/sau URL
  const urlMatch = value.match(
    /https?:\/\/(?:www\.|vt\.|vm\.)?tiktok\.com\/[^\s)]+/i
  );

  if (urlMatch) {
    value = urlMatch[0];
  }

  return value.trim();
}
function toLarkDatetime(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  const raw = String(value).trim();

  if (!raw || raw === "—") {
    return null;
  }

  const numberValue = Number(raw);

  if (Number.isFinite(numberValue)) {
    // TikTok createTime thường là Unix timestamp giây
    if (numberValue < 10000000000) {
      return numberValue * 1000;
    }

    return numberValue;
  }

  const dateValue = Date.parse(raw);

  if (Number.isFinite(dateValue)) {
    return dateValue;
  }

  return null;
}
function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}


function randomJitter(baseMs: number, jitterMs: number): number {
  return baseMs + Math.floor(Math.random() * jitterMs);
}

/** Gọi fetchTiktokVideoMetricsAction với retry: backoff tăng dần + đổi User-Agent mỗi lần thử.
 * Chỉ retry khi lỗi là do bị chặn/rate-limit/xác minh — lỗi khác (URL sai, thiếu video ID...) dừng ngay. */
async function fetchTiktokVideoMetricsWithRetry(
  linkAir: string,
  maxAttempts = 5
): Promise<ActionResult<TiktokVideoMetrics>> {
  let lastResult: ActionResult<TiktokVideoMetrics> | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      const backoffMs = randomJitter(6000 * Math.pow(2, attempt - 1), 3000);
      console.log(`[TikTok retry] attempt ${attempt + 1}/${maxAttempts}, chờ ${backoffMs}ms...`);
      await sleep(backoffMs);
    }

    lastResult = await fetchTiktokVideoMetricsAction(linkAir, attempt);

    if (lastResult.success) return lastResult;

    const isBlockedError = /chặn|rate-limit|xác minh|verify|captcha/i.test(lastResult.message ?? "");
    if (!isBlockedError) return lastResult;
  }

  return lastResult!;
}
export async function syncAllTiktokRecordsAction(
  selectedMonths?: string[],
  selectedDepartments?: string[]
): Promise<ActionResult<SyncTiktokRecordResult[]>
> {
  try {
    console.log("========================================");
    console.log("START SYNC TIKTOK");
    console.log("========================================");

    const client = getLarkClient();

    // ============================================================
    // 1. LẤY DANH SÁCH FIELD
    // ============================================================

    const fields = await client.listFields();

    console.log("Lark fields:");

    console.table(
      fields.map((field) => ({
        field_name: field.field_name,
        field_id: field.field_id,
        type: field.type,
      }))
    );

    const linkAirField = fields.find(
      (field) => field.field_name.trim().toLowerCase() === "link air"
    );

    if (!linkAirField) {
      throw new Error(
        `Không tìm thấy cột "Link Air" trong Lark Base.

Các field hiện có:
${fields.map((f) => f.field_name).join(", ")}`
      );
    }

    const linkAirFieldName = linkAirField.field_name;

    console.log("Link Air field:", linkAirFieldName);

    // Tìm field "BP sử dụng NS" — không bắt buộc phải tồn tại, nếu không có thì bỏ qua lọc BP
    console.log("Tất cả field thật trong Base:");
    console.table(fields.map((f) => ({ name: f.field_name, length: f.field_name.length })));

    const departmentField = fields.find(
      (field) => normalizeText(field.field_name) === normalizeText("BP sử dụng NS")
    );
    const departmentFieldName = departmentField?.field_name ?? null;

    if (selectedDepartments && selectedDepartments.length > 0 && !departmentFieldName) {
      console.warn(`⚠️ Không tìm thấy field "BP sử dụng NS" trong Base. Các field hiện có: ${fields.map(f => f.field_name).join(", ")}`);
    }


    // ============================================================
    // 2. LẤY TOÀN BỘ RECORD (chỉ lấy field cần để lọc, tăng pageSize)
    // ============================================================

    const allRecords: LarkRecord[] = [];
    let pageToken: string | undefined;

    do {
      console.log("Đang lấy records, pageToken:", pageToken || "(first page)");

      const result = await client.listRecords({
        pageSize: 500,
        pageToken,
        fieldNames: departmentFieldName
          ? [linkAirFieldName, "Gộp tháng", departmentFieldName]
          : [linkAirFieldName, "Gộp tháng"],
      });

      console.log(`Nhận được ${result.items.length} records`);

      allRecords.push(...result.items);
      pageToken = result.hasMore ? result.pageToken : undefined;
    } while (pageToken);

    console.log(`TỔNG RECORD: ${allRecords.length}`);

    // TẠM: log 5 record đầu để soi field key + giá trị thô thật
    console.log(
      "MẪU FIELD KEYS của 3 record đầu:",
      allRecords.slice(0, 3).map((r) => Object.keys(r.fields))
    );
    console.log(
      "MẪU GIÁ TRỊ Gộp tháng của 5 record đầu:",
      allRecords.slice(0, 5).map((r) => ({
        id: r.record_id,
        rawValue: r.fields["Gộp tháng"],
        typeofValue: typeof r.fields["Gộp tháng"],
      }))
    );

    const monthFiltered =
      selectedMonths && selectedMonths.length > 0
        ? allRecords.filter((r) => {
          const monthsOfRecord = extractGopThangValues(r.fields["Gộp tháng"]);
          const matched = monthsOfRecord.some((m) =>
            selectedMonths.some((sel) => monthKeysMatch(m, sel))
          );
          if (!matched) {
            console.log(
              `[BỎ QUA - Tháng] id=${r.record_id}, raw="${r.fields["Gộp tháng"]}", extract=[${monthsOfRecord.join(", ")}]`
            );
          }
          return matched;
        })
        : allRecords;

    const testRecords =
      selectedDepartments && selectedDepartments.length > 0 && departmentFieldName
        ? monthFiltered.filter((r) => {
          const deptsOfRecord = extractGopThangValues(r.fields[departmentFieldName]);
          const matched = deptsOfRecord.some((d) =>
            selectedDepartments.some((sel) => normalizeText(d) === normalizeText(sel))
          );
          if (!matched) {
            console.log(
              `[BỎ QUA - BP] id=${r.record_id}, raw="${r.fields[departmentFieldName]}", extract=[${deptsOfRecord.join(", ")}]`
            );
          }
          return matched;
        })
        : monthFiltered;

    console.log(`Sẽ xử lý ${testRecords.length}/${allRecords.length} record`);

    const tiktokRecords: {
      record: LarkRecord;
      linkAir: string;
    }[] = [];

    for (const record of testRecords) {
      const rawValue = record.fields[linkAirFieldName];

      console.log("================================");
      console.log("RECORD ID:", record.record_id);

      console.log("FIELD NAME:", linkAirFieldName);

      console.log("RAW LINK AIR:");
      console.dir(rawValue, { depth: null });

      const linkAir = extractLinkAir(rawValue);

      console.log("EXTRACTED LINK:", linkAir);

      if (!linkAir) {
        console.log("❌ Không extract được URL");
        continue;
      }

      console.log("URL:", linkAir);

      const isTikTok = isTikTokVideoUrl(linkAir);

      console.log("IS TIKTOK:", isTikTok);

      if (!isTikTok) {
        console.log("⚠️ Có URL nhưng không phải TikTok");
        continue;
      }

      console.log("✅ TIKTOK RECORD");

      tiktokRecords.push({
        record,
        linkAir,
      });
    }

    console.log(
      `TỔNG LINK TIKTOK: ${tiktokRecords.length}`
    );

    // ============================================================
    // 4. ĐỌC TỪNG VIDEO
    // ============================================================

    const results: SyncTiktokRecordResult[] = [];

    for (const item of tiktokRecords) {
      const record = item.record;
      const linkAir = item.linkAir;

      console.log("----------------------------------------");
      console.log("Đang xử lý:", record.record_id);
      console.log("TikTok:", linkAir);

      try {
        // ========================================================
        // Gọi TikTok với retry (backoff tăng dần + đổi User-Agent)
        // ========================================================

        const metric = await fetchTiktokVideoMetricsWithRetry(linkAir, 4);

        if (!metric.success) {
          throw new Error(metric.message || "Không lấy được dữ liệu TikTok.");
        }

        if (!metric.data) {
          throw new Error("TikTok không trả về dữ liệu.");
        }

        const data = metric.data;

        console.log("TikTok data:", data);

        // ========================================================
        // 5. TÌM CÁC FIELD ĐÍCH TRONG LARK
        // ========================================================

        const fieldMap = buildFieldAliasMap(fields);

        const fieldName = {
          title: pickRealFieldName(fieldMap, ["Title", "Video Title"]),
          uploader: pickRealFieldName(fieldMap, ["Uploader", "Creator", "Author"]),
          viewCount: pickRealFieldName(fieldMap, ["View Count", "Views", "Play Count"]),
          commentCount: pickRealFieldName(fieldMap, ["Comment Count", "Comments"]),
          collectionCount: pickRealFieldName(fieldMap, ["Collection Count", "Collections", "Favorite Count"]),
          likeCount: pickRealFieldName(fieldMap, ["Like Count", "Likes", "Digg Count"]),
          totalInteractionCount: pickRealFieldName(fieldMap, ["Total Interaction Count", "Interaction Count"]),
          releaseTime: pickRealFieldName(fieldMap, ["Release Time", "Created Time"]),
          shareCount: pickRealFieldName(fieldMap, ["Share Count", "Shares"]),
          dataRetrievalTime: pickRealFieldName(fieldMap, ["Data Retrieval Time", "Retrieved At"]),
          errorMessage: pickRealFieldName(fieldMap, ["Error Message"]),
        };

        console.log("Resolved fields:", fieldName);

        // ========================================================
        // 6. TẠO DATA UPDATE
        // ========================================================

        const updateFields: Record<string, unknown> = {};

        if (fieldName.title) updateFields[fieldName.title] = data.title;
        if (fieldName.uploader) updateFields[fieldName.uploader] = data.uploader;
        if (fieldName.viewCount) updateFields[fieldName.viewCount] = data.viewCount;
        if (fieldName.commentCount) updateFields[fieldName.commentCount] = data.commentCount;
        if (fieldName.collectionCount) updateFields[fieldName.collectionCount] = data.collectionCount;
        if (fieldName.likeCount) updateFields[fieldName.likeCount] = data.likeCount;
        if (fieldName.totalInteractionCount) updateFields[fieldName.totalInteractionCount] = data.totalInteractionCount;

        if (fieldName.releaseTime) {
          const releaseTimestamp = toLarkDatetime(data.releaseTime);
          if (releaseTimestamp !== null) updateFields[fieldName.releaseTime] = releaseTimestamp;
        }

        if (fieldName.shareCount) updateFields[fieldName.shareCount] = data.shareCount;

        if (fieldName.errorMessage) updateFields[fieldName.errorMessage] = "";

        if (Object.keys(updateFields).length === 0) {
          throw new Error("Không tìm thấy field chỉ số TikTok để cập nhật trong Lark Base.");
        }

        // dataRetrievalTime = thời điểm update Lark Base THÀNH CÔNG, không phải thời điểm
        // bắt đầu gọi TikTok — set NGAY TRƯỚC lúc gọi updateRecord để sát nhất với "thành công".
        if (fieldName.dataRetrievalTime) {
          // Làm tròn xuống giây gần nhất (bội số của 1000ms) — field "Ngày giờ" của Lark
          // không chấp nhận timestamp có phần mili-giây lẻ, giống cách releaseTime đã làm qua toLarkDatetime.
          updateFields[fieldName.dataRetrievalTime] = Math.floor(Date.now() / 1000) * 1000;
        }

        const fieldTypeMap = new Map(fields.map((f) => [f.field_name, f.type]));
        console.log("UPDATE FIELDS:", updateFields);

        // ========================================================
        // 7. UPDATE CHÍNH RECORD
        // ========================================================

        const updated = await client.updateRecord(record.record_id, updateFields, fieldTypeMap);
        console.log("UPDATE SUCCESS:", updated.record_id);

        results.push({
          recordId: record.record_id,
          linkAir,
          success: true,
          title: data.title,
          uploader: data.uploader,
          viewCount: data.viewCount,
          commentCount: data.commentCount,
          collectionCount: data.collectionCount,
          likeCount: data.likeCount,
          shareCount: data.shareCount,
          totalInteractionCount: data.totalInteractionCount,
          releaseTime: data.releaseTime,
          dataRetrievalTime: new Date().toISOString(),
          errorMessage: "",
        });

        // Giãn cách ngẫu nhiên giữa các record (5s–9s) — quét chậm hơn nhưng giảm tỷ lệ bị chặn
        await sleep(randomJitter(5000, 4000));
      } catch (err: any) {
        const errorMessage = err?.message || String(err) || "Lỗi không xác định.";

        console.error(`TikTok ERROR ${record.record_id}:`, err);

        results.push({
          recordId: record.record_id,
          linkAir,
          success: false,
          errorMessage,
        });

        // Ghi lỗi vào Base nếu có field
        try {
          const fieldMap = buildFieldAliasMap(fields);
          const errorField = pickRealFieldName(fieldMap, ["Error Message"]);
          if (errorField) {
            await client.updateRecord(record.record_id, { [errorField]: errorMessage }, new Map(fields.map((f) => [f.field_name, f.type])));
          }
        } catch (updateError) {
          console.error("Không ghi được Error Message:", updateError);
        }

        // Không dừng toàn bộ
        continue;
      }
    }

    console.log(
      "========================================"
    );

    console.log(
      "SYNC FINISHED"
    );

    console.log(
      `TikTok records: ${tiktokRecords.length}`
    );

    console.log(
      `Success: ${results.filter(
        (r) => r.success
      ).length
      }`
    );

    console.log(
      `Error: ${results.filter(
        (r) => !r.success
      ).length
      }`
    );

    console.log(
      "========================================"
    );

    return {
      success: true,
      data: toPlain(results),
    };

  } catch (err: any) {

    console.error(
      "SYNC ALL TIKTOK ERROR:",
      err
    );

    return {
      success: false,

      message:
        err?.message ||
        String(err) ||
        "Lỗi khi quét toàn bộ record TikTok.",
    };
  }
}
// ─── Xóa record có Số tiền TGĐ duyệt âm ──────────────────────────────────────

/** Bước 1: chỉ TÌM, không xóa — trả về danh sách để UI hiển thị preview trước khi xác nhận. */
export async function previewNegativeApprovedAmountRecordsAction(): Promise<ActionResult<BudgetRecordView[]>> {
  try {
    const client = getLarkClient();
    const allRecords: LarkRecord[] = [];
    let pageToken: string | undefined;

    do {
      const result = await client.listRecords({
        pageSize: 500,
        pageToken,
        fieldNames: ["Brand", "Quý ngân sách", "Năm", "Tháng ngân sách", "Mã ngân sách", "Số tiền TGĐ duyệt"],
      });
      allRecords.push(...result.items);
      pageToken = result.hasMore ? result.pageToken : undefined;
    } while (pageToken);

    const negative = allRecords.filter((r) => (Number(r.fields["Số tiền TGĐ duyệt"]) || 0) < 0);

    return { success: true, data: negative.map(larkRecordToView) };
  } catch (err: any) {
    return { success: false, message: err.message || "Không tìm được record." };
  }
}

/** Bước 2: xóa THẬT các record theo danh sách recordId đã lấy từ bước preview.
 * Nhận thẳng recordId thay vì tự tìm lại — tránh lệch dữ liệu nếu Base thay đổi
 * giữa lúc preview và lúc người dùng bấm xác nhận. */
export async function deleteNegativeApprovedAmountRecordsAction(
  recordIds: string[]
): Promise<ActionResult<{ deletedCount: number; failed: { recordId: string; reason: string }[] }>> {
  try {
    if (!recordIds || recordIds.length === 0) {
      return { success: false, message: "Danh sách record cần xóa đang trống." };
    }

    const client = getLarkClient();
    let deletedCount = 0;
    const failed: { recordId: string; reason: string }[] = [];

    for (const recordId of recordIds) {
      try {
        const before = await client.getRecord(recordId);
        if (before) {
          await appendAuditLog({
            timestamp: new Date().toISOString(),
            wasCreated: false,
            action: "delete",
            recordId,
            brand: String(before.fields["Brand"] ?? ""),
            quy: String(before.fields["Quý ngân sách"] ?? ""),
            nam: String(before.fields["Năm"] ?? ""),
            thang: String(before.fields["Tháng ngân sách"] ?? ""),
            maNganSach: String(before.fields["Mã ngân sách"] ?? ""),
            soTienLanNay: 0,
            giaTriTruoc: Number(before.fields["Số tiền TGĐ duyệt"]) || 0,
            giaTriSau: 0,
          });
        }
        await client.deleteRecord(recordId);
        deletedCount++;
      } catch (err: any) {
        failed.push({ recordId, reason: err.message || "Lỗi không xác định" });
      }
    }

    return { success: true, data: { deletedCount, failed } };
  } catch (err: any) {
    return { success: false, message: err.message || "Xóa record thất bại." };
  }
}
// ─── Tìm Mã ngân sách cấp 1 bị trùng ─────────────────────────────────────────

const LEVEL1_BUDGET_CODES = [
  "ADS001", "ADS002", "ADS003", "ADS004", "ADS005", "ADS006", "ADS007", "ADS008",
  "BOO001", "BOO002", "BOO003", "BOO004", "BOO005",
  "KOL001", "KOL002", "KOL003", "KOL004", "KOL005",
  "GOI001", "GOO002", "GOO003",
  "OFF001", "OFF002",
  "TRA001", "TRA002", "TRA003",
  "CRE001", "CRE002", "CRE003",
  "COL001", "COL002",
  "OTH001", "OTH002", "OTH003", "OTH004", "OTH005", "OTH006", "OTH007", "OTH008",
  "PCN001",
];

export interface DuplicateLevel1Group {
  maNganSach: string;
  loaiNganSach: string;
  brand: string;
  quy: string;
  nam: string;
  thang: string;
  records: BudgetRecordView[];
}
export interface DuplicateLevel1FilterInput {
  quy?: string;
  thang?: string;
}

export interface BudgetHierarchyAuditRow {
  code: string;
  level: number;
  recordCount: number;
  directAmount: number;
  childAmount: number;
  expectedAmount: number;
  difference: number;
  hasChildren: boolean;
}

export interface BudgetHierarchyAuditResult {
  rootCode: string;
  codeField: string;
  amountField: string;
  totalRecords: number;
  directLevel1Amount: number;
  directLevel2Amount: number;
  directLevel3Amount: number;
  rollupLevel1Amount: number;
  rollupLevel2Amount: number;
  rows: BudgetHierarchyAuditRow[];
  records: BudgetHierarchyAuditRecord[];
  reasons: string[];
}

export interface BudgetHierarchyAuditRecord {
  recordId: string;
  brand: string;
  quy: string;
  thang: string;
  loaiNganSach: string;
  nam: string;
  code: string;
  level: number;
  amount: number;
}

export interface BudgetHierarchyAuditFilters {
  brand?: string;
  quy?: string;
  thang?: string;
  loaiNganSach?: string;
}

function normalizeAuditBudgetCode(value: unknown): string {
  return String(value ?? "")
    .trim()
    .replace(/[_.\/\s-]+/g, "-")
    .replace(/^-|-$/g, "")
    .toUpperCase();
}

function auditBudgetCodePath(code: string): string[] {
  const parts = code.split("-").filter(Boolean);
  if (parts.length <= 1) return [code];
  const [root, suffix] = parts;
  const path = [root];
  for (let length = 2; length <= suffix.length; length += 2) {
    path.push(`${root}-${suffix.slice(0, length)}`);
  }
  return path;
}

/** Kiểm tra chỉ đọc tổng chi theo cây mã A01, không thay đổi record trong Base. */
export async function auditBudgetHierarchyAction(
  rootCodeInput: string,
  filters: BudgetHierarchyAuditFilters = {}
): Promise<ActionResult<BudgetHierarchyAuditResult>> {
  try {
    const client = getLarkClient();
    const fields = await client.listFields();
    const fieldNames = fields.map((field) => field.field_name);
    const normalizedFieldNames = new Map(fieldNames.map((name) => [normalizeText(name), name]));
    const codeField = normalizedFieldNames.get(normalizeText("Mã ngân sách"));
    if (!codeField) return { success: false, message: "Không tìm thấy field 'Mã ngân sách' trong table đang active." };

    const amountCandidates = [
      "Tổng khoản chi",
      "Tổng chi phí",
      "Đã chi",
      "Đã chi (lookup)",
      "Số tiền đã chi",
      "Số tiền",
      "Số tiền TGĐ duyệt",
    ];
    const amountField = amountCandidates
      .map((candidate) => normalizedFieldNames.get(normalizeText(candidate)))
      .find(Boolean);
    if (!amountField) {
      return { success: false, message: `Không tìm thấy field khoản chi. Các field hiện có: ${fieldNames.join(", ")}` };
    }

    const brandField = normalizedFieldNames.get(normalizeText("Brand"));
    const quyField = normalizedFieldNames.get(normalizeText("Quý ngân sách"));
    const thangField = normalizedFieldNames.get(normalizeText("Tháng ngân sách"));
    const loaiNganSachField = normalizedFieldNames.get(normalizeText("Loại ngân sách"));
    const namField = normalizedFieldNames.get(normalizeText("Năm"));

    const rootCode = normalizeAuditBudgetCode(rootCodeInput);

    const allRecords: LarkRecord[] = [];
    let pageToken: string | undefined;
    do {
      const page = await client.listRecords({
        pageSize: 500,
        pageToken,
        fieldNames: fieldNames,
      });
      allRecords.push(...page.items);
      pageToken = page.hasMore ? page.pageToken : undefined;
    } while (pageToken);

    const matched = allRecords.filter((record) => {
      const code = normalizeAuditBudgetCode(record.fields[codeField]);
      const matches = (fieldName: string | undefined, filterValue: string | undefined) =>
        !filterValue || normalizeText(record.fields[fieldName ?? ""]).includes(normalizeText(filterValue));
      return (
        (!rootCode || code === rootCode || code.startsWith(`${rootCode}-`)) &&
        matches(brandField, filters.brand) &&
        matches(quyField, filters.quy) &&
        matches(thangField, filters.thang) &&
        matches(loaiNganSachField, filters.loaiNganSach)
      );
    });
    const byCode = new Map<string, { amount: number; count: number }>();
    for (const record of matched) {
      const code = normalizeAuditBudgetCode(record.fields[codeField]);
      const amount = Number(record.fields[amountField]) || 0;
      const current = byCode.get(code) ?? { amount: 0, count: 0 };
      current.amount += amount;
      current.count++;
      byCode.set(code, current);
    }

    const allCodes = new Set(byCode.keys());
    for (const code of byCode.keys()) auditBudgetCodePath(code).forEach((parent) => allCodes.add(parent));
    const directAmount = (code: string) => byCode.get(code)?.amount ?? 0;
    const directCount = (code: string) => byCode.get(code)?.count ?? 0;
    const auditRecords: BudgetHierarchyAuditRecord[] = matched.map((record) => {
      const code = normalizeAuditBudgetCode(record.fields[codeField]);
      return {
        recordId: record.record_id,
        brand: String(record.fields[brandField ?? ""] ?? ""),
        quy: String(record.fields[quyField ?? ""] ?? ""),
        thang: String(record.fields[thangField ?? ""] ?? ""),
        loaiNganSach: String(record.fields[loaiNganSachField ?? ""] ?? ""),
        nam: String(record.fields[namField ?? ""] ?? ""),
        code,
        level: auditBudgetCodePath(code).length,
        amount: Number(record.fields[amountField]) || 0,
      };
    });
    const rows: BudgetHierarchyAuditRow[] = [];

    for (const code of Array.from(allCodes).sort()) {
      const path = auditBudgetCodePath(code);
      const children = Array.from(allCodes).filter((candidate) => {
        const candidatePath = auditBudgetCodePath(candidate);
        return candidatePath.length === path.length + 1 && candidatePath[path.length - 1] === code;
      });
      const childAmount = children.reduce((sum, child) => sum + directAmount(child), 0);
      const expectedAmount = children.length > 0 ? childAmount : directAmount(code);
      rows.push({
        code,
        level: path.length,
        recordCount: directCount(code),
        directAmount: directAmount(code),
        childAmount,
        expectedAmount,
        difference: directAmount(code) - expectedAmount,
        hasChildren: children.length > 0,
      });
    }

    const level1 = rows.filter((row) => row.level === 1);
    const level2 = rows.filter((row) => row.level === 2);
    const level3 = rows.filter((row) => row.level === 3);
    const reasons: string[] = [];
    if (matched.length === 0) reasons.push(rootCode ? `Không tìm thấy record có mã ${rootCode}.` : "Không tìm thấy record phù hợp trong table.");
    if (level1.some((row) => row.recordCount > 1)) reasons.push("Mã cấp 1 có nhiều record, tổng đang bị cộng từ nhiều dòng.");
    if (rows.some((row) => row.hasChildren && row.directAmount !== 0)) reasons.push("Có mã cha vừa có khoản chi trực tiếp vừa có mã con; đây là nguyên nhân dễ gây cộng trùng.");
    if (level1.reduce((sum, row) => sum + row.expectedAmount, 0) !== level2.reduce((sum, row) => sum + row.expectedAmount, 0)) {
      reasons.push("Tổng roll-up cấp 1 và cấp 2 đang lệch; kiểm tra mã cấp 2 thiếu, khác cấu trúc hoặc khác điều kiện lọc.");
    }
    if (level3.length > 0 && level2.reduce((sum, row) => sum + row.expectedAmount, 0) !== level3.reduce((sum, row) => sum + row.expectedAmount, 0)) {
      reasons.push("Có cấp 3 nhưng tổng roll-up cấp 2 và cấp 3 đang lệch.");
    }
    if (reasons.length === 0) reasons.push("Không phát hiện chênh lệch theo cây mã trong các record đã đọc.");

    return {
      success: true,
      data: {
        rootCode: rootCode || "ALL",
        codeField,
        amountField,
        totalRecords: matched.length,
        directLevel1Amount: level1.reduce((sum, row) => sum + row.directAmount, 0),
        directLevel2Amount: level2.reduce((sum, row) => sum + row.directAmount, 0),
        directLevel3Amount: level3.reduce((sum, row) => sum + row.directAmount, 0),
        rollupLevel1Amount: level1.reduce((sum, row) => sum + row.expectedAmount, 0),
        rollupLevel2Amount: level2.reduce((sum, row) => sum + row.expectedAmount, 0),
        rows,
        records: auditRecords,
        reasons,
      },
    };
  } catch (err: any) {
    return { success: false, message: err.message || "Không thể kiểm tra cây ngân sách." };
  }
}
// ─── Rà soát bản ghi không phải Import từ BOT / Điều chuyển từ Admin ────────

const TRUSTED_SOURCE_VALUES = ["Import từ BOT", "Điều chuyển từ Admin"];

export interface SuspiciousSourceRecord extends BudgetRecordView {
  loaiNganSach: string;
  loaiDeXuat: string;
  createdTime: string;
  updatedTime: string;
}

/** Quét toàn bộ record thuộc 5 Loại ngân sách liên quan, lọc ra các bản ghi có
 * "Loại đề xuất" KHÔNG thuộc nhóm nguồn tin cậy (Import từ BOT / Điều chuyển từ Admin)
 * — dùng để rà soát thủ công các bản ghi khả nghi bị sửa tay sai cấp ngân sách. */
export async function findSuspiciousSourceRecordsAction(): Promise<ActionResult<SuspiciousSourceRecord[]>> {
  try {
    const client = getLarkClient();
    const F = await buildFieldNameResolver(client);
    const trustedSet = new Set(TRUSTED_SOURCE_VALUES.map((v) => normalizeText(v)));

    const allRecords: LarkRecord[] = [];
    let pageToken: string | undefined;
    do {
      const result = await client.listRecords({
        pageSize: 500,
        pageToken,
        fieldNames: [
          F("Brand"),
          F("Quý ngân sách"),
          F("Năm"),
          F("Tháng ngân sách"),
          F("Mã ngân sách"),
          F("Hạng mục"),
          F("Số tiền TGĐ duyệt"),
          F("Loại ngân sách"),
          F("Loại đề xuất"),
        ],
      });
      allRecords.push(...result.items);
      pageToken = result.hasMore ? result.pageToken : undefined;
    } while (pageToken);

    const suspicious = allRecords.filter((r) => {
      const loaiDeXuatValues = extractGopThangValues(r.fields[F("Loại đề xuất")]);
      // Trống cũng coi là khả nghi (không rõ nguồn) -> vẫn giữ lại để rà soát
      if (loaiDeXuatValues.length === 0) return true;
      // Giữ lại nếu KHÔNG khớp bất kỳ giá trị tin cậy nào
      return !loaiDeXuatValues.some((v) => trustedSet.has(normalizeText(v)));
    });

    const result: SuspiciousSourceRecord[] = suspicious.map((r) => {
      const view = larkRecordToView(r);
      return {
        ...view,
        loaiNganSach: String(r.fields[F("Loại ngân sách")] ?? ""),
        loaiDeXuat: extractGopThangValues(r.fields[F("Loại đề xuất")]).join(", "),
        createdTime: "", // Lark trả timestamp riêng qua field hệ thống — xem lưu ý bên dưới
        updatedTime: "",
      };
    });

    return { success: true, data: result };
  } catch (err: any) {
    return { success: false, message: err.message || "Không quét được dữ liệu." };
  }
}
export async function findDuplicateLevel1CodesAction(): Promise<ActionResult<DuplicateLevel1Group[]>> {
  try {
    const client = getLarkClient();
    const F = await buildFieldNameResolver(client);
    const codeSet = new Set(LEVEL1_BUDGET_CODES.map((c) => normalizeText(c)));

    const RELEVANT_LOAI_NGAN_SACH = new Set(
      [
        "Ngân sách Product Marketing",
        "Ngân sách Ecom",
        "Ngân sách Trade",
        "Ngân sách hãng tài trợ",
        "Ngân sách Ads",
      ].map((v) => normalizeText(v))
    );

    const allRecords: LarkRecord[] = [];
    let pageToken: string | undefined;
    do {
      const result = await client.listRecords({
        pageSize: 500,
        pageToken,
        fieldNames: [
          F("Brand"),
          F("Quý ngân sách"),
          F("Năm"),
          F("Tháng ngân sách"),
          F("Mã ngân sách"),
          F("Số tiền TGĐ duyệt"),
          F("Có NS cấp con"),
          F("Mã ngân sách mẹ"),
          F("Mã ngân sách con"),
          F("Loại ngân sách"),
        ],
      });
      allRecords.push(...result.items);
      pageToken = result.hasMore ? result.pageToken : undefined;
    } while (pageToken);

    const matched = allRecords.filter((r) => {
      if (!codeSet.has(normalizeText(r.fields[F("Mã ngân sách")]))) return false;

      // Chỉ quét các record thuộc 5 Loại ngân sách được chỉ định
      const loaiValue = normalizeText(r.fields[F("Loại ngân sách")]);
      if (!RELEVANT_LOAI_NGAN_SACH.has(loaiValue)) return false;

      const maNganSachConValues = extractGopThangValues(r.fields[F("Mã ngân sách con")]);
      const hasMaNganSachCon = maNganSachConValues.some((v) => normalizeText(v) !== "");
      if (hasMaNganSachCon) return true;

      const nsCapConValues = extractGopThangValues(r.fields[F("Có NS cấp con")]);
      const isNsCapConFalse =
        nsCapConValues.length === 0 ||
        nsCapConValues.every((v) => normalizeText(v) === "false");

      const maNganSachMeValues = extractGopThangValues(r.fields[F("Mã ngân sách mẹ")]);
      const isMaNganSachMeEmpty =
        maNganSachMeValues.length === 0 ||
        maNganSachMeValues.every((v) => normalizeText(v) === "");

      if (isNsCapConFalse && isMaNganSachMeEmpty) return false;
      return true;
    });

    const groups = new Map<string, BudgetRecordView[] & { loaiNganSach?: string }>();
    const groupLoai = new Map<string, string>();

    for (const r of matched) {
      const view = larkRecordToView(r);
      const loaiNganSach = String(r.fields[F("Loại ngân sách")] ?? "");
      // Key gộp gồm cả Loại ngân sách -> trùng phải cùng loại, cùng mã, cùng kỳ
      const key = [
        normalizeText(view.maNganSach),
        normalizeText(loaiNganSach),
        normalizeText(view.brand),
        normalizeText(view.quy),
        normalizeText(view.nam),
        normalizeText(view.thang),
      ].join("|");
      const group = groups.get(key) ?? [];
      group.push(view);
      groups.set(key, group);
      groupLoai.set(key, loaiNganSach);
    }

    const duplicates: DuplicateLevel1Group[] = Array.from(groups.entries())
      .filter(([, items]) => items.length > 1)
      .map(([key, items]) => ({
        maNganSach: items[0].maNganSach,
        loaiNganSach: groupLoai.get(key) ?? "",
        brand: items[0].brand,
        quy: items[0].quy,
        nam: items[0].nam,
        thang: items[0].thang,
        records: items,
      }))
      .sort((a, b) => a.maNganSach.localeCompare(b.maNganSach));

    return { success: true, data: duplicates };
  } catch (err: any) {
    return { success: false, message: err.message || "Không quét được dữ liệu trùng." };
  }
}
export async function fetchTiktokProfileStatsAction(input: string): Promise<ActionResult<TiktokProfileStats>> {
  try {
    const { handle, profileUrl } = normalizeTiktokProfileInput(input);
    const response = await fetch(profileUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
        Referer: "https://www.tiktok.com/",
      },
      redirect: "follow",
    });

    if (!response.ok) {
      throw new Error(`TikTok trả về trạng thái ${response.status}.`);
    }

    const html = await response.text();
    const stats = extractTiktokStatsFromPage(html, handle);
    return { success: true, data: toPlain(stats) };
  } catch (err: any) {
    return { success: false, message: err.message || "Lỗi không xác định khi lấy thống kê TikTok." };
  }
}

export async function importTiktokProfileStatsToLarkBaseAction(input: string): Promise<ActionResult<LarkRecord>> {
  try {
    const preview = await fetchTiktokProfileStatsAction(input);
    if (!preview.success) {
      return { success: false, message: preview.message };
    }
    if (!preview.data) {
      throw new Error("Không lấy được dữ liệu TikTok.");
    }

    const client = getLarkClient();
    const fields = await client.listFields();
    const fieldMap = buildFieldAliasMap(fields);

    const fieldName = {
      username: pickRealFieldName(fieldMap, ["username", "user name", "tiktok username", "handle"]),
      nickname: pickRealFieldName(fieldMap, ["nickname", "display name", "name"]),
      followers: pickRealFieldName(fieldMap, ["followers", "follower count", "followers count"]),
      following: pickRealFieldName(fieldMap, ["following", "following count"]),
      likes: pickRealFieldName(fieldMap, ["likes", "likes count", "heart count", "digg count"]),
      videos: pickRealFieldName(fieldMap, ["videos", "video count", "videos count"]),
      profileUrl: pickRealFieldName(fieldMap, ["profile url", "url", "link"]),
      source: pickRealFieldName(fieldMap, ["source"]),
    };

    const recordFields: Record<string, unknown> = {};
    if (fieldName.username) recordFields[fieldName.username] = preview.data.username;
    if (fieldName.nickname) recordFields[fieldName.nickname] = preview.data.nickname;
    if (fieldName.followers) recordFields[fieldName.followers] = preview.data.followerCount;
    if (fieldName.following) recordFields[fieldName.following] = preview.data.followingCount;
    if (fieldName.likes) recordFields[fieldName.likes] = preview.data.heartCount;
    if (fieldName.videos) recordFields[fieldName.videos] = preview.data.videoCount;
    if (fieldName.profileUrl) recordFields[fieldName.profileUrl] = preview.data.profileUrl;
    if (fieldName.source) recordFields[fieldName.source] = "TikTok";

    if (Object.keys(recordFields).length === 0) {
      throw new Error("Lark Base hiện chưa có field phù hợp để lưu thống kê TikTok. Hãy thêm các field Username / Nickname / Followers / Likes / Videos.");
    }

    const created = await client.createRecord(recordFields);
    return { success: true, data: toPlain(created) };
  } catch (err: any) {
    return { success: false, message: err.message || "Lỗi không xác định khi import TikTok vào Lark Base." };
  }
}

export async function importTiktokVideoMetricsToLarkBaseAction(input: string): Promise<ActionResult<LarkRecord>> {
  try {
    const preview = await fetchTiktokVideoMetricsAction(input);
    if (!preview.success) {
      return { success: false, message: preview.message };
    }
    if (!preview.data) {
      throw new Error("Không lấy được dữ liệu video TikTok.");
    }

    const client = getLarkClient();
    const fields = await client.listFields();
    const fieldMap = buildFieldAliasMap(fields);

    const fieldName = {
      title: pickRealFieldName(fieldMap, ["title", "video title"]),
      uploader: pickRealFieldName(fieldMap, ["uploader", "creator", "author"]),
      viewCount: pickRealFieldName(fieldMap, ["view count", "views", "play count"]),
      commentCount: pickRealFieldName(fieldMap, ["comment count", "comments"]),
      collectionCount: pickRealFieldName(fieldMap, ["collection count", "collections", "favorite count"]),
      likeCount: pickRealFieldName(fieldMap, ["like count", "likes", "digg count"]),
      totalInteractionCount: pickRealFieldName(fieldMap, ["total interaction count", "interaction count"]),
      releaseTime: pickRealFieldName(fieldMap, ["release time", "created time"]),
      shareCount: pickRealFieldName(fieldMap, ["share count", "shares"]),
      dataRetrievalTime: pickRealFieldName(fieldMap, ["data retrieval time", "retrieved at"]),
      errorMessage: pickRealFieldName(fieldMap, ["error message"]),
    };

    const recordFields: Record<string, unknown> = {};
    if (fieldName.title) recordFields[fieldName.title] = preview.data.title;
    if (fieldName.uploader) recordFields[fieldName.uploader] = preview.data.uploader;
    if (fieldName.viewCount) recordFields[fieldName.viewCount] = preview.data.viewCount;
    if (fieldName.commentCount) recordFields[fieldName.commentCount] = preview.data.commentCount;
    if (fieldName.collectionCount) recordFields[fieldName.collectionCount] = preview.data.collectionCount;
    if (fieldName.likeCount) recordFields[fieldName.likeCount] = preview.data.likeCount;
    if (fieldName.totalInteractionCount) recordFields[fieldName.totalInteractionCount] = preview.data.totalInteractionCount;
    if (fieldName.releaseTime) recordFields[fieldName.releaseTime] = preview.data.releaseTime;
    if (fieldName.shareCount) recordFields[fieldName.shareCount] = preview.data.shareCount;
    if (fieldName.dataRetrievalTime) recordFields[fieldName.dataRetrievalTime] = preview.data.dataRetrievalTime;
    if (fieldName.errorMessage) recordFields[fieldName.errorMessage] = preview.data.errorMessage;

    if (Object.keys(recordFields).length === 0) {
      throw new Error("Lark Base chưa có field phù hợp để lưu video TikTok. Hãy thêm field Title / Uploader / View Count / Comment Count / Like Count / Share Count / Release Time / Collection Count / Total Interaction Count.");
    }

    const created = await client.createRecord(recordFields);
    return { success: true, data: toPlain(created) };
  } catch (err: any) {
    return { success: false, message: err.message || "Lỗi không xác định khi import video TikTok vào Lark Base." };
  }
}

// ─── Import Excel (mapping cột tuỳ chọn — tính năng cũ) ─────────────────────

export interface ExcelPreview {
  columns: string[];
  rows: Record<string, unknown>[];
  totalRows: number;
}

function excelSerialDateToMs(serial: number): number {
  const utcDays = serial - 25569;
  return Math.round(utcDays * 86400 * 1000);
}

function parseExcelDateValue(value: unknown): number | null {
  if (typeof value === "number") {
    return excelSerialDateToMs(value);
  }

  if (value instanceof Date) {
    return value.getTime();
  }

  if (typeof value !== "string") {
    return null;
  }

  const raw = value.trim();
  if (!raw) return null;

  const isoDate = new Date(raw);
  if (!Number.isNaN(isoDate.getTime())) {
    return isoDate.getTime();
  }

  const match = raw.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (match) {
    let [, d, m, y] = match;
    if (y.length === 2) y = `20${y}`;
    const date = new Date(`${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`);
    if (!Number.isNaN(date.getTime())) {
      return date.getTime();
    }
  }

  return null;
}

function parseExcelNumberValue(value: unknown): number | null {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value !== "string") {
    return null;
  }

  const raw = value.trim();
  if (!raw) return null;

  const dotCount = (raw.match(/\./g) || []).length;
  const commaCount = (raw.match(/,/g) || []).length;

  let normalized = raw.replace(/\s+/g, "");
  if (dotCount > 0 && commaCount > 0) {
    normalized = normalized.replace(/\./g, "").replace(/,/g, ".");
  } else if (commaCount > 0 && dotCount === 0) {
    normalized = normalized.replace(/,/g, ".");
  }

  normalized = normalized.replace(/[^0-9.-]/g, "");
  const num = Number(normalized);
  return Number.isNaN(num) ? null : num;
}

function normalizeExcelHeader(header: string): string {
  return header.trim();
}

/** Đọc file Excel do người dùng upload, trả về danh sách cột + vài dòng đầu để xem trước */
export async function parseExcelPreviewAction(formData: FormData): Promise<ActionResult<ExcelPreview>> {
  try {
    const file = formData.get("file") as File | null;
    if (!file) return { success: false, message: "Chưa chọn file." };

    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: null,
      raw: true,
    });

    const rows = rawRows.map((row) => ({ ...row }));
    const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
    return {
      success: true,
      data: { columns, rows: rows.slice(0, 20), totalRows: rows.length },
    };
  } catch (err: any) {
    return { success: false, message: err.message || "Không đọc được file Excel." };
  }
}

export interface ImportMapping {
  [excelColumn: string]: {
    larkField: string; // "" nghĩa là bỏ qua cột này
    isDate?: boolean;
    isNumber?: boolean;
  };
}

/** Import toàn bộ file Excel vào Base theo mapping cột đã chọn (tính năng cũ, cấu trúc phẳng) */
export async function importExcelAction(
  formData: FormData,
  mapping: ImportMapping
): Promise<ActionResult<{ created: number; total: number }>> {
  try {
    const file = formData.get("file") as File | null;
    if (!file) return { success: false, message: "Chưa chọn file." };

    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: null,
      raw: true,
    });

    const recordsFields = rows
      .map((row) => {
        const fields: Record<string, unknown> = {};

        for (const [excelCol, rawValue] of Object.entries(row)) {
          const normalizedExcelCol = normalizeExcelHeader(excelCol);
          const rule = mapping[normalizedExcelCol] || mapping[excelCol];
          if (!rule || !rule.larkField) continue;
          if (rawValue === null || rawValue === undefined || rawValue === "") continue;

          let value: unknown = rawValue;
          if (rule.isDate) {
            const parsedDate = parseExcelDateValue(value);
            if (parsedDate === null) continue;
            value = parsedDate;
          } else if (rule.isNumber) {
            const parsedNumber = parseExcelNumberValue(value);
            if (parsedNumber === null) continue;
            value = parsedNumber;
          } else {
            if (value instanceof Date) {
              value = value.toISOString();
            } else if (typeof value !== "string") {
              value = String(value);
            }
          }

          fields[rule.larkField] = value;
        }

        return Object.keys(fields).length > 0 ? fields : null;
      })
      .filter((item): item is Record<string, unknown> => item !== null);

    if (recordsFields.length === 0) {
      return { success: false, message: "Không tìm thấy dòng hợp lệ để import." };
    }

    const client = getLarkClient();
    const batchSize = 500;
    let created = 0;
    for (let i = 0; i < recordsFields.length; i += batchSize) {
      const batch = recordsFields.slice(i, i + batchSize);
      const result = await client.batchCreateRecords(batch);
      created += result.length;
    }

    return { success: true, data: { created, total: recordsFields.length } };
  } catch (err: any) {
    return { success: false, message: err.message || "Import thất bại." };
  }
}

// ─── TGĐ Duyệt Ngân sách: Import file Excel (đa Brand / đa Quý / đa khối) ───
//
// THUẬT TOÁN QUÉT TOÀN BỘ (không giả định vị trí cố định B1/B2, không giả định
// mỗi sheet chỉ có 1 Brand/1 Quý/1 khối TGĐ duyệt) — để chịu được nhiều kiểu bố cục:
//   (a) Mỗi sheet = 1 Brand + 1 Quý (file đơn giản, B1 = Brand, B2 = Quý — KHÔNG có
//       nhãn "Brand:"/"Quý:" tường minh, chỉ có giá trị thô)
//   (b) 1 sheet có NHIỀU khối "TGĐ DUYỆT NGÂN SÁCH Qx.yyyy" cho nhiều quý khác nhau
//   (c) 1 sheet có nhiều Brand xếp chồng (nhiều bảng con, mỗi bảng có header riêng,
//       có nhãn "Brand:"/"Quý:" tường minh để phân biệt)
//
// Cách hoạt động:
// 1. Quét toàn sheet tìm mọi ô nhãn "Brand" / "Quý" -> lấy giá trị ô liền kề làm value.
//    NẾU không tìm thấy nhãn nào (trường hợp a) -> fallback đọc trực tiếp B1 (Brand)
//    và B2 (Quý) như cấu trúc file cũ, coi đây là anchor "ở trên cùng" (row: -1) áp
//    dụng cho toàn sheet. Đây là điểm đã SỬA để tương thích ngược với file cũ.
// 2. Quét toàn sheet tìm mọi khối tiêu đề "TGĐ DUYỆT NGÂN SÁCH ..." (có thể nhiều khối).
//    Quý ưu tiên lấy từ CHÍNH tiêu đề khối (vd "Q3.2026") nếu có, vì đây là nguồn
//    đáng tin cậy nhất khi 1 sheet có nhiều khối cho nhiều quý khác nhau.
// 3. Quét toàn sheet tìm mọi hàng header chứa cả "Hạng mục" + "Mã ngân sách"
//    (có thể nhiều hàng header nếu nhiều Brand xếp chồng).
// 4. Với mỗi khối TGĐ: gán Brand/Quý gần nhất phía trên nó, gán header section gần nhất,
//    giới hạn vùng dữ liệu tới trước header section kế tiếp (tránh lẫn dữ liệu Brand khác).

const AUDIT_LOG_PATH = path.join(process.cwd(), "data", "audit-log.json");

interface AuditLogEntry {
  timestamp: string;
  batchId?: string;
  wasCreated?: boolean;
  action: "import" | "approve" | "edit" | "delete";
  recordId?: string;
  brand: string;
  quy: string;
  nam: string;
  thang: string;
  maNganSach: string;
  hangMuc?: string;
  khoanNganSach?: string;
  soTienLanNay: number;
  giaTriTruoc: number;
  giaTriSau: number;
  nguoiDuyet?: string;
  ghiChu?: string;
}

async function appendAuditLog(entry: AuditLogEntry): Promise<void> {
  try {
    const dir = path.dirname(AUDIT_LOG_PATH);
    await fs.mkdir(dir, { recursive: true });

    let existing: AuditLogEntry[] = [];
    try {
      const raw = await fs.readFile(AUDIT_LOG_PATH, "utf-8");
      existing = JSON.parse(raw);
      if (!Array.isArray(existing)) existing = [];
    } catch {
      existing = [];
    }

    existing.push(entry);
    await fs.writeFile(AUDIT_LOG_PATH, JSON.stringify(existing, null, 2), "utf-8");
  } catch (err: any) {
    // Trên production (Vercel) filesystem là read-only — không throw ra ngoài,
    // vì audit log chỉ là log phụ, không nên làm hỏng kết quả của action chính.
    console.error("Không thể ghi audit log (bỏ qua, không ảnh hưởng kết quả chính):", err.message);
  }
}

export async function getAuditLogAction(): Promise<ActionResult<AuditLogEntry[]>> {
  try {
    const raw = await fs.readFile(AUDIT_LOG_PATH, "utf-8");
    const data = JSON.parse(raw);
    return { success: true, data: Array.isArray(data) ? data : [] };
  } catch {
    return { success: true, data: [] };
  }
}

function normalizeText(s: unknown): string {
  return String(s ?? "")
    .normalize("NFC")
    .replace(/[\u00A0\u200B]/g, " ") // NBSP, zero-width space -> space thường
    .replace(/\s+/g, " ") // gộp nhiều khoảng trắng liên tiếp thành 1
    .trim()
    .toLowerCase();
}

/**
 * Tra tên field CHÍNH XÁC (đúng byte) từ danh sách field thật lấy qua API,
 * để tránh trường hợp gõ tay chuỗi tiếng Việt bị lệch encode Unicode (NFC/NFD)
 * so với tên field thật trong Lark Base — lệch encode khiến Lark API coi đây
 * là field lạ và ÂM THẦM BỎ QUA (không báo lỗi, nhưng giá trị không được ghi).
 */
async function buildFieldNameResolver(client: ReturnType<typeof getLarkClient>): Promise<(label: string) => string> {
  const fields = await client.listFields();
  const map = new Map<string, string>();
  for (const f of fields) {
    map.set(normalizeText(f.field_name), f.field_name);
  }
  return (label: string) => {
    const resolved = map.get(normalizeText(label));
    if (!resolved) {
      throw new Error(
        `Không tìm thấy field '${label}' trong Base (đã kiểm tra ${fields.length} field). Kiểm tra lại tên field thật trong Lark Base.`
      );
    }
    return resolved;
  };
}

/** Tách "Q3/2026" -> { quy: "Q3", nam: "2026" }. Nếu không khớp định dạng, trả cả chuỗi vào quy. */
function parseQuarterYear(quarterStr: string): { quy: string; nam: string } {
  const match = quarterStr.trim().match(/^(Q\d)\s*[\/.]\s*(\d{4})$/i); // chấp nhận cả "." lẫn "/"
  if (match) return { quy: match[1].toUpperCase(), nam: match[2] };
  return { quy: quarterStr.trim(), nam: "" };
}

/** Trích "Q3/2026" hoặc "Q3.2026" (hoặc biến thể có khoảng trắng) từ 1 đoạn text bất kỳ,
 * chuẩn hóa về dạng "Q3/2026". Trả null nếu không tìm thấy pattern quý/năm nào trong text. */
function extractQuarterFromText(text: string): string | null {
  const match = text.match(/q\s*(\d)\s*[./]\s*(\d{4})/i);
  if (!match) return null;
  return `Q${match[1]}/${match[2]}`;
}
/** Trích "Tháng 9" từ text tiêu đề khối (vd "TGĐ DUYỆT NGÂN SÁCH BOOKING THÁNG 9"). */
function extractMonthFromText(text: string): string | null {
  const match = text.match(/tháng\s*(\d{1,2})/i);
  if (!match) return null;
  const m = parseInt(match[1], 10);
  if (!m || m < 1 || m > 12) return null;
  return `Tháng ${m}`;
}

function getImportMonthKey(month: string): string {
  return normalizeText(month);
}

/** "Tháng 9" -> "Q3" */
function monthLabelToQuarter(monthLabel: string): string {
  const m = parseInt(monthLabel.match(/\d+/)?.[0] ?? "0", 10);
  const q = Math.max(1, Math.min(4, Math.ceil(m / 3) || 1));
  return `Q${q}`;
}

/** Lấy giá trị "hiệu lực" của 1 ô SheetJS (0-indexed row/col), xử lý cả trường hợp merge. */
function getMergedCellValueXLSX(sheet: XLSX.WorkSheet, row: number, col: number): unknown {
  const address = XLSX.utils.encode_cell({ r: row, c: col });
  const directCell = sheet[address];
  if (directCell && directCell.v !== undefined) return directCell.v;

  const merges = sheet["!merges"] || [];
  for (const range of merges) {
    if (row >= range.s.r && row <= range.e.r && col >= range.s.c && col <= range.e.c) {
      const masterAddr = XLSX.utils.encode_cell({ r: range.s.r, c: range.s.c });
      return sheet[masterAddr]?.v;
    }
  }
  return undefined;
}

/** Lấy giá trị TRỰC TIẾP của 1 ô, KHÔNG áp dụng merge-fallback.
 * Dùng cho việc quét NHÃN/TIÊU ĐỀ (label/title) trên toàn sheet — vì text luôn nằm ở
 * đúng 1 ô master, các ô khác trong vùng merge không chứa text. Nếu dùng merge-fallback
 * khi quét toàn sheet, mọi ô nằm trong vùng merge của master sẽ "nhìn thấy" cùng 1 text,
 * khiến 1 nhãn/tiêu đề bị đếm trùng nhiều lần (theo số ô trong vùng merge). */
function getDirectCellValueXLSX(sheet: XLSX.WorkSheet, row: number, col: number): unknown {
  const address = XLSX.utils.encode_cell({ r: row, c: col });
  return sheet[address]?.v;
}

function findColumnByLabelXLSX(sheet: XLSX.WorkSheet, row: number, label: string, maxCol = 60): number {
  for (let col = 0; col < maxCol; col++) {
    const val = normalizeText(getDirectCellValueXLSX(sheet, row, col));
    if (val === label) return col;
  }
  return -1;
}

interface LabelAnchor {
  row: number;
  col: number;
  value: string;
}

/** Quét toàn bộ sheet tìm các ô có text khớp labelRegex (vd "Brand", "Quý"), lấy giá trị
 * ở ô liền kề bên phải (cùng hàng, thử tối đa 3 ô kế tiếp nếu có ô trống xen giữa) làm value.
 * Dùng để tìm NHIỀU "Brand:"/"Quý:" ở bất kỳ đâu trong sheet, không cố định vị trí B1/B2. */
function findAllLabelAnchors(
  sheet: XLSX.WorkSheet,
  labelRegex: RegExp,
  maxRow: number,
  maxCol = 40
): LabelAnchor[] {
  const anchors: LabelAnchor[] = [];
  for (let row = 0; row <= maxRow; row++) {
    for (let col = 0; col < maxCol; col++) {
      const raw = getDirectCellValueXLSX(sheet, row, col);
      const text = String(raw ?? "").trim();
      if (!text || !labelRegex.test(normalizeText(text))) continue;

      for (let c = col + 1; c < col + 4; c++) {
        const v = getMergedCellValueXLSX(sheet, row, c);
        if (v !== undefined && v !== null && String(v).trim() !== "") {
          anchors.push({ row, col, value: String(v).trim() });
          break;
        }
      }
    }
  }
  return anchors;
}

/** Quét TOÀN BỘ sheet tìm mọi khối "TGĐ DUYỆT NGÂN SÁCH ..." (không dừng ở khối đầu tiên) —
 * hỗ trợ file có nhiều khối cho nhiều quý khác nhau nằm cạnh/dưới nhau trong cùng 1 sheet. */
function findAllTgdBlocksXLSX(
  sheet: XLSX.WorkSheet,
  maxRow: number,
  maxCol = 100
): { row: number; col: number; colEnd: number; titleText: string }[] {
  const blocks: { row: number; col: number; colEnd: number; titleText: string }[] = [];
  for (let row = 0; row <= maxRow; row++) {
    for (let col = 0; col < maxCol; col++) {
      const raw = getDirectCellValueXLSX(sheet, row, col);
      const text = String(raw ?? "").trim();
      if (normalizeText(text).startsWith("tgđ duyệt ngân sách")) {
        const mergedRange = (sheet["!merges"] || []).find(
          (range) => row >= range.s.r && row <= range.e.r && col >= range.s.c && col <= range.e.c
        );
        blocks.push({
          row,
          col,
          colEnd: mergedRange ? mergedRange.e.c + 1 : col + 1,
          titleText: text,
        });
      }
    }
  }
  return blocks;
}
/** Tìm hàng chứa nhãn "... sếp duyệt" trong vài hàng ngay dưới 1 vị trí cho trước —
 * dùng để xác định đúng hàng chứa tên Brand cho template có thêm 1 dòng tiêu đề phụ
 * (vd "Ngân sách BOOKING SẾP DUYỆT") nằm GIỮA tiêu đề khối "TGĐ DUYỆT NGÂN SÁCH..."
 * và hàng tên Brand thật sự. */
function findApprovalLabelRowBelow(
  sheet: XLSX.WorkSheet,
  startRow: number,
  maxSearchRows: number,
  maxCol: number
): number | null {
  for (let row = startRow; row <= startRow + maxSearchRows; row++) {
    for (let col = 0; col < maxCol; col++) {
      const raw = getDirectCellValueXLSX(sheet, row, col);
      const text = normalizeText(raw);
      if (text.includes("sếp duyệt")) return row;
    }
  }
  return null;
}
/** Quét TOÀN BỘ sheet tìm mọi hàng header chứa cả "Hạng mục" và "Mã ngân sách" —
 * hỗ trợ file có nhiều bảng con (nhiều Brand) xếp chồng trong cùng 1 sheet. */
function findAllHeaderSectionsXLSX(
  sheet: XLSX.WorkSheet,
  maxRow: number,
  maxCol = 60
): { row: number; colHangMuc: number; colMaNganSach: number }[] {
  const sections: { row: number; colHangMuc: number; colMaNganSach: number }[] = [];
  for (let row = 0; row <= maxRow; row++) {
    const colHangMuc = findColumnByLabelXLSX(sheet, row, "hạng mục", maxCol);
    const colMaNganSach = findColumnByLabelXLSX(sheet, row, "mã ngân sách", maxCol);
    if (colHangMuc >= 0 && colMaNganSach >= 0) {
      sections.push({ row, colHangMuc, colMaNganSach });
    }
  }
  return sections;
}
/** Tìm cột bắt đầu (exclusive boundary) của khối TGĐ kế tiếp nằm bên PHẢI khối hiện tại,
 * trong phạm vi vài hàng gần nhau (vd cùng hàng hoặc lệch 1-3 hàng) — dùng để chặn cứng
 * vùng quét Brand của khối hiện tại, tránh lấn sang cột Brand/NOTE của khối tháng kế tiếp
 * khi nhiều khối tháng nằm liền kề nhau, không có đủ khoảng trống ngăn cách rõ ràng. */
function findNextBlockColBoundary(
  allBlocks: { row: number; col: number; colEnd: number; titleText: string }[],
  currentBlock: { row: number; col: number },
  maxRowTolerance = 3
): number | null {
  let best: number | null = null;
  for (const b of allBlocks) {
    if (b.col <= currentBlock.col) continue;
    if (Math.abs(b.row - currentBlock.row) > maxRowTolerance) continue;
    if (best === null || b.col < best) best = b.col;
  }
  return best;
}
/** Quét các cột Brand nằm bên phải cột "Hạng mục"/"Mã ngân sách" trên CHÍNH header row
 * (không có subheader riêng như layout Tháng-theo-cột). Dừng khi gặp 3 ô trống liên tiếp
 * hoặc gặp "Note". Bỏ qua nếu lỡ là cột "Tháng X" (tránh nhầm với layout cũ). */
function findBrandColumnsXLSX(
  sheet: XLSX.WorkSheet,
  headerRow: number,
  startCol: number,
  maxCol: number
): { name: string; col: number }[] {
  const brands: { name: string; col: number }[] = [];
  let emptyStreak = 0;
  for (let col = startCol; col < maxCol; col++) {
    const raw = getDirectCellValueXLSX(sheet, headerRow, col);
    const text = String(raw ?? "").trim();
    if (!text) {
      emptyStreak++;
      if (emptyStreak >= 3) break;
      continue;
    }
    emptyStreak = 0;
    const normalized = normalizeText(text);
    if (/^tháng\s*\d+$/.test(normalized)) continue;
    if (normalized === "note") break;
    brands.push({ name: text, col });
  }
  return brands;
}

function findNumericColumnsXLSX(
  sheet: XLSX.WorkSheet,
  dataStartRow: number,
  dataEndRow: number,
  startCol: number,
  maxCol: number
): number[] {
  const columns: number[] = [];
  let foundData = false;
  let emptyStreak = 0;
  for (let col = startCol; col < maxCol; col++) {
    const headerText = normalizeText(getDirectCellValueXLSX(sheet, dataStartRow - 1, col));
    if (headerText === "note") break;

    let hasNumber = false;
    for (let row = dataStartRow; row <= dataEndRow; row++) {
      const value = getMergedCellValueXLSX(sheet, row, col);
      if (typeof value === "number" && Number.isFinite(value) && value !== 0) {
        hasNumber = true;
        break;
      }
    }

    if (hasNumber) {
      columns.push(col);
      foundData = true;
      emptyStreak = 0;
    } else if (foundData) {
      emptyStreak++;
      if (emptyStreak >= 3) break;
    }
  }
  return columns;
}

/** Resolver KHÔNG throw — dùng cho field tuỳ chọn như "Khoản ngân sách"
 * (có thể không tồn tại trong mọi Base). */
async function buildOptionalFieldNameResolver(
  client: ReturnType<typeof getLarkClient>
): Promise<(label: string) => string | null> {
  const fields = await client.listFields();
  const map = new Map<string, string>();
  for (const f of fields) map.set(normalizeText(f.field_name), f.field_name);
  return (label: string) => map.get(normalizeText(label)) ?? null;
}
/** Tìm anchor (Brand/Quý) GẦN NHẤT phía TRÊN 1 hàng cho trước — dùng để gán đúng
 * Brand/Quý cho từng khối TGĐ duyệt khi có nhiều khối/nhiều brand trong 1 sheet.
 * Nếu không có anchor nào ở trên (khối nằm trên cùng), dùng tạm anchor đầu tiên tìm được. */
function findNearestAnchorAbove(anchors: LabelAnchor[], targetRow: number): LabelAnchor | null {
  let best: LabelAnchor | null = null;
  for (const a of anchors) {
    if (a.row <= targetRow) {
      if (!best || a.row > best.row) best = a;
    }
  }
  return best ?? (anchors.length > 0 ? anchors[0] : null);
}

function findNearestHeaderSection<T extends { row: number }>(sections: T[], targetRow: number): T | null {
  let best: T | null = null;
  let bestDist = Infinity;
  for (const s of sections) {
    const dist = Math.abs(s.row - targetRow);
    if (dist < bestDist) {
      bestDist = dist;
      best = s;
    }
  }
  return best;
}

/** Field LUÔN LUÔN là text bất kể Lark báo type gì — phòng trường hợp field như
 * "Mã ngân sách" có mã dạng "BOO002-01" nhưng lỡ bị cấu hình nhầm kiểu khác trong Base. */
const FORCE_TEXT_FIELD_LABELS = new Set(["Mã ngân sách", "Hạng mục"]);

/** Field LUÔN LUÔN là text bất kể Lark báo gì. */

/** Field LUÔN LUÔN là number — biết chắc theo nghiệp vụ, không cần đoán type ID của Lark
 * (type ID trả về từ API không khớp giả định 2=Number, nên bỏ hẳn cách đoán theo type ID). */
const FORCE_NUMBER_FIELD_LABELS = new Set(["Số tiền TGĐ duyệt"]);
interface FieldMeta {
  optionsByNormalized: Map<string, string>; // normalizeText(option) -> tên option THẬT
  optionsByNormalizedNoSpace: Map<string, string>; // như trên nhưng bỏ hết khoảng trắng, dùng khớp dự phòng
}

function buildFieldMetaMap(allFields: LarkField[]): Map<string, FieldMeta> {
  const map = new Map<string, FieldMeta>();
  for (const f of allFields) {
    const optionsByNormalized = new Map<string, string>();
    const optionsByNormalizedNoSpace = new Map<string, string>();
    for (const opt of f.property?.options ?? []) {
      if (opt.name) {
        const normalized = normalizeText(opt.name);
        optionsByNormalized.set(normalized, opt.name);
        optionsByNormalizedNoSpace.set(normalized.replace(/\s+/g, ""), opt.name);
      }
    }
    map.set(f.field_name, { optionsByNormalized, optionsByNormalizedNoSpace });
  }
  return map;
}

/** Xác định cách xử lý field KHÔNG dựa vào type ID của Lark (đã chứng minh đoán sai) mà dựa vào:
 * 1. Tên field mình biết chắc là Text/Number theo nghiệp vụ (FORCE_TEXT/FORCE_NUMBER).
 * 2. Field có sẵn danh sách `options` -> chắc chắn là Select, so khớp option.
 * 3. Còn lại -> Text (an toàn nhất, ít khả năng gây lỗi convert nhất). */
function buildFieldsBySmartType(
  raw: Record<string, unknown>,
  fieldMetaMap: Map<string, FieldMeta>,
  fieldNameToLabel: Map<string, string>,
  warnings: string[],
  fieldTypeMap: Map<string, number> // field_name -> type id (3 = SingleSelect trong Lark)
): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  for (const [fieldName, value] of Object.entries(raw)) {
    const label = fieldNameToLabel.get(fieldName) ?? fieldName;
    const meta = fieldMetaMap.get(fieldName);
    const larkType = fieldTypeMap.get(fieldName);

    if (FORCE_TEXT_FIELD_LABELS.has(label)) {
      out[fieldName] = value == null ? "" : String(value);
      continue;
    }
    if (FORCE_NUMBER_FIELD_LABELS.has(label)) {
      const n = typeof value === "number" ? value : Number(String(value).replace(/[^0-9.-]/g, ""));
      if (!Number.isFinite(n) || String(value).trim() === "") {
        throw new Error(`Field "${label}" thiếu giá trị số hợp lệ (nhận: "${value}") — kiểm tra lại định dạng Quý/Tháng trong file Excel.`);
      }
      out[fieldName] = n;
      continue;
    }

    // Field là Single/Multi Select trong Lark (type 3/4) nhưng KHÔNG có options cached
    // -> đừng âm thầm gửi Text, throw để dev biết ngay.
    if ((larkType === 3 || larkType === 4) && (!meta || meta.optionsByNormalized.size === 0)) {
      throw new Error(`Field "${label}" là Select trong Lark nhưng không lấy được danh sách option — kiểm tra lại field.property.options.`);
    }

    if (meta && meta.optionsByNormalized.size > 0) {
      const valueText = String(value ?? "").trim();
      if (!valueText) continue;

      const normalizedValue = normalizeText(valueText);
      let matched = meta.optionsByNormalized.get(normalizedValue);

      // Khớp chính xác thất bại -> thử khớp dự phòng bỏ hết khoảng trắng
      // (vd Excel ghi "BRING GREEN", Lark option là "BRINGGREEN").
      let matchedViaFallback = false;
      if (!matched) {
        matched = meta.optionsByNormalizedNoSpace.get(normalizedValue.replace(/\s+/g, ""));
        if (matched) matchedViaFallback = true;
      }

      if (matched) {
        out[fieldName] = matched;
        if (matchedViaFallback) {
          warnings.push(
            `Field "${label}": giá trị "${valueText}" khớp option "${matched}" qua fallback bỏ khoảng trắng — kiểm tra lại có đúng ý muốn không.`
          );
        }
      } else {
        const msg = `Field "${label}": giá trị "${valueText}" không khớp option nào (options có: [${Array.from(meta.optionsByNormalized.values()).join(", ")}])`;
        if (label === "Brand" || label === "Năm") {
          throw new Error(msg);
        }
        warnings.push(msg + " — đã bỏ qua field này.");
      }
      continue;
    }

    out[fieldName] = value == null ? "" : typeof value === "string" ? value : String(value);
  }

  return out;
}

export interface SheetsAndMonthsPreview {
  sheets: string[];
  months: string[]; // vd ["Tháng 7", "Tháng 8", "Tháng 9"], đã sắp theo số tháng tăng dần
  sheetMonths: Record<string, string[]>;
  recordEstimate: number;
}

/** Đọc nhanh file Excel, liệt kê tên các sheet và các nhãn "Tháng X" tìm thấy trong từng sheet.
 * Dùng để UI hiển thị checkbox và nhãn tháng theo từng sheet riêng trước khi import thật sự.
 * Không ghi gì vào Lark Base ở bước này. */
export async function listSheetsAndMonthsAction(formData: FormData): Promise<ActionResult<SheetsAndMonthsPreview>> {
  try {
    const file = formData.get("file") as File | null;
    if (!file) return { success: false, message: "Chưa chọn file." };

    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: "buffer" });

    const monthSet = new Set<string>();
    const sheetMonths: Record<string, string[]> = {};
    let recordEstimate = 0;

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const range = XLSX.utils.decode_range(sheet["!ref"] || "A1");
      const perSheetMonthSet = new Set<string>();
      // Quét thêm tháng nằm trong TIÊU ĐỀ KHỐI (layout Brand-theo-cột không có ô "Tháng X" rời)
      const tgdBlocksForMonthScan = findAllTgdBlocksXLSX(sheet, range.e.r, range.e.c + 1);
      for (const block of tgdBlocksForMonthScan) {
        const monthFromTitle = extractMonthFromText(block.titleText);
        if (monthFromTitle) {
          perSheetMonthSet.add(monthFromTitle);
          monthSet.add(monthFromTitle);
        }
      }
      for (let row = 0; row <= range.e.r; row++) {
        for (let col = 0; col <= range.e.c; col++) {
          const val = String(getMergedCellValueXLSX(sheet, row, col) ?? "").trim();
          if (/^tháng\s*\d+$/i.test(val)) {
            perSheetMonthSet.add(val);
            monthSet.add(val);
          }
        }
      }

      const monthsForSheet = Array.from(perSheetMonthSet).sort((a, b) => {
        const na = parseInt(a.match(/\d+/)?.[0] ?? "0", 10);
        const nb = parseInt(b.match(/\d+/)?.[0] ?? "0", 10);
        return na - nb;
      });
      sheetMonths[sheetName] = monthsForSheet;

      const headerSections = findAllHeaderSectionsXLSX(sheet, range.e.r, range.e.c + 1);
      for (const headerSection of headerSections) {
        const nextSectionRow = headerSections
          .map((section) => section.row)
          .filter((row) => row > headerSection.row)
          .sort((a, b) => a - b)[0];
        const dataEndRow = nextSectionRow !== undefined ? nextSectionRow - 1 : range.e.r;
        for (let row = headerSection.row + 2; row <= dataEndRow; row++) {
          const maNganSach = normalizeImportedBudgetCode(
            String(getMergedCellValueXLSX(sheet, row, headerSection.colMaNganSach) ?? "")
          );
          if (maNganSach) {
            recordEstimate++;
          }
        }
      }
    }

    const months = Array.from(monthSet).sort((a, b) => {
      const na = parseInt(a.match(/\d+/)?.[0] ?? "0", 10);
      const nb = parseInt(b.match(/\d+/)?.[0] ?? "0", 10);
      return na - nb;
    });

    return { success: true, data: { sheets: workbook.SheetNames, months, sheetMonths, recordEstimate } };
  } catch (err: any) {
    return { success: false, message: err.message || "Không đọc được file Excel." };
  }
}

export interface TgdImportRowResult {
  sheetName: string;
  brand: string;
  quarter: string;
  hangMuc: string;
  maNganSach: string;
  thang: string;
  soTien: number;
  action: "created" | "updated" | "skipped";
  reason?: string;
}

function normalizeImportedBudgetCode(
  code: string,
  sourceCodes?: Set<string>,
  sourceCodesWithAmount?: Set<string>
): string {
  const normalized = normalizeBudgetCodeForComparison(code);
  const parts = normalized.split("-").filter(Boolean);
  if (parts.length === 0) return "";

  if (sourceCodes && parts.length === 1) {
    const hasLevel3Child = hasImportedBudgetLevel3Child(normalized, sourceCodes);
    const hasLevel2Child = hasImportedBudgetLevel2Child(normalized, sourceCodes);
    const hasLevel2ChildWithAmount = hasImportedBudgetDirectLevel2ChildWithAmount(
      normalized,
      sourceCodes,
      sourceCodesWithAmount
    );

    // Rule nghiệp vụ:
    // - mã cấp 1 có mã con thì không chuyển tiền của nó vào mã lá cấp 3.
    // - mã cấp 2 chưa có cấp 3 có thể tạo mã lá giả cấp 3 cho chính nó.
    // - không có mã con thì giữ nguyên mã nguồn duy nhất.
    if (normalized === "PCN001" && sourceCodesWithAmount?.has(normalized) && hasLevel2ChildWithAmount) {
      const paidLevel2Child = Array.from(sourceCodes).find((sourceCode) => {
        const childPath = getImportedBudgetCodePath(sourceCode);
        return childPath.length === 2 && childPath[0] === normalized && sourceCodesWithAmount.has(sourceCode);
      });
      if (paidLevel2Child) return `${paidLevel2Child}-00`;
    }
    if (sourceCodesWithAmount?.has(normalized) && !hasLevel2ChildWithAmount && hasLevel2Child) {
      return `${normalized}-00-00`;
    }
    if (hasLevel3Child || hasLevel2Child) return "";
    return normalized;
  }

  if (sourceCodes && parts.length === 2) {
    // Dạng nén như OFF001-0201 đã là mã cấp 3: 02 (cấp 2) + 01 (cấp 3).
    if (parts[1].length > 2) return normalized;

    if (
      normalized.startsWith("PCN001-") &&
      sourceCodesWithAmount?.has(normalized) &&
      sourceCodesWithAmount.has("PCN001")
    ) return "";

    const hasLevel3ChildWithAmount = hasImportedBudgetLevel3Child(
      normalized,
      sourceCodes,
      sourceCodesWithAmount
    );
    // Chỉ bỏ qua mã cấp 2 khi mã cấp 3 tương ứng đã có số tiền.
    // Nếu cấp 3 trống hoặc bằng 0 thì vẫn tạo mã lá giả để giữ tiền cấp 2.
    if (hasLevel3ChildWithAmount) return "";
    return `${normalized}-00`;
  }

  return normalized;
}

function parseMoneyValue(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value === undefined || value === null || value === "") return 0;

  const cleaned = String(value).trim();
  if (!cleaned) return 0;

  const normalized = cleaned.replace(/[^0-9,.-]/g, "");
  if (!normalized) return 0;

  const dotCount = (normalized.match(/\./g) ?? []).length;
  const commaCount = (normalized.match(/,/g) ?? []).length;
  let compact: string;

  if (dotCount > 0 && commaCount > 0) {
    // Khi có cả hai dấu, dấu xuất hiện sau cùng là dấu thập phân.
    const decimalSeparator = normalized.lastIndexOf(".") > normalized.lastIndexOf(",") ? "." : ",";
    const thousandsSeparator = decimalSeparator === "." ? "," : ".";
    compact = normalized
      .replaceAll(thousandsSeparator, "")
      .replace(decimalSeparator, ".");
  } else {
    const separator = dotCount > 0 ? "." : ",";
    const separatorCount = dotCount + commaCount;
    const fractionLength = normalized.length - normalized.lastIndexOf(separator) - 1;
    const isThousandsFormat = separatorCount > 1 || fractionLength === 3;
    compact = isThousandsFormat
      ? normalized.replaceAll(separator, "")
      : normalized.replace(separator, ".");
  }

  const number = Number(compact);
  return Number.isFinite(number) ? number : 0;
}

function normalizeBudgetCodeForComparison(code: string): string {
  return code.trim().replace(/[_.\/\s-]+/g, "-").replace(/^-|-$/g, "");
}

function hasImportedBudgetLevel3Child(
  code: string,
  sourceCodes: Set<string>,
  sourceCodesWithAmount?: Set<string>
): boolean {
  const parentPath = getImportedBudgetCodePath(code);
  return Array.from(sourceCodes).some((sourceCode) => {
    const childPath = getImportedBudgetCodePath(sourceCode);
    return (
      childPath.length >= 3 &&
      childPath.length > parentPath.length &&
      parentPath.every((part, index) => childPath[index] === part) &&
      (!sourceCodesWithAmount || sourceCodesWithAmount.has(sourceCode))
    );
  });
}

function hasImportedBudgetLevel2Child(
  code: string,
  sourceCodes: Set<string>,
  sourceCodesWithAmount?: Set<string>
): boolean {
  const parentPath = getImportedBudgetCodePath(code);
  return Array.from(sourceCodes).some((sourceCode) => {
    const childPath = getImportedBudgetCodePath(sourceCode);
    return (
      childPath.length >= 2 &&
      childPath.length > parentPath.length &&
      parentPath.every((part, index) => childPath[index] === part) &&
      (!sourceCodesWithAmount || sourceCodesWithAmount.has(sourceCode))
    );
  });
}

function hasImportedBudgetDirectLevel2ChildWithAmount(
  code: string,
  sourceCodes: Set<string>,
  sourceCodesWithAmount?: Set<string>
): boolean {
  return Array.from(sourceCodes).some((sourceCode) => {
    const childPath = getImportedBudgetCodePath(sourceCode);
    return childPath.length === 2 && childPath[0] === code && sourceCodesWithAmount?.has(sourceCode) === true;
  });
}

function getImportedBudgetCodePath(code: string): string[] {
  const parts = code.split("-").filter(Boolean);
  if (parts.length <= 1) return [code];
  if (parts.length > 2) return parts.map((_, index) => parts.slice(0, index + 1).join("-"));

  const [root, suffix] = parts;
  const path = [root];
  for (let length = 2; length <= suffix.length; length += 2) {
    path.push(`${root}-${suffix.slice(0, length)}`);
  }
  return path;
}

/** Thông tin chẩn đoán cho từng sheet — trả về kèm kết quả import để người dùng
 * tự thấy ngay trên UI vì sao 1 sheet không import được dòng nào, không cần xem log server. */
export interface SheetDebugInfo {
  sheetName: string;
  brandAnchorsFound: string[]; // giá trị Brand tìm được (kể cả từ fallback B1)
  quarterAnchorsFound: string[]; // giá trị Quý tìm được (kể cả từ fallback B2)
  headerSectionsFound: number; // số hàng có cả "Hạng mục" + "Mã ngân sách"
  headerSectionsDetail: string[]; // "row=5, colHangMục=2, colMaNganSach=3"
  tgdBlocksFound: number; // số khối "TGĐ DUYỆT NGÂN SÁCH..."
  tgdBlockTitles: string[];
  monthColsPerBlock: string[]; // vd "Q3/2026 @row12: Tháng 7, Tháng 8"
  dataPreview: string[]; // preview vài dòng thô quanh dataStartRow, để soi lệch cột/hàng
  dataRowsScanned: number; // tổng số dòng có Mã ngân sách khác rỗng, gộp mọi khối
  note: string;
}


const batchId = randomUUID();
export async function importTgdBudgetExcelAction(
  formData: FormData
): Promise<
  ActionResult<{
    results: TgdImportRowResult[];
    created: number;
    updated: number;
    skipped: number;
    batchId: string;
    debug: SheetDebugInfo[];
  }>
> {
  try {
    const file = formData.get("file") as File | null;
    if (!file) return { success: false, message: "Chưa chọn file." };

    const namOverride = String(formData.get("namGhiDe") || "").trim(); // vd "2026", chỉ dùng cho layout Brand-theo-cột
    const loaiNganSach = String(formData.get("loaiNganSach") || "");
    const isTradeBudget = loaiNganSach.trim() === "Ngân sách Trade";
    const loaiDeXuat = String(formData.get("loaiDeXuat") || "");
    const lanDeXuat = String(formData.get("lanDeXuat") || ""); // 👈 thêm dòng này
    // Danh sách sheet/tháng người dùng chọn để import (JSON string array).
    // Nếu không truyền (undefined) -> import TẤT CẢ sheet/tháng, giữ tương thích ngược.
    const selectedSheetsRaw = formData.get("selectedSheets");
    const selectedMonthsRaw = formData.get("selectedMonths");
    const selectedSheets: string[] | null = selectedSheetsRaw ? JSON.parse(String(selectedSheetsRaw)) : null;
    const selectedMonths: string[] | null = selectedMonthsRaw ? JSON.parse(String(selectedMonthsRaw)) : null;

    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sourceBudgetCodes = new Set<string>();
    const sourceBudgetCodesWithAmountByMonth = new Map<string, Set<string>>();
    for (const sheetName of workbook.SheetNames) {
      if (selectedSheets && !selectedSheets.includes(sheetName)) continue;
      const sheet = workbook.Sheets[sheetName];
      const range = XLSX.utils.decode_range(sheet["!ref"] || "A1");
      const headerSections = findAllHeaderSectionsXLSX(sheet, range.e.r, range.e.c + 1);
      const tgdBlocks = findAllTgdBlocksXLSX(sheet, range.e.r, range.e.c + 1);
      for (const headerSection of headerSections) {
        const nextSectionRow = headerSections
          .map((section) => section.row)
          .filter((row) => row > headerSection.row)
          .sort((a, b) => a - b)[0];
        const dataEndRow = nextSectionRow !== undefined ? nextSectionRow - 1 : range.e.r;
        const amountColumns = new Set<number>();
        const amountColumnMonths = new Map<number, string[]>();
        for (const block of tgdBlocks) {
          const nearestHeader = findNearestHeaderSection(headerSections, block.row);
          if (nearestHeader?.row !== headerSection.row) continue;

          const subHeaderRow = headerSection.row + 1;
          let hasMonthColumns = false;
          for (let col = block.col; col < block.col + 8; col++) {
            const value = String(getMergedCellValueXLSX(sheet, subHeaderRow, col) ?? "").trim();
            if (/^tháng\s*\d+$/i.test(value)) {
              hasMonthColumns = true;
              if (!selectedMonths || selectedMonths.includes(value)) {
                amountColumns.add(col);
                const months = amountColumnMonths.get(col) ?? [];
                months.push(value);
                amountColumnMonths.set(col, months);
              }
            }
          }

          if (!hasMonthColumns) {
            const blockEnd = block.colEnd > block.col + 1 ? block.colEnd : range.e.c + 1;
            for (const candidateRow of [headerSection.row, block.row + 1, block.row + 2, subHeaderRow]) {
              for (const brandColumn of findBrandColumnsXLSX(sheet, candidateRow, block.col, blockEnd)) {
                amountColumns.add(brandColumn.col);
                const monthFromTitle = extractMonthFromText(block.titleText);
                if (monthFromTitle) {
                  const months = amountColumnMonths.get(brandColumn.col) ?? [];
                  months.push(monthFromTitle);
                  amountColumnMonths.set(brandColumn.col, months);
                }
              }
            }
          }
        }

        for (let row = headerSection.row + 1; row <= dataEndRow; row++) {
          const code = normalizeBudgetCodeForComparison(
            String(getMergedCellValueXLSX(sheet, row, headerSection.colMaNganSach) ?? "")
          );
          if (code) {
            sourceBudgetCodes.add(code);
            for (const col of amountColumns) {
              const rawValue = getMergedCellValueXLSX(sheet, row, col);
              if (parseMoneyValue(rawValue) > 0) {
                for (const month of amountColumnMonths.get(col) ?? []) {
                  const monthKey = getImportMonthKey(month);
                  const codes = sourceBudgetCodesWithAmountByMonth.get(monthKey) ?? new Set<string>();
                  codes.add(code);
                  sourceBudgetCodesWithAmountByMonth.set(monthKey, codes);
                }
              }
            }
          }
        }
      }
    }

    const client = getLarkClient();
    const F = await buildFieldNameResolver(client);
    const Fopt = await buildOptionalFieldNameResolver(client);
    const khoanNganSachField = Fopt("Khoản ngân sách");
    const lanDeXuatField = Fopt("Lần đề xuất"); // 👈 thêm dòng này — đổi tên cho khớp đúng field thật trong Base nếu khác
    const allFieldsMeta = await client.listFields();
    const fieldMetaMap = buildFieldMetaMap(allFieldsMeta);
    const fieldTypeMap = new Map<string, number>(
      allFieldsMeta.map((f) => [f.field_name, f.type])
    );
    const fieldNameToLabel = new Map<string, string>([
      [F("Mã ngân sách"), "Mã ngân sách"],
      [F("Hạng mục"), "Hạng mục"],
      [F("Brand"), "Brand"],
      [F("Năm"), "Năm"],
      [F("Số tiền TGĐ duyệt"), "Số tiền TGĐ duyệt"],
    ]);

    const importWarnings: string[] = [];

    const batchId = randomUUID();
    const results: TgdImportRowResult[] = [];
    const debug: SheetDebugInfo[] = [];
    const syntheticRecordTotals = new Map<string, { recordId: string; total: number }>();
    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const sheetName of workbook.SheetNames) {
      if (selectedSheets && !selectedSheets.includes(sheetName)) continue; // sheet không được chọn -> bỏ qua

      const sheet = workbook.Sheets[sheetName];
      const range = XLSX.utils.decode_range(sheet["!ref"] || "A1");
      const maxRow = range.e.r;
      const maxCol = range.e.c;

      const brandAnchors = findAllLabelAnchors(sheet, /^brand\s*:?$/i, maxRow, maxCol + 1);
      const quarterAnchors = findAllLabelAnchors(sheet, /^qu[ýy]\s*:?$/i, maxRow, maxCol + 1);

      // FIX: fallback về cấu trúc file cũ (B1 = Brand, B2 = Quý, KHÔNG có nhãn tường minh).
      // Nếu không quét được nhãn "Brand:"/"Quý:" nào trong sheet, đọc trực tiếp ô B1/B2
      // (row 0, col 1 / row 1, col 1) làm anchor mặc định cho toàn sheet.
      if (brandAnchors.length === 0) {
        const b1 = getMergedCellValueXLSX(sheet, 0, 1);
        if (b1 !== undefined && b1 !== null && String(b1).trim() !== "") {
          brandAnchors.push({ row: -1, col: 1, value: String(b1).trim() });
        }
      }
      if (quarterAnchors.length === 0) {
        const b2 = getMergedCellValueXLSX(sheet, 1, 1);
        if (b2 !== undefined && b2 !== null && String(b2).trim() !== "") {
          quarterAnchors.push({ row: -1, col: 1, value: String(b2).trim() });
        }
      }

      const headerSections = findAllHeaderSectionsXLSX(sheet, maxRow, maxCol + 1);
      const tgdBlocks = findAllTgdBlocksXLSX(sheet, maxRow, maxCol + 1);

      const sheetDebug: SheetDebugInfo = {
        sheetName,
        brandAnchorsFound: brandAnchors.map((a) => a.value),
        quarterAnchorsFound: quarterAnchors.map((a) => a.value),
        headerSectionsFound: headerSections.length,
        headerSectionsDetail: headerSections.map(
          (s) => `row=${s.row}, colHangMục=${s.colHangMuc}, colMaNganSach=${s.colMaNganSach}`
        ),
        tgdBlocksFound: tgdBlocks.length,
        tgdBlockTitles: tgdBlocks.map((b) => b.titleText),
        monthColsPerBlock: [],
        dataPreview: [],
        dataRowsScanned: 0,
        note: "",
      };

      if (headerSections.length === 0 && tgdBlocks.length === 0) {
        sheetDebug.note =
          "Không tìm thấy header 'Hạng mục'/'Mã ngân sách' VÀ không tìm thấy khối 'TGĐ DUYỆT NGÂN SÁCH'. Kiểm tra lại tên cột/tiêu đề có đúng chính tả không (có thể khác dấu, viết hoa/thường, hoặc nằm ngoài phạm vi quét).";
      } else if (headerSections.length === 0) {
        sheetDebug.note =
          "Tìm thấy khối 'TGĐ DUYỆT NGÂN SÁCH' nhưng KHÔNG tìm thấy hàng header có cả 'Hạng mục' và 'Mã ngân sách'. Kiểm tra lại tên 2 cột này trong file có khớp chính xác không.";
      } else if (tgdBlocks.length === 0) {
        sheetDebug.note =
          "Tìm thấy header 'Hạng mục'/'Mã ngân sách' nhưng KHÔNG tìm thấy khối tiêu đề bắt đầu bằng 'TGĐ DUYỆT NGÂN SÁCH'. Kiểm tra lại chính tả tiêu đề khối trong file.";
      }

      if (headerSections.length === 0 || tgdBlocks.length === 0) {
        debug.push(sheetDebug);
        continue; // sheet không đúng cấu trúc mong đợi
      }

      let sheetHadValidBlock = false;

      for (const block of tgdBlocks) {
        const headerSection = findNearestHeaderSection(headerSections, block.row);
        if (!headerSection) {
          sheetDebug.monthColsPerBlock.push(`"${block.titleText}" @row${block.row}: BỎ QUA - không tìm thấy header section gần nhất`);
          continue;
        }

        const subHeaderRow = headerSection.row + 1;

        // Kiểm tra subHeaderRow có phải dòng "Tháng X" không -> quyết định layout.
        // Layout cũ: subHeaderRow chứa các ô "Tháng X" (Brand cố định, Tháng theo cột).
        // Layout mới: subHeaderRow KHÔNG chứa "Tháng X" -> Brand theo cột, 1 khối = 1 tháng lấy từ tiêu đề.
        let subHeaderHasMonthCols = false;
        for (let col = block.col; col < block.col + 8; col++) {
          const val = normalizeText(getMergedCellValueXLSX(sheet, subHeaderRow, col));
          if (/^tháng\s*\d+$/.test(val)) {
            subHeaderHasMonthCols = true;
            break;
          }
        }

        if (subHeaderHasMonthCols) {
          // ══════════════════ LAYOUT CŨ: Tháng theo cột ══════════════════
          const brandAnchor = findNearestAnchorAbove(brandAnchors, block.row);
          const brand = isTradeBudget ? "N/A" : brandAnchor?.value ?? "";
          if (!brand) {
            sheetDebug.monthColsPerBlock.push(`"${block.titleText}" @row${block.row}: BỎ QUA - không xác định được Brand`);
            continue;
          }

          const quarterFromTitle = extractQuarterFromText(block.titleText);
          const quarterAnchor = findNearestAnchorAbove(quarterAnchors, block.row);
          const quarterRaw = quarterFromTitle ?? quarterAnchor?.value ?? "";
          if (!quarterRaw) {
            sheetDebug.monthColsPerBlock.push(`"${block.titleText}" @row${block.row}: BỎ QUA - không xác định được Quý (brand="${brand}")`);
            continue;
          }

          const { nam } = parseQuarterYear(quarterRaw);

          const dataStartRow = subHeaderRow + 1;
          const nextSectionRow = headerSections
            .map((s) => s.row)
            .filter((r) => r > headerSection.row)
            .sort((a, b) => a - b)[0];
          const dataEndRow = nextSectionRow !== undefined ? nextSectionRow - 1 : maxRow;

          const monthCols: { label: string; col: number }[] = [];
          let sawAnyMonth = false;
          for (let col = block.col; col < block.col + 8; col++) {
            const val = String(getMergedCellValueXLSX(sheet, subHeaderRow, col) ?? "").trim();
            if (/^tháng\s*\d+$/i.test(val)) {
              sawAnyMonth = true;
              if (!selectedMonths || selectedMonths.includes(val)) monthCols.push({ label: val, col });
            } else if (normalizeText(val) === "note" && sawAnyMonth) {
              break;
            }
          }

          sheetDebug.monthColsPerBlock.push(
            `"${block.titleText}" @row${block.row}: [Tháng-theo-cột] brand="${brand}", quý="${quarterRaw}", cột tháng=[${monthCols.map((m) => m.label).join(", ") || "KHÔNG CÓ"}]`
          );
          if (monthCols.length === 0) continue;
          sheetHadValidBlock = true;

          // Preview 5 dòng thô đầu tiên để soi lệch cột/hàng
          if (sheetDebug.dataPreview.length === 0) {
            for (let previewRow = dataStartRow; previewRow <= Math.min(dataStartRow + 5, dataEndRow); previewRow++) {
              const rawMa = getMergedCellValueXLSX(sheet, previewRow, headerSection.colMaNganSach);
              const rawHangMuc = getMergedCellValueXLSX(sheet, previewRow, headerSection.colHangMuc);
              const rawMonth0 = monthCols[0] ? getMergedCellValueXLSX(sheet, previewRow, monthCols[0].col) : undefined;
              sheetDebug.dataPreview.push(
                `row${previewRow}: Hạng mục(col${headerSection.colHangMuc})="${rawHangMuc ?? "∅"}", Mã ngân sách(col${headerSection.colMaNganSach})="${rawMa ?? "∅"}", ${monthCols[0]?.label ?? "?"}(col${monthCols[0]?.col ?? "?"})="${rawMonth0 ?? "∅"}"`
              );
            }
          }

          for (let row = dataStartRow; row <= dataEndRow; row++) {
            const sourceCode = normalizeBudgetCodeForComparison(
              String(getMergedCellValueXLSX(sheet, row, headerSection.colMaNganSach) ?? "")
            );
            sheetDebug.dataRowsScanned++;
            const hangMuc = String(getMergedCellValueXLSX(sheet, row, headerSection.colHangMuc) ?? "").trim();

            for (const { label: thangLabel, col: monthCol } of monthCols) {
              const rawAmount = getMergedCellValueXLSX(sheet, row, monthCol);
              const soTien = parseMoneyValue(rawAmount);
              if (rawAmount === undefined || rawAmount === null || rawAmount === "" || soTien === 0) continue;
              const maNganSach = normalizeImportedBudgetCode(
                sourceCode,
                sourceBudgetCodes,
                sourceBudgetCodesWithAmountByMonth.get(getImportMonthKey(thangLabel))
              );
              if (!maNganSach) continue;

              const isSyntheticCode = maNganSach !== sourceCode && maNganSach.endsWith("-00");
              const syntheticSourceCode = isSyntheticCode ? maNganSach.slice(0, -3) : "";
              if (
                isSyntheticCode &&
                !getImportedBudgetCodePath(syntheticSourceCode).includes(sourceCode)
              ) continue;

              const syntheticKey = maNganSach !== sourceCode
                ? JSON.stringify([brand, quarterRaw, nam, thangLabel, maNganSach, loaiNganSach, loaiDeXuat, lanDeXuat])
                : "";
              const existingSynthetic = syntheticKey ? syntheticRecordTotals.get(syntheticKey) : undefined;
              if (existingSynthetic) {
                existingSynthetic.total += soTien;
                await client.updateRecord(
                  existingSynthetic.recordId,
                  { [F("Số tiền TGĐ duyệt")]: existingSynthetic.total },
                  fieldTypeMap
                );
                updated++;
                results.push({ sheetName, brand, quarter: quarterRaw, hangMuc, maNganSach, thang: thangLabel, soTien, action: "updated" });
                continue;
              }

              const fieldsToSend: Record<string, unknown> = {
                [F("Brand")]: brand,
                [F("Quý ngân sách")]: quarterRaw,
                [F("Năm")]: nam,
                [F("Tháng ngân sách")]: thangLabel,
                [F("Mã ngân sách")]: maNganSach,
                [F("Số tiền TGĐ duyệt")]: soTien,
                ...(loaiNganSach ? { [F("Loại ngân sách")]: loaiNganSach } : {}),
                ...(loaiDeXuat ? { [F("Loại đề xuất")]: loaiDeXuat } : {}),
                ...(lanDeXuatField && lanDeXuat ? { [lanDeXuatField]: lanDeXuat } : {}), // 👈 thêm dòng này

              };
              const coercedFields = buildFieldsBySmartType(
                fieldsToSend,
                fieldMetaMap,
                fieldNameToLabel,
                importWarnings,
                fieldTypeMap
              );
              try {
                const newRecord = await client.createRecord(coercedFields);
                created++;
                if (syntheticKey) syntheticRecordTotals.set(syntheticKey, { recordId: newRecord.record_id, total: soTien });
                results.push({ sheetName, brand, quarter: quarterRaw, hangMuc, maNganSach, thang: thangLabel, soTien, action: "created" });
                await appendAuditLog({
                  timestamp: new Date().toISOString(),
                  batchId,
                  wasCreated: true,
                  action: "import",
                  recordId: newRecord.record_id,
                  brand,
                  quy: quarterRaw,
                  nam,
                  thang: thangLabel,
                  maNganSach,
                  hangMuc,
                  soTienLanNay: soTien,
                  giaTriTruoc: 0,
                  giaTriSau: soTien,
                });
              } catch (rowErr: any) {
                skipped++;
                // Log đầy đủ để xác định CHÍNH XÁC field nào Lark từ chối, không cần đoán.
                console.error(
                  `[Import lỗi] sheet="${sheetName}" row=${row} maNganSach="${maNganSach}" brand="${brand}"`,
                  "\nFields đã gửi:", JSON.stringify(coercedFields, null, 2),
                  "\nLỗi Lark trả về:", rowErr.message
                );
                results.push({
                  sheetName,
                  brand,
                  quarter: quarterRaw,
                  hangMuc,
                  maNganSach,
                  thang: thangLabel,
                  soTien,
                  action: "skipped",
                  reason: rowErr.message || "Lỗi không xác định khi ghi record",
                });
              }
            }
          }
        } else {
          // ══════════════════ LAYOUT MỚI: Brand theo cột ══════════════════
          // 1 khối = 1 tháng, lấy tháng từ CHÍNH tiêu đề khối (vd "...THÁNG 9").
          const monthLabel = extractMonthFromText(block.titleText);
          if (!monthLabel) {
            sheetDebug.monthColsPerBlock.push(`"${block.titleText}" @row${block.row}: BỎ QUA - không đọc được tháng từ tiêu đề khối`);
            continue;
          }
          if (selectedMonths && !selectedMonths.includes(monthLabel)) continue; // tháng không được chọn

          const yearFromTitle = extractYearFromMonthText(block.titleText);
          const namBrandLayout = yearFromTitle || namOverride || String(new Date().getFullYear());
          const quarterBrandLayout = `${monthLabelToQuarter(monthLabel)}/${namBrandLayout}`;

          // SAU:
          // SAU:
          // Dùng cột bắt đầu của CHÍNH tiêu đề "TGĐ DUYỆT NGÂN SÁCH..." (block.col) làm mốc,
          // vì sheet có thể có thêm khối "MKT ĐỀ XUẤT NGÂN SÁCH..." nằm bên trái dùng chung
          // hàng Hạng mục/Mã ngân sách/Khoản ngân sách — nếu quét từ ngay sau cột "Mã ngân sách"
          // sẽ lẫn luôn số liệu đề xuất (sai) trước khi tới đúng khối TGĐ duyệt.
          // SAU:
          const startCol = block.col;
          const approvalLabelRow = findApprovalLabelRowBelow(sheet, block.row, 5, maxCol + 1);

          // Chặn cứng vùng quét Brand tại đúng cột bắt đầu của khối TGĐ kế tiếp (nếu có) —
          // tránh lấn sang Brand/NOTE của tháng sau khi 2 khối nằm liền kề, không đủ ô trống
          // để heuristic "3 ô trống liên tiếp" nhận biết điểm dừng.
          const nextBlockColBoundary = findNextBlockColBoundary(tgdBlocks, block);
          const brandScanEndCol =
            block.colEnd > block.col + 1
              ? block.colEnd
              : nextBlockColBoundary !== null
                ? nextBlockColBoundary
                : maxCol + 1;

          const dataStartRow = headerSection.row + 1;
          const nextSectionRow = headerSections
            .map((s) => s.row)
            .filter((r) => r > headerSection.row)
            .sort((a, b) => a - b)[0];
          const dataEndRow = nextSectionRow !== undefined ? nextSectionRow - 1 : maxRow;

          const brandHeaderRows = Array.from(
            new Set([
              ...(approvalLabelRow !== null ? [approvalLabelRow + 1] : []),
              headerSection.row,
              block.row + 1,
              block.row + 2,
              headerSection.row + 1,
              headerSection.row + 2,
            ])
          ).filter((row) => row >= 0 && row <= maxRow);
          let brandHeaderRow = headerSection.row;
          let brandColumns: { name: string; col: number }[] = [];
          for (const candidateRow of brandHeaderRows) {
            const candidateColumns = findBrandColumnsXLSX(sheet, candidateRow, startCol, brandScanEndCol);
            if (candidateColumns.length > 0) {
              brandHeaderRow = candidateRow;
              brandColumns = candidateColumns;
              break;
            }
          }
          if (brandColumns.length === 0) {
            const brandAnchor = findNearestAnchorAbove(brandAnchors, block.row);
            const numericColumns = findNumericColumnsXLSX(
              sheet,
              dataStartRow,
              dataEndRow,
              startCol,
              brandScanEndCol
            );
            if (brandAnchor && numericColumns.length === 1) {
              brandColumns = numericColumns.map((col) => ({ name: brandAnchor.value, col }));
            }
          }
          // Một số template có thêm dòng tiêu đề phụ (vd "Ngân sách BOOKING SẾP DUYỆT") nằm
          // GIỮA tiêu đề khối và hàng tên Brand thật -> tên Brand KHÔNG cùng hàng với header
          // "Hạng mục"/"Mã ngân sách". Ưu tiên tìm nhãn "sếp duyệt" ngay dưới tiêu đề khối;
          // nếu có, đọc tên Brand ở đúng hàng NGAY DƯỚI nhãn đó thay vì headerSection.row.


          sheetDebug.monthColsPerBlock.push(
            `"${block.titleText}" @row${block.row}: [Brand-theo-cột] tháng="${monthLabel}", quý="${quarterBrandLayout}", brand cols=[${brandColumns.map((b) => b.name).join(", ") || "KHÔNG CÓ"}]`
          );
          if (brandColumns.length === 0) continue;
          sheetHadValidBlock = true;

          const khoanNganSachColIdx = findColumnByLabelXLSX(sheet, headerSection.row, "khoản ngân sách", maxCol + 1);

          // Preview 5 dòng thô đầu tiên để soi lệch cột/hàng
          if (sheetDebug.dataPreview.length === 0) {
            for (let previewRow = dataStartRow; previewRow <= Math.min(dataStartRow + 5, dataEndRow); previewRow++) {
              const rawMa = getMergedCellValueXLSX(sheet, previewRow, headerSection.colMaNganSach);
              const rawHangMuc = getMergedCellValueXLSX(sheet, previewRow, headerSection.colHangMuc);
              const rawBrand0 = brandColumns[0] ? getMergedCellValueXLSX(sheet, previewRow, brandColumns[0].col) : undefined;
              sheetDebug.dataPreview.push(
                `row${previewRow}: Hạng mục(col${headerSection.colHangMuc})="${rawHangMuc ?? "∅"}", Mã ngân sách(col${headerSection.colMaNganSach})="${rawMa ?? "∅"}", ${brandColumns[0]?.name ?? "?"}(col${brandColumns[0]?.col ?? "?"})="${rawBrand0 ?? "∅"}"`
              );
            }
          }

          for (let row = dataStartRow; row <= dataEndRow; row++) {
            const sourceCode = normalizeBudgetCodeForComparison(
              String(getMergedCellValueXLSX(sheet, row, headerSection.colMaNganSach) ?? "")
            );
            sheetDebug.dataRowsScanned++;
            const hangMuc = String(getMergedCellValueXLSX(sheet, row, headerSection.colHangMuc) ?? "").trim();
            const khoanNganSach =
              khoanNganSachColIdx >= 0 ? String(getMergedCellValueXLSX(sheet, row, khoanNganSachColIdx) ?? "").trim() : "";

            for (const brandCol of brandColumns) {
              const rawAmount = getMergedCellValueXLSX(sheet, row, brandCol.col);
              const soTien = parseMoneyValue(rawAmount);
              if (rawAmount === undefined || rawAmount === null || rawAmount === "" || soTien === 0) continue;
              const maNganSach = normalizeImportedBudgetCode(
                sourceCode,
                sourceBudgetCodes,
                sourceBudgetCodesWithAmountByMonth.get(getImportMonthKey(monthLabel))
              );
              if (!maNganSach) continue;

              const isSyntheticCode = maNganSach !== sourceCode && maNganSach.endsWith("-00");
              const syntheticSourceCode = isSyntheticCode ? maNganSach.slice(0, -3) : "";
              if (
                isSyntheticCode &&
                !getImportedBudgetCodePath(syntheticSourceCode).includes(sourceCode)
              ) continue;

              const effectiveBrand = isTradeBudget ? "N/A" : brandCol.name;
              const syntheticKey = maNganSach !== sourceCode
                ? JSON.stringify([effectiveBrand, quarterBrandLayout, namBrandLayout, monthLabel, maNganSach, loaiNganSach, loaiDeXuat, lanDeXuat])
                : "";
              const existingSynthetic = syntheticKey ? syntheticRecordTotals.get(syntheticKey) : undefined;
              if (existingSynthetic) {
                existingSynthetic.total += soTien;
                await client.updateRecord(
                  existingSynthetic.recordId,
                  { [F("Số tiền TGĐ duyệt")]: existingSynthetic.total },
                  fieldTypeMap
                );
                updated++;
                results.push({
                  sheetName,
                  brand: effectiveBrand,
                  quarter: quarterBrandLayout,
                  hangMuc,
                  maNganSach,
                  thang: monthLabel,
                  soTien,
                  action: "updated",
                });
                continue;
              }

              const fieldsToSend: Record<string, unknown> = {
                [F("Brand")]: effectiveBrand,
                [F("Quý ngân sách")]: quarterBrandLayout,
                [F("Năm")]: namBrandLayout,
                [F("Tháng ngân sách")]: monthLabel,
                [F("Mã ngân sách")]: maNganSach,
                [F("Số tiền TGĐ duyệt")]: soTien,
                ...(khoanNganSachField && khoanNganSach ? { [khoanNganSachField]: khoanNganSach } : {}),
                ...(loaiNganSach ? { [F("Loại ngân sách")]: loaiNganSach } : {}),
                ...(loaiDeXuat ? { [F("Loại đề xuất")]: loaiDeXuat } : {}),
                ...(lanDeXuatField && lanDeXuat ? { [lanDeXuatField]: lanDeXuat } : {}), // 👈 thêm dòng này
              };
              const coercedFields = buildFieldsBySmartType(
                fieldsToSend,
                fieldMetaMap,
                fieldNameToLabel,
                importWarnings,
                fieldTypeMap
              ); try {
                const newRecord = await client.createRecord(coercedFields);
                created++;
                if (syntheticKey) syntheticRecordTotals.set(syntheticKey, { recordId: newRecord.record_id, total: soTien });
                results.push({
                  sheetName,
                  brand: effectiveBrand,
                  quarter: quarterBrandLayout,
                  hangMuc,
                  maNganSach,
                  thang: monthLabel,
                  soTien,
                  action: "created",
                });
                await appendAuditLog({
                  timestamp: new Date().toISOString(),
                  batchId,
                  wasCreated: true,
                  action: "import",
                  recordId: newRecord.record_id,
                  brand: isTradeBudget ? "N/A" : brandCol.name,
                  quy: quarterBrandLayout,
                  nam: namBrandLayout,
                  thang: monthLabel,
                  maNganSach,
                  hangMuc,
                  soTienLanNay: soTien,
                  giaTriTruoc: 0,
                  giaTriSau: soTien,
                });
              } catch (rowErr: any) {
                skipped++;
                // Log đầy đủ để xác định CHÍNH XÁC field nào Lark từ chối, không cần đoán.
                console.error(
                  `[Import lỗi] sheet="${sheetName}" row=${row} maNganSach="${maNganSach}" brand="${isTradeBudget ? "N/A" : brandCol.name}"`,
                  "\nFields đã gửi:", JSON.stringify(coercedFields, null, 2),
                  "\nLỗi Lark trả về:", rowErr.message
                );
                results.push({
                  sheetName,
                  brand: isTradeBudget ? "N/A" : brandCol.name,
                  quarter: quarterBrandLayout,
                  hangMuc,
                  maNganSach,
                  thang: monthLabel,
                  soTien,
                  action: "skipped",
                  reason: rowErr.message || "Lỗi không xác định khi ghi record",
                });
              }
            }
          }
        }
      }

      if (!sheetHadValidBlock && !sheetDebug.note) {
        sheetDebug.note =
          "Tìm thấy khối TGĐ và header, nhưng không có khối nào đủ điều kiện (thiếu Brand/Quý/Tháng hoặc không tìm thấy cột dữ liệu nào) — xem chi tiết từng khối ở trên.";
      }
      debug.push(sheetDebug);
    }

    if (importWarnings.length > 0) {
      console.warn("[Import cảnh báo SingleSelect không khớp]\n" + importWarnings.join("\n"));
    }

    return { success: true, data: { results, created, updated, skipped, batchId, debug } };
  } catch (err: any) {
    return { success: false, message: err.message || "Import thất bại." };
  }
}

// ─── TGĐ Duyệt Ngân sách: Duyệt thủ công (cộng dồn) ──────────────────────────

export interface ApproveBudgetItemInput {
  brand: string;
  quarter: string;
  thang: string;
  maNganSach: string;
  hangMuc?: string;
  khoanNganSach?: string;
  soTien: number;
  nguoiDuyet?: string;
  ghiChu?: string;
}

export interface ApproveBudgetItemOutput {
  recordId: string;
  oldValue: number;
  newValue: number;
  hangMuc?: string;
  khoanNganSach?: string;
}

export async function approveBudgetItemAction(
  input: ApproveBudgetItemInput
): Promise<ActionResult<ApproveBudgetItemOutput>> {
  try {
    const { quy, nam } = parseQuarterYear(input.quarter);
    const client = getLarkClient();
    const F = await buildFieldNameResolver(client);

    const allRecords: LarkRecord[] = [];
    let pageToken: string | undefined;
    do {
      const result = await client.listRecords({ pageSize: 100, pageToken });
      allRecords.push(...result.items);
      pageToken = result.hasMore ? result.pageToken : undefined;
    } while (pageToken);

    const matches = allRecords.filter((r) => {
      return (
        normalizeText(r.fields["Brand"]) === normalizeText(input.brand) &&
        normalizeText(r.fields["Quý ngân sách"]) === normalizeText(input.quarter) &&
        normalizeText(r.fields["Năm"]) === normalizeText(nam) &&
        normalizeText(r.fields["Tháng ngân sách"]) === normalizeText(input.thang) &&
        normalizeText(r.fields["Mã ngân sách"]) === normalizeText(input.maNganSach)
      );
    });

    if (matches.length === 0) {
      return {
        success: false,
        message: `Không tìm thấy record khớp Brand="${input.brand}", Quý="${input.quarter}", Tháng="${input.thang}", Mã ngân sách="${input.maNganSach}".`,
      };
    }
    if (matches.length > 1) {
      return {
        success: false,
        message: `Tìm thấy ${matches.length} record cùng khớp điều kiện — dữ liệu Base có thể bị trùng lặp.`,
      };
    }

    const record = matches[0];
    const oldValue = Number(record.fields["Số tiền TGĐ duyệt"]) || 0;
    const newValue = oldValue + input.soTien;

    await client.updateRecord(record.record_id, {
      [F("Số tiền TGĐ duyệt")]: newValue,
      [F("Thời điểm duyệt")]: Date.now(),
    });

    await appendAuditLog({
      timestamp: new Date().toISOString(),
      action: "approve",
      recordId: record.record_id,
      brand: input.brand,
      quy: input.quarter,
      nam,
      thang: input.thang,
      maNganSach: input.maNganSach,
      hangMuc: input.hangMuc ?? String(record.fields["Hạng mục"] ?? ""),
      khoanNganSach: input.khoanNganSach ?? String(record.fields["Khoản ngân sách"] ?? ""),
      soTienLanNay: input.soTien,
      giaTriTruoc: oldValue,
      giaTriSau: newValue,
      nguoiDuyet: input.nguoiDuyet,
      ghiChu: input.ghiChu,
    });

    return {
      success: true,
      data: {
        recordId: record.record_id,
        oldValue,
        newValue,
        hangMuc: String(record.fields["Hạng mục"] ?? ""),
        khoanNganSach: String(record.fields["Khoản ngân sách"] ?? ""),
      },
    };
  } catch (err: any) {
    return { success: false, message: err.message || "Duyệt ngân sách thất bại." };
  }
}

// ─── Batch import: liệt kê & hoàn tác ────────────────────────────────────────

export interface ImportBatchSummary {
  batchId: string;
  timestamp: string;
  totalRecords: number;
  created: number;
  updated: number;
}

export async function getRecentImportBatchesAction(): Promise<ActionResult<ImportBatchSummary[]>> {
  try {
    const raw = await fs.readFile(AUDIT_LOG_PATH, "utf-8");
    const entries: AuditLogEntry[] = JSON.parse(raw);

    const batches = new Map<string, ImportBatchSummary>();
    for (const e of entries) {
      if (e.action !== "import" || !e.batchId) continue;
      const existing = batches.get(e.batchId);
      if (!existing) {
        batches.set(e.batchId, {
          batchId: e.batchId,
          timestamp: e.timestamp,
          totalRecords: 1,
          created: e.wasCreated ? 1 : 0,
          updated: e.wasCreated ? 0 : 1,
        });
      } else {
        existing.totalRecords++;
        if (e.wasCreated) existing.created++;
        else existing.updated++;
      }
    }

    const result = Array.from(batches.values()).sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
    return { success: true, data: result };
  } catch {
    return { success: true, data: [] };
  }
}

export async function undoImportBatchAction(
  batchId: string
): Promise<ActionResult<{ deleted: number; reverted: number; failed: { recordId: string; reason: string }[] }>> {
  try {
    const raw = await fs.readFile(AUDIT_LOG_PATH, "utf-8");
    const entries: AuditLogEntry[] = JSON.parse(raw);

    const batchEntries = entries.filter((e) => e.batchId === batchId && e.action === "import");
    if (batchEntries.length === 0) {
      return { success: false, message: `Không tìm thấy batch import '${batchId}' trong audit log.` };
    }

    const client = getLarkClient();
    const F = await buildFieldNameResolver(client);

    let deleted = 0;
    let reverted = 0;
    const failed: { recordId: string; reason: string }[] = [];

    for (const entry of batchEntries) {
      if (!entry.recordId) continue;
      try {
        if (entry.wasCreated) {
          await client.deleteRecord(entry.recordId);
          deleted++;
        } else {
          await client.updateRecord(entry.recordId, {
            [F("Số tiền TGĐ duyệt")]: entry.giaTriTruoc,
          });
          reverted++;
        }
      } catch (err: any) {
        failed.push({ recordId: entry.recordId, reason: err.message || "Lỗi không xác định" });
      }
    }

    const failedRecordIds = new Set(failed.map((f) => f.recordId));
    const remaining = entries.filter(
      (e) => !(e.batchId === batchId && e.action === "import" && e.recordId && !failedRecordIds.has(e.recordId))
    );
    await fs.writeFile(AUDIT_LOG_PATH, JSON.stringify(remaining, null, 2), "utf-8");

    return { success: true, data: { deleted, reverted, failed } };
  } catch (err: any) {
    return { success: false, message: err.message || "Hoàn tác batch thất bại." };
  }
}



