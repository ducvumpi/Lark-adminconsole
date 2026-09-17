"use client";

import { useState, useTransition } from "react";
import {
    findSuspiciousSourceRecordsAction,
    type SuspiciousSourceRecord,
} from "@/app/lib/action";

export default function SuspiciousSourceRecordsPanel() {
    const [isPending, startTransition] = useTransition();
    const [records, setRecords] = useState<SuspiciousSourceRecord[] | null>(null);
    const [error, setError] = useState<string | null>(null);

    function handleScan() {
        setError(null);
        startTransition(async () => {
            const res = await findSuspiciousSourceRecordsAction();
            if (!res.success) {
                setError(res.message);
                return;
            }
            setRecords(res.data ?? []);
        });
    }

    return (
        <div className="overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-xl ring-1 ring-slate-800/50 space-y-4">
            <div>
                <h4 className="font-semibold text-slate-100">Rà soát bản ghi không rõ nguồn</h4>
                <p className="text-sm text-slate-400">
                    Bản ghi có "Loại đề xuất" khác "Import từ BOT" và "Điều chuyển từ Admin" — khả năng bị sửa tay, cần kiểm tra cấp ngân sách.
                </p>
            </div>

            {error && (
                <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                    {error}
                </div>
            )}

            <button
                onClick={handleScan}
                disabled={isPending}
                className="rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm font-semibold text-slate-200 transition-colors hover:bg-slate-700 disabled:opacity-50"
            >
                {isPending ? "Đang quét..." : "Quét bản ghi khả nghi"}
            </button>

            {records && records.length === 0 && (
                <p className="text-sm text-emerald-400">Không có bản ghi nào cần rà soát.</p>
            )}

            {records && records.length > 0 && (
                <div className="space-y-2">
                    <p className="text-sm text-slate-300">
                        Tìm thấy <strong className="text-slate-100">{records.length}</strong> bản ghi cần rà soát:
                    </p>
                    <div className="max-h-[32rem] overflow-auto rounded-lg border border-slate-700">
                        <table className="min-w-full text-xs">
                            <thead className="sticky top-0 bg-slate-800 text-slate-400">
                                <tr>
                                    <th className="px-3 py-2 text-left">Mã NS</th>
                                    <th className="px-3 py-2 text-left">Hạng mục</th>
                                    <th className="px-3 py-2 text-left">Brand</th>
                                    <th className="px-3 py-2 text-left">Kỳ</th>
                                    <th className="px-3 py-2 text-left">Loại đề xuất</th>
                                    <th className="px-3 py-2 text-right">Số tiền</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800">
                                {records.map((r) => (
                                    <tr key={r.recordId} className="hover:bg-slate-800/60">
                                        <td className="px-3 py-2 font-mono text-amber-300">{r.maNganSach}</td>
                                        <td className="px-3 py-2 text-slate-300">{r.hangMuc}</td>
                                        <td className="px-3 py-2 text-slate-400">{r.brand}</td>
                                        <td className="px-3 py-2 text-slate-400">{r.quy} · {r.thang}</td>
                                        <td className="px-3 py-2 text-slate-500">{r.loaiDeXuat || "(trống)"}</td>
                                        <td className="px-3 py-2 text-right text-slate-300">{r.soTien.toLocaleString("vi-VN")}</td>
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