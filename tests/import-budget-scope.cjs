/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const XLSX = require("xlsx");

// Run the real import action with in-memory Excel files and a fake Lark client.
// No network requests or audit-log writes are made by this regression check.
const writes = [];
const updates = [];
const names = ["Brand", "Quý ngân sách", "Năm", "Tháng ngân sách", "Mã ngân sách", "Hạng mục", "Số tiền TGĐ duyệt", "Phân loại nguồn NS"];
const client = {
  listFields: async () => names.map((field_name) => ({ field_name, type: field_name === "Số tiền TGĐ duyệt" ? 2 : 1, property: {} })),
  createRecord: async (fields) => {
    writes.push(fields);
    return { record_id: `record-${writes.length}` };
  },
  updateRecord: async (id, fields) => { updates.push({ id, fields }); },
};
const catalog = JSON.parse(fs.readFileSync("data/budget-codes.json", "utf8"));
const roots = new Set(catalog.filter((code) => code.includes("-")).map((code) => code.split("-")[0]));
const context = {
  exports: {}, console, Buffer, FormData, File, process,
  require: (name) => {
    if (name === "./lark-client") return { getLarkClient: () => client };
    if (name === "./budget-codes") return { getRootOnlyImportCode: (code) => roots.has(code) ? `${code}-00-00` : code };
    if (["./config", "./auth", "next/headers"].includes(name)) return {};
    if (name === "fs/promises") return { mkdir: async () => {}, readFile: async () => "[]", writeFile: async () => {} };
    return require(name);
  },
};
vm.createContext(context);
const source = fs.readFileSync("app/lib/action.ts", "utf8");
vm.runInContext(ts.transpile(source, { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true }), context);

async function run(sheet, hasChildren = false) {
  writes.length = 0;
  updates.length = 0;
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Budget");
  const file = new File([XLSX.write(workbook, { type: "buffer", bookType: "xlsx" })], "budget.xlsx");
  const form = new FormData();
  form.set("file", file);
  form.set("hasChildBudgetCodes", String(hasChildren));
  const result = await context.exports.importTgdBudgetExcelAction(form);
  assert.equal(result.success, true, result.message);
  return result.data;
}

async function main() {
  // Adjacent quarter blocks used to each scan eight columns, rereading January.
  const adjacent = XLSX.utils.aoa_to_sheet([
    ["Brand", "Brand A"],
    ["Quý", "Q1/2026"],
    [null, null, "TGĐ DUYỆT NGÂN SÁCH Q1/2026", null, "TGĐ DUYỆT NGÂN SÁCH Q2/2026"],
    ["Hạng mục", "Mã ngân sách"],
    [null, null, "Tháng 1", null, "Tháng 4"],
    ["Booking", "BOO002", 100, null, 200],
    ["Mã duy nhất", "BOO001", 30, null, 40],
  ]);
  let result = await run(adjacent);
  assert.equal(result.created, 4);
  assert.equal(result.updated, 0);
  assert.equal(updates.length, 0);
  assert.deepEqual(writes.map((row) => [row["Quý ngân sách"], row["Tháng ngân sách"], row["Mã ngân sách"], row["Số tiền TGĐ duyệt"]]), [
    ["Q1/2026", "Tháng 1", "BOO002-00-00", 100],
    ["Q1/2026", "Tháng 1", "BOO001", 30],
    ["Q2/2026", "Tháng 4", "BOO002-00-00", 200],
    ["Q2/2026", "Tháng 4", "BOO001", 40],
  ]);
  result = await run(adjacent, true);
  assert.equal(result.created, 4);
  assert.equal(result.updated, 0);
  assert.equal(writes[0]["Mã ngân sách"], "BOO002");

  // Duplicate title rows can associate the same header and money cell twice.
  const repeated = XLSX.utils.aoa_to_sheet([
    ["TGĐ DUYỆT NGÂN SÁCH THÁNG 1/2026"],
    ["TGĐ DUYỆT NGÂN SÁCH THÁNG 1/2026"],
    ["Hạng mục", "Mã ngân sách", "Brand A"],
    ["Booking", "BOO002", 100],
  ]);
  // Put titles at the approval column, matching a Brand-column template.
  delete repeated.A1; delete repeated.A2;
  repeated.C1 = { t: "s", v: "TGĐ DUYỆT NGÂN SÁCH THÁNG 1/2026" };
  repeated.C2 = { t: "s", v: "TGĐ DUYỆT NGÂN SÁCH THÁNG 1/2026" };
  result = await run(repeated);
  assert.equal(result.created, 1);
  assert.equal(result.updated, 0);
  assert.equal(writes[0]["Số tiền TGĐ duyệt"], 100);

  // Distinct source rows still legitimately contribute to the same synthetic code.
  repeated.A5 = { t: "s", v: "Booking thêm" };
  repeated.B5 = { t: "s", v: "BOO002" };
  repeated.C5 = { t: "n", v: 50 };
  repeated["!ref"] = "A1:C5";
  result = await run(repeated);
  assert.equal(result.created, 1);
  assert.equal(result.updated, 1);
  assert.equal(updates[0].fields["Số tiền TGĐ duyệt"], 150);
  console.log("Import scope regression checks passed (both Excel layouts, duplicate cells and distinct contributions).");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
