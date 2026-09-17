"use client";

import { useMemo, useState, useTransition } from "react";
import {
    findDuplicateLevel1CodesAction,
    type DuplicateLevel1Group,
} from "@/app/lib/action";

export default function DuplicateLevel1CodesPanel() {
    const [isPending, startTransition] = useTransition();
    const [groups, setGroups] = useState<DuplicateLevel1Group[] | null>(null);
    const [error, setError] = useState<string | null>(null);

    const [quyFilter, setQuyFilter] = useState("");
    const [thangFilter, setThangFilter] = useState("");
    const [loaiFilter, setLoaiFilter] = useState("");

    function handleScan() {
        setError(null);
        setQuyFilter("");
        setThangFilter("");
        startTransition(async () => {
            const res = await findDuplicateLevel1CodesAction();
            if (!res.success) {
                setError(res.message);
                return;
            }
            setGroups(res.data ?? []);
        });
    }

    // Danh sách Quý/Tháng thật sự có trong kết quả vừa quét — không hard-code
    const quyOptions = useMemo(() => {
        if (!groups) return [];
        const set = new Set(groups.map((g) => g.quy).filter(Boolean));
        return Array.from(set).sort();
    }, [groups]);

    const thangOptions = useMemo(() => {
        if (!groups) return [];
        const set = new Set(groups.map((g) => g.thang).filter(Boolean));
        return Array.from(set).sort((a, b) => {
            const na = parseInt(a.match(/\d+/)?.[0] ?? "0", 10);
            const nb = parseInt(b.match(/\d+/)?.[0] ?? "0", 10);
            return na - nb;
        });
    }, [groups]);
    const loaiOptions = useMemo(() => {
        if (!groups) return [];
        const set = new Set(groups.map((g) => g.loaiNganSach).filter(Boolean));
        return Array.from(set).sort();
    }, [groups]);

    // Sửa filteredGroups, thêm điều kiện loaiFilter
    const filteredGroups = useMemo(() => {
        if (!groups) return null;
        return groups.filter((g) => {
            if (quyFilter && g.quy !== quyFilter) return false;
            if (thangFilter && g.thang !== thangFilter) return false;
            if (loaiFilter && g.loaiNganSach !== loaiFilter) return false;
            return true;
        });
    }, [groups, quyFilter, thangFilter, loaiFilter]);


    const totalDuplicateRecords = filteredGroups?.reduce((sum, g) => sum + g.records.length, 0) ?? 0;

    return (
        <div className="overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-xl ring-1 ring-slate-800/50 space-y-4">
            <div>
                <h4 className="font-semibold text-slate-100">Mã ngân sách cấp 1 bị trùng</h4>
                <p className="text-sm text-slate-400">
                    Kiểm tra 39 mã cấp 1 cố định — trùng nghĩa là cùng mã, cùng Brand/Quý/Năm/Tháng nhưng có nhiều hơn 1 record.
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
                {isPending ? "Đang quét..." : "Quét trùng"}
            </button>

            {groups && groups.length === 0 && (
                <p className="text-sm text-emerald-400">Không tìm thấy mã nào bị trùng.</p>
            )}

            {groups && groups.length > 0 && (
                <div className="space-y-3">
                    <div className="flex flex-wrap items-end gap-3">
                        <div className="flex flex-col gap-1">
                            <label className="text-xs text-slate-400">Lọc theo Quý</label>
                            <select
                                value={quyFilter}
                                onChange={(e) => setQuyFilter(e.target.value)}
                                className="rounded-lg border border-slate-600 bg-slate-800 px-2 py-1.5 text-sm text-slate-200"
                            >
                                <option value="">Tất cả ({groups.length})</option>
                                {quyOptions.map((q) => (
                                    <option key={q} value={q}>{q}</option>
                                ))}
                            </select>
                        </div>

                        <div className="flex flex-col gap-1">
                            <label className="text-xs text-slate-400">Lọc theo Tháng</label>
                            <select
                                value={thangFilter}
                                onChange={(e) => setThangFilter(e.target.value)}
                                className="rounded-lg border border-slate-600 bg-slate-800 px-2 py-1.5 text-sm text-slate-200"
                            >
                                <option value="">Tất cả</option>
                                {thangOptions.map((t) => (
                                    <option key={t} value={t}>{t}</option>
                                ))}
                            </select>
                        </div>
                        <div className="flex flex-col gap-1">
                            <label className="text-xs text-slate-400">Lọc theo Loại ngân sách</label>
                            <select
                                value={loaiFilter}
                                onChange={(e) => setLoaiFilter(e.target.value)}
                                className="rounded-lg border border-slate-600 bg-slate-800 px-2 py-1.5 text-sm text-slate-200"
                            >
                                <option value="">Tất cả</option>
                                {loaiOptions.map((l) => (
                                    <option key={l} value={l}>{l}</option>
                                ))}
                            </select>
                        </div>
                        {(quyFilter || thangFilter || loaiFilter) && (
                            <button
                                onClick={() => { setQuyFilter(""); setThangFilter(""); setLoaiFilter(""); }}
                                className="text-xs text-slate-500 underline hover:text-slate-300"
                            >
                                Xóa lọc
                            </button>
                        )}
                    </div>

                    <p className="text-sm text-slate-300">
                        Hiển thị <strong className="text-slate-100">{filteredGroups?.length ?? 0}</strong> nhóm trùng
                        (<strong className="text-slate-100">{totalDuplicateRecords}</strong> record liên quan)
                        {(quyFilter || thangFilter) && (
                            <span className="text-slate-500"> / tổng {groups.length} nhóm quét được</span>
                        )}
                    </p>

                    <div className="max-h-96 space-y-3 overflow-auto">
                        {filteredGroups?.map((g, i) => (
                            <div key={i} className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                                <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
                                    <span className="rounded-full bg-amber-500/20 px-2 py-0.5 font-mono text-amber-300">
                                        {g.maNganSach}
                                    </span>
                                    <span className="text-slate-400">
                                        {g.loaiNganSach} · {g.brand} · {g.quy} · {g.nam} · {g.thang}
                                    </span>
                                    <span className="ml-auto rounded-full bg-red-500/20 px-2 py-0.5 text-xs text-red-300">
                                        {g.records.length} record
                                    </span>
                                </div>
                                <ul className="space-y-1 text-xs">
                                    {g.records.map((r) => (
                                        <li key={r.recordId} className="flex justify-between text-slate-400">
                                            <span className="font-mono">{r.recordId}</span>
                                            <span>{r.soTien.toLocaleString("vi-VN")}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ))}
                        {filteredGroups?.length === 0 && (
                            <p className="text-sm text-slate-500">Không có nhóm nào khớp bộ lọc đang chọn.</p>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}