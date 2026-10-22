import { z } from "zod";

export const input = z
  .object({
    partnerId: z.string().describe("ID đại lý từ list_partners"),
    latitude: z
      .number()
      .min(-90)
      .max(90)
      .describe("Vĩ độ lấy từ trình duyệt sau khi nhân viên cấp quyền GPS"),
    longitude: z
      .number()
      .min(-180)
      .max(180)
      .describe("Kinh độ lấy từ trình duyệt sau khi nhân viên cấp quyền GPS"),
    accuracy: z
      .number()
      .min(0)
      .max(100000)
      .describe("Độ chính xác GPS do trình duyệt cung cấp, đơn vị mét"),
    notes: z
      .string()
      .max(2000)
      .describe(
        "Ghi chú không bắt buộc về lượt ghé; gửi chuỗi rỗng nếu không có",
      ),
  })
  .strict();

export const output = z.object({
  status: z.enum(["success", "partial", "failed", "unknown"]),
  message: z.string(),
  recordIds: z.array(z.string()),
});
