"use client";

import { useMemo, useState, useTransition } from "react";
import {
    findBudgetLevelViolationsAction,
    applyBudgetLevelViolationFixesAction,
    type BudgetLevelViolationGroup,
    type BudgetLevelViolationFixInput,
} from "@/app/lib/action";

export default function BudgetLevelViolationPanel() {
    const [isPending, startTransition] = useTransition();
    const [groups, setGroups] = useState<BudgetLevelViolationGroup[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [applyResult, setApplyResult] = useState<{
        updated: number;
        failed: { recordId: string; reason: string }[];
    } | null>(null);

    const [quyFilter, setQuyFilter] = useState("");
    const [thangFilter, setThangFilter] = useState("");
    const [loaiFilter, setLoaiFilter] = useState("");

    function handleScan() {
        setError(null);
        setApplyResult(null);
        setQuyFilter("");
        setThangFilter("");
        setLoaiFilter("");
        startTransition(async () => {
            const res = await findBudgetLevelViolationsAction();
            if (!res.success) {
                setError(res.message);
                setGroups(null);
                return;
            }
            const g = res.data ?? [];
            setGroups(g);
            setSelected(
                new Set(g.flatMap((group) => group.candidates.map((c) => c.recordId)))
            );
        });
    }

    const quyOptions = useMemo(() => {
        if (!groups) return [];
        return Array.from(new Set(groups.map((g) => g.quy).filter(Boolean))).sort();
    }, [groups]);

    const thangOptions = useMemo(() => {
        if (!groups) return [];
        return Array.from(new Set(groups.map((g) => g.thang).filter(Boolean))).sort((a, b) => {
            const na = parseInt(a.match(/\d+/)?.[0] ?? "0", 10);
            const nb = parseInt(b.match(/\d+/)?.[0] ?? "0", 10);
            return na - nb;
        });
    }, [groups]);

    const loaiOptions = useMemo(() => {
        if (!groups) return [];
        return Array.from(new Set(groups.map((g) => g.loaiNganSach).filter(Boolean))).sort();
    }, [groups]);

    const filteredGroups = useMemo(() => {
        if (!groups) return null;
        return groups.filter((g) => {
            if (quyFilter && g.quy !== quyFilter) return false;
            if (thangFilter && g.thang !== thangFilter) return false;
            if (loaiFilter && g.loaiNganSach !== loaiFilter) return false;
            return true;
        });
    }, [groups, quyFilter, thangFilter, loaiFilter]);

    function toggle(recordId: string) {
        setSelected((prev) => {
            const next = new Set(prev);
            next.has(recordId) ? next.delete(recordId) : next.add(recordId);
            return next;
        });
    }
    const visibleCandidates = useMemo(
        () => (filteredGroups ?? []).flatMap((g) => g.candidates),
        [filteredGroups]
    );
    const allVisibleSelected =
        visibleCandidates.length > 0 &&
        visibleCandidates.every((c) => selected.has(c.recordId));

    function toggleAllVisible() {
        setSelected((prev) => {
            const next = new Set(prev);
            if (allVisibleSelected) {
                visibleCandidates.forEach((c) => next.delete(c.recordId));
            } else {
                visibleCandidates.forEach((c) => next.add(c.recordId));
            }
            return next;
        });
    }



    const allFixes: BudgetLevelViolationFixInput[] = useMemo(() => {
        if (!groups) return [];
        return groups
            .flatMap((g) => g.candidates)
            .filter((c) => selected.has(c.recordId))
            .map((c) => ({ recordId: c.recordId, ...c.proposedFields }));
    }, [groups, selected]);

    function handleApply() {
        if (allFixes.length === 0) return;
        const confirmed = window.confirm(
            `Bạn sắp ghi đè ${allFixes.length} bản ghi.\nThao tác này KHÔNG thể hoàn tác.\nTiếp tục?`
        );
        if (!confirmed) return;

        setError(null);
        startTransition(async () => {
            const res = await applyBudgetLevelViolationFixesAction(allFixes);
            if (!res.success) {
                setError(res.message);
                return;
            }
            setApplyResult(res.data!);
            setGroups(null);
            setSelected(new Set());
        });
    }

    const totalCandidates = filteredGroups?.reduce((s, g) => s + g.candidates.length, 0) ?? 0;

    return (
        <div className="overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-xl ring-1 ring-slate-800/50 space-y-4">
            <div>
                <h4 className="font-semibold text-slate-100">Phát hiện vi phạm cấp ngân sách</h4>
                <p className="text-sm text-slate-400">
                    Tìm các bản ghi đang mang mã cấp cha nhưng thực chất phải là cấp con
                    (đã có mã con khác cùng nhóm Loại ngân sách/Brand/Quý/Năm/Tháng).
                </p>
            </div>

            {error && (
                <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                    {error}
                </div>
            )}

            {applyResult && (
                <div className="rounded-lg border border-slate-700 bg-slate-800/40 p-3 text-sm">
                    <p className="font-semibold text-emerald-400">Đã sửa {applyResult.updated} bản ghi.</p>
                    {applyResult.failed.length > 0 && (
                        <ul className="ml-4 mt-1 list-disc text-xs text-red-300">
                            {applyResult.failed.map((f) => (
                                <li key={f.recordId}>{f.recordId}: {f.reason}</li>
                            ))}
                        </ul>
                    )}
                </div>
            )}

            <button
                onClick={handleScan}
                disabled={isPending}
                className="rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm font-semibold text-slate-200 transition-colors hover:bg-slate-700 disabled:opacity-50"
            >
                {isPending ? "Đang quét..." : "Quét vi phạm"}
            </button>

            {groups && groups.length === 0 && (
                <p className="text-sm text-emerald-400">Không tìm thấy vi phạm nào.</p>
            )}

            {groups && groups.length > 0 && (
                <div className="space-y-3">
                    <div className="flex flex-wrap items-end gap-3">

                        <div className="flex flex-wrap items-end gap-3">
                            <div className="flex flex-col gap-1">
                                <label className="text-xs text-slate-400">Lọc theo Quý</label>
                                <select value={quyFilter} onChange={(e) => setQuyFilter(e.target.value)} className="rounded-lg border border-slate-600 bg-slate-800 px-2 py-1.5 text-sm text-slate-200">
                                    <option value="">Tất cả ({groups.length})</option>
                                    {quyOptions.map((q) => <option key={q} value={q}>{q}</option>)}
                                </select>
                            </div>
                            <div className="flex flex-col gap-1">
                                <label className="text-xs text-slate-400">Lọc theo Tháng</label>
                                <select value={thangFilter} onChange={(e) => setThangFilter(e.target.value)} className="rounded-lg border border-slate-600 bg-slate-800 px-2 py-1.5 text-sm text-slate-200">
                                    <option value="">Tất cả</option>
                                    {thangOptions.map((t) => <option key={t} value={t}>{t}</option>)}
                                </select>
                            </div>
                            <div className="flex flex-col gap-1">
                                <label className="text-xs text-slate-400">Lọc theo Loại ngân sách</label>
                                <select value={loaiFilter} onChange={(e) => setLoaiFilter(e.target.value)} className="rounded-lg border border-slate-600 bg-slate-800 px-2 py-1.5 text-sm text-slate-200">
                                    <option value="">Tất cả</option>
                                    {loaiOptions.map((l) => <option key={l} value={l}>{l}</option>)}
                                </select>
                            </div>
                            {(quyFilter || thangFilter || loaiFilter) && (
                                <button onClick={() => { setQuyFilter(""); setThangFilter(""); setLoaiFilter(""); }} className="text-xs text-slate-500 underline hover:text-slate-300">
                                    Xóa lọc
                                </button>
                            )}

                            <div className="ml-auto flex gap-2">
                                <button
                                    onClick={toggleAllVisible}
                                    disabled={isPending || visibleCandidates.length === 0}
                                    className="rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-200 transition-colors hover:bg-slate-700 disabled:opacity-50"
                                >
                                    {allVisibleSelected ? "Bỏ chọn tất cả" : "Chọn tất cả"}
                                </button>
                                <button
                                    onClick={handleApply}
                                    disabled={isPending || allFixes.length === 0}
                                    className="rounded-lg border border-red-500/40 bg-red-500/15 px-3 py-2 text-sm font-semibold text-red-200 transition-colors hover:bg-red-500/25 disabled:opacity-50"
                                >
                                    {isPending ? "Đang áp dụng..." : `Áp dụng sửa ${selected.size} bản ghi`}
                                </button>
                            </div>
                        </div>


                    </div>

                    <p className="text-sm text-slate-300">
                        Hiển thị <strong className="text-slate-100">{filteredGroups?.length ?? 0}</strong> nhóm vi phạm
                        (<strong className="text-slate-100">{totalCandidates}</strong> record) / tổng {groups.length} nhóm quét được.
                    </p>

                    <div className="max-h-96 space-y-3 overflow-auto">
                        {filteredGroups?.map((g, i) => (
                            <div key={i} className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                                <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
                                    <span className="rounded-full bg-amber-500/20 px-2 py-0.5 font-mono text-amber-300">
                                        {g.parentCode} → {g.anchorChildCode}
                                    </span>
                                    <span className="text-slate-400">
                                        {g.loaiNganSach} · {g.brand} · {g.quy} · {g.nam} · {g.thang}
                                    </span>
                                    <span className="ml-auto rounded-full bg-red-500/20 px-2 py-0.5 text-xs text-red-300">
                                        {g.candidates.length} record
                                    </span>
                                </div>
                                <ul className="space-y-1 text-xs">
                                    {g.candidates.map((c) => (
                                        <li key={c.recordId} className="flex items-center gap-2 text-slate-400">
                                            <input
                                                type="checkbox"
                                                checked={selected.has(c.recordId)}
                                                onChange={() => toggle(c.recordId)}
                                            />
                                            <span className="font-mono">{c.recordId}</span>
                                            <span>{c.maNganSachHienTai} → {c.proposedFields.maNganSach}</span>
                                            <span className="ml-auto">{c.soTien.toLocaleString("vi-VN")}</span>
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