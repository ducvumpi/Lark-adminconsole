"use client";

import { useState, useTransition } from "react";
import {
    importInvitationImagesAction,
    type InvitationImportSummary,
} from "@/app/lib/action";

export default function ImportInvitationImagesPanel() {
    const [isPending, startTransition] = useTransition();
    const [summary, setSummary] = useState<InvitationImportSummary | null>(null);
    const [error, setError] = useState<string | null>(null);

    function handleImport() {
        setError(null);
        setSummary(null);
        startTransition(async () => {
            const result = await importInvitationImagesAction();
            if (!result.success) {
                setError(result.message);
                return;
            }
            setSummary(result.data ?? null);
        });
    }

    return (
        <div className="overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-xl ring-1 ring-slate-800/50 space-y-4">
            <div>
                <h4 className="font-semibold text-slate-100">Import ảnh Thư Mời</h4>
                <p className="text-sm text-slate-400">
                    Đọc ảnh trong C:\Users\Win10\Desktop\Thư mời; mã số trước dấu _ trong tên file sẽ được so khớp với cột Mã NV.
                </p>
            </div>

            {error && (
                <div role="alert" className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                    {error}
                </div>
            )}

            <button
                type="button"
                onClick={handleImport}
                disabled={isPending}
                className="rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-3 py-2 text-sm font-semibold text-emerald-200 transition-colors hover:bg-emerald-500/25 disabled:opacity-50"
            >
                {isPending ? "Đang tải ảnh và cập nhật Lark..." : "Import ảnh vào cột Thư Mời"}
            </button>

            {summary && (
                <div className="space-y-3 text-sm">
                    <p className="text-slate-300">
                        Đã quét {summary.scanned} ảnh: thêm {summary.uploaded}, đã có {summary.alreadyAttached},
                        không khớp {summary.unmatched.length}, mã trùng {summary.ambiguous.length}, lỗi {summary.failed.length}.
                    </p>
                    {summary.unmatched.length > 0 && (
                        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                            <h5 className="mb-1 font-semibold text-amber-200">Không tìm thấy người tương ứng</h5>
                            <ul className="list-inside list-disc text-amber-100/80">
                                {summary.unmatched.map((name) => <li key={name}>{name}</li>)}
                            </ul>
                        </div>
                    )}
                    {summary.ambiguous.length > 0 && (
                        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                            <h5 className="mb-1 font-semibold text-amber-200">Mã NV trong Base không duy nhất</h5>
                            <ul className="list-inside list-disc text-amber-100/80">
                                {summary.ambiguous.map((item) => (
                                    <li key={item.fileName}>{item.fileName}: {item.names.join(", ")}</li>
                                ))}
                            </ul>
                        </div>
                    )}
                    {summary.failed.length > 0 && (
                        <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3">
                            <h5 className="mb-1 font-semibold text-red-200">Ảnh chưa cập nhật được</h5>
                            <ul className="list-inside list-disc text-red-100/80">
                                {summary.failed.map((item) => <li key={item.fileName}>{item.fileName}: {item.reason}</li>)}
                            </ul>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}