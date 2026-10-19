import { createDecipheriv, createHash, timingSafeEqual } from "node:crypto";

function equal(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function decodeLarkEvent(raw: string, headers: Headers, token: string, encryptKey?: string) {
  if (!token) throw new Error("Missing verification token");
  let payload = JSON.parse(raw);
  if (typeof payload.encrypt === "string") {
    if (!encryptKey) throw new Error("Missing encrypt key");
    const encrypted = Buffer.from(payload.encrypt, "base64");
    const key = createHash("sha256").update(encryptKey).digest();
    const decipher = createDecipheriv("aes-256-cbc", key, encrypted.subarray(0, 16));
    payload = JSON.parse(Buffer.concat([decipher.update(encrypted.subarray(16)), decipher.final()]).toString("utf8"));
  }
  if (!payload || typeof payload !== "object") throw new Error("Invalid event");
  const actual = payload.header?.token ?? payload.token;
  if (typeof actual !== "string" || !equal(actual, token)) throw new Error("Invalid token");
  // URL verification can arrive without event-signature headers. Only this
  // token-authenticated handshake is exempt; regular events still require them.
  const isChallenge = payload.type === "url_verification" && typeof payload.challenge === "string";
  if (encryptKey && !isChallenge) {
    const timestamp = headers.get("x-lark-request-timestamp") || "";
    const nonce = headers.get("x-lark-request-nonce") || "";
    const signature = createHash("sha256").update(timestamp + nonce + encryptKey + raw).digest("hex");
    if (!timestamp || !nonce || !equal(signature, headers.get("x-lark-signature") || "")) {
      throw new Error("Invalid signature");
    }
  }
  return payload;
}

export const BOT_HELP = "Tra cứu Base đang chọn trong Cài đặt:\nbase — xem 10 dòng đầu\nbase Brand=ABC — lọc chính xác theo cột văn bản\nbase Mã ngân sách=ADS001\nMỗi lần trả tối đa 10 dòng. Hiện hỗ trợ lọc cột văn bản và lựa chọn đơn.";

export function normalizeBotText(text: string, mentions: unknown): string {
  if (Array.isArray(mentions)) {
    for (const mention of mentions) {
      if (mention && typeof mention === "object" && typeof mention.key === "string" && mention.key) {
        text = text.split(mention.key).join("");
      }
    }
  }
  return text.trim();
}

// Do not log whole Axios errors: they can contain Authorization/App Secret.
export function larkErrorCodes(error: unknown) {
  if (!error || typeof error !== "object") return {};
  const candidate = error as { apiCode?: unknown; code?: unknown; reason?: unknown; response?: { status?: unknown; data?: { code?: unknown } } };
  const apiCode = candidate.apiCode ?? candidate.response?.data?.code;
  return {
    ...(typeof apiCode === "number" ? { apiCode } : {}),
    ...(typeof candidate.response?.status === "number" ? { httpStatus: candidate.response.status } : {}),
    ...(["app_credentials_missing", "base_table_missing"].includes(String(candidate.reason)) ? { reason: candidate.reason } : {}),
    ...(["ECONNABORTED", "ETIMEDOUT", "ERR_CANCELED", "ENOTFOUND", "ECONNRESET", "ECONNREFUSED", "EAI_AGAIN", "EACCES", "EPERM", "ERR_NETWORK", "ERR_INVALID_URL"].includes(String(candidate.code)) ? { networkCode: candidate.code } : {}),
  };
}

export function parseBaseCommand(text: string): { field?: string; value?: string } | null {
  const match = text.trim().match(/^\/?base(?:\s+(.+))?$/i);
  if (!match) return null;
  if (!match[1]) return {};
  const separator = match[1].indexOf("=");
  if (separator < 1) return null;
  const field = match[1].slice(0, separator).trim();
  const value = match[1].slice(separator + 1).trim();
  if (!field || !value || /[\[\]\\\r\n]/.test(field) || text.length > 1000) return null;
  return { field, value };
}

export function formatBaseRecords(items: { fields: Record<string, unknown> }[], hasMore: boolean) {
  if (!items.length) return "Không tìm thấy dữ liệu phù hợp trong bảng đang chọn.";
  const valueText = (value: unknown): string => {
    if (value == null) return "";
    if (Array.isArray(value)) return value.map(valueText).join(", ");
    if (typeof value === "object") {
      const item = value as Record<string, unknown>;
      return String(item.text ?? item.name ?? item.link ?? "[Dữ liệu phức hợp]");
    }
    return String(value);
  };
  const rows = items.map((item, i) => `${i + 1}. ` + Object.entries(item.fields).slice(0, 12)
    .map(([key, value]) => `${key.slice(0, 80)}: ${valueText(value).slice(0, 160)}`).join(" | "));
  return (`Base/bảng đang chọn — ${items.length} dòng${hasMore ? " (còn dữ liệu, hãy thêm điều kiện lọc)" : ""}.\nMỗi dòng hiển thị tối đa 12 cột; giá trị dài được rút gọn.\n\n` + rows.join("\n\n")).slice(0, 10000);
}
