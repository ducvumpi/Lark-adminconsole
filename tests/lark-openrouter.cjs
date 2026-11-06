/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
function load(file, extra = {}) {
  const context = { exports: {}, require, AbortSignal, ...extra };
  vm.createContext(context);
  vm.runInContext(ts.transpile(fs.readFileSync(file, "utf8"), { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }), context);
  return context.exports;
}
const query = load("app/lib/lark-ai-query.ts");
const openai = load("app/lib/lark-openai.ts", { require: name => name === "./lark-client" ? {} : name === "./lark-ai-query" ? query : require(name) });
const env = { OPENROUTER_API_KEY: "offline-key", OPENROUTER_MODEL: "vendor/model" };
const logs = [];
const { answerWithOpenRouter, validateWrite, dateContext } = load("app/lib/lark-openrouter.ts", {
  process: { env }, console: { error: (...args) => logs.push(args) },
  require: name => name === "./lark-client" ? { FIELD_TYPE_LABEL: {} } : name === "./lark-ai-query" ? query : name === "./lark-openai" ? openai : ["./lark-bot-tables", "./lark-bot-config"].includes(name) ? {} : require(name),
});
const fields = [
  { field_name: "Name", type: 1 }, { field_name: "Amount", type: 2 },
  { field_name: "Status", type: 3, property: { options: [{ name: "Open" }] } },
  { field_name: "Date", type: 5 }, { field_name: "Done", type: 7 },
  { field_name: "Formula", type: 20 },
];
const create = { action: "create", recordId: null, values: [{ field: "Name", value: "ABC" }, { field: "Amount", value: 123 }] };
const update = { ...create, action: "update", recordId: "recOne" };
function client(rows = [{ record_id: "recOne", fields: { Name: "ABC" } }]) {
  const writes = [];
  return { writes, listFields: async () => fields, listRecords: async () => ({ items: rows, hasMore: false }),
    createRecord: async values => { writes.push(["create", values]); return { record_id: "recNew", fields: values }; },
    updateRecord: async (id, values) => { writes.push(["update", id, values]); return { record_id: id, fields: values }; },
  };
}
const tool = (name, args) => ({ role: "assistant", content: null, tool_calls: [{ id: "call1", type: "function", function: { name, arguments: JSON.stringify(args) } }] });
function api(messages, bodies = []) {
  let index = 0;
  return async (url, options) => {
    assert.equal(url, "https://openrouter.ai/api/v1/chat/completions");
    assert.equal(options.headers.Authorization, "Bearer offline-key");
    const body = JSON.parse(options.body);
    assert.equal(body.model, "vendor/model");
    // Endpoints such as Nemotron free reject the extra strict/parallel routing
    // requirements with 404 even though they support ordinary function calling.
    assert.equal(Object.hasOwn(body, "parallel_tool_calls"), false);
    assert.equal(Object.hasOwn(body.tools[0].function, "strict"), false);
    assert.equal(body.provider.require_parameters, true);
    bodies.push(body);
    const message = messages[index++];
    assert.ok(message, "Unexpected extra inference / write retry");
    return new Response(JSON.stringify({ choices: [{ finish_reason: message.tool_calls ? "tool_calls" : "stop", message }] }));
  };
}
async function main() {
  const dates = dateContext(new Date("2026-11-05T18:00:00Z"));
  assert.equal(dates.today, "2026-11-06", "Relative dates must use Vietnam time, not UTC");
  assert.equal(dates.yesterdayStart, Date.parse("2026-11-05T00:00:00+07:00"));
  assert.equal(dates.yesterdayEndExclusive, Date.parse("2026-11-06T00:00:00+07:00"));
  const chosen = client();
  const discoveryBodies = [];
  const tables = {
    listTables: async () => [{ baseToken: "baseOne", tableId: "tblA03", name: "A03" }],
    openTable: async args => { assert.equal(args.table, "A03"); return { table: { baseToken: "baseOne", tableId: "tblA03", name: "A03" }, fields, client: chosen }; },
  };
  const discoveryQuery = { action: "sum", filters: [], columns: [], sumField: "Amount" };
  const result = await answerWithOpenRouter("Tổng tiền A03", { canWrite: false, tables, fetch: api([
    tool("list_tables", {}), tool("open_table", { table: "A03", baseToken: null }), tool("query_base", discoveryQuery), { role: "assistant", content: "Đã tra cứu A03." },
  ], discoveryBodies) });
  assert.equal(result, "Đã tra cứu A03.");
  assert.deepEqual(discoveryBodies[0].tools.map(tool => tool.function.name), ["list_tables", "open_table"]);
  assert.ok(discoveryBodies[2].tools.some(tool => tool.function.name === "query_base"));
  assert.ok(!discoveryBodies[2].tools.some(tool => tool.function.name === "write_base"));
  const unselected = client();
  const blockedBodies = [];
  await answerWithOpenRouter("Tổng tiền", { canWrite: true, tables: { ...tables, openTable: async () => { throw Error("Should not open"); } }, fetch: api([
    tool("write_base", create), { role: "assistant", content: "Cần chọn bảng." },
  ], blockedBodies) });
  assert.equal(unselected.writes.length, 0);
  assert.match(JSON.parse(blockedBodies[1].messages.at(-1).content).error, /không được phép/);
  const firstTable = client();
  await answerWithOpenRouter("Tìm ABC rồi mở bảng khác và sửa", { canWrite: true, tables: {
    ...tables, openTable: async args => {
      if (args.table === "missing") throw new query.BaseQueryError("Không tìm thấy bảng");
      return { table: { name: "A03", tableId: "tblA03", baseToken: "baseOne" }, fields, client: firstTable };
    },
  }, fetch: api([
    tool("open_table", { table: "A03" }),
    tool("query_base", { action: "list", sumField: null, columns: [], filters: [] }),
    tool("open_table", { table: "missing" }), tool("write_base", update),
    { role: "assistant", content: "Cần chọn bảng lại." },
  ]) });
  assert.equal(firstTable.writes.length, 0, "Failed selection must not leave a prior table writable");
  const contextBodies = [];
  await answerWithOpenRouter("Ngân sách tôi import hôm qua trong A03?", { canWrite: false, tableName: "A03", client: client(), fetch: api([{ role: "assistant", content: "Bạn có mã đợt import không?" }], contextBodies) });
  assert.match(contextBodies[0].messages[0].content, /"A03"/);
  assert.match(contextBodies[0].messages[0].content, /không chứng minh thời gian import/);
  assert.match(contextBodies[0].messages[0].content, /yesterdayEndExclusive/);
  const ids = new Set(["recOne"]);
  assert.equal(validateWrite(update, fields, ids).values.Amount, 123);
  assert.throws(() => validateWrite(update, fields, new Set()), /recordId/);
  for (const entry of [{ field: "Formula", value: 2 }, { field: "Missing", value: "x" }, { field: "Amount", value: "123" }, { field: "Done", value: "true" }, { field: "Date", value: 1.5 }, { field: "Status", value: "New option" }]) {
    assert.throws(() => validateWrite({ ...create, values: [entry] }, fields, ids));
  }
  assert.throws(() => validateWrite({ ...create, values: [create.values[0], create.values[0]] }, fields, ids), /trùng/);
  const created = client();
  assert.match(await answerWithOpenRouter("Tạo ABC số tiền 123", { canWrite: true, client: created, fetch: api([tool("write_base", create)]) }), /Đã tạo.*recNew/);
  assert.equal(created.writes.length, 1);
  assert.equal(typeof created.writes[0][1].Amount, "number");
  const changed = client();
  const queryArgs = { action: "list", filters: [{ field: "Name", operator: "equals", value: "ABC" }], columns: ["Name"], sumField: null };
  const bodies = [];
  assert.match(await answerWithOpenRouter("Sửa ABC số tiền 123", { canWrite: true, client: changed, fetch: api([tool("query_base", queryArgs), tool("write_base", update)], bodies) }), /Đã cập nhật.*recOne/);
  assert.equal(changed.writes.length, 1);
  assert.equal(bodies[1].messages.at(-1).role, "tool");
  assert.equal(JSON.parse(bodies[1].messages.at(-1).content).rows[0].recordId, "recOne");
  const denied = client();
  const readBodies = [];
  await answerWithOpenRouter("Tạo ABC", { canWrite: false, client: denied, fetch: api([tool("write_base", create), { role: "assistant", content: "Không có quyền ghi." }], readBodies) });
  assert.equal(denied.writes.length, 0);
  assert.equal(readBodies[0].tools.length, 1);
  const ambiguous = client([{ record_id: "recOne", fields: { Name: "ABC" } }, { record_id: "recTwo", fields: { Name: "ABC" } }]);
  await answerWithOpenRouter("Sửa ABC", { canWrite: true, client: ambiguous, fetch: api([tool("query_base", queryArgs), tool("write_base", update), { role: "assistant", content: "Chọn recordId." }]) });
  assert.equal(ambiguous.writes.length, 0);
  const failed = client();
  failed.createRecord = async () => { throw new Error("secret transport details"); };
  const uncertain = await answerWithOpenRouter("Tạo ABC", { canWrite: true, client: failed, fetch: api([tool("write_base", create)]) });
  assert.match(uncertain, /kiểm tra Base/);
  assert.doesNotMatch(uncertain, /secret/);
  const unknown = client();
  await answerWithOpenRouter("Sửa ABC", { canWrite: true, client: unknown, fetch: api([tool("write_base", update), { role: "assistant", content: "Cần recordId." }]) });
  assert.equal(unknown.writes.length, 0);
  const explicit = client();
  assert.match(await answerWithOpenRouter("Sửa recOne thành ABC", { canWrite: true, client: explicit, fetch: api([tool("write_base", update)]) }), /Đã cập nhật/);
  assert.match(await answerWithOpenRouter("test", { canWrite: false, client: client(), fetch: async () => new Response("", { status: 429 }) }), /hạn mức/);
  for (const [status, message, expected, reason] of [
    [401, "Invalid key offline-key", /401.*API key/, "authentication"],
    [402, "Insufficient credits", /402.*credits/, "credits"],
    [403, "Forbidden", /403.*từ chối/, "forbidden"],
    [404, "No endpoints found that can handle the requested parameters", /404.*tham số/, "unsupported_parameters"],
    [404, "No endpoints found matching your data policy", /404.*chính sách dữ liệu/, "data_policy"],
    [400, "not a valid model ID", /400.*Model ID/, "invalid_model"],
    [404, "Not found", /404.*Không tìm thấy/, "no_endpoint"],
    [400, "Invalid request", /400.*tham số/, "invalid_request"],
    [429, "Rate limited", /429.*giới hạn/, "rate_limit"],
    [503, "No provider", /503.*không khả dụng/, "provider_unavailable"],
  ]) {
    const output = await answerWithOpenRouter("test", { canWrite: false, client: client(), fetch: async () => new Response(JSON.stringify({ error: { code: status, message, metadata: { raw: "SECRET PROMPT offline-key" } } }), { status }) });
    assert.match(output, expected);
    assert.equal(logs.at(-1)[1].reason, reason);
    assert.equal(logs.at(-1)[1].httpStatus, status);
    assert.doesNotMatch(output, /offline-key|SECRET/);
  }
  assert.doesNotMatch(JSON.stringify(logs), /offline-key|SECRET|Invalid key/);
  assert.match(await answerWithOpenRouter("test", { canWrite: false, client: client(), fetch: async () => new Response(JSON.stringify({ error: { code: 429, message: "Rate limited" } }), { status: 200 }) }), /429.*giới hạn/);
  assert.match(await answerWithOpenRouter("test", { canWrite: false, client: client(), fetch: async () => new Response("<html>SECRET</html>", { status: 502 }) }), /502/);
  const parallel = client();
  const multi = tool("write_base", create);
  multi.tool_calls.push({ ...multi.tool_calls[0], id: "call2" });
  assert.match(await answerWithOpenRouter("Tạo ABC", { canWrite: true, client: parallel, fetch: api([multi]) }), /quá nhiều công cụ/);
  assert.equal(parallel.writes.length, 0, "Multiple calls must be rejected before mutation");
  const truncated = client();
  assert.match(await answerWithOpenRouter("Tổng hôm qua", { canWrite: true, client: truncated, fetch: async () => new Response(JSON.stringify({ choices: [{ finish_reason: "length", message: { content: "partial text", tool_calls: [tool("write_base", create).tool_calls[0]] } }] })) }), /hết giới hạn token/);
  assert.equal(truncated.writes.length, 0, "Truncated responses must never execute even a complete-looking write");
  assert.equal(logs.at(-1)[1].reason, "output_limit");
  const broken = tool("query_base", queryArgs);
  broken.tool_calls[0].function.arguments = "{bad JSON SECRET";
  const repairedBodies = [];
  await answerWithOpenRouter("Tính tổng", { canWrite: false, client: client(), fetch: api([broken, { role: "assistant", content: "Hãy làm rõ yêu cầu." }], repairedBodies) });
  assert.match(JSON.parse(repairedBodies[1].messages.at(-1).content).error, /JSON hợp lệ/);
  assert.doesNotMatch(JSON.stringify(logs), /SECRET/);
  const failingReader = client();
  failingReader.listRecords = async () => { throw new Error("SECRET transport"); };
  assert.match(await answerWithOpenRouter("Tra cứu", { canWrite: false, client: failingReader, fetch: api([tool("query_base", queryArgs)]) }), /Chưa đọc được dữ liệu Base/);
  assert.equal(logs.at(-1)[1].reason, "base_transport");
  assert.equal(logs.at(-1)[1].stage, "tool");
  for (const setting of [undefined, "1024", "8192", "999999", "bad", "2000.5"]) {
    if (setting === undefined) delete env.OPENROUTER_MAX_OUTPUT_TOKENS;
    else env.OPENROUTER_MAX_OUTPUT_TOKENS = setting;
    const bodies = [];
    await answerWithOpenRouter("Test", { canWrite: false, client: client(), fetch: api([{ role: "assistant", content: "OK" }], bodies) });
    assert.equal(bodies[0].max_tokens, ["1024", "8192"].includes(setting) ? Number(setting) : 4096);
  }
  delete env.OPENROUTER_MODEL;
  assert.match(await answerWithOpenRouter("test", { canWrite: false, fetch: async () => { throw new Error("Must not call"); } }), /Chưa cấu hình/);
  console.log("Lark OpenRouter checks passed (offline, no API calls)");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
