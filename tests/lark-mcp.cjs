/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

function load(file, extra = {}) {
  const context = { exports: {}, require, Buffer, Request, Response, AbortSignal, URL, ...extra };
  vm.createContext(context);
  vm.runInContext(ts.transpile(fs.readFileSync(file, "utf8"), {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
  }), context);
  return context.exports;
}
const query = load("app/lib/lark-ai-query.ts");
const bot = load("app/lib/lark-bot.ts");
const reportFormatter = load("app/lib/lark-budget-report.ts");
const env = { LARK_MCP_TOKEN: "offline-test-token" };
const logs = [];
const { handleMcp } = load("app/lib/lark-mcp.ts", {
  process: { env }, console: Object.fromEntries(["info", "warn", "error"].map(level => [level, (...args) => logs.push(args)])),
  require: name => {
    if (name === "./lark-ai-query") return query;
    if (name === "./lark-bot") return bot;
    if (name === "./lark-budget-report") return reportFormatter;
    if (name === "./lark-client") return { FIELD_TYPE_LABEL: { 1: "Văn bản", 2: "Số", 3: "Lựa chọn đơn" } };
    return require(name);
  },
});
const fields = [
  { field_name: "Brand", type: 3, property: { options: [{ name: "Horus" }, { name: "Other" }] } },
  { field_name: "Năm", type: 3, property: { options: [{ name: "2026" }] } },
  { field_name: "Số tiền TGĐ duyệt", type: 2 },
];
const rows = [
  { record_id: "a", fields: { Brand: "Horus", "Năm": "2026", "Số tiền TGĐ duyệt": 100 } },
  { record_id: "b", fields: { Brand: "Other", "Năm": "2026", "Số tiền TGĐ duyệt": 999 } },
  { record_id: "c", fields: { Brand: "Horus", "Năm": "2026", "Số tiền TGĐ duyệt": 200 } },
];
let constructions = 0;
let reads = 0;
let transportError = false;
let fakeError;
const dependencies = { createClient: () => {
  constructions++;
  return {
    listFields: async () => {
      if (transportError) throw fakeError ?? { response: { data: { secret: "DO_NOT_EXPOSE" } }, config: { Authorization: "DO_NOT_EXPOSE" } };
      return fields;
    },
    listRecords: async () => { reads++; return { items: rows, hasMore: false }; },
  };
} };
function request(body, headers = {}, method = "POST") {
  return new Request("https://example.test/api/bot/mcp", {
    method, headers: { authorization: "Bearer offline-test-token", "content-type": "application/json", accept: "application/json, text/event-stream", ...headers },
    ...(method === "POST" ? { body: typeof body === "string" ? body : JSON.stringify(body) } : {}),
  });
}
const rpc = (method, params, id = 1) => ({ jsonrpc: "2.0", id, method, ...(params ? { params } : {}) });
const post = (body, headers) => handleMcp(request(body, headers), dependencies);
const call = async (name, args) => (await post(rpc("tools/call", { name, arguments: args }))).json();
const resultText = response => JSON.parse(response.result.content[0].text);

