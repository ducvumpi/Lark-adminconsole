"use client";

import { useTransition, useState } from "react";
import {
    previewNegativeApprovedAmountRecordsAction,
    deleteNegativeApprovedAmountRecordsAction,
    type BudgetRecordView,
} from "@/app/lib/action";

export default function DeleteNegativeRecordsPanel() {
    const [isPending, startTransition] = useTransition();
    const [preview, setPreview] = useState<BudgetRecordView[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<{ deletedCount: number; failed: { recordId: string; reason: string }[] } | null>(null);

    function handleFind() {
        setError(null);
        setResult(null);
        startTransition(async () => {
            const res = await previewNegativeApprovedAmountRecordsAction();
            if (!res.success) {
                setError(res.message);
                return;
            }
            setPreview(res.data ?? []);
        });
    }

    function handleConfirmDelete() {
        if (!preview || preview.length === 0) return;
        startTransition(async () => {
            const ids = preview.map((p) => p.recordId);
            const res = await deleteNegativeApprovedAmountRecordsAction(ids);
            if (!res.success) {
                setError(res.message);
                return;
            }
            setResult(res.data!);
            setPreview(null);
        });
    }

    return (
        <div className="overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-xl ring-1 ring-slate-800/50 space-y-4">
            <div>
                <h4 className="font-semibold text-slate-100">Xóa bản ghi có Số tiền TGĐ duyệt âm</h4>
                <p className="text-sm text-slate-400">Thao tác không thể hoàn tác. Kiểm tra kỹ danh sách trước khi xác nhận.</p>
            </div>

            {error && (
                <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                    {error}
                </div>
            )}

            {!preview && !result && (
                <button
                    onClick={handleFind}
                    disabled={isPending}
                    className="rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm font-semibold text-slate-200 transition-colors hover:bg-slate-700 disabled:opacity-50"
                >
                    {isPending ? "Đang tìm..." : "Tìm bản ghi"}
                </button>
            )}

            {preview && (
                <div className="space-y-3">
                    <p className="text-sm text-slate-300">
                        Tìm thấy <strong className="text-slate-100">{preview.length}</strong> bản ghi có số tiền âm:
                    </p>
                    <ul className="max-h-48 space-y-1 overflow-auto rounded-lg border border-slate-700 bg-slate-800/50 p-2 text-sm">
                        {preview.slice(0, 20).map((p) => (
                            <li key={p.recordId} className="flex justify-between px-1 py-0.5">
                                <span className="text-slate-400">{p.maNganSach || p.recordId}</span>
                                <span className="font-mono text-red-400">{p.soTien.toLocaleString("vi-VN")}</span>
                            </li>
                        ))}
                        {preview.length > 20 && (
                            <li className="px-1 text-slate-500">...và {preview.length - 20} bản ghi khác</li>
                        )}
                    </ul>
                    <div className="flex gap-2">
                        <button
                            onClick={handleConfirmDelete}
                            disabled={isPending}
                            className="rounded-lg border border-red-500/40 bg-red-500/15 px-3 py-2 text-sm font-semibold text-red-200 transition-colors hover:bg-red-500/25 disabled:opacity-50"
                        >
                            {isPending ? "Đang xóa..." : `Xác nhận xóa ${preview.length} bản ghi`}
                        </button>
                        <button
                            onClick={() => setPreview(null)}
                            disabled={isPending}
                            className="rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-300 hover:bg-slate-700"
                        >
                            Hủy
                        </button>
                    </div>
                </div>
            )}

            {result && (
                <div className="text-sm">
                    <p className="text-emerald-400">Đã xóa {result.deletedCount} bản ghi.</p>
                    {result.failed.length > 0 && (
                        <p className="text-red-400">Thất bại: {result.failed.length} bản ghi.</p>
                    )}
                    <button
                        onClick={() => setResult(null)}
                        className="mt-2 text-xs text-slate-500 underline hover:text-slate-300"
                    >
                        Làm lại
                    </button>
                </div>
            )}
        </div>
    );
}