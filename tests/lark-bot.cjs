/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const crypto = require("node:crypto");
const context = { exports: {}, require, Buffer };
vm.createContext(context);
vm.runInContext(ts.transpile(fs.readFileSync("app/lib/lark-bot.ts", "utf8"), {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
}), context);
const { decodeLarkEvent, parseBaseCommand, formatBaseRecords, normalizeBotText, larkErrorCodes } = context.exports;
assert.equal(normalizeBotText("@_user_1 base", [{ key: "@_user_1" }]), "base");
assert.equal(normalizeBotText("base Brand=ABC", null), "base Brand=ABC");
assert.equal(JSON.stringify(larkErrorCodes({ message: "SECRET", config: { token: "SECRET" }, response: { status: 403, data: { code: 99991672, msg: "SECRET" } } })), '{"apiCode":99991672,"httpStatus":403}');
const raw = JSON.stringify({ token: "secret", type: "url_verification", challenge: "test" });
assert.equal(decodeLarkEvent(raw, new Headers(), "secret").challenge, "test");
assert.throws(() => decodeLarkEvent(raw, new Headers(), ""));
assert.throws(() => decodeLarkEvent(raw, new Headers(), "wrong"));
const key = crypto.createHash("sha256").update("encrypt-key").digest();
const iv = crypto.randomBytes(16);
const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
const encrypted = Buffer.concat([iv, cipher.update(raw), cipher.final()]).toString("base64");
const envelope = JSON.stringify({ encrypt: encrypted });
const signature = crypto.createHash("sha256").update("123nonceencrypt-key" + envelope).digest("hex");
const headers = new Headers({ "x-lark-request-timestamp": "123", "x-lark-request-nonce": "nonce", "x-lark-signature": signature });
assert.equal(decodeLarkEvent(envelope, headers, "secret", "encrypt-key").challenge, "test");
assert.equal(decodeLarkEvent(envelope, new Headers(), "secret", "encrypt-key").challenge, "test");
assert.equal(decodeLarkEvent(raw, new Headers(), "secret", "encrypt-key").challenge, "test");
assert.throws(() => decodeLarkEvent(envelope, new Headers(), "wrong", "encrypt-key"));
const normalEvent = JSON.stringify({ header: { token: "secret", event_type: "im.message.receive_v1" } });
assert.throws(() => decodeLarkEvent(normalEvent, new Headers(), "secret", "encrypt-key"));
const normalHeaders = new Headers({
  "x-lark-request-timestamp": "123", "x-lark-request-nonce": "nonce",
  "x-lark-signature": crypto.createHash("sha256").update("123nonceencrypt-key" + normalEvent).digest("hex"),
});
assert.equal(decodeLarkEvent(normalEvent, normalHeaders, "secret", "encrypt-key").header.event_type, "im.message.receive_v1");
assert.throws(() => decodeLarkEvent(normalEvent + " ", normalHeaders, "secret", "encrypt-key"));
assert.equal(parseBaseCommand("base").field, undefined);
assert.equal(parseBaseCommand("base Brand=ABC").value, "ABC");
assert.equal(parseBaseCommand("base Brand=ABC=DEF").value, "ABC=DEF");
assert.equal(parseBaseCommand("base Brand]=ABC"), null);
assert.equal(parseBaseCommand("base Brand="), null);
assert.equal(parseBaseCommand("xóa dữ liệu"), null);
assert.match(formatBaseRecords([], false), /Không tìm thấy/);
assert.match(formatBaseRecords([{ fields: { Brand: [{ text: "ABC" }] } }], true), /Brand: ABC/);
assert.ok(formatBaseRecords(Array.from({ length: 10 }, () => ({ fields: Object.fromEntries(Array.from({ length: 12 }, (_, i) => ["Column" + i, "a".repeat(500)])) })), true).length <= 10000);
async function checkRoute() {
  const scheduled = [];
  const replies = [];
  let reads = 0;
  let aiCalls = 0;
  let failReply = false;
  const logs = [];
  const logger = Object.fromEntries(["info", "warn", "error"].map(level => [level, (...args) => logs.push(args)]));
  const env = { LARK_VERIFICATION_TOKEN: "secret", LARK_BOT_ALLOWED_OPEN_IDS: "ou_allowed" };
  const route = { exports: {}, Response, Date, Map, AbortSignal, console: logger, process: { env },
    require: (name) => {
      if (name === "next/server") return { after: callback => scheduled.push(callback) };
      if (name.endsWith("/lark-bot")) return context.exports;
      if (name.endsWith("/lark-openai")) return { answerWithOpenAI: async () => { aiCalls++; return "Tổng ngân sách: 300."; } };
      if (name.endsWith("/config")) return { getConfig: () => ({ appId: "app" }) };
      if (name.endsWith("/lark-client")) return { LarkBaseClient: class {
        async listFields() { return [{ field_name: "Brand", type: 1 }]; }
        async listRecords() { reads++; return { items: [{ fields: { Brand: "ABC" } }], hasMore: false }; }
        async replyText(...args) {
          if (failReply) throw { response: { status: 403, data: { code: 99991672, msg: "SECRET" } }, config: { token: "SECRET" } };
          replies.push(args);
        }
      } };
      return require(name);
    },
  };
  vm.createContext(route);
  vm.runInContext(ts.transpile(fs.readFileSync("app/api/bot/lark/events/route.ts", "utf8"), {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
  }), route);
  const post = payload => route.exports.POST(new Request("https://example.test/api/bot/lark/events", {
    method: "POST", body: JSON.stringify(payload),
  }));
  assert.equal((await post({ token: "wrong" })).status, 401);
  const event = {
    header: { token: "secret", app_id: "app", event_type: "im.message.receive_v1" },
    event: { sender: { sender_type: "user", sender_id: { open_id: "ou_allowed" } },
      message: { message_id: "msg", chat_type: "p2p", message_type: "text", content: JSON.stringify({ text: "base" }) } },
  };
  env.LARK_BOT_ALLOWED_OPEN_IDS = "";
  await post(event);
  assert.equal(scheduled.length, 0);
  assert.ok(logs.some(entry => entry[1]?.reason === "allowed_users_not_configured"));
  env.LARK_BOT_ALLOWED_OPEN_IDS = "ou_allowed";
  event.event.message.chat_type = "group";
  await post(event);
  assert.equal(scheduled.length, 0);
  event.event.message.chat_type = "p2p";
  event.header.app_id = "other";
  await post(event);
  assert.equal(scheduled.length, 0);
  assert.ok(logs.some(entry => entry[1]?.reason === "app_id_mismatch"));
  event.header.app_id = "app";
  assert.equal((await post(event)).status, 200);
  await post(event);
  assert.equal(scheduled.length, 1);
  await scheduled[0]();
  assert.equal(reads, 1);
  assert.equal(replies.length, 1);
  assert.match(replies[0][1], /Brand: ABC/);
  event.event.message.message_id = "msg-ai";
  event.event.message.content = JSON.stringify({ text: "Tổng ngân sách năm 2026 là bao nhiêu?" });
  await post(event);
  await scheduled[1]();
  assert.equal(aiCalls, 1);
  assert.equal(replies[1][1], "Tổng ngân sách: 300.");
  event.event.sender.sender_id.open_id = "ou_stranger";
  event.event.message.message_id = "msg-stranger";
  await post(event);
  assert.equal(scheduled.length, 2);
  assert.equal(aiCalls, 1);
  assert.ok(logs.some(entry => entry[1]?.reason === "sender_not_allowed" && entry[1].senderOpenId === "ou_stranger"));
  event.event.sender.sender_id.open_id = "ou_allowed";
  event.event.message.message_id = "msg-mention";
  event.event.message.mentions = [{ key: "@_user_1" }];
  event.event.message.content = JSON.stringify({ text: "@_user_1 base" });
  await post(event);
  await scheduled[scheduled.length - 1]();
  assert.equal(aiCalls, 1);
  assert.match(replies[replies.length - 1][1], /Brand: ABC/);
  event.event.message.message_id = "msg-failure";
  failReply = true;
  await post(event);
  await scheduled[scheduled.length - 1]();
  assert.ok(logs.some(entry => entry[0] === "Lark bot: failed to send reply" && entry[1]?.apiCode === 99991672));
  assert.ok(!JSON.stringify(logs).includes("SECRET"));
  failReply = false;
  const beforeRetry = scheduled.length;
  await post(event);
  assert.equal(scheduled.length, beforeRetry + 1);
  await scheduled[scheduled.length - 1]();
  event.event.message.message_id = "msg-invalid-field";
  event.event.message.content = JSON.stringify({ text: "base Missing=x" });
  await post(event);
  await scheduled[scheduled.length - 1]();
  assert.match(replies[replies.length - 1][1], /Không tìm thấy cột/);
}
checkRoute().then(() => console.log("Lark bot checks passed"), error => { console.error(error); process.exitCode = 1; });