async function main() {
  assert.equal((await post(rpc("tools/list"), { authorization: "" })).status, 401);
  assert.equal((await post(rpc("tools/list"), { authorization: "Bearer wrong" })).status, 401);
  assert.equal((await post(rpc("tools/list"), { origin: "https://evil.test" })).status, 403);
  assert.equal((await post(rpc("tools/list"), { "mcp-protocol-version": "unsupported" })).status, 400);
  assert.equal((await post(rpc("tools/list"), { accept: "text/html" })).status, 406);
  assert.equal((await post("{}", { "content-type": "text/plain" })).status, 415);
  assert.equal((await post("x".repeat(65537))).status, 413);
  assert.equal((await post("broken-json")).status, 400);
  assert.equal((await post([rpc("ping")])).status, 400);
  assert.equal(constructions, 0);
  delete env.LARK_MCP_TOKEN;
  assert.equal((await post(rpc("tools/list"))).status, 503);
  env.LARK_MCP_TOKEN = "offline-test-token";
  for (const version of ["2025-03-26", "2025-06-18", "2025-11-25"]) {
    const initialize = await post(rpc("initialize", { protocolVersion: version, capabilities: {}, clientInfo: { name: "test", version: "1" } }));
    const body = await initialize.json();
    assert.equal(body.result.protocolVersion, version);
    assert.ok(body.result.capabilities.tools);
    assert.equal(initialize.headers.get("cache-control"), "no-store");
    assert.equal(initialize.headers.get("mcp-session-id"), null);
  }
  const notified = await post({ jsonrpc: "2.0", method: "notifications/initialized" });
  assert.equal(notified.status, 202);
  assert.equal(await notified.text(), "");
  assert.equal((await post(rpc("ping", undefined, 0))).status, 200);
  assert.equal((await (await post(rpc("resources/list"))).json()).error.code, -32601);
  const get = await handleMcp(request(undefined, {}, "GET"), dependencies);
  assert.equal(get.status, 405);
  assert.equal(get.headers.get("allow"), "POST");
  assert.equal((await handleMcp(request(undefined, {}, "DELETE"), dependencies)).status, 405);
  const tools = (await (await post(rpc("tools/list"))).json()).result.tools;
  assert.deepEqual(tools.map(tool => tool.name), ["list_base_fields", "query_base", "summarize_budget"]);
  assert.ok(tools.every(tool => tool.annotations.readOnlyHint));
  // Regression: Lark's Go reader rejects JSON Schema type unions such as
  // type: ["string", "null"]. Inspect every nested property and array item.
  const checkLarkSchema = schema => {
    assert.equal(typeof schema.type, "string");
    for (const property of Object.values(schema.properties || {})) checkLarkSchema(property);
    if (schema.items) checkLarkSchema(schema.items);
    assert.equal(Array.isArray(schema.default), false);
  };
  tools.forEach(tool => checkLarkSchema(tool.inputSchema));
  const querySchema = tools.find(tool => tool.name === "query_base").inputSchema;
  assert.equal(querySchema.properties.sumField.type, "string");
  assert.ok(!querySchema.required.includes("sumField"));
  assert.equal(constructions, 0);

  const schema = resultText(await call("list_base_fields", {}));
  assert.deepEqual(schema.fields[0].options, ["Horus", "Other"]);
  fields.push({ field_name: "Check cấp NS", type: 20, property: { type: { data_type: 3, ui_property: { options: [{ id: "opt_level_3", name: "Khoản chi cấp 3" }] } } } });
  const computedSchema = resultText(await call("list_base_fields", {})).fields.find(field => field.name === "Check cấp NS");
  assert.equal(computedSchema.resultType, 3);
  assert.deepEqual(computedSchema.options, ["Khoản chi cấp 3"]);
  const sum = resultText(await call("query_base", {
    action: "sum", sumField: "Số tiền TGĐ duyệt",
    filters: [{ field: "Brand", operator: "equals", value: "Horus" }, { field: "Năm", operator: "equals", value: "2026" }],
  }));
  assert.equal(sum.sum, 300);
  assert.equal(sum.count, 2);
  const listed = resultText(await call("query_base", { action: "list", columns: ["Brand"], filters: [{ field: "Brand", operator: "equals", value: "Other" }] }));
  assert.equal(listed.rows.length, 1);
  assert.equal(listed.rows[0].fields.Brand, "Other");
  const all = resultText(await call("query_base", { action: "list", limit: 100, columns: ["Brand"] }));
  assert.equal(all.rows.length, 3);
  assert.equal(all.hasMore, false);
  assert.equal(all.limit, 100);
  assert.equal((await call("query_base", { action: "list", limit: 101 })).result.isError, true);
  assert.equal(resultText(await call("query_base", { action: "count" })).count, 3);
  const report = resultText(await call("summarize_budget", { sumField: "Số tiền TGĐ duyệt", groupBy: ["Brand"], title: "Báo cáo thử" }));
  assert.equal(report.sum, 1299);
  assert.equal(report.count, 3);
  assert.equal(report.groupCount, 2);
  assert.match(report.reportText, /Báo cáo thử/);
  assert.match(report.reportText, /Horus/);
  assert.match(report.reportText, /1\.299/);
  assert.equal((await call("summarize_budget", { sumField: "Số tiền TGĐ duyệt", groupBy: ["Missing"] })).result.isError, true);
  assert.equal((await call("summarize_budget", { sumField: "Số tiền TGĐ duyệt", groupBy: ["Brand"], receiveId: "someone" })).error.code, -32602);
  assert.equal((await call("query_base", { action: "report" })).error.code, -32602);
  const invalid = await call("query_base", { action: "sum", sumField: "Missing" });
  assert.equal(invalid.result.isError, true);
  assert.match(invalid.result.content[0].text, /cột số/);
  const beforeUnknown = constructions;
  assert.equal((await call("delete_records", {})).error.code, -32602);
  assert.equal((await call("query_base", { action: "count", tableId: "other" })).error.code, -32602);
  assert.equal(constructions, beforeUnknown);
  const beforeNotification = reads;
  await post({ jsonrpc: "2.0", method: "tools/call", params: { name: "query_base", arguments: { action: "count" } } });
  assert.equal(reads, beforeNotification);
  fields.push({ field_name: "Quý công thức", type: 20 }, { field_name: "Tổng công thức", type: 20 });
  rows.forEach((row, index) => {
    row.fields["Quý công thức"] = { type: 1, value: [index === 1 ? "Q3/2026" : "Q4/2026"] };
    row.fields["Tổng công thức"] = { type: 2, value: [row.fields["Số tiền TGĐ duyệt"]] };
  });
  const formula = resultText(await call("query_base", {
    action: "sum", sumField: "Tổng công thức",
    filters: [{ field: "Quý công thức", operator: "equals", value: "Q4/2026" }],
  }));
  assert.equal(formula.sum, 300);
  assert.equal(formula.count, 2);
  transportError = true;
  const failure = await call("list_base_fields", {});
  assert.equal(failure.result.isError, true);
  assert.ok(!JSON.stringify(failure).includes("DO_NOT_EXPOSE"));
  assert.ok(!JSON.stringify(logs).includes("DO_NOT_EXPOSE"));
  fakeError = { response: { status: 403, data: { code: 99991672, secret: "DO_NOT_EXPOSE" } } };
  const denied = await call("list_base_fields", {});
  assert.match(denied.result.content[0].text, /99991672/);
  assert.equal(logs[logs.length - 1][1].apiCode, 99991672);
  assert.equal(logs[logs.length - 1][1].stage, "list_fields");
  assert.equal(logs[logs.length - 1][1].deadlineExceeded, false);
  fakeError = { reason: "app_credentials_missing", message: "DO_NOT_EXPOSE" };
  assert.match((await call("list_base_fields", {})).result.content[0].text, /App ID\/App Secret/);
  fakeError = { reason: "base_table_missing" };
  assert.match((await call("list_base_fields", {})).result.content[0].text, /Base App Token\/Table ID/);
  fakeError = { code: "ECONNABORTED" };
  assert.match((await call("list_base_fields", {})).result.content[0].text, /quá thời gian/);
  assert.equal(logs[logs.length - 1][1].networkCode, "ECONNABORTED");
  assert.ok(!JSON.stringify(logs).includes("DO_NOT_EXPOSE"));
  console.log("Lark MCP checks passed (offline, no API calls)");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
