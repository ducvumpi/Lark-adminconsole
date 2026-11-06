/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
function load(file, imports = {}, extra = {}) {
  const context = { exports: {}, require: name => imports[name] ?? require(name), URL, ...extra };
  vm.createContext(context);
  vm.runInContext(ts.transpile(fs.readFileSync(file, "utf8"), { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }), context);
  return context.exports;
}
const env = { LARK_APP_ID: "stableBot", LARK_APP_SECRET: "secret", LARK_BASE_APP_TOKEN: "baseOne", LARK_TABLE_ID: "tblImportOnly" };
const { getBotConfig } = load("app/lib/lark-bot-config.ts", {}, { process: { env } });
const { BaseQueryError } = load("app/lib/lark-ai-query.ts");
const calls = [];
const metadata = {
  baseOne: [{ table_id: "tblA01", name: "A01. Tổng hợp" }, { table_id: "tblA03", name: "A03. Ngân sách" }],
  baseTwo: [{ table_id: "tblOther", name: "A03. Ngân sách" }],
};
class FakeClient {
  constructor({ config }) { this.config = config; calls.push({ ...config }); }
  async listTables() { return metadata[this.config.baseAppToken] ?? []; }
  async listFields() { return [{ field_name: this.config.tableId + " Amount", type: 2 }]; }
}
const { createBotTableAccess, baseLinksFromText } = load("app/lib/lark-bot-tables.ts", {
  "./lark-client": { LarkBaseClient: FakeClient }, "./lark-ai-query": { BaseQueryError }, "./lark-bot-config": { getBotConfig },
});
async function main() {
  const config = getBotConfig();
  assert.equal(config.tableId, "", "Must ignore LARK_TABLE_ID used for imports");
  assert.equal(config.appId, "stableBot");
  env.LARK_BOT_APP_ID = "dedicatedBot";
  env.LARK_BOT_APP_SECRET = "dedicatedSecret";
  assert.equal(getBotConfig().appId, "dedicatedBot");
  assert.equal(getBotConfig().appSecret, "dedicatedSecret");
  const signal = new AbortController().signal;
  const access = createBotTableAccess(config, "Tổng A03", signal);
  const listed = await access.listTables();
  assert.equal(listed.length, 2);
  const opened = await access.openTable({ table: "A03" });
  assert.equal(opened.table.tableId, "tblA03");
  assert.equal(opened.fields[0].field_name, "tblA03 Amount");
  assert.equal(opened.client.config.appId, "stableBot");
  assert.equal(opened.client.config.tableId, "tblA03");
  assert.ok(calls.every(call => call.tableId !== "tblImportOnly"));
  await assert.rejects(access.openTable({ table: "" }), /Chưa xác định/);
  await assert.rejects(access.openTable({ table: "tblNotFound" }), /Chưa xác định/);
  await assert.rejects(access.openTable({ table: "tblOther", baseToken: "baseTwo" }), /Chưa xác định/);
  const linked = createBotTableAccess(config, "https://tenant.larksuite.com/base/baseTwo?table=tblOther", signal);
  assert.equal((await linked.openTable({ table: "" })).table.tableId, "tblOther");
  const multiple = createBotTableAccess({ ...config, baseTokens: ["baseOne", "baseTwo"] }, "A03", signal);
  await assert.rejects(multiple.openTable({ table: "A03" }), /nhiều bảng/);
  assert.equal((await linked.openTable({ table: "A03" })).table.baseToken, "baseTwo");
  assert.equal((await linked.openTable({ table: "A03", baseToken: "baseTwo" })).table.tableId, "tblOther");
  const baseOnlyLink = createBotTableAccess({ ...config, tableId: "tblA03" }, "https://tenant.larksuite.com/base/baseTwo", signal);
  assert.equal((await baseOnlyLink.openTable({ table: "" })).table.tableId, "tblOther", "User Base link takes precedence over a default table in another Base");
  assert.equal(baseLinksFromText("https://larksuite.com.evil.test/base/secret").length, 0);
  assert.equal(baseLinksFromText("https://evil.test/base/secret").length, 0);
  assert.equal(baseLinksFromText("https://t.feishu.cn/base/baseTwo?table=tblOther")[0].tableId, "tblOther");
  const noBase = createBotTableAccess({ ...config, baseTokens: [] }, "hello", signal);
  await assert.rejects(noBase.listTables(), /gửi link Base/);
  env.LARK_BOT_BASE_APP_TOKENS = "baseOne,baseTwo,baseOne";
  assert.equal(getBotConfig().baseTokens.length, 2);
  env.LARK_BOT_BASE_APP_TOKENS = "../../secret";
  assert.throws(getBotConfig, /Invalid bot Base/);
  console.log("Independent bot configuration and table discovery checks passed (offline)");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
