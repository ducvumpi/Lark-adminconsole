/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

function load(file, extra = {}) {
  const context = { exports: {}, require, AbortSignal, ...extra };
  vm.createContext(context);
  vm.runInContext(ts.transpile(fs.readFileSync(file, "utf8"), {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
  }), context);
  return context.exports;
}
const queryModule = load("app/lib/lark-ai-query.ts");
const { queryBase } = queryModule;
const fields = [
  { field_name: "Brand", type: 1 }, { field_name: "Năm", type: 2 },
  { field_name: "Số tiền", type: 2 }, { field_name: "Ngày", type: 5 },
];
const row = (id, brand, amount, year = 2026) => ({ record_id: id, fields: { Brand: brand, "Năm": year, "Số tiền": amount, "Ngày": 1767225600000 } });
function reader(pages) {
  const requests = [];
  return {
    requests, listFields: async () => fields,
    listRecords: async options => { requests.push(options); return pages[requests.length - 1]; },
  };
}
const sumQuery = {
  action: "sum", sumField: "Số tiền", columns: [],
  filters: [{ field: "Brand", operator: "equals", value: "abc" }, { field: "Năm", operator: "equals", value: "2026" }],
};
const completed = output => new Response(JSON.stringify({ status: "completed", output }), { status: 200 });
const call = args => ({ type: "function_call", name: "query_base", arguments: JSON.stringify(args), call_id: "call1" });
const message = text => ({ type: "message", role: "assistant", content: [{ type: "output_text", text }] });

async function main() {
  const client = reader([
    { items: [row("a", "ABC", 100), row("b", "XYZ", 999)], hasMore: true, pageToken: "page2" },
    { items: [row("c", [{ text: "A" }, { text: "bc" }], "200"), row("d", "ABC", null), row("e", "ABC", 888, 2025)], hasMore: false },
  ]);
  const sum = await queryBase(client, fields, sumQuery);
  assert.equal(sum.sum, 300);
  assert.equal(sum.count, 3);
  assert.equal(sum.emptyCount, 1);
  assert.equal(client.requests[1].pageToken, "page2");
  assert.deepEqual(Array.from(client.requests[0].fieldNames).sort(), ["Brand", "Năm", "Số tiền"].sort());
  const invalid = reader([]);
  await assert.rejects(queryBase(invalid, fields, { ...sumQuery, sumField: "Brand" }), /cột số/);
  await assert.rejects(queryBase(invalid, fields, { ...sumQuery, action: "delete" }), /không hợp lệ/);
  await assert.rejects(queryBase(invalid, fields, { ...sumQuery, filters: [{ field: "Missing", operator: "equals", value: "x" }] }), /Không tìm thấy/);
  await assert.rejects(queryBase(invalid, fields, { ...sumQuery, filters: [{ field: "Năm", operator: "equals", value: "abc" }] }), /giá trị số/);
  assert.equal(invalid.requests.length, 0);
  await assert.rejects(queryBase(reader([{ items: [row("a", "ABC", "1.000 đ")], hasMore: false }]), fields, sumQuery), /không phải số/);
  await assert.rejects(queryBase(reader([{ items: [], hasMore: true }]), fields, sumQuery), /Phân trang/);
  const large = reader(Array.from({ length: 10 }, (_, i) => ({ items: [row("a", "ABC", 1)], hasMore: true, pageToken: "page" + i })));
  await assert.rejects(queryBase(large, fields, sumQuery), /5.000/);
  assert.equal(large.requests.length, 10);
  const count = await queryBase(reader([{ items: [row("a", "ABC", 1), row("b", "ABC", 2)], hasMore: false }]), fields,
    { action: "count", sumField: null, filters: [], columns: [] });
  assert.equal(count.count, 2);
  const listed = await queryBase(reader([{ items: Array.from({ length: 15 }, (_, i) => row(String(i), "a".repeat(500), i)), hasMore: false }]), fields,
    { action: "list", sumField: null, filters: [], columns: ["Brand"] });
  assert.equal(listed.rows.length, 10);
  assert.equal(listed.hasMore, true);
  assert.equal(listed.rows[0].fields.Brand.length, 300);
  const dates = await queryBase(reader([{ items: [row("a", "ABC", 1)], hasMore: false }]), fields,
    { action: "count", sumField: null, columns: [], filters: [{ field: "Ngày", operator: "gte", value: "1767225600000" }] });
  assert.equal(dates.count, 1);

  const env = { OPENAI_API_KEY: "fake-key-for-offline-test", OPENAI_MODEL: "test-model" };
  const { answerWithOpenAI } = load("app/lib/lark-openai.ts", {
    process: { env }, console: { error() {} },
    require: name => {
      if (name === "./lark-ai-query") return queryModule;
      if (name === "./lark-client") return { FIELD_TYPE_LABEL: { 1: "Văn bản", 2: "Số", 5: "Ngày" } };
      return require(name);
    },
  });
  const requests = [];
  const api = async (url, options) => {
    assert.equal(url, "https://api.openai.com/v1/responses");
    assert.equal(options.headers.Authorization, "Bearer fake-key-for-offline-test");
    const body = JSON.parse(options.body);
    assert.equal(body.store, false);
    assert.equal(body.model, "test-model");
    requests.push(body);
    return completed(requests.length === 1 ? [call(sumQuery)] : [message("Tổng: 300 từ 2 bản ghi.")]);
  };
  const answer = await answerWithOpenAI("Tổng ngân sách ABC năm 2026?", {
    client: reader([{ items: [row("a", "ABC", 100), row("b", "ABC", 200)], hasMore: false }]), fetch: api,
  });
  assert.equal(answer, "Tổng: 300 từ 2 bản ghi.");
  assert.equal(requests.length, 2);
  assert.equal(requests[0].tools[0].strict, true);
  const toolResult = requests[1].input.find(item => item.type === "function_call_output");
  assert.equal(JSON.parse(toolResult.output).sum, 300);
  assert.equal(toolResult.call_id, "call1");

  let errorRounds = 0;
  await answerWithOpenAI("Tính tổng", { client: reader([]), fetch: async (_url, options) => {
    errorRounds++;
    if (errorRounds === 1) return completed([call({ ...sumQuery, sumField: "Wrong" })]);
    const output = JSON.parse(options.body).input.find(item => item.type === "function_call_output");
    assert.match(JSON.parse(output.output).error, /cột số/);
    return completed([message("Cần chọn cột số.")]);
  } });
  const offline = reader([]);
  assert.match(await answerWithOpenAI("test", { client: offline, fetch: async () => new Response("", { status: 429 }) }), /hạn mức/);
  assert.match(await answerWithOpenAI("test", { client: reader([]), fetch: async () => new Response("", { status: 401 }) }), /API key/);
  let unknownRounds = 0;
  const noWrite = reader([]);
  assert.match(await answerWithOpenAI("Xóa dữ liệu", { client: noWrite, fetch: async () => {
    unknownRounds++;
    return completed([{ ...call(sumQuery), name: "delete_records" }]);
  } }), /Chưa hoàn tất/);
  assert.equal(unknownRounds, 1);
  assert.equal(noWrite.requests.length, 0);
  delete env.OPENAI_API_KEY;
  assert.match(await answerWithOpenAI("test", { fetch: async () => { throw new Error("Must not call API"); } }), /Chưa cấu hình/);
  console.log("Lark OpenAI checks passed (offline, no API calls)");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
