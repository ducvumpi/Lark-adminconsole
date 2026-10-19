import { createHash } from "node:crypto";
import { after } from "next/server";
import { BOT_HELP, decodeLarkEvent, formatBaseRecords, parseBaseCommand } from "@/app/lib/lark-bot";
import { LarkBaseClient } from "@/app/lib/lark-client";
import { getConfig } from "@/app/lib/config";
import { answerWithOpenAI } from "@/app/lib/lark-openai";

export const runtime = "nodejs";
export const maxDuration = 60;

// Best-effort local deduplication. Lark also deduplicates replies using uuid.
const seen = new Map<string, number>();

export async function POST(request: Request) {
  const token = process.env.LARK_VERIFICATION_TOKEN?.trim();
  if (!token) return Response.json({ error: "Bot not configured" }, { status: 503 });
  let payload;
  try {
    payload = decodeLarkEvent(await request.text(), request.headers, token, process.env.LARK_ENCRYPT_KEY?.trim());
  } catch {
    return Response.json({ error: "Invalid Lark event" }, { status: 401 });
  }
  if (payload.type === "url_verification" && typeof payload.challenge === "string") {
    return Response.json({ challenge: payload.challenge });
  }
  if (payload.header?.event_type !== "im.message.receive_v1") return Response.json({});
  // Reject events for a different app, including after switching the active Base.
  if (payload.header?.app_id !== getConfig().appId) return Response.json({});
  const { message, sender } = payload.event ?? {};
  const allowed = (process.env.LARK_BOT_ALLOWED_OPEN_IDS || "").split(",").map(id => id.trim()).filter(Boolean);
  if (sender?.sender_type !== "user" || !allowed.includes(sender?.sender_id?.open_id)
    || message?.chat_type !== "p2p" || message?.message_type !== "text"
    || typeof message?.message_id !== "string") return Response.json({});
  let text: string;
  try {
    text = JSON.parse(message.content).text;
    if (typeof text !== "string") throw new Error("Invalid text");
  } catch {
    return Response.json({});
  }
  const id = message.message_id;
  for (const [key, expiry] of seen) if (expiry < Date.now()) seen.delete(key);
  if (seen.has(id)) return Response.json({});
  seen.set(id, Date.now() + 3600000);
  after(async () => {
    const client = new LarkBaseClient();
    let reply = BOT_HELP;
    try {
      const command = parseBaseCommand(text);
      if (command) {
        let filter: string | undefined;
        if (command.field) {
          const fields = await client.listFields();
          const field = fields.find(field => field.field_name === command.field);
          if (!field || ![1, 3].includes(field.type)) {
            reply = "Không tìm thấy cột văn bản/lựa chọn đơn phù hợp. Kiểm tra tên cột trong Base.";
          } else {
            filter = `CurrentValue.[${field.field_name}]=${JSON.stringify(command.value)}`;
          }
          if (!filter) {
            await client.replyText(id, reply, createHash("sha256").update(id).digest("hex").slice(0, 40));
            return;
          }
        }
        const result = await client.listRecords({ pageSize: 10, filter });
        reply = formatBaseRecords(result.items, result.hasMore);
      } else {
        reply = await answerWithOpenAI(text);
      }
    } catch {
      reply = "Chưa đọc được Base. Vui lòng kiểm tra cấu hình, quyền đọc Base của ứng dụng và bảng đang chọn.";
    }
    try {
      await client.replyText(id, reply, createHash("sha256").update(id).digest("hex").slice(0, 40));
    } catch {
      seen.delete(id);
      console.error("Lark bot: failed to send reply");
    }
  });
  return Response.json({});
}
