"use client";

import { useState } from "react";
import {
    syncAllTiktokRecordsAction,
    type SyncTiktokRecordResult,
} from "@/app/lib/action";

export default function TiktokImportPanel() {
    const [results, setResults] = useState<SyncTiktokRecordResult[]>([]);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<string | null>(null);

    async function handleSync() {
        setLoading(true);
        setMessage(null);
        setResults([]);

        try {
            const res = await syncAllTiktokRecordsAction();

            if (!res.success) {
                setMessage(`❌ ${res.message}`);
                return;
            }

            const data = res.data ?? [];

            setResults(data);

            const successCount = data.filter(
                (item) => item.success
            ).length;

            const errorCount = data.filter(
                (item) => !item.success
            ).length;

            setMessage(
                `Đã quét ${data.length} link TikTok | ` +
                `Thành công: ${successCount} | ` +
                `Lỗi: ${errorCount}`
            );

        } catch (e) {
            setMessage(
                e instanceof Error
                    ? e.message
                    : String(e)
            );
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
                        Hệ thống sẽ đọc toàn bộ bản ghi trong Lark Base,
                        tìm cột Link Air và tự động lấy chỉ số từ các
                        link TikTok.
                    </p>
                </div>

                <button
                    className="btn btn-primary"
                    onClick={handleSync}
                    disabled={loading}
                >
                    {loading
                        ? "Đang quét Lark Base..."
                        : "Quét & cập nhật TikTok"}
                </button>
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

                                    <th className="px-4 py-3">
                                        Record ID
                                    </th>

                                    <th className="px-4 py-3">
                                        Link Air
                                    </th>

                                    <th className="px-4 py-3">
                                        Video
                                    </th>

                                    <th className="px-4 py-3 text-right">
                                        Views
                                    </th>

                                    <th className="px-4 py-3 text-right">
                                        Likes
                                    </th>

                                    <th className="px-4 py-3 text-right">
                                        Comments
                                    </th>

                                    <th className="px-4 py-3 text-right">
                                        Shares
                                    </th>

                                    <th className="px-4 py-3 text-right">
                                        Collections
                                    </th>

                                    <th className="px-4 py-3 text-right">
                                        Total
                                    </th>

                                    <th className="px-4 py-3">
                                        Trạng thái
                                    </th>

                                </tr>
                            </thead>

                            <tbody>
                                {results.map((item) => (
                                    <tr
                                        key={item.recordId}
                                        className="border-b border-slate-800 last:border-0 hover:bg-slate-800/40"
                                    >

                                        {/* Record ID */}
                                        <td className="px-4 py-3 font-mono text-xs text-slate-500">
                                            {item.recordId}
                                        </td>

                                        {/* Link */}
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

                                        {/* Video */}
                                        <td className="max-w-[250px] px-4 py-3">
                                            <div
                                                className="truncate font-medium text-white"
                                                title={item.title}
                                            >
                                                {item.title || "—"}
                                            </div>

                                            <div className="mt-1 truncate text-xs text-slate-500">
                                                {item.uploader || "—"}
                                            </div>
                                        </td>

                                        {/* Views */}
                                        <td className="px-4 py-3 text-right font-medium text-white">
                                            {formatNumber(item.viewCount)}
                                        </td>

                                        {/* Likes */}
                                        <td className="px-4 py-3 text-right text-slate-300">
                                            {formatNumber(item.likeCount)}
                                        </td>

                                        {/* Comments */}
                                        <td className="px-4 py-3 text-right text-slate-300">
                                            {formatNumber(item.commentCount)}
                                        </td>

                                        {/* Shares */}
                                        <td className="px-4 py-3 text-right text-slate-300">
                                            {formatNumber(item.shareCount)}
                                        </td>

                                        {/* Collections */}
                                        <td className="px-4 py-3 text-right text-slate-300">
                                            {formatNumber(item.collectionCount)}
                                        </td>

                                        {/* Total */}
                                        <td className="px-4 py-3 text-right font-semibold text-white">
                                            {formatNumber(
                                                item.totalInteractionCount
                                            )}
                                        </td>

                                        {/* Status */}
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
