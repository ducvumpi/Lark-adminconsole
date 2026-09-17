"use client";

import { useState, useTransition } from "react";
import {
    auditBudgetHierarchyAction,
    type BudgetHierarchyAuditFilters,
    type BudgetHierarchyAuditResult,
} from "@/app/lib/action";

function money(value: number): string {
    return value.toLocaleString("vi-VN");
}

export default function BudgetHierarchyAuditPanel() {
    const [rootCode, setRootCode] = useState("");
    const [filters, setFilters] = useState<BudgetHierarchyAuditFilters>({});
    const [result, setResult] = useState<BudgetHierarchyAuditResult | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();

    function handleAudit() {
        setError(null);
        setResult(null);
        startTransition(async () => {
            const response = await auditBudgetHierarchyAction(rootCode, filters);
            if (!response.success) {
                setError(response.message);
                return;
            }
            setResult(response.data ?? null);
        });
    }

    return (
        <div className="space-y-4 rounded-2xl border border-cyan-500/30 bg-slate-900 p-5 shadow-xl ring-1 ring-slate-800/50">
            <div>
                <h4 className="font-semibold text-slate-100">Kiểm tra cân đối cây ngân sách</h4>
                <p className="text-sm text-slate-400">
                    Chỉ đọc dữ liệu Lark Base, không sửa record. Kiểm tra mã cha/con và tìm nguyên nhân tổng cấp 1 lệch cấp 2.
                </p>
            </div>

            <div className="flex flex-wrap items-end gap-3">
                <label className="flex min-w-56 flex-col gap-1 text-xs text-slate-400">
                    Mã gốc (tùy chọn)
                    <input
                        value={rootCode}
                        onChange={(event) => setRootCode(event.target.value)}
                        placeholder="Để trống để quét toàn bộ table"
                        className="rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-200 outline-none focus:border-cyan-400"
                    />
                </label>
                {[
                    ["brand", "Brand", "Ví dụ: Round Lab"],
                    ["quy", "Quý", "Ví dụ: Q3/2026"],
                    ["thang", "Tháng", "Ví dụ: Tháng 9"],
                    ["loaiNganSach", "Loại ngân sách", "Ví dụ: Ngân sách Ads"],
                ].map(([key, label, placeholder]) => (
                    <label key={key} className="flex min-w-48 flex-col gap-1 text-xs text-slate-400">
                        {label}
                        <input
                            value={filters[key as keyof BudgetHierarchyAuditFilters] ?? ""}
                            onChange={(event) => setFilters((current) => ({ ...current, [key]: event.target.value }))}
                            placeholder={placeholder}
                            className="rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-200 outline-none focus:border-cyan-400"
                        />
                    </label>
                ))}
                <button
                    type="button"
                    onClick={handleAudit}
                    disabled={isPending}
                    className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-500 disabled:opacity-50"
                >
                    {isPending ? "Đang kiểm tra..." : "Quét toàn bộ Lark Base"}
                </button>
            </div>

            {error && <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">{error}</div>}

            {result && (
                <div className="space-y-4">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                        <div className="rounded-lg border border-slate-700 bg-slate-800/60 p-3">
                            <div className="text-xs text-slate-400">Record liên quan</div>
                            <div className="mt-1 text-lg font-semibold text-slate-100">{result.totalRecords}</div>
                        </div>
                        <div className="rounded-lg border border-slate-700 bg-slate-800/60 p-3">
                            <div className="text-xs text-slate-400">Roll-up cấp 1</div>
                            <div className="mt-1 text-lg font-semibold text-slate-100">{money(result.rollupLevel1Amount)}</div>
                        </div>
                        <div className="rounded-lg border border-slate-700 bg-slate-800/60 p-3">
                            <div className="text-xs text-slate-400">Roll-up cấp 2</div>
                            <div className="mt-1 text-lg font-semibold text-slate-100">{money(result.rollupLevel2Amount)}</div>
                        </div>
                    </div>

                    <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
                        <div className="font-semibold">Nguyên nhân / kết luận</div>
                        <ul className="mt-1 list-inside list-disc space-y-1">
                            {result.reasons.map((reason) => <li key={reason}>{reason}</li>)}
                        </ul>
                    </div>

                    <div className="text-xs text-slate-500">
                        Đang đọc mã bằng field <span className="text-slate-300">{result.codeField}</span> và tiền bằng field <span className="text-slate-300">{result.amountField}</span>.
                    </div>

                    <div className="max-h-[32rem] overflow-auto rounded-lg border border-slate-700">
                        <table className="min-w-full text-xs">
                            <thead className="sticky top-0 bg-slate-800 text-slate-300">
                                <tr>
                                    <th className="p-2 text-left">Record ID</th>
                                    <th className="p-2 text-left">Brand</th>
                                    <th className="p-2 text-left">Quý</th>
                                    <th className="p-2 text-left">Tháng</th>
                                    <th className="p-2 text-left">Loại ngân sách</th>
                                    <th className="p-2 text-left">Mã</th>
                                    <th className="p-2 text-center">Cấp</th>
                                    <th className="p-2 text-right">Khoản chi</th>
                                </tr>
                            </thead>
                            <tbody>
                                {result.records.map((record) => (
                                    <tr key={record.recordId} className="border-t border-slate-800 text-slate-300">
                                        <td className="p-2 font-mono">{record.recordId}</td>
                                        <td className="p-2">{record.brand}</td>
                                        <td className="p-2">{record.quy}</td>
                                        <td className="p-2">{record.thang}</td>
                                        <td className="p-2">{record.loaiNganSach}</td>
                                        <td className="p-2 font-mono">{record.code}</td>
                                        <td className="p-2 text-center">{record.level}</td>
                                        <td className="p-2 text-right">{money(record.amount)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className="max-h-[28rem] overflow-auto rounded-lg border border-slate-700">
                        <table className="min-w-full text-xs">
                            <thead className="sticky top-0 bg-slate-800 text-slate-300">
                                <tr>
                                    <th className="p-2 text-left">Mã</th>
                                    <th className="p-2 text-center">Cấp</th>
                                    <th className="p-2 text-right">Số record</th>
                                    <th className="p-2 text-right">Chi trực tiếp</th>
                                    <th className="p-2 text-right">Tổng con</th>
                                    <th className="p-2 text-right">Lệch</th>
                                </tr>
                            </thead>
                            <tbody>
                                {result.rows.map((row) => (
                                    <tr key={row.code} className="border-t border-slate-800 text-slate-300">
                                        <td className="p-2 font-mono">{row.code}</td>
                                        <td className="p-2 text-center">{row.level}</td>
                                        <td className="p-2 text-right">{row.recordCount}</td>
                                        <td className="p-2 text-right">{money(row.directAmount)}</td>
                                        <td className="p-2 text-right">{money(row.childAmount)}</td>
                                        <td className={`p-2 text-right ${row.difference === 0 ? "text-emerald-300" : "text-red-300"}`}>
                                            {money(row.difference)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
