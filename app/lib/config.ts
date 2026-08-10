import fs from "fs";
import path from "path";

export interface LarkTableProfile {
  id: string;
  name: string;
  tableId: string;
}

export interface LarkBaseCredentials {
  appId: string;
  appSecret: string;
  baseAppToken: string;
  apiBaseUrl: string;
}

export interface LarkConfig extends LarkBaseCredentials {
  tableId: string;
}

export interface LarkBaseProfile extends LarkBaseCredentials {
  id: string;
  name: string;
  tables: LarkTableProfile[];
}

export interface LarkConfigStorage {
  activeBaseId?: string;
  activeTableId?: string;
  bases: LarkBaseProfile[];
}

const CONFIG_PATH = path.join(process.cwd(), "data", "config.json");

function readOverrides(): any {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function normalizeTableProfile(table: Partial<LarkTableProfile> | undefined, fallbackName = "Bảng"): LarkTableProfile {
  const current = table ?? {};
  return {
    id: current.id || `table-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: current.name || fallbackName,
    tableId: current.tableId || "",
  };
}

/** Chuẩn hóa 1 base profile — TƯƠNG THÍCH NGƯỢC với format cũ (base có `tableId` trực
 * tiếp, không có mảng `tables`). Nếu gặp format cũ, tự động gói `tableId` cũ thành
 * 1 table đầu tiên trong mảng `tables`. */
function normalizeBaseProfile(base: any, fallbackName = "Base"): LarkBaseProfile {
  const current = base ?? {};

  let tables: LarkTableProfile[];
  if (Array.isArray(current.tables) && current.tables.length > 0) {
    tables = current.tables.map((t: any, i: number) => normalizeTableProfile(t, `Bảng ${i + 1}`));
  } else if (current.tableId) {
    // Format cũ: base có tableId trực tiếp -> gói thành 1 table
    tables = [normalizeTableProfile({ id: "table-1", name: "Bảng 1", tableId: current.tableId }, "Bảng 1")];
  } else {
    tables = [];
  }

  return {
    id: current.id || `base-${Date.now()}`,
    name: current.name || fallbackName,
    appId: current.appId || "",
    appSecret: current.appSecret || "",
    baseAppToken: current.baseAppToken || "",
    apiBaseUrl: current.apiBaseUrl || "https://open.larksuite.com/open-apis",
    tables,
  };
}

function createDefaultProfile(): LarkBaseProfile {
  const envTableId = process.env.LARK_TABLE_ID || "";
  return {
    id: "default",
    name: "Base mặc định",
    appId: process.env.LARK_APP_ID || "",
    appSecret: process.env.LARK_APP_SECRET || "",
    baseAppToken: process.env.LARK_BASE_APP_TOKEN || "",
    apiBaseUrl: process.env.LARK_API_BASE_URL || "https://open.larksuite.com/open-apis",
    tables: envTableId ? [{ id: "table-1", name: "Bảng 1", tableId: envTableId }] : [],
  };
}

export function getConfigStorage(): LarkConfigStorage {
  const raw = readOverrides();

  const legacyProfile = normalizeBaseProfile(
    {
      id: "default",
      name: "Base mặc định",
      appId: raw.appId || process.env.LARK_APP_ID || "",
      appSecret: raw.appSecret || process.env.LARK_APP_SECRET || "",
      baseAppToken: raw.baseAppToken || process.env.LARK_BASE_APP_TOKEN || "",
      apiBaseUrl: raw.apiBaseUrl || process.env.LARK_API_BASE_URL || "https://open.larksuite.com/open-apis",
      tableId: raw.tableId || process.env.LARK_TABLE_ID || "",
    },
    "Base mặc định"
  );

  const existingBases: LarkBaseProfile[] = Array.isArray(raw.bases)
    ? raw.bases.map((base: any, index: number) => normalizeBaseProfile(base, `Base ${index + 1}`))
    : [legacyProfile];

  const bases = existingBases.length ? existingBases : [legacyProfile];
  const activeBaseId = raw.activeBaseId || bases[0]?.id;
  const activeBase = bases.find((b) => b.id === activeBaseId) ?? bases[0];
  const activeTableId = raw.activeTableId || activeBase?.tables[0]?.id;

  return { activeBaseId, activeTableId, bases };
}

/** Lấy cấu hình hiện tại (Base + Table đang active), fallback về .env nếu chưa có gì */
export function getConfig(): LarkConfig {
  const storage = getConfigStorage();
  const activeBase = storage.bases.find((b) => b.id === storage.activeBaseId) ?? storage.bases[0] ?? createDefaultProfile();
  const activeTable = activeBase.tables.find((t) => t.id === storage.activeTableId) ?? activeBase.tables[0];

  return {
    appId: activeBase.appId,
    appSecret: activeBase.appSecret,
    baseAppToken: activeBase.baseAppToken,
    apiBaseUrl: activeBase.apiBaseUrl,
    tableId: activeTable?.tableId || "",
  };
}

export function getAllBaseProfiles(): LarkBaseProfile[] {
  return getConfigStorage().bases;
}

function writeStorage(storage: LarkConfigStorage) {
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(storage, null, 2), "utf-8");
}

/** Lưu credentials cấp Base (appId/appSecret/baseAppToken/apiBaseUrl/name).
 * KHÔNG đụng tới danh sách tables — dùng saveTableProfile() riêng cho việc đó. */
export function saveBaseProfile(partial: Partial<LarkBaseCredentials> & { baseId: string; name?: string }) {
  const storage = getConfigStorage();
  const baseId = partial.baseId; // không còn fallback ngầm về activeBaseId nữa
  const existingIndex = storage.bases.findIndex((b) => b.id === baseId);
  const existing = existingIndex >= 0 ? storage.bases[existingIndex] : undefined;

  const nextBase = normalizeBaseProfile(
    {
      ...existing,
      id: baseId,
      name: partial.name || existing?.name || "Base mới",
      appId: partial.appId ?? existing?.appId ?? "",
      appSecret: partial.appSecret ?? existing?.appSecret ?? "",
      baseAppToken: partial.baseAppToken ?? existing?.baseAppToken ?? "",
      apiBaseUrl: partial.apiBaseUrl || existing?.apiBaseUrl || "https://open.larksuite.com/open-apis",
      tables: existing?.tables ?? [],
    },
    "Base mới"
  );

  const nextBases = [...storage.bases];
  if (existingIndex >= 0) nextBases[existingIndex] = nextBase;
  else nextBases.push(nextBase);

  writeStorage({
    activeBaseId: baseId,
    activeTableId: storage.activeTableId,
    bases: nextBases,
  });
}

/** Thêm hoặc sửa 1 Table trong 1 Base cụ thể. Nếu tableProfileId đã tồn tại -> sửa,
 * chưa tồn tại (hoặc để trống) -> thêm mới. */
export function saveTableProfile(
  baseId: string,
  table: { tableProfileId?: string; name: string; tableId: string }
) {
  const storage = getConfigStorage();
  const baseIndex = storage.bases.findIndex((b) => b.id === baseId);
  if (baseIndex === -1) return;

  const base = storage.bases[baseIndex];
  const existingTableIndex = table.tableProfileId
    ? base.tables.findIndex((t) => t.id === table.tableProfileId)
    : -1;

  const nextTable = normalizeTableProfile(
    {
      id: table.tableProfileId,
      name: table.name,
      tableId: table.tableId,
    },
    "Bảng mới"
  );

  const nextTables = [...base.tables];
  if (existingTableIndex >= 0) nextTables[existingTableIndex] = nextTable;
  else nextTables.push(nextTable);

  const nextBases = [...storage.bases];
  nextBases[baseIndex] = { ...base, tables: nextTables };

  writeStorage({
    activeBaseId: baseId,
    activeTableId: nextTable.id,
    bases: nextBases,
  });
}

export function deleteTableProfile(baseId: string, tableProfileId: string) {
  const storage = getConfigStorage();
  const baseIndex = storage.bases.findIndex((b) => b.id === baseId);
  if (baseIndex === -1) return;

  const base = storage.bases[baseIndex];
  const nextTables = base.tables.filter((t) => t.id !== tableProfileId);

  const nextBases = [...storage.bases];
  nextBases[baseIndex] = { ...base, tables: nextTables };

  const nextActiveTableId =
    storage.activeTableId === tableProfileId ? nextTables[0]?.id : storage.activeTableId;

  writeStorage({
    activeBaseId: storage.activeBaseId,
    activeTableId: nextActiveTableId,
    bases: nextBases,
  });
}

export function setActiveBase(baseId: string) {
  const storage = getConfigStorage();
  const target = storage.bases.find((b) => b.id === baseId);
  if (!target) return;

  writeStorage({
    activeBaseId: baseId,
    activeTableId: target.tables[0]?.id, // đổi Base -> reset về Table đầu tiên của Base đó
    bases: storage.bases,
  });
}

export function setActiveTable(baseId: string, tableProfileId: string) {
  const storage = getConfigStorage();
  const base = storage.bases.find((b) => b.id === baseId);
  if (!base) return;
  const target = base.tables.find((t) => t.id === tableProfileId);
  if (!target) return;

  writeStorage({
    activeBaseId: baseId,
    activeTableId: tableProfileId,
    bases: storage.bases,
  });
}

export function deleteBaseProfile(baseId: string) {
  const storage = getConfigStorage();
  const filtered = storage.bases.filter((b) => b.id !== baseId);
  const nextBases = filtered.length > 0 ? filtered : [createDefaultProfile()];

  writeStorage({
    activeBaseId: nextBases[0]?.id,
    activeTableId: nextBases[0]?.tables[0]?.id,
    bases: nextBases,
  });
}

export function isConfigComplete(cfg: LarkConfig): boolean {
  return Boolean(cfg.appId && cfg.appSecret && cfg.baseAppToken && cfg.tableId);
}