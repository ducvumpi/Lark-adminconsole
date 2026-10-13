"use client";

import { useState } from "react";
import { budgetCodes, budgetCodeGroups } from "@/app/lib/budget-codes";

export default function BudgetCodeCatalog() {
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState("");
  const normalizedQuery = query.replace(/\s+/g, "").toUpperCase();
  const filtered = budgetCodes.filter((item) =>
    (!group || item.group === group) && item.code.includes(normalizedQuery)
  );

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
            {budgetCodes.length} mã · {budgetCodeGroups.length} nhóm · Lưu trong danh mục dùng chung của hệ thống.
          </p>
        </div>
        <button type="button" className="btn btn-sm" onClick={downloadCatalog}>Tải toàn bộ JSON</button>
      </div>
      <p className="mb-4 text-sm text-slate-400">
        Đã bỏ khoảng trắng thừa trong mã ADS007. Giữ nguyên hai tiền tố GOI và GOO theo danh sách cung cấp.
      </p>
      <div className="mb-4 flex flex-wrap gap-4">
        <label className="flex flex-col gap-2 text-sm">
          Tìm mã ngân sách
          <input className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-slate-100" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ví dụ: OFF001-01" />
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
            <tr>{["Mã ngân sách", "Nhóm", "Cấp", "Mã cha"].map((label) => <th key={label} scope="col" className="px-4 py-3">{label}</th>)}</tr>
          </thead>
          <tbody>
            {filtered.map((item) => (
              <tr key={item.code} className="border-t border-slate-700">
                <td className="px-4 py-3 font-mono">{item.code}</td>
                <td className="px-4 py-3">{item.group}</td>
                <td className="px-4 py-3">{item.level}</td>
                <td className="px-4 py-3 font-mono">{item.parentCode ?? "—"}</td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-400">Không tìm thấy mã phù hợp.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
