"use client";

import { useMemo, useState } from "react";
import {
    syncAllTiktokRecordsAction,
    type SyncTiktokRecordResult,
} from "@/app/lib/action";

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1); // 1..12
const DEPARTMENTS = ["MPD", "Production", "Product MKT"] as const;
type Department = (typeof DEPARTMENTS)[number];
function getRecentYears(count = 2): number[] {
    const currentYear = new Date().getFullYear();
    return Array.from({ length: count }, (_, i) => currentYear - i);
}

export default function TiktokImportPanel() {
    const [results, setResults] = useState<SyncTiktokRecordResult[]>([]);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<string | null>(null);

    // ─── Chọn phạm vi quét: Tất cả / theo Năm + Tháng ────────────────
    const years = useMemo(() => getRecentYears(2), []);
    const [scanAll, setScanAll] = useState(true);
    const [selectedYear, setSelectedYear] = useState<number>(years[0]);
    const [selectedMonths, setSelectedMonths] = useState<Set<number>>(new Set());
    const [selectedDepartments, setSelectedDepartments] = useState<Set<Department>>(new Set());

    function toggleDepartment(dept: Department) {
        setSelectedDepartments((prev) => {
            const next = new Set(prev);
            if (next.has(dept)) next.delete(dept);
            else next.add(dept);
            return next;
        });
    }

    function toggleAllDepartments() {
        setSelectedDepartments((prev) =>
            prev.size === DEPARTMENTS.length ? new Set() : new Set(DEPARTMENTS)
        );
    }
    function toggleMonth(month: number) {
        setSelectedMonths((prev) => {
            const next = new Set(prev);
            if (next.has(month)) next.delete(month);
            else next.add(month);
            return next;
        });
    }

    function toggleAllMonths() {
        setSelectedMonths((prev) => (prev.size === 12 ? new Set() : new Set(MONTHS)));
    }

    // Ghép "T1" + năm đã chọn -> "Tháng 1/2026", đúng format mà
    // parseMonthYear/monthKeysMatch trong actions.ts đang nhận diện.
    const monthLabels = useMemo(
        () =>
            Array.from(selectedMonths)
                .sort((a, b) => a - b)
                .map((m) => `Tháng ${m}/${selectedYear}`),
        [selectedMonths, selectedYear]
    );
    const departmentLabels = useMemo(
        () => Array.from(selectedDepartments),
        [selectedDepartments]
    );
    async function handleSync() {
        setLoading(true);
        setMessage(null);
        setResults([]);

        try {
            const monthsToSend =
                scanAll || monthLabels.length === 0 ? undefined : monthLabels;
            const departmentsToSend =
                scanAll || departmentLabels.length === 0 ? undefined : departmentLabels;

            const res = await syncAllTiktokRecordsAction(monthsToSend, departmentsToSend);

            if (!res.success) {
                setMessage(`❌ ${res.message}`);
                return;
            }

            const data = res.data ?? [];
            setResults(data);

            const successCount = data.filter((item) => item.success).length;
            const errorCount = data.filter((item) => !item.success).length;

            const scopeParts: string[] = [];
            if (monthsToSend?.length) scopeParts.push(monthsToSend.join(", "));
            if (departmentsToSend?.length) scopeParts.push(departmentsToSend.join(", "));
            const scopeLabel = scopeParts.length ? `(${scopeParts.join(" | ")})` : "(tất cả)";

            setMessage(
                `Đã quét ${data.length} link TikTok ${scopeLabel} | ` +
                `Thành công: ${successCount} | ` +
                `Lỗi: ${errorCount}`
            );
        } catch (e) {
            setMessage(e instanceof Error ? e.message : String(e));
        } finally {
            setLoading(false);
        }
    }

    return (
        <section className="rounded-2xl border border-slate-700 bg-slate-900/70 p-6 shadow-xl ring-1 ring-slate-800/50">
            {/* Header */}
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                    <h2 className="text-lg font-semibold text-white">
                        Đồng bộ chỉ số TikTok
                    </h2>
                    <p className="mt-1 text-sm text-slate-400">
                        Hệ thống sẽ đọc bản ghi trong Lark Base theo phạm vi tháng
                        bạn chọn dưới đây, tìm cột Link Air và tự động lấy chỉ số
                        từ các link TikTok.
                    </p>
                </div>
                {/* Chọn BP sử dụng NS */}
                <div>
                    <div className="mb-1.5 flex items-center justify-between">
                        <span className="text-xs font-medium text-slate-400">
                            BP sử dụng NS
                        </span>
                        <button
                            type="button"
                            onClick={toggleAllDepartments}
                            className="text-xs text-blue-400 hover:text-blue-300 hover:underline"
                        >
                            {selectedDepartments.size === DEPARTMENTS.length ? "Bỏ chọn tất cả" : "Chọn tất cả"}
                        </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {DEPARTMENTS.map((dept) => {
                            const checked = selectedDepartments.has(dept);
                            return (
                                <button
                                    key={dept}
                                    type="button"
                                    onClick={() => toggleDepartment(dept)}
                                    className={`rounded-lg border px-3 py-1.5 text-sm transition ${checked
                                        ? "border-blue-500 bg-blue-600 text-white"
                                        : "border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800"
                                        }`}
                                >
                                    {dept}
                                </button>
                            );
                        })}
                    </div>
                </div>
                <button
                    className="btn btn-primary"
                    onClick={handleSync}
                    disabled={loading || (!scanAll && monthLabels.length === 0)}
                >
                    {loading ? "Đang quét Lark Base..." : "Quét & cập nhật TikTok"}
                </button>
            </div>

            {/* Bộ chọn phạm vi tháng */}
            <div className="mt-5 rounded-xl border border-slate-700 bg-slate-950 p-4">
                <h3 className="mb-3 text-sm font-semibold text-white">
                    Phạm vi quét
                </h3>

                {/* Tuỳ chọn: Tất cả record */}
                <label className="flex items-center gap-2 text-sm text-slate-200">
                    <input
                        type="radio"
                        name="scan-scope"
                        checked={scanAll}
                        onChange={() => setScanAll(true)}
                        className="h-4 w-4"
                    />
                    Tất cả bản ghi
                </label>

                {/* Tuỳ chọn: Chọn Năm + Tháng */}
                <label className="mt-2 flex items-center gap-2 text-sm text-slate-200">
                    <input
                        type="radio"
                        name="scan-scope"
                        checked={!scanAll}
                        onChange={() => setScanAll(false)}
                        className="h-4 w-4"
                    />
                    Chọn Năm &amp; Tháng cần quét (cột &quot;Gộp tháng&quot;)
                </label>

                {!scanAll ? (
                    <div className="mt-3 border-t border-slate-800 pt-3 space-y-3">
                        {/* Chọn năm */}
                        <div>
                            <div className="mb-1.5 text-xs font-medium text-slate-400">
                                Năm
                            </div>
                            <div className="flex gap-2">
                                {years.map((y) => (
                                    <button
                                        key={y}
                                        type="button"
                                        onClick={() => setSelectedYear(y)}
                                        className={`rounded-lg border px-3 py-1.5 text-sm transition ${selectedYear === y
                                            ? "border-blue-500 bg-blue-600 text-white"
                                            : "border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800"
                                            }`}
                                    >
                                        {y}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Chọn tháng */}
                        <div>
                            <div className="mb-1.5 flex items-center justify-between">
                                <span className="text-xs font-medium text-slate-400">
                                    Tháng
                                </span>
                                <button
                                    type="button"
                                    onClick={toggleAllMonths}
                                    className="text-xs text-blue-400 hover:text-blue-300 hover:underline"
                                >
                                    {selectedMonths.size === 12 ? "Bỏ chọn tất cả" : "Chọn tất cả"}
                                </button>
                            </div>
                            <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                                {MONTHS.map((m) => {
                                    const checked = selectedMonths.has(m);
                                    return (
                                        <button
                                            key={m}
                                            type="button"
                                            onClick={() => toggleMonth(m)}
                                            className={`rounded-lg border px-2 py-1.5 text-sm transition ${checked
                                                ? "border-blue-500 bg-blue-600 text-white"
                                                : "border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800"
                                                }`}
                                        >
                                            T{m}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        <p className="text-xs text-slate-500">
                            Chọn tháng sẽ tự ghép với năm đã chọn (vd T1 → &quot;Tháng 1/{selectedYear}&quot;)
                            và so khớp với cột &quot;Gộp tháng&quot; trong Base.
                        </p>

                        {monthLabels.length === 0 ? (
                            <div className="text-xs text-amber-400">
                                Chưa chọn tháng nào — nếu bấm quét, hệ thống sẽ không quét record nào.
                            </div>
                        ) : (
                            <div className="text-xs text-slate-500">
                                Sẽ đồng bộ: {monthLabels.join(", ")}
                            </div>
                        )}
                    </div>
                ) : null}
            </div>

            {/* Message */}
            {message ? (
                <div className="mt-4 rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-200">
                    {message}
                </div>
            ) : null}

            {/* Loading */}
            {loading ? (
                <div className="mt-5 rounded-xl border border-blue-900/50 bg-blue-950/20 p-4">
                    <div className="flex items-center gap-3">
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-500 border-t-blue-400" />
                        <div>
                            <div className="text-sm font-medium text-white">
                                Đang đọc dữ liệu...
                            </div>
                            <div className="text-xs text-slate-400">
                                Đang quét các bản ghi và lấy chỉ số TikTok.
                            </div>
                        </div>
                    </div>
                </div>
            ) : null}

            {/* Results */}
            {results.length > 0 ? (
                <div className="mt-6">
                    <div className="mb-3 flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-white">
                            Kết quả đồng bộ
                        </h3>
                        <span className="text-xs text-slate-500">
                            {results.length} video TikTok
                        </span>
                    </div>

                    <div className="overflow-x-auto rounded-xl border border-slate-700">
                        <table className="w-full min-w-[1100px] text-sm">
                            <thead className="bg-slate-950">
                                <tr className="border-b border-slate-700 text-left text-xs uppercase tracking-wider text-slate-500">
                                    <th className="px-4 py-3">Record ID</th>
                                    <th className="px-4 py-3">Link Air</th>
                                    <th className="px-4 py-3">Video</th>
                                    <th className="px-4 py-3 text-right">Views</th>
                                    <th className="px-4 py-3 text-right">Likes</th>
                                    <th className="px-4 py-3 text-right">Comments</th>
                                    <th className="px-4 py-3 text-right">Shares</th>
                                    <th className="px-4 py-3 text-right">Collections</th>
                                    <th className="px-4 py-3 text-right">Total</th>
                                    <th className="px-4 py-3">Trạng thái</th>
                                </tr>
                            </thead>
                            <tbody>
                                {results.map((item) => (
                                    <tr
                                        key={item.recordId}
                                        className="border-b border-slate-800 last:border-0 hover:bg-slate-800/40"
                                    >
                                        <td className="px-4 py-3 font-mono text-xs text-slate-500">
                                            {item.recordId}
                                        </td>
                                        <td className="max-w-[250px] px-4 py-3">
                                            <a

                                                href={item.linkAir}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="block truncate text-blue-400 hover:text-blue-300"
                                                title={item.linkAir}
                                            >
                                                {item.linkAir}
                                            </a>
                                        </td>
                                        <td className="max-w-[250px] px-4 py-3">
                                            <div className="truncate font-medium text-white" title={item.title}>
                                                {item.title || "—"}
                                            </div>
                                            <div className="mt-1 truncate text-xs text-slate-500">
                                                {item.uploader || "—"}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-right font-medium text-white">
                                            {formatNumber(item.viewCount)}
                                        </td>
                                        <td className="px-4 py-3 text-right text-slate-300">
                                            {formatNumber(item.likeCount)}
                                        </td>
                                        <td className="px-4 py-3 text-right text-slate-300">
                                            {formatNumber(item.commentCount)}
                                        </td>
                                        <td className="px-4 py-3 text-right text-slate-300">
                                            {formatNumber(item.shareCount)}
                                        </td>
                                        <td className="px-4 py-3 text-right text-slate-300">
                                            {formatNumber(item.collectionCount)}
                                        </td>
                                        <td className="px-4 py-3 text-right font-semibold text-white">
                                            {formatNumber(item.totalInteractionCount)}
                                        </td>
                                        <td className="px-4 py-3">
                                            {item.success ? (
                                                <span className="inline-flex rounded-full border border-emerald-700/50 bg-emerald-950/40 px-2.5 py-1 text-xs font-medium text-emerald-400">
                                                    Đã cập nhật
                                                </span>
                                            ) : (
                                                <div>
                                                    <span className="inline-flex rounded-full border border-red-700/50 bg-red-950/40 px-2.5 py-1 text-xs font-medium text-red-400">
                                                        Lỗi
                                                    </span>
                                                    {item.errorMessage ? (
                                                        <div
                                                            className="mt-1 max-w-[200px] truncate text-xs text-red-400"
                                                            title={item.errorMessage}
                                                        >
                                                            {item.errorMessage}
                                                        </div>
                                                    ) : null}
                                                </div>
                                            )}
                                        </td>
                                    </tr>

                                ))}
                            </tbody>
                        </table>
                    </div>

                </div>

            ) : null}
        </section>
    );
}

function formatNumber(value: number | undefined): string {
    if (value === undefined || value === null) {
        return "—";
    }
    return Number(value).toLocaleString("vi-VN");
}