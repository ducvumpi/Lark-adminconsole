/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
function load(file) {
  const context = { exports: {}, require, AbortSignal };
  vm.createContext(context);
  vm.runInContext(ts.transpile(fs.readFileSync(file, "utf8"), { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }), context);
  return context.exports;
}
const { queryBase } = load("app/lib/lark-ai-query.ts");
const { formatBudgetReport } = load("app/lib/lark-budget-report.ts");
const fields = [
  { field_name: "Brand", type: 3, property: { options: [{ name: "Horus" }, { name: "Roundlab" }] } },
  { field_name: "Tháng", type: 20 }, { field_name: "Số tiền", type: 20 }, { field_name: "Nhãn", type: 4 },
];
const row = (id, brand, month, amount) => ({ record_id: id, fields: { Brand: brand, Tháng: month, "Số tiền": amount } });
const query = { action: "report", sumField: "Số tiền", columns: [], filters: [], groupBy: ["Brand"], limit: 10 };
function reader(pages) {
  let page = 0;
  return { listRecords: async () => pages[page++] };
}

async function main() {
  const report = await queryBase(reader([
    { items: [row("1", "Horus", "Tháng 10", 100), row("2", "Roundlab", "Tháng 10", 500)], hasMore: true, pageToken: "2" },
    { items: [row("3", "Horus", "Tháng 11", { type: 2, value: [200] }), row("4", "Horus", "Tháng 11", null), row("5", "", "Tháng 10", -50)], hasMore: false },
  ]), fields, query);
  assert.equal(report.sum, 750);
  assert.equal(report.count, 5);
  assert.equal(report.numericCount, 4);
  assert.equal(report.emptyCount, 1);
  assert.equal(report.groupCount, 3);
  assert.equal(report.hasMoreGroups, false);
  const horus = report.groups.find(group => group.values[0] === "Horus");
  assert.equal(horus.sum, 300);
  assert.equal(horus.count, 3);
  assert.equal(horus.emptyCount, 1);
  assert.equal(report.groups[0].values[0], "Roundlab");
  const table = formatBudgetReport(report, [], "Báo cáo ngân sách");
  assert.match(table, /Tổng: 750/);
  assert.match(table, /Horus/);
  assert.match(table, /\(Trống\)/);
  assert.match(table, /1 bản ghi trống/);
  assert.match(table, /```/);

  const rows = [row("1", "Horus", "Tháng 10", 0.1), row("2", "Horus", "Tháng 10", 0.2), row("3", "Roundlab", "Tháng 11", 50)];
  const filters = [{ field: "Tháng", operator: "equals", value: "Tháng 10" }];
  const filtered = await queryBase(reader([{ items: rows, hasMore: false }]), fields, { ...query, filters, groupBy: ["Brand", "Tháng"] });
  assert.equal(filtered.count, 2);
  assert.ok(Math.abs(filtered.sum - 0.3) < 1e-12);
  assert.equal(filtered.groups.length, 1);
  assert.match(formatBudgetReport(filtered, filters), /Tháng = Tháng 10/);
  const top = await queryBase(reader([{ items: rows, hasMore: false }]), fields, { ...query, limit: 1 });
  assert.equal(top.groupCount, 2);
  assert.equal(top.groups.length, 1);
  assert.equal(top.hasMoreGroups, true);
  assert.equal(top.other.count, 2);
  assert.ok(Math.abs(top.other.sum - 0.3) < 1e-12);
  assert.match(formatBudgetReport(top, []), /Khác \(1 nhóm\)/);
  assert.match(formatBudgetReport(top, []), /Tổng phía trên gồm toàn bộ nhóm/);

  const empty = await queryBase(reader([{ items: [], hasMore: false }]), fields, query);
  assert.equal(empty.sum, 0);
  assert.equal(empty.groups.length, 0);
  assert.match(formatBudgetReport(empty, []), /Bản ghi: 0/);
  for (const input of [{ ...query, groupBy: [] }, { ...query, groupBy: ["Brand", "Brand"] }, { ...query, groupBy: ["Nhãn"] }, { ...query, limit: 31 }, { ...query, sumField: "Brand" }]) {
    await assert.rejects(queryBase(reader([]), fields, input));
  }
  await assert.rejects(queryBase(reader([{ items: [row("x", "Horus", "Tháng 10", [10, 20])], hasMore: false }]), fields, query), /nhiều giá trị/);
  const tooMany = reader(Array.from({ length: 10 }, (_, i) => ({ items: [rows[0]], hasMore: true, pageToken: String(i) })));
  await assert.rejects(queryBase(tooMany, fields, query), /5.000/);
  const hostile = { ...report, groups: [{ ...report.groups[0], values: ["```\n<at id=all>|x"] }] };
  const safe = formatBudgetReport(hostile, [], "<at id=all>");
  assert.equal((safe.match(/```/g) || []).length, 2);
  assert.ok(!safe.includes("<at"));
  assert.ok(!safe.includes("|x"));
  console.log("Budget report checks passed (offline, no API calls or messages sent)");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
