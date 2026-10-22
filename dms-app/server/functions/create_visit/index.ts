import { z } from "zod";
import {
  defineFunction,
  SDKError,
} from "@lark-base-open/base-database-app-sdk/server";
import { input, output } from "./contract.js";

const recordId = z.string().regex(/^rec[A-Za-z0-9]{1,32}$/);
function fail(message: string): never {
  throw new SDKError("DMS_VALIDATION", message, { wireCode: 400 });
}
function queryRows(value: unknown): Record<string, unknown>[] {
  if (typeof value !== "object" || value === null)
    return fail("Không đọc được dữ liệu kiểm tra đại lý.");
  const body = value as { code?: number; data?: { rows?: unknown } };
  if (
    body.code !== 0 ||
    !Array.isArray(body.data?.rows) ||
    body.data.rows.some(
      (row) => typeof row !== "object" || row === null || Array.isArray(row),
    )
  ) {
    return fail("Không đọc được dữ liệu kiểm tra đại lý.");
  }
  return body.data.rows as Record<string, unknown>[];
}
function summarize(result: { status: string; appliedIds?: string[] }) {
  const status = result.status as "success" | "partial" | "failed" | "unknown";
  return {
    status,
    recordIds: result.appliedIds || [],
    message:
      status === "success"
        ? "Đã ghi nhận lượt ghé GPS."
        : status === "partial"
          ? "Chỉ ghi nhận được một phần. Hãy tải lại để kiểm tra."
          : status === "unknown"
            ? "Chưa xác định kết quả lưu. Hãy tải lại và đối chiếu trước khi gửi lại."
            : "Không thể lưu lượt ghé. Kiểm tra quyền truy cập và thử lại.",
  };
}

export default defineFunction({
  input,
  output,
  handler: async (params, ctx) => {
    if (!recordId.safeParse(params.partnerId).success)
      return fail("ID đại lý không hợp lệ.");
    const checked = await ctx.invokeFunction({
      projectId: "DENAp0kOirKIGijXz80lxDkggqx",
      functionId: "visit_partner",
      params: [params.partnerId],
    });
    const partners = queryRows(checked);
    const partner = partners[0];
    if (
      partners.length !== 1 ||
      partner.type !== "Đại lý" ||
      partner.status !== "Hoạt động"
    ) {
      return fail("Chỉ có thể check-in với đại lý đang hoạt động.");
    }
    if (typeof partner.operator_id !== "string" || !partner.operator_id) {
      return fail(
        "Không xác định được nhân viên hiện tại; lượt ghé chưa được lưu.",
      );
    }
    return summarize(
      await ctx.records.create(
        {
          baseToken: "D4kXbl3y6aLftVsDCTTlhBkfgpe",
          tableId: "tbltfPPUVDZHQvNY",
        },
        [
          {
            "Mã lượt ghé":
              "GH-" + crypto.randomUUID().slice(0, 8).toUpperCase(),
            "Đại lý ID": params.partnerId,
            "Thời gian check-in": new Date().toISOString(),
            "Vĩ độ": String(params.latitude),
            "Kinh độ": String(params.longitude),
            "Độ chính xác (m)": Math.round(params.accuracy * 10) / 10,
            "Nhân viên ID": partner.operator_id,
            "Ghi chú": params.notes.trim(),
          },
        ],
      ),
    );
  },
});
