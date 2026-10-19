import { createHash } from "node:crypto";
import { after } from "next/server";
import { BOT_HELP, decodeLarkEvent, formatBaseRecords, larkErrorCodes, normalizeBotText, parseBaseCommand } from "@/app/lib/lark-bot";
import { LarkBaseClient } from "@/app/lib/lark-client";
import { getConfig } from "@/app/lib/config";
import { answerWithOpenAI } from "@/app/lib/lark-openai";

export const runtime = "nodejs";
export const maxDuration = 60;

// Best-effort local deduplication. Lark also deduplicates replies using uuid.
const seen = new Map<string, number>();

export async function POST(request: Request) {
  const token = process.env.LARK_VERIFICATION_TOKEN?.trim();
  if (!token) {
    console.error("Lark bot: not configured", { reason: "verification_token_missing" });
    return Response.json({ error: "Bot not configured" }, { status: 503 });
  }
  let payload;
  try {
    payload = decodeLarkEvent(await request.text(), request.headers, token, process.env.LARK_ENCRYPT_KEY?.trim());
  } catch {
    console.warn("Lark bot: rejected", { reason: "invalid_event_auth" });
    return Response.json({ error: "Invalid Lark event" }, { status: 401 });
  }
  if (payload.type === "url_verification" && typeof payload.challenge === "string") {
    console.info("Lark bot: URL verified");
    return Response.json({ challenge: payload.challenge });
  }
  if (payload.header?.event_type !== "im.message.receive_v1") {
    console.info("Lark bot: ignored", { reason: "unsupported_event_type", eventType: payload.header?.event_type });
    return Response.json({});
  }
  // Reject events for a different app, including after switching the active Base.
  if (payload.header?.app_id !== getConfig().appId) {
    console.warn("Lark bot: ignored", { reason: "app_id_mismatch", receivedAppId: payload.header?.app_id, configuredAppId: getConfig().appId });
    return Response.json({});
  }
  const { message, sender } = payload.event ?? {};
  const metadata = { messageId: message?.message_id, senderOpenId: sender?.sender_id?.open_id };
  const ignore = (reason: string) => {
    console.warn("Lark bot: ignored", { reason, ...metadata });
    return Response.json({});
  };
  const allowed = (process.env.LARK_BOT_ALLOWED_OPEN_IDS || "").split(",").map(id => id.trim()).filter(Boolean);
  if (sender?.sender_type !== "user") return ignore("sender_not_user");
  if (!allowed.length) return ignore("allowed_users_not_configured");
  if (!allowed.includes(sender?.sender_id?.open_id)) return ignore("sender_not_allowed");
  if (message?.chat_type !== "p2p") return ignore("not_private_chat");
  if (message?.message_type !== "text") return ignore("unsupported_message_type");
  if (typeof message?.message_id !== "string") return ignore("missing_message_id");
  let text: string;
  try {
    text = JSON.parse(message.content).text;
    if (typeof text !== "string") throw new Error("Invalid text");
    text = normalizeBotText(text, message.mentions);
  } catch {
    return ignore("invalid_text_content");
  }
  const id = message.message_id;
  for (const [key, expiry] of seen) if (expiry < Date.now()) seen.delete(key);
  if (seen.has(id)) return ignore("duplicate_message");
  seen.set(id, Date.now() + 3600000);
  console.info("Lark bot: accepted", metadata);
  after(async () => {
    const client = new LarkBaseClient({ signal: AbortSignal.timeout(55000) });
    let reply = BOT_HELP;
    try {
      const command = parseBaseCommand(text);
      if (command) {
        const reader = new LarkBaseClient({ signal: AbortSignal.timeout(30000) });
        let filter: string | undefined;
        if (command.field) {
          const fields = await reader.listFields();
          const field = fields.find(field => field.field_name === command.field);
          if (!field || ![1, 3].includes(field.type)) {
            reply = "Không tìm thấy cột văn bản/lựa chọn đơn phù hợp. Kiểm tra tên cột trong Base.";
          } else {
            filter = `CurrentValue.[${field.field_name}]=${JSON.stringify(command.value)}`;
          }
        }
        if (!command.field || filter) {
          const result = await reader.listRecords({ pageSize: 10, filter });
          reply = formatBaseRecords(result.items, result.hasMore);
        }
      } else {
        reply = await answerWithOpenAI(text);
      }
    } catch (error) {
      console.error("Lark bot: lookup failed", { messageId: id, ...larkErrorCodes(error) });
      reply = "Chưa đọc được Base. Vui lòng kiểm tra cấu hình, quyền đọc Base của ứng dụng và bảng đang chọn.";
    }
    try {
      await client.replyText(id, reply, createHash("sha256").update(id).digest("hex").slice(0, 40));
      console.info("Lark bot: replied", { messageId: id });
    } catch (error) {
      seen.delete(id);
      console.error("Lark bot: failed to send reply", { messageId: id, ...larkErrorCodes(error) });
    }
  });
  return Response.json({});
}
