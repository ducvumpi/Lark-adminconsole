import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID, createHash, createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { Snapshot } from "./domain";

const ROOT = path.join(process.cwd(), "data", "budget-app");
export type BudgetSession = { openId: string; name: string; tenantKey: string; token: string; expiresAt: number; appId: string };
export type BudgetRequest = {
  id: string; creator: string; creatorName: string; createdAt: string; updatedAt: string;
  snapshot: Snapshot; binding: string; status: "draft" | "sending" | "pending" | "approved" | "rejected" | "canceled" | "syncing" | "synced" | "unknown" | "partial";
  approvers: string[]; approvalCode: string; instanceCode?: string; snapshotField: string;
  syncResults: { recordId: string; status: string }[];
  events: { at: string; actor: string; message: string }[];
};
function safeName(id: string) { if (!/^[a-f0-9-]{36}$/.test(id)) throw Error("Định danh không hợp lệ."); return id; }
function key() { const secret = process.env.SESSION_SECRET; if (!secret || secret.length < 24) throw Error("Cần SESSION_SECRET tối thiểu 24 ký tự để bảo vệ phiên đăng nhập ngân sách."); return createHash("sha256").update(secret).digest(); }
function seal(value: unknown) { const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", key(), iv); const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]); return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64"); }
function unseal(value: string) { const data = Buffer.from(value, "base64"), decipher = createDecipheriv("aes-256-gcm", key(), data.subarray(0, 12)); decipher.setAuthTag(data.subarray(12, 28)); return JSON.parse(Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString("utf8")); }
export async function saveSession(session: BudgetSession) { const id = randomUUID(); const dir = path.join(ROOT, "sessions"); await fs.mkdir(dir, { recursive: true }); await fs.writeFile(path.join(dir, safeName(id) + ".json"), seal(session), { mode: 0o600 }); return id; }
export async function readSession(id: string): Promise<BudgetSession | null> {
  try { const value = unseal(await fs.readFile(path.join(ROOT, "sessions", safeName(id) + ".json"), "utf8")) as BudgetSession; return value.expiresAt > Date.now() ? value : null; } catch { return null; }
}
export async function deleteSession(id: string) { await fs.rm(path.join(ROOT, "sessions", safeName(id) + ".json"), { force: true }); }
export async function saveRequest(request: BudgetRequest) { const dir = path.join(ROOT, "requests"); await fs.mkdir(dir, { recursive: true }); const file = path.join(dir, safeName(request.id) + ".json"), temp = file + ".tmp"; await fs.writeFile(temp, seal(request), { mode: 0o600 }); await fs.rename(temp, file); }
export async function readRequest(id: string): Promise<BudgetRequest> { return unseal(await fs.readFile(path.join(ROOT, "requests", safeName(id) + ".json"), "utf8")); }
export async function listRequests(): Promise<BudgetRequest[]> { const dir = path.join(ROOT, "requests"); const files = await fs.readdir(dir).catch(() => []); const rows = await Promise.all(files.filter(file => /^[a-f0-9-]{36}\.json$/.test(file)).map(file => readRequest(file.slice(0, -5)))); return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt)); }
const locks = new Map<string, Promise<unknown>>();
// Serializes one local Node process only. No claim of distributed transactions.
export async function withRequestLock<T>(id: string, work: () => Promise<T>): Promise<T> {
  const previous = locks.get(id) || Promise.resolve();
  const current = previous.catch(() => {}).then(work); locks.set(id, current);
  try { return await current; } finally { if (locks.get(id) === current) locks.delete(id); }
}
