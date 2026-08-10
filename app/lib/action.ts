"use server";

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
  const baseId = String(formData.get("baseId") || "");
  saveBaseProfile({
    baseId: baseId || undefined,
    name: String(formData.get("name") || ""),
    appId: String(formData.get("appId") || ""),
    appSecret: String(formData.get("appSecret") || ""),
    baseAppToken: String(formData.get("baseAppToken") || ""),
    apiBaseUrl: String(formData.get("apiBaseUrl") || ""),
  });
  return { success: true };
}

/** Thêm hoặc sửa 1 Table trong Base đang chọn. */
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
}): Promise<ActionResult<{ items: LarkRecord[]; hasMore: boolean; pageToken?: string; total: number }>> {
  try {
    const client = getLarkClient();
    const result = await client.listRecords(options);
    return { success: true, data: result };
  } catch (err: any) {
    return { success: false, message: err.message || "Lỗi không xác định" };
  }
}

export async function findDuplicateBudgetRecordsAction(): Promise<ActionResult<{ budgetName: string; records: LarkRecord[] }[]>> {
  try {
    const client = getLarkClient();
    const allRecords: LarkRecord[] = [];
    let pageToken: string | undefined;

    do {
      const result = await client.listRecords({ pageSize: 100, pageToken });
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
      const result = await client.listRecords({ pageSize: 100, pageToken });
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

function describeVideoMetricInput(input: string): { videoId: string; videoUrl: string; profileUrl: string } {
  const value = input.trim();
  if (!value) {
    throw new Error("Vui lòng nhập URL video TikTok hợp lệ.");
  }

  const videoMatch = value.match(/tiktok\.com\/(?:@[^/]+\/)?video\/([0-9]+)/i);
  if (videoMatch?.[1]) {
    const videoId = videoMatch[1];
    return {
      videoId,
      videoUrl: value,
      profileUrl: value,
    };
  }

  throw new Error("Định dạng URL video TikTok không hợp lệ. Ví dụ: https://www.tiktok.com/@username/video/1234567890123456789");
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

export async function fetchTiktokVideoMetricsAction(input: string): Promise<ActionResult<TiktokVideoMetrics>> {
  try {
    const { videoId, videoUrl } = describeVideoMetricInput(input);
    const retrievalTime = new Date().toISOString();
    const response = await fetch(videoUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
        Referer: "https://www.tiktok.com/",
      },
      redirect: "follow",
    });

    if (!response.ok) {
      throw new Error(`TikTok trả về trạng thái ${response.status} khi đọc video ${videoId}.`);
    }

    const html = await response.text();
    const hydration = lookupNestedScriptObject(html);
    const scope = hydration?.["__DEFAULT_SCOPE__"] ?? hydration ?? {};

    const candidates = [
      scope["webapp.video-detail"],
      scope["webapp.user-detail"],
      scope,
      deepFindValue(scope, "itemInfo"),
    ];

    const candidateVideo = candidates.find(Boolean) as Record<string, unknown> | undefined;
    const title = String(deepFindValue(candidateVideo, "title") ?? deepFindValue(candidateVideo, "desc") ?? "") || "—";
    const uploader = String(deepFindValue(candidateVideo, "authorName") ?? deepFindValue(candidateVideo, "uniqueId") ?? deepFindValue(candidateVideo, "nickname") ?? "") || "—";
    const viewCount = getNumber(deepFindValue(candidateVideo, "playCount") ?? deepFindValue(candidateVideo, "viewCount"));
    const commentCount = getNumber(deepFindValue(candidateVideo, "commentCount"));
    const collectionCount = getNumber(deepFindValue(candidateVideo, "collectCount") ?? deepFindValue(candidateVideo, "favoriteCount"));
    const likeCount = getNumber(deepFindValue(candidateVideo, "diggCount") ?? deepFindValue(candidateVideo, "likeCount"));
    const shareCount = getNumber(deepFindValue(candidateVideo, "shareCount"));
    const releaseTime = String(deepFindValue(candidateVideo, "createTime") ?? deepFindValue(candidateVideo, "releaseTime") ?? "") || "—";
    const totalInteractionCount = viewCount + commentCount + likeCount + shareCount + collectionCount;

    const payload: TiktokVideoMetrics = {
      title: String(title).trim() || "—",
      uploader: String(uploader).trim() || "—",
      viewCount,
      commentCount,
      collectionCount,
      likeCount,
      totalInteractionCount,
      releaseTime: String(releaseTime).trim() || "—",
      shareCount,
      dataRetrievalTime: retrievalTime,
      errorMessage: "",
    };

    return { success: true, data: toPlain(payload) };
  } catch (err: any) {
    return {
      success: false,
      message: err.message || "Lỗi không xác định khi đọc dữ liệu video TikTok.",
    };
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
  const match = quarterStr.trim().match(/^(Q\d)\s*\/\s*(\d{4})$/i);
  if (match) {
    return { quy: match[1].toUpperCase(), nam: match[2] };
  }
  return { quy: quarterStr.trim(), nam: "" };
}

/** Trích "Q3/2026" hoặc "Q3.2026" (hoặc biến thể có khoảng trắng) từ 1 đoạn text bất kỳ,
 * chuẩn hóa về dạng "Q3/2026". Trả null nếu không tìm thấy pattern quý/năm nào trong text. */
function extractQuarterFromText(text: string): string | null {
  const match = text.match(/q\s*(\d)\s*[./]\s*(\d{4})/i);
  if (!match) return null;
  return `Q${match[1]}/${match[2]}`;
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
): { row: number; col: number; titleText: string }[] {
  const blocks: { row: number; col: number; titleText: string }[] = [];
  for (let row = 0; row <= maxRow; row++) {
    for (let col = 0; col < maxCol; col++) {
      const raw = getDirectCellValueXLSX(sheet, row, col);
      const text = String(raw ?? "").trim();
      if (normalizeText(text).startsWith("tgđ duyệt ngân sách")) {
        blocks.push({ row, col, titleText: text });
      }
    }
  }
  return blocks;
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
          const maNganSach = String(getMergedCellValueXLSX(sheet, row, headerSection.colMaNganSach) ?? "").trim();
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

/**
 * Import file Excel vào Lark Base — LUÔN TẠO RECORD MỚI cho mỗi dòng hợp lệ
 * (không tìm/update record cũ, theo đúng nghiệp vụ: mỗi lần import = 1 lượt đề xuất mới).
 * Hỗ trợ file có nhiều Brand / nhiều Quý / nhiều khối TGĐ duyệt trong cùng 1 sheet
 * (xem chú thích thuật toán ở đầu file), ĐỒNG THỜI tương thích ngược với file đơn giản
 * kiểu cũ (B1 = Brand, B2 = Quý, không có nhãn tường minh).
 */
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

    const loaiNganSach = String(formData.get("loaiNganSach") || "");
    const loaiDeXuat = String(formData.get("loaiDeXuat") || "");

    // Danh sách sheet/tháng người dùng chọn để import (JSON string array).
    // Nếu không truyền (undefined) -> import TẤT CẢ sheet/tháng, giữ tương thích ngược.
    const selectedSheetsRaw = formData.get("selectedSheets");
    const selectedMonthsRaw = formData.get("selectedMonths");
    const selectedSheets: string[] | null = selectedSheetsRaw ? JSON.parse(String(selectedSheetsRaw)) : null;
    const selectedMonths: string[] | null = selectedMonthsRaw ? JSON.parse(String(selectedMonthsRaw)) : null;

    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: "buffer" });

    const client = getLarkClient();
    const F = await buildFieldNameResolver(client);
    const batchId = randomUUID();

    const results: TgdImportRowResult[] = [];
    const debug: SheetDebugInfo[] = [];
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
      // row: -1 đảm bảo anchor này luôn được coi là "ở trên" mọi khối TGĐ duyệt,
      // nên findNearestAnchorAbove vẫn chọn đúng khi sheet chỉ có 1 Brand/1 Quý.
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
        const brandAnchor = findNearestAnchorAbove(brandAnchors, block.row);
        const brand = brandAnchor?.value ?? "";
        if (!brand) {
          sheetDebug.monthColsPerBlock.push(`"${block.titleText}" @row${block.row}: BỎ QUA - không xác định được Brand`);
          continue; // không xác định được Brand cho khối này, bỏ qua an toàn
        }

        // Quý: ưu tiên lấy từ CHÍNH tiêu đề khối (đáng tin cậy nhất khi 1 sheet có nhiều khối/quý)
        const quarterFromTitle = extractQuarterFromText(block.titleText);
        const quarterAnchor = findNearestAnchorAbove(quarterAnchors, block.row);
        const quarterRaw = quarterFromTitle ?? quarterAnchor?.value ?? "";
        if (!quarterRaw) {
          sheetDebug.monthColsPerBlock.push(`"${block.titleText}" @row${block.row}: BỎ QUA - không xác định được Quý (brand="${brand}")`);
          continue;
        }

        const { nam } = parseQuarterYear(quarterRaw);

        const headerSection = findNearestHeaderSection(headerSections, block.row);
        if (!headerSection) {
          sheetDebug.monthColsPerBlock.push(`"${block.titleText}" @row${block.row}: BỎ QUA - không tìm thấy header section gần nhất`);
          continue;
        }

        const subHeaderRow = headerSection.row + 1;
        const dataStartRow = subHeaderRow + 1;

        // Giới hạn vùng dữ liệu của bảng này: từ dataStartRow tới NGAY TRƯỚC header section
        // kế tiếp (nếu có) — tránh lẫn dữ liệu của Brand/bảng khác xếp bên dưới cùng sheet.
        const nextSectionRow = headerSections
          .map((s) => s.row)
          .filter((r) => r > headerSection.row)
          .sort((a, b) => a - b)[0];
        const dataEndRow = nextSectionRow !== undefined ? nextSectionRow - 1 : maxRow;

        // Xác định các cột tháng thuộc khối này (thường 3 tháng/quý, quét tới khi gặp "Note")
        const monthCols: { label: string; col: number }[] = [];
        let sawAnyMonth = false;
        for (let col = block.col; col < block.col + 8; col++) {
          const val = String(getMergedCellValueXLSX(sheet, subHeaderRow, col) ?? "").trim();
          if (/^tháng\s*\d+$/i.test(val)) {
            sawAnyMonth = true;
            if (!selectedMonths || selectedMonths.includes(val)) {
              monthCols.push({ label: val, col });
            }
          } else if (normalizeText(val) === "note" && sawAnyMonth) {
            break;
          }
        }

        sheetDebug.monthColsPerBlock.push(
          `"${block.titleText}" @row${block.row}: brand="${brand}", quý="${quarterRaw}", subHeaderRow=${subHeaderRow}, cột tháng tìm thấy=[${monthCols.map((m) => m.label).join(", ") || "KHÔNG CÓ"}]`
        );

        if (monthCols.length === 0) continue;

        sheetHadValidBlock = true;

        // Preview 5 dòng thô đầu tiên từ dataStartRow, tại cột Mã ngân sách/Hạng mục
        // đã xác định — giúp thấy ngay dữ liệu thật có nằm đúng vị trí giả định không.
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
          const maNganSach = String(getMergedCellValueXLSX(sheet, row, headerSection.colMaNganSach) ?? "").trim();
          if (!maNganSach) continue;

          sheetDebug.dataRowsScanned++;
          const hangMuc = String(getMergedCellValueXLSX(sheet, row, headerSection.colHangMuc) ?? "").trim();

          for (const { label: thangLabel, col: monthCol } of monthCols) {
            const rawAmount = getMergedCellValueXLSX(sheet, row, monthCol);
            const soTien = typeof rawAmount === "number" ? rawAmount : 0;

            // Bỏ qua nếu ô trống HOẶC số tiền = 0 (chưa thực sự được duyệt), tránh tạo record rác
            if (rawAmount === undefined || rawAmount === null || rawAmount === "" || soTien === 0) {
              continue;
            }

            try {
              const newRecord = await client.createRecord({
                [F("Brand")]: brand,
                [F("Quý ngân sách")]: quarterRaw,
                [F("Năm")]: nam,
                [F("Tháng ngân sách")]: thangLabel,
                [F("Mã ngân sách")]: maNganSach,
                [F("Số tiền TGĐ duyệt")]: soTien,
                ...(loaiNganSach ? { [F("Loại ngân sách")]: loaiNganSach } : {}),
                ...(loaiDeXuat ? { [F("Loại đề xuất")]: loaiDeXuat } : {}),
              });
              created++;
              results.push({
                sheetName,
                brand,
                quarter: quarterRaw,
                hangMuc,
                maNganSach,
                thang: thangLabel,
                soTien,
                action: "created",
              });
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
      }

      if (!sheetHadValidBlock && !sheetDebug.note) {
        sheetDebug.note =
          "Tìm thấy khối TGĐ và header, nhưng không có khối nào đủ điều kiện (thiếu Brand/Quý hoặc không tìm thấy cột 'Tháng X' nào) — xem chi tiết từng khối ở trên.";
      }
      debug.push(sheetDebug);
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