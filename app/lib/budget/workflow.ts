import { randomUUID } from "node:crypto";
import { approvalBinding, displayText, requireBrand, validateApprovedForm, parseVnd, type BrandAccess, type Snapshot } from "./domain";
import { lark, a03Record, patchApprovedAmount } from "./lark";
import { readRequest, saveRequest, withRequestLock, type BudgetRequest, type BudgetSession } from "./storage";

export function approvalConfig() {
  return { code: process.env.BUDGET_APPROVAL_CODE || "", snapshotField: process.env.BUDGET_APPROVAL_SNAPSHOT_FIELD || "", titleField: process.env.BUDGET_APPROVAL_TITLE_FIELD || "", nodeKey: process.env.BUDGET_APPROVAL_NODE_KEY || "" };
}
function event(request: BudgetRequest, session: BudgetSession, message: string) { request.updatedAt = new Date().toISOString(); request.events.push({ at: request.updatedAt, actor: session.name, message }); }
export function canOpen(request: BudgetRequest, session: BudgetSession, access: BrandAccess[]) { const permission = requireBrand(access, request.snapshot.brand); if (request.creator !== session.openId && !permission.canManage && !request.approvers.includes(session.openId)) throw Error("Bạn không được xem hồ sơ này."); }
export async function newDraft(session: BudgetSession, access: BrandAccess[], snapshot: Snapshot) {
  requireBrand(access, snapshot.brand, true);
  if (!snapshot.title.trim() || snapshot.title.length > 180 || snapshot.lines.length < 1 || snapshot.lines.length > 200) throw Error("Hồ sơ cần tiêu đề và từ 1 đến 200 dòng tiền.");
  const id = randomUUID(), now = new Date().toISOString();
  const request: BudgetRequest = { id, creator: session.openId, creatorName: session.name, createdAt: now, updatedAt: now, snapshot, binding: approvalBinding(id, snapshot), status: "draft", approvers: [], approvalCode: "", snapshotField: "", syncResults: [], events: [{ at: now, actor: session.name, message: "Đã tạo bản chốt tiền từ bảng tính. Chưa ghi A03." }] };
  await saveRequest(request); return request;
}
export async function sendApproval(session: BudgetSession, access: BrandAccess[], id: string, approvers: string[], candidates: string[]) {
  return withRequestLock(id, async () => {
    const request = await readRequest(id); canOpen(request, session, access); requireBrand(access, request.snapshot.brand, true);
    if (request.creator !== session.openId || request.status !== "draft") throw Error("Chỉ người lập được gửi bản nháp chưa gửi.");
    const cfg = approvalConfig();
    if (!cfg.code || !cfg.snapshotField || !cfg.titleField || !cfg.nodeKey) throw Error("Chưa cấu hình mẫu Approval ngân sách. Xem phần Kết nối trong app.");
    if (!approvers.length || approvers.length > 10 || new Set(approvers).size !== approvers.length || approvers.some(user => !candidates.includes(user))) throw Error("Chọn người duyệt trong danh sách được phân công Brand.");
    const definition = await lark<{ approval_name: string; form: string; node_list: { node_id: string; custom_node_id?: string; need_approver: boolean; approver_chosen_multi?: boolean }[]; is_external?: boolean }>(session.token, `/open-apis/approval/v4/approvals/${encodeURIComponent(cfg.code)}`);
    if (definition.is_external) throw Error("Cần mẫu Lark Approval nội bộ, không phải phê duyệt bên thứ ba.");
    const raw = JSON.parse(definition.form) as unknown;
    const controls: { id: string; type: string; required?: boolean }[] = Array.isArray(raw) ? raw : (raw as { form?: { id: string; type: string; required?: boolean }[] })?.form || [];
    if (!controls.some(c => c.id === cfg.snapshotField && c.type === "textarea") || !controls.some(c => c.id === cfg.titleField && c.type === "input")) throw Error("Mẫu Approval cần trường input cho tiêu đề và textarea cho bản tiền, đúng ID đã cấu hình.");
    if (controls.some(c => ![cfg.snapshotField, cfg.titleField].includes(c.id) && c.required)) throw Error("Mẫu còn trường bắt buộc chưa được ánh xạ; không gửi thiếu dữ liệu.");
    const nodes = definition.node_list.filter(n => n.need_approver);
    const node = nodes.find(n => (n.custom_node_id || n.node_id) === cfg.nodeKey);
    if (!node || nodes.length !== 1 || (!node.approver_chosen_multi && approvers.length > 1)) throw Error("Cấu hình cần đúng một bước chọn người duyệt; các bước còn lại thiết lập cố định trong Approval.");
    if (request.binding.length > 50000) throw Error("Bản tiền quá lớn để gửi trong phiếu; chia thành hồ sơ nhỏ hơn.");
    request.approvers = approvers; request.approvalCode = cfg.code; request.snapshotField = cfg.snapshotField; request.status = "sending";
    event(request, session, "Đang gửi bản chốt tiền sang Lark Approval."); await saveRequest(request);
    try {
      const result = await lark<{ instance_code: string }>(session.token, "/open-apis/approval/v4/instances", { method: "POST", params: { user_id_type: "open_id" }, body: { approval_code: cfg.code, open_id: session.openId, uuid: request.id, form: JSON.stringify([{ id: cfg.titleField, type: "input", value: request.snapshot.title }, { id: cfg.snapshotField, type: "textarea", value: request.binding }]), node_approver_list: [{ key: cfg.nodeKey, value: approvers }] } });
      if (!result.instance_code) throw Error("Thiếu mã phiếu Approval.");
      request.instanceCode = result.instance_code; request.status = "pending"; event(request, session, "Đã tạo phiếu Lark Approval.");
    } catch (error) { request.status = "unknown"; event(request, session, "Chưa xác định kết quả gửi; không gửi lại tự động."); await saveRequest(request); throw error; }
    await saveRequest(request); return request;
  });
}
async function verifiedInstance(session: BudgetSession, request: BudgetRequest) {
  if (!request.instanceCode) throw Error("Hồ sơ chưa có mã instance_code do hệ thống tạo.");
  const instance = await lark<{ instance_code: string; approval_code: string; status: string; form: string; open_id?: string }>(session.token, `/open-apis/approval/v4/instances/${encodeURIComponent(request.instanceCode)}`, { params: { user_id_type: "open_id" } });
  if (instance.instance_code !== request.instanceCode || instance.approval_code !== request.approvalCode) throw Error("Phiếu không khớp mẫu Approval hoặc hồ sơ.");
  validateApprovedForm(instance.form, request.snapshotField, request.binding);
  return instance;
}
export async function refreshApproval(session: BudgetSession, access: BrandAccess[], id: string) {
  return withRequestLock(id, async () => {
    const request = await readRequest(id); canOpen(request, session, access);
    if (["synced", "syncing", "partial", "unknown", "draft", "sending"].includes(request.status)) throw Error("Hồ sơ chưa ở trạng thái cho phép làm mới Approval tự động.");
    const instance = await verifiedInstance(session, request);
    const states: Record<string, BudgetRequest["status"]> = { APPROVED: "approved", PENDING: "pending", REJECTED: "rejected", CANCELED: "canceled", REVERTED: "canceled", DELETED: "canceled" };
    if (!states[instance.status]) throw Error("Trạng thái Approval chưa được hỗ trợ; giữ nguyên hồ sơ.");
    request.status = states[instance.status]; event(request, session, `Đối chiếu Approval: ${instance.status}`); await saveRequest(request); return request;
  });
}
export async function syncApproved(session: BudgetSession, access: BrandAccess[], id: string) {
  return withRequestLock(id, async () => {
    const request = await readRequest(id); canOpen(request, session, access); const permission = requireBrand(access, request.snapshot.brand, true);
    if (request.creator !== session.openId && !permission.canManage) throw Error("Chỉ người lập hoặc quản lý Brand được đồng bộ bản đã duyệt.");
    if (request.status !== "approved") throw Error("Chỉ đồng bộ hồ sơ đã duyệt và chưa từng đồng bộ; không tự thử lại hồ sơ lỗi hoặc chưa rõ kết quả.");
    const instance = await verifiedInstance(session, request);
    if (instance.status !== "APPROVED") throw Error("Approval chưa được duyệt hoặc đã bị hủy duyệt.");
    // Verify the entire scope and baseline before the first financial write.
    for (const line of request.snapshot.lines) {
      const row = await a03Record(session, line.recordId);
      if (displayText(row.fields.Brand) !== line.brand || displayText(row.fields["Mã ngân sách"]) !== line.code || displayText(row.fields["Năm"]) !== line.year || displayText(row.fields["Quý ngân sách"]) !== line.quarter || displayText(row.fields["Tháng ngân sách"]) !== line.month || parseVnd(row.fields["Số tiền TGĐ duyệt"] ?? 0) !== line.before) throw Error("A03 đã thay đổi so với bản trình duyệt; dừng đồng bộ, cần lập hồ sơ mới.");
    }
    request.status = "syncing"; event(request, session, "Bắt đầu đồng bộ bản đã duyệt vào A03."); await saveRequest(request);
    for (const line of request.snapshot.lines) {
      try {
        await patchApprovedAmount(session, line.recordId, line.amount, request.instanceCode!);
        request.syncResults.push({ recordId: line.recordId, status: "saved" }); await saveRequest(request);
      } catch {
        request.syncResults.push({ recordId: line.recordId, status: "unknown" }); request.status = "partial";
        event(request, session, "Dừng vì một dòng chưa rõ kết quả ghi. Các dòng sau chưa được gửi; cần đối soát thủ công."); await saveRequest(request); return request;
      }
    }
    request.status = "synced"; event(request, session, "Đã ghi xong các dòng A03 theo bản được Approval duyệt."); await saveRequest(request); return request;
  });
}
