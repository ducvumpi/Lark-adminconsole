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
const { answerWithOpenRouter, validateWrite } = load("app/lib/lark-openrouter.ts", {
  process: { env }, console: { error: (...args) => logs.push(args) },
  require: name => name === "./lark-client" ? {} : name === "./lark-ai-query" ? query : name === "./lark-openai" ? openai : require(name),
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
  assert.match(await answerWithOpenRouter("Tạo ABC", { canWrite: true, client: parallel, fetch: api([multi]) }), /Chưa hoàn tất/);
  assert.equal(parallel.writes.length, 0, "Multiple calls must be rejected before mutation");
  delete env.OPENROUTER_MODEL;
  assert.match(await answerWithOpenRouter("test", { canWrite: false, fetch: async () => { throw new Error("Must not call"); } }), /Chưa cấu hình/);
  console.log("Lark OpenRouter checks passed (offline, no API calls)");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
