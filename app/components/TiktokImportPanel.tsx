"use client";

import { useState } from "react";
import {
    fetchTiktokVideoMetricsAction,
    importTiktokVideoMetricsToLarkBaseAction,
    type TiktokVideoMetrics,
} from "@/app/lib/action";

export default function TiktokImportPanel() {
    const [profileInput, setProfileInput] = useState("https://www.tiktok.com/@tiktok/video/7473234450012131626");
    const [preview, setPreview] = useState<TiktokVideoMetrics | null>(null);
    const [loadingPreview, setLoadingPreview] = useState(false);
    const [loadingImport, setLoadingImport] = useState(false);
    const [message, setMessage] = useState<string | null>(null);

    async function handlePreview() {
        setLoadingPreview(true);
        setMessage(null);
        try {
            const res = await fetchTiktokVideoMetricsAction(profileInput);
            if (!res.success) {
                setMessage(res.message);
                setPreview(null);
                return;
            }
            setPreview(res.data ?? null);
            setMessage("Đã lấy được metadata video từ TikTok.");
        } catch (e) {
            setMessage(e instanceof Error ? e.message : String(e));
            setPreview(null);
        } finally {
            setLoadingPreview(false);
        }
    }

    async function handleImport() {
        setLoadingImport(true);
        setMessage(null);
        try {
            const res = await importTiktokVideoMetricsToLarkBaseAction(profileInput);
            if (!res.success) {
                setMessage(res.message);
                return;
            }
            setMessage(`Đã import thành công vào Lark Base với record_id ${res.data?.record_id ?? ""}.`);
        } catch (e) {
            setMessage(e instanceof Error ? e.message : String(e));
        } finally {
            setLoadingImport(false);
        }
    }

    return (
        <section className="rounded-2xl border border-slate-700 bg-slate-900/70 p-6 shadow-xl ring-1 ring-slate-800/50">
            <div className="flex flex-col gap-3 md:flex-row md:items-end">
                <label className="flex-1 text-sm text-slate-300">
                    <span className="mb-2 block font-medium">Video TikTok URL</span>
                    <input
                        className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none ring-0 transition focus:border-blue-500"
                        value={profileInput}
                        onChange={(e) => setProfileInput(e.target.value)}
                        placeholder="https://www.tiktok.com/@username/video/1234567890123456789"
                    />
                </label>

                <div className="flex flex-wrap gap-2">
                    <button className="btn btn-sm" onClick={handlePreview} disabled={loadingPreview || loadingImport}>
                        {loadingPreview ? "Đang đọc..." : "Xem chỉ số"}
                    </button>
                    <button className="btn btn-sm btn-primary" onClick={handleImport} disabled={loadingPreview || loadingImport}>
                        {loadingImport ? "Đang import..." : "Import vào LarkBase"}
                    </button>
                </div>
            </div>

            {message ? <div className="mt-4 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200">{message}</div> : null}

            {preview ? (
                <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <MetricCard label="Title" value={preview.title} />
                    <MetricCard label="Uploader" value={preview.uploader} />
                    <MetricCard label="View Count" value={preview.viewCount.toLocaleString("vi-VN")} />
                    <MetricCard label="Comment Count" value={preview.commentCount.toLocaleString("vi-VN")} />
                    <MetricCard label="Collection Count" value={preview.collectionCount.toLocaleString("vi-VN")} />
                    <MetricCard label="Like Count" value={preview.likeCount.toLocaleString("vi-VN")} />
                    <MetricCard label="Total Interaction Count" value={preview.totalInteractionCount.toLocaleString("vi-VN")} />
                    <MetricCard label="Release Time" value={preview.releaseTime} />
                    <MetricCard label="Share Count" value={preview.shareCount.toLocaleString("vi-VN")} />
                    <MetricCard label="Data Retrieval Time" value={preview.dataRetrievalTime} />
                    <MetricCard label="Error Message" value={preview.errorMessage || "—"} />
                </div>
            ) : null}
        </section>
    );
}

function MetricCard({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-xl border border-slate-700 bg-slate-950/80 p-3">
            <div className="text-xs uppercase tracking-[0.2em] text-slate-500">{label}</div>
            <div className="mt-2 text-lg font-semibold text-white">{value}</div>
        </div>
    );
}
