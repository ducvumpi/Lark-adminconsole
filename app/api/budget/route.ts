import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { BUDGET_APP_ID, DEFAULT_BUDGET_SHEET_URL, requireBrand, type ModuleKey, type Snapshot } from "@/app/lib/budget/domain";
import { BudgetApiError, accessContext, budgetCredentials, importLines, moduleRecords, publicOrigin, readSheet } from "@/app/lib/budget/lark";
import { deleteSession, listRequests, readSession, type BudgetSession } from "@/app/lib/budget/storage";
import { approvalConfig, canOpen, newDraft, refreshApproval, sendApproval, syncApproved } from "@/app/lib/budget/workflow";

export const runtime = "nodejs";
function json(data: unknown, status = 200) { return NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } }); }
async function session(): Promise<BudgetSession> { const id = (await cookies()).get("budget_session")?.value; const value = id ? await readSession(id) : null; if (!value) throw new BudgetApiError("Đăng nhập bằng tài khoản Lark của bạn để áp dụng phân quyền Brand.", 401); return value; }
function failure(error: unknown) { return json({ ok: false, message: error instanceof Error ? error.message : "Không hoàn tất được yêu cầu." }, error instanceof BudgetApiError ? error.status : 400); }
export async function GET(request: Request) {
  const url = new URL(request.url);
  if (url.searchParams.get("op") === "config") {
    let configured = true; try { budgetCredentials(); } catch { configured = false; }
    const approval = approvalConfig();
    return json({ ok: true, configured, appId: BUDGET_APP_ID, callback: publicOrigin() + "/api/budget/auth/callback", approvalReady: !!(approval.code && approval.titleField && approval.snapshotField && approval.nodeKey), sheetUrl: process.env.BUDGET_SHEET_URL || DEFAULT_BUDGET_SHEET_URL });
  }
  try {
    const user = await session(), context = await accessContext(user);
    if (url.searchParams.get("op") === "records") {
      const key = url.searchParams.get("module") as ModuleKey, brand = url.searchParams.get("brand") || "", page = url.searchParams.get("page") || "";
      return json({ ok: true, ...(await moduleRecords(user, context.access, key, brand, page)) });
    }
    const requests = (await listRequests()).filter(row => { try { canOpen(row, user, context.access); return true; } catch { return false; } });
    return json({ ok: true, user: { name: user.name, openId: user.openId }, brands: context.access, members: context.members, requests });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    if (request.headers.get("origin") !== publicOrigin()) throw new BudgetApiError("Nguồn yêu cầu không hợp lệ.", 403);
    if (Number(request.headers.get("content-length") || 0) > 500000) throw Error("Yêu cầu quá lớn.");
    const user = await session();
    const raw = await request.text(); if (raw.length > 500000) throw Error("Yêu cầu quá lớn.");
    const body = JSON.parse(raw) as Record<string, unknown>;
    if (body.op === "logout") { const jar = await cookies(), id = jar.get("budget_session")?.value; if (id) await deleteSession(id); jar.delete("budget_session"); return json({ ok: true }); }
    const context = await accessContext(user), brand = typeof body.brand === "string" ? body.brand : "";
    if (body.op === "sheet") { requireBrand(context.access, brand, true); return json({ ok: true, ...(await readSheet(user, String(body.url || ""), String(body.sheetId || ""))) }); }
    if (body.op === "draft") {
      requireBrand(context.access, brand, true);
      if (typeof body.url !== "string" || typeof body.sheetId !== "string" || typeof body.title !== "string") throw Error("Thiếu thông tin hồ sơ.");
      const sheet = await readSheet(user, body.url, body.sheetId);
      const lines = await importLines(user, brand, sheet.values);
      const snapshot: Snapshot = { version: 1, title: body.title.trim(), brand, sheetUrl: body.url, lines };
      return json({ ok: true, request: await newDraft(user, context.access, snapshot) });
    }
    if (body.op === "send") {
      if (body.confirm !== true || !Array.isArray(body.approvers) || body.approvers.some(id => typeof id !== "string")) throw Error("Cần xác nhận bản tiền và người duyệt trước khi gửi.");
      // Candidate membership is restricted to the request's own Brand in the workflow.
      const { readRequest } = await import("@/app/lib/budget/storage");
      const doc = await readRequest(String(body.id)); canOpen(doc, user, context.access);
      const candidates = context.members.filter(member => member.brand === doc.snapshot.brand).map(member => member.id);
      return json({ ok: true, request: await sendApproval(user, context.access, doc.id, body.approvers as string[], candidates) });
    }
    if (body.op === "refresh") return json({ ok: true, request: await refreshApproval(user, context.access, String(body.id)) });
    if (body.op === "sync") { if (body.confirm !== true) throw Error("Cần xác nhận ghi bản đã duyệt vào A03."); return json({ ok: true, request: await syncApproved(user, context.access, String(body.id)) }); }
    if (body.op === "create") throw Error("Ứng dụng này chỉ xử lý dữ liệu A03 hiện có; tạo bản ghi trực tiếp bị tắt.");
    throw Error("Thao tác không được hỗ trợ.");
  } catch (error) { return failure(error); }
}
