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
const { decodeLarkEvent, parseBaseCommand, formatBaseRecords } = context.exports;
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
  const env = { LARK_VERIFICATION_TOKEN: "secret", LARK_BOT_ALLOWED_OPEN_IDS: "ou_allowed" };
  const route = { exports: {}, Response, Date, Map, console, process: { env },
    require: (name) => {
      if (name === "next/server") return { after: callback => scheduled.push(callback) };
      if (name.endsWith("/lark-bot")) return context.exports;
      if (name.endsWith("/lark-openai")) return { answerWithOpenAI: async () => { aiCalls++; return "Tổng ngân sách: 300."; } };
      if (name.endsWith("/config")) return { getConfig: () => ({ appId: "app" }) };
      if (name.endsWith("/lark-client")) return { LarkBaseClient: class {
        async listRecords() { reads++; return { items: [{ fields: { Brand: "ABC" } }], hasMore: false }; }
        async replyText(...args) { replies.push(args); }
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
  env.LARK_BOT_ALLOWED_OPEN_IDS = "ou_allowed";
  event.event.message.chat_type = "group";
  await post(event);
  assert.equal(scheduled.length, 0);
  event.event.message.chat_type = "p2p";
  event.header.app_id = "other";
  await post(event);
  assert.equal(scheduled.length, 0);
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
}
checkRoute().then(() => console.log("Lark bot checks passed"), error => { console.error(error); process.exitCode = 1; });
