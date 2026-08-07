import fs from "fs";
import path from "path";

export interface LarkConfig {
  appId: string;
  appSecret: string;
  baseAppToken: string;
  tableId: string;
  apiBaseUrl: string;
}

export interface LarkBaseProfile extends LarkConfig {
  id: string;
  name: string;
}

export interface LarkConfigStorage {
  activeBaseId?: string;
  bases: LarkBaseProfile[];
}

const CONFIG_PATH = path.join(process.cwd(), "data", "config.json");

function readOverrides(): Partial<LarkConfigStorage & LarkConfig> {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function createDefaultProfile(): LarkBaseProfile {
  return {
    id: "default",
    name: "Base mặc định",
    appId: process.env.LARK_APP_ID || "",
    appSecret: process.env.LARK_APP_SECRET || "",
    baseAppToken: process.env.LARK_BASE_APP_TOKEN || "",
    tableId: process.env.LARK_TABLE_ID || "",
    apiBaseUrl: process.env.LARK_API_BASE_URL || "https://open.larksuite.com/open-apis",
  };
}

function normalizeBaseProfile(base: Partial<LarkBaseProfile> | undefined, fallbackName = "Base"): LarkBaseProfile {
  const current = base ?? {};
  return {
    id: current.id || `base-${Date.now()}`,
    name: current.name || fallbackName,
    appId: current.appId || "",
    appSecret: current.appSecret || "",
    baseAppToken: current.baseAppToken || "",
    tableId: current.tableId || "",
    apiBaseUrl: current.apiBaseUrl || "https://open.larksuite.com/open-apis",
  };
}

export function getConfigStorage(): LarkConfigStorage {
  const raw = readOverrides();
  const legacy = {
    appId: raw.appId || process.env.LARK_APP_ID || "",
    appSecret: raw.appSecret || process.env.LARK_APP_SECRET || "",
    baseAppToken: raw.baseAppToken || process.env.LARK_BASE_APP_TOKEN || "",
    tableId: raw.tableId || process.env.LARK_TABLE_ID || "",
    apiBaseUrl: raw.apiBaseUrl || process.env.LARK_API_BASE_URL || "https://open.larksuite.com/open-apis",
  };

  const legacyProfile = normalizeBaseProfile({
    id: "default",
    name: "Base mặc định",
    ...legacy,
  }, "Base mặc định");

  const existingBases = Array.isArray(raw.bases)
    ? raw.bases.map((base, index) => normalizeBaseProfile(base, `Base ${index + 1}`))
    : [legacyProfile];

  const activeBaseId = raw.activeBaseId || existingBases[0]?.id || legacyProfile.id;

  return {
    activeBaseId,
    bases: existingBases.length ? existingBases : [legacyProfile],
  };
}

/** Lấy cấu hình hiện tại: ưu tiên profile đang active trong data/config.json, fallback về .env */
export function getConfig(): LarkConfig {
  const storage = getConfigStorage();
  const activeBase = storage.bases.find((base) => base.id === storage.activeBaseId) ?? storage.bases[0] ?? createDefaultProfile();

  return {
    appId: activeBase.appId,
    appSecret: activeBase.appSecret,
    baseAppToken: activeBase.baseAppToken,
    tableId: activeBase.tableId,
    apiBaseUrl: activeBase.apiBaseUrl,
  };
}

/** Lấy danh sách tất cả profile đang lưu */
export function getAllBaseProfiles(): LarkBaseProfile[] {
  return getConfigStorage().bases;
}

/** Lưu đè cấu hình (ghi vào data/config.json, không đụng tới file .env gốc) */
export function saveConfig(partial: Partial<LarkConfig> & { baseId?: string; name?: string }) {
  const storage = getConfigStorage();
  const baseId = partial.baseId || storage.activeBaseId || storage.bases[0]?.id || "default";

  const existingIndex = storage.bases.findIndex((base) => base.id === baseId);
  const nextBase = normalizeBaseProfile(
    {
      ...(existingIndex >= 0 ? storage.bases[existingIndex] : {}),
      id: baseId,
      name: partial.name || (existingIndex >= 0 ? storage.bases[existingIndex].name : "Base mới"),
      appId: partial.appId || storage.bases[existingIndex]?.appId || "",
      appSecret: partial.appSecret || storage.bases[existingIndex]?.appSecret || "",
      baseAppToken: partial.baseAppToken || storage.bases[existingIndex]?.baseAppToken || "",
      tableId: partial.tableId || storage.bases[existingIndex]?.tableId || "",
      apiBaseUrl: partial.apiBaseUrl || storage.bases[existingIndex]?.apiBaseUrl || "https://open.larksuite.com/open-apis",
    },
    "Base mới"
  );

  const nextBases = [...storage.bases];
  if (existingIndex >= 0) {
    nextBases[existingIndex] = nextBase;
  } else {
    nextBases.push(nextBase);
  }

  const nextStorage: LarkConfigStorage = {
    activeBaseId: baseId,
    bases: nextBases,
  };

  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(nextStorage, null, 2), "utf-8");
}

export function setActiveBase(baseId: string) {
  const storage = getConfigStorage();
  const target = storage.bases.find((base) => base.id === baseId);
  if (!target) return;

  const nextStorage: LarkConfigStorage = {
    activeBaseId: baseId,
    bases: storage.bases,
  };

  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(nextStorage, null, 2), "utf-8");
}

export function deleteBaseProfile(baseId: string) {
  const storage = getConfigStorage();
  const filtered = storage.bases.filter((base) => base.id !== baseId);
  const nextBases = filtered.length > 0 ? filtered : [createDefaultProfile()];
  const nextStorage: LarkConfigStorage = {
    activeBaseId: nextBases[0]?.id,
    bases: nextBases,
  };

  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(nextStorage, null, 2), "utf-8");
}

/** Kiểm tra cấu hình đã đủ để gọi Lark API chưa */
export function isConfigComplete(cfg: LarkConfig): boolean {
  return Boolean(cfg.appId && cfg.appSecret && cfg.baseAppToken && cfg.tableId);
}