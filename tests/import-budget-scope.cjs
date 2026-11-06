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
const names = ["Brand", "Quý ngân sách", "Năm", "Tháng ngân sách", "Mã ngân sách", "Hạng mục", "Số tiền TGĐ duyệt", "Phân loại nguồn NS", "Mã phiếu đề xuất"];
const client = {
  listFields: async () => names.map((field_name) => ({ field_name, type: field_name === "Số tiền TGĐ duyệt" ? 2 : 1, property: {} })),
  createRecord: async (fields) => {
    writes.push(fields);
    return { record_id: `record-${writes.length}` };
  },
  updateRecord: async (id, fields) => { updates.push({ id, fields }); },
};
const catalog = JSON.parse(fs.readFileSync("data/budget-codes.json", "utf8"));
const budgetItemsByCode = JSON.parse(fs.readFileSync("data/budget-code-budget-items.json", "utf8"));
const roots = new Set(catalog.filter((code) => code.includes("-")).map((code) => code.split("-")[0]));
const codesByBudgetItem = new Map(
  Object.entries(budgetItemsByCode).map(([code, budgetItem]) => [budgetItem.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase(), code])
);
const context = {
  exports: {}, console, Buffer, FormData, File, process,
  require: (name) => {
    if (name === "./lark-client") return { getLarkClient: () => client };
    if (name === "./budget-codes") return {
      getRootOnlyImportCode: (code) => roots.has(code) ? `${code}-00-00` : code,
      getBudgetCodeForBudgetItem: (budgetItem) => codesByBudgetItem.get(budgetItem.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase()) ?? null,
    };
    if (["./config", "./auth", "next/headers"].includes(name)) return {};
    if (name === "fs/promises") return { mkdir: async () => {}, readFile: async () => "[]", writeFile: async () => {} };
    return require(name);
  },
};
vm.createContext(context);
const source = fs.readFileSync("app/lib/action.ts", "utf8");
vm.runInContext(ts.transpile(source, { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true }), context);

function makeForm(workbook, hasChildren = false, approvalInstanceCode = "") {
  const file = new File([XLSX.write(workbook, { type: "buffer", bookType: "xlsx" })], "budget.xlsx");
  const form = new FormData();
  form.set("file", file);
  form.set("hasChildBudgetCodes", String(hasChildren));
  form.set("approvalInstanceCode", approvalInstanceCode);
  return form;
}

async function runWorkbook(workbook, hasChildren = false, approvalInstanceCode = "") {
  writes.length = 0;
  updates.length = 0;
  const result = await context.exports.importTgdBudgetExcelAction(makeForm(workbook, hasChildren, approvalInstanceCode));
  assert.equal(result.success, true, result.message);
  return result.data;
}

async function run(sheet, hasChildren = false, approvalInstanceCode = "") {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Budget");
  return runWorkbook(workbook, hasChildren, approvalInstanceCode);
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

  result = await run(adjacent, false, "approval-budget-2026-01");
  assert.equal(result.created, 4);
  assert.ok(writes.every((row) => row["Mã phiếu đề xuất"] === "approval-budget-2026-01"));

  const mappedSheet = XLSX.utils.aoa_to_sheet([
    ["Brand", "Brand A"],
    ["Quý", "Q1/2026"],
    [null, null, null, "TGĐ DUYỆT NGÂN SÁCH THÁNG 1/2026"],
    ["Hạng mục", "Mã ngân sách", "Khoản ngân sách", "Brand A"],
    ["Booking", "WRONG-CODE", " Hot   Page ", 125],
    ["Khác", "OLD001", "Khoản chưa có trong danh mục", 50],
  ]);
  const mappedLegacySheet = XLSX.utils.aoa_to_sheet([
    ["Brand", "Brand A"],
    ["Quý", "Q1/2026"],
    [null, null, null, "TGĐ DUYỆT NGÂN SÁCH Q1/2026"],
    ["Hạng mục", "Mã ngân sách", "Khoản ngân sách"],
    [null, null, null, "Tháng 1"],
    ["Booking", "WRONG-CODE", "Hot Page", 75],
  ]);
  const workbookWithMapping = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbookWithMapping, mappedSheet, "Budget A");
  XLSX.utils.book_append_sheet(workbookWithMapping, mappedLegacySheet, "Budget B");

  const preview = await context.exports.listSheetsAndMonthsAction(makeForm(workbookWithMapping));
  assert.equal(preview.success, true, preview.message);
  assert.deepEqual(Array.from(preview.data.sheets), ["Budget A", "Budget B"]);
  assert.deepEqual(Array.from(preview.data.categories), ["Booking", "Khác"]);

  result = await runWorkbook(workbookWithMapping, true);
  assert.equal(result.created, 2);
  assert.equal(result.updated, 1);
  assert.deepEqual(writes.map((row) => row["Mã ngân sách"]), ["BOO002-01-00", "OLD001"]);

  const checkWorkbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(checkWorkbook, XLSX.utils.aoa_to_sheet([
    ["Khoản ngân sách", "Mã ngân sách"],
    ["Hot Page", "BOO002-01"],
    ["Hot Page", "WRONG-CODE"],
    ["Hot Page", ""],
    ["Khoản chưa có trong danh mục", "OLD001"],
  ]), "Check A");
  XLSX.utils.book_append_sheet(checkWorkbook, XLSX.utils.aoa_to_sheet([
    ["Mã ngân sách", "Khoản ngân sách"],
    ["BOO002-01", "Hot Page"],
  ]), "Check B");
  const checkResult = await context.exports.checkBudgetCodeExcelMappingAction(makeForm(checkWorkbook));
  assert.equal(checkResult.success, true, checkResult.message);
  assert.deepEqual(
    Array.from(checkResult.data.rows, (row) => [row.sheetName, row.status, row.expectedCode, row.codeColumn]),
    [
      ["Check A", "matched", "BOO002-01", 1],
      ["Check A", "mismatched", "BOO002-01", 1],
      ["Check A", "missing", "BOO002-01", 1],
      ["Check A", "unmapped", null, 1],
      ["Check B", "matched", "BOO002-01", 0],
    ]
  );
  console.log("Import scope regression checks passed (static mapping, multi-sheet Excel check and duplicate contributions).");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
