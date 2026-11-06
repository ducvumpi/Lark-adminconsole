"use client";

import { useState, type FormEvent } from "react";
import * as XLSX from "xlsx";
import {
  checkBudgetCodeExcelMappingAction,
  type BudgetCodeExcelCheckResult,
} from "@/app/lib/action";
import {
  budgetCodes,
  budgetCodeGroups,
} from "@/app/lib/budget-codes";

export default function BudgetCodeCatalog() {
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState("");
  const [checkFile, setCheckFile] = useState<File | null>(null);
  const [checkResult, setCheckResult] = useState<BudgetCodeExcelCheckResult | null>(null);
  const [checkError, setCheckError] = useState("");
  const [isCheckingFile, setIsCheckingFile] = useState(false);
  const normalizedQuery = query.replace(/\s+/g, "").toUpperCase();
  const filtered = budgetCodes.filter((item) =>
    (!group || item.group === group) &&
    (item.code.includes(normalizedQuery) || item.budgetItem.toUpperCase().includes(query.trim().toUpperCase()))
  );
  const fillableRows = checkResult?.rows.filter(
    (row) => !row.currentCode && row.expectedCode && row.codeColumn !== null
  ) ?? [];

  async function checkExcelMapping(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!checkFile) {
      setCheckError("Vui lòng chọn file Excel.");
      return;
    }

    setIsCheckingFile(true);
    setCheckError("");
    setCheckResult(null);
    try {
      const formData = new FormData();
      formData.set("file", checkFile);
      const result = await checkBudgetCodeExcelMappingAction(formData);
      if (!result.success) {
        setCheckError(result.message);
        return;
      }
      setCheckResult(result.data ?? null);
    } catch (error) {
      setCheckError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsCheckingFile(false);
    }
  }

  async function downloadExcelWithMissingCodesFilled() {
    if (!checkFile || !checkResult || fillableRows.length === 0) return;

    setCheckError("");
    try {
      const workbook = XLSX.read(await checkFile.arrayBuffer(), { type: "array" });
      for (const row of fillableRows) {
        const sheet = workbook.Sheets[row.sheetName];
        if (!sheet || row.codeColumn === null || !row.expectedCode) continue;

        const address = XLSX.utils.encode_cell({ r: row.rowNumber - 1, c: row.codeColumn });
        const existingValue = sheet[address]?.v;
        if (existingValue !== undefined && existingValue !== null && String(existingValue).trim() !== "") continue;
        sheet[address] = { t: "s", v: row.expectedCode };
      }

      const output = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
      const blob = new Blob([output], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${checkFile.name.replace(/\.(xlsx|xls)$/i, "")}-da-bo-sung-ma-ngan-sach.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      setCheckError(error instanceof Error ? error.message : "Không thể tạo file Excel đã bổ sung mã.");
    }
  }

  function downloadCatalog() {
    const blob = new Blob([JSON.stringify(budgetCodes, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "budget-codes.json";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2 className="panel-title">Danh mục mã ngân sách</h2>
          <p className="mt-2 text-sm text-slate-400">
            {budgetCodes.length} mã · {budgetCodes.filter((item) => item.budgetItem).length} khoản ngân sách · {budgetCodeGroups.length} nhóm.
          </p>
        </div>
        <button type="button" className="btn btn-sm" onClick={downloadCatalog}>Tải toàn bộ JSON</button>
      </div>
      <p className="mb-4 text-sm text-slate-400">
        Đã bỏ khoảng trắng thừa trong mã ADS007. Giữ nguyên hai tiền tố GOI và GOO theo danh sách cung cấp.
      </p>
      <div className="mb-6 rounded-xl border border-slate-700 bg-slate-900/60 p-4">
        <h3 className="text-base font-semibold text-slate-100">Kiểm tra ánh xạ trong file Excel</h3>
        <p className="mt-1 text-sm text-slate-400">
          Chọn file Excel để đối chiếu cột “Khoản ngân sách” với danh mục cố định và kiểm tra mã hiện tại trên tất cả sheet.
        </p>
        <form className="mt-3 flex flex-wrap items-end gap-3" onSubmit={checkExcelMapping}>
          <label className="flex min-w-64 flex-1 flex-col gap-2 text-sm">
            File Excel (.xlsx, .xls)
            <input
              className="rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-slate-100"
              type="file"
              accept=".xlsx,.xls"
              onChange={(event) => {
                setCheckFile(event.target.files?.[0] ?? null);
                setCheckResult(null);
                setCheckError("");
              }}
            />
          </label>
          <button type="submit" className="btn btn-primary" disabled={isCheckingFile || !checkFile}>
            {isCheckingFile ? "Đang kiểm tra..." : "Kiểm tra file"}
          </button>
        </form>
        {checkError && <p className="mt-3 text-sm text-red-300" role="alert">{checkError}</p>}
        {checkResult && (
          <div className="mt-4">
            <p className="mb-3 text-sm text-slate-300" role="status">
              File “{checkResult.fileName}”: {checkResult.rows.length} dòng ·
              {" "}{checkResult.rows.filter((row) => row.status === "matched").length} đúng ·
              {" "}{checkResult.rows.filter((row) => row.status === "missing").length} thiếu mã ·
              {" "}{checkResult.rows.filter((row) => row.status === "mismatched").length} sai mã ·
              {" "}{checkResult.rows.filter((row) => row.status === "unmapped").length} chưa có ánh xạ.
            </p>
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <button
                type="button"
                className="btn btn-primary"
                onClick={downloadExcelWithMissingCodesFilled}
                disabled={fillableRows.length === 0}
              >
                Tải Excel đã bổ sung {fillableRows.length} mã còn trống
              </button>
              <span className="text-xs text-slate-400">
                Chỉ điền ô mã đang trống khi tìm được ánh xạ; không ghi đè mã đã có.
              </span>
            </div>
            <div className="max-h-96 overflow-auto rounded-lg border border-slate-700">
              <table className="min-w-full text-left text-sm">
                <thead className="sticky top-0 bg-slate-800 text-slate-300">
                  <tr>
                    {["Sheet", "Dòng", "Khoản ngân sách", "Mã trong file", "Mã theo danh mục", "Kết quả"].map((label) => (
                      <th key={label} scope="col" className="whitespace-nowrap px-3 py-2">{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {checkResult.rows.map((row, index) => (
                    <tr key={`${row.sheetName}-${row.rowNumber}-${index}`} className="border-t border-slate-700">
                      <td className="whitespace-nowrap px-3 py-2">{row.sheetName}</td>
                      <td className="px-3 py-2">{row.rowNumber}</td>
                      <td className="px-3 py-2">{row.budgetItem}</td>
                      <td className="px-3 py-2 font-mono">{row.currentCode || "—"}</td>
                      <td className="px-3 py-2 font-mono">{row.expectedCode ?? "—"}</td>
                      <td className={`whitespace-nowrap px-3 py-2 ${
                        row.status === "matched" ? "text-emerald-300" : row.status === "mismatched" ? "text-red-300" : "text-amber-300"
                      }`}>
                        {row.status === "matched"
                          ? "Đúng"
                          : row.status === "missing"
                            ? "Thiếu mã - có thể bổ sung"
                            : row.status === "mismatched"
                              ? "Sai mã"
                              : "Chưa có ánh xạ"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
      <div className="mb-4 flex flex-wrap gap-4">
        <label className="flex flex-col gap-2 text-sm">
          Tìm mã ngân sách
          <input className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-slate-100" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm mã hoặc khoản ngân sách" />
        </label>
        <label className="flex flex-col gap-2 text-sm">
          Nhóm mã
          <select className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-slate-100" value={group} onChange={(event) => setGroup(event.target.value)}>
            <option value="">Tất cả nhóm</option>
            {budgetCodeGroups.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
      </div>
      <p className="mb-3 text-sm text-slate-400" role="status">Hiển thị {filtered.length} / {budgetCodes.length} mã</p>
      <div className="overflow-x-auto rounded-xl border border-slate-700">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-800 text-slate-300">
            <tr>{["Mã ngân sách", "Khoản ngân sách", "Nhóm", "Cấp", "Mã cha"].map((label) => <th key={label} scope="col" className="px-4 py-3">{label}</th>)}</tr>
          </thead>
          <tbody>
            {filtered.map((item) => (
              <tr key={item.code} className="border-t border-slate-700">
                <td className="px-4 py-3 font-mono">{item.code}</td>
                <td className="px-4 py-3">{item.budgetItem || "—"}</td>
                <td className="px-4 py-3">{item.group}</td>
                <td className="px-4 py-3">{item.level}</td>
                <td className="px-4 py-3 font-mono">{item.parentCode ?? "—"}</td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">Không tìm thấy mã phù hợp.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
