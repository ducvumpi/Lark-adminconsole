"use client";

import { useMemo, useState } from "react";
import type { LarkBaseProfile, LarkConfig } from "@/app/lib/config";
import type { LarkField, LarkRecord } from "@/app/lib/lark-client";
import type { ActionResult } from "@/app/lib/action";
import RecordsManager from "@/app/components/RecordsManager";
import ImportWizard from "@/app/components/ImportWizard";
import TiktokImportPanel from "@/app/components/TiktokImportPanel";
import SettingsForm from "@/app/components/SettingsForm";

const FIELD_TYPE_LABEL: Record<string, string> = {
    1: "Single Select",
    2: "Multi Select",
    3: "Text",
    4: "Number",
    5: "Date",
    6: "Checkbox",
    7: "User",
    8: "Phone",
    9: "Attachment",
    10: "Formula",
    11: "Link",
    12: "Group Chat",
    13: "Created Time",
    14: "Modified Time",
    15: "Created User",
    16: "Modified User",
    17: "Currency",
    18: "Percent",
    19: "Auto Number",
};

type TabKey = "overview" | "fields" | "records" | "import" | "tiktok" | "settings";

type RecordsListResult = {
    items: LarkRecord[];
    hasMore: boolean;
    pageToken?: string;
    total: number;
};

export default function SpaDashboard({
    settings,
    fieldsResult,
    recordsResult,
}: {
    settings: LarkConfig & { complete: boolean; profiles: LarkBaseProfile[]; activeBaseId?: string };
    fieldsResult: ActionResult<LarkField[]>;
    recordsResult: ActionResult<RecordsListResult>;
}) {
    const [activeTab, setActiveTab] = useState<TabKey>("overview");
    const [importProgress, setImportProgress] = useState<{
        open: boolean;
        operation: "import" | "undo";
        current: number;
        total: number;
        message: string;
    } | null>(null);
    const [isProgressHidden, setIsProgressHidden] = useState(false);

    const fields = useMemo(() => fieldsResult.success ? fieldsResult.data ?? [] : [], [fieldsResult]);
    const records = useMemo(() => recordsResult.success ? recordsResult.data ?? { items: [], hasMore: false, total: 0 } : { items: [], hasMore: false, total: 0 }, [recordsResult]);
    const progressPercent = importProgress?.total
        ? Math.min(100, Math.round((importProgress.current / importProgress.total) * 100))
        : 0;
    const progressBarTone = importProgress?.operation === "undo"
        ? "from-amber-400 to-yellow-300"
        : "from-emerald-400 to-cyan-400";
    const progressBorderTone = importProgress?.operation === "undo"
        ? "border-amber-500/60"
        : "border-emerald-500/60";
    const progressBadgeTone = importProgress?.operation === "undo"
        ? "bg-amber-500/15 text-amber-200 border-amber-400/40"
        : "bg-emerald-500/15 text-emerald-200 border-emerald-400/40";
    const progressSummaryLabel = importProgress?.operation === "undo"
        ? "File đang hoàn tác"
        : "Record đã xử lý / Tổng record";

    const showProgressOverlay = importProgress?.open && !isProgressHidden;

    const tabs: { key: TabKey; label: string; icon: string }[] = [
        { key: "overview", label: "Tổng quan", icon: "🏠" },
        { key: "fields", label: "Danh sách cột", icon: "📋" },
        { key: "records", label: "Records", icon: "🗂" },
        { key: "import", label: "Import Excel", icon: "⬆️" },
        { key: "tiktok", label: "TikTok", icon: "🎵" },
        { key: "settings", label: "Cài đặt", icon: "⚙️" },
    ];

    return (
        <div className="spa-shell">
            <aside className="sidebar-nav">
                <div className="sidebar-brand">🗂 Lark Base Manager</div>

                <div className="sidebar-section">
                    {tabs.map((tab) => (
                        <button
                            key={tab.key}
                            type="button"
                            className={`sidebar-item ${activeTab === tab.key ? "active" : ""}`}
                            onClick={() => setActiveTab(tab.key)}
                        >
                            <span className="sidebar-icon">{tab.icon}</span>
                            <span>{tab.label}</span>
                        </button>
                    ))}
                </div>

                <div className="sidebar-footer">
                    <div className="sidebar-footer-title">Status</div>
                    <div className="sidebar-footer-value">{settings.complete ? "Connected" : "Needs setup"}</div>
                </div>
            </aside>

            <main className="content-area">
                <header className="workspace-header">
                    <div>
                        <span className="eyebrow">Bảng điều khiển</span>
                        <h1 className="hero-title">Quản lý Lark Base</h1>
                        <p className="hero-subtitle">
                            Giao diện đang chạy theo mô hình Sidebar Layout SPA, giúp bạn thao tác nhanh hơn với các module trong cùng một trang.
                        </p>
                    </div>
                    <div className="header-badge">SPA</div>
                </header>

                {activeTab === "overview" && (
                    <section className="panel">
                        <div className="panel-header">
                            <div>
                                <h3 className="panel-title">Tổng quan hệ thống</h3>
                            </div>
                        </div>

                        {!settings.complete && (
                            <div className="alert alert-error">
                                Chưa cấu hình đủ App ID / App Secret / Base Token / Table ID. Hãy vào mục Cài đặt để hoàn tất.
                            </div>
                        )}

                        <div className="card-grid">
                            <div className="stat-card" style={{ display: "block" }}>
                                <div className="stat-label">Trạng thái cấu hình</div>
                                <div className="stat-value">{settings.complete ? "Đã cấu hình" : "Chưa đủ"}</div>
                                <p className="stat-note">Bộ thông tin kết nối Lark Base hiển thị trong content area của layout sidebar.</p>
                            </div>
                            <div className="stat-card" style={{ display: "block" }}>
                                <div className="stat-label">Số cột trong bảng</div>
                                <div className="stat-value">{fieldsResult.success ? fields.length : "—"}</div>
                                <p className="stat-note">Số field hiện có trong schema của table đã kết nối.</p>
                            </div>
                            <div className="stat-card" style={{ display: "block" }}>
                                <div className="stat-label">Table ID</div>
                                <div className="stat-value" style={{ fontSize: 15, wordBreak: "break-all" }}>{settings.tableId || "—"}</div>
                                <p className="stat-note">Dùng chung dữ liệu cấu hình được lưu trên server.</p>
                            </div>
                        </div>
                    </section>
                )}

                {activeTab === "fields" && (
                    <section className="panel">
                        <div className="panel-header">
                            <div>
                                <h3 className="panel-title">Danh sách cột</h3>
                            </div>
                        </div>

                        {!fieldsResult.success && (
                            <div className="alert alert-error">{fieldsResult.message}</div>
                        )}

                        {fieldsResult.success && (
                            <div className="overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-xl ring-1 ring-slate-800/50">
                                <div className="overflow-x-auto">
                                    <table className="min-w-full">
                                        <thead className="bg-slate-800/80 backdrop-blur">
                                            <tr>
                                                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Tên cột</th>
                                                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Loại</th>
                                                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Field ID</th>
                                                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Tùy chọn</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-800">
                                            {fields.map((field) => (
                                                <tr key={field.field_id} className="transition-colors duration-200 hover:bg-slate-800/60">
                                                    <td className="px-6 py-4 font-medium">{field.field_name}</td>
                                                    <td className="px-6 py-4">
                                                        <span className="inline-flex rounded-full bg-blue-500/15 px-3 py-1 text-xs font-semibold text-blue-300">
                                                            {FIELD_TYPE_LABEL[field.type] || `Loại ${field.type}`}
                                                        </span>
                                                    </td>
                                                    <td className="max-w-xs break-all px-6 py-4 font-mono text-sm text-slate-400">{field.field_id}</td>
                                                    <td className="px-6 py-4 text-slate-300">
                                                        {field.property?.options?.length ? (
                                                            <div className="flex flex-wrap gap-2">
                                                                {field.property.options.map((option) => (
                                                                    <span key={option.id ?? option.name} className="rounded-full bg-slate-700 px-3 py-1 text-xs">
                                                                        {option.name}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        ) : (
                                                            <span className="text-slate-500">—</span>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </section>
                )}

                {activeTab === "records" && (
                    <section className="panel">
                        <div className="panel-header">
                            <div>
                                <h3 className="panel-title">Quản lý Records</h3>
                            </div>
                        </div>

                        {recordsResult.success ? (
                            <div className="overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-xl ring-1 ring-slate-800/50">
                                <RecordsManager
                                    fields={fields}
                                    initialRecords={records.items}
                                    initialHasMore={records.hasMore}
                                    initialPageToken={records.pageToken}
                                    initialTotal={records.total}
                                />
                            </div>
                        ) : (
                            <div className="alert alert-error">{recordsResult.message}</div>
                        )}
                    </section>
                )}

                <section
                    className="panel"
                    style={{ display: activeTab === "import" ? "block" : "none" }}
                >
                    <div className="panel-header">
                        <div>
                            <h3 className="panel-title">Import Excel</h3>
                        </div>
                    </div>
                    <ImportWizard onProgressStateChange={setImportProgress} />
                </section>

                {activeTab === "tiktok" && (
                    <section className="panel">
                        <div className="panel-header">
                            <div>
                                <h3 className="panel-title">TikTok Metrics</h3>
                            </div>
                        </div>
                        <TiktokImportPanel />
                    </section>
                )}

                {activeTab === "settings" && (
                    <section className="panel">
                        <div className="panel-header">
                            <div>
                                <h3 className="panel-title">Cài đặt kết nối</h3>
                            </div>
                        </div>
                        <SettingsForm initial={settings} />
                    </section>
                )}
                {showProgressOverlay && (
                    <div className={`fixed bottom-4 left-4 z-50 w-[340px] rounded-2xl border bg-slate-950/95 p-4 text-sm text-slate-200 shadow-2xl backdrop-blur ${progressBorderTone}`}>
                        <div className="mb-2 flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                                <span className="font-semibold text-slate-100">
                                    {importProgress.operation === "import" ? "Đang import" : "Đang hoàn tác"}
                                </span>
                                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${progressBadgeTone}`}>
                                    {importProgress.operation === "import" ? "Run" : "Undo"}
                                </span>
                            </div>
                            <span className="text-[11px] text-slate-400">
                                {progressSummaryLabel}: {importProgress.current}/{importProgress.total} · {progressPercent}%
                            </span>
                        </div>
                        <div className="mb-2 text-xs text-slate-300">{importProgress.message}</div>
                        <div className="h-2.5 overflow-hidden rounded-full bg-slate-800">
                            <div
                                className={`h-full rounded-full bg-gradient-to-r transition-all duration-300 ${progressBarTone}`}
                                style={{ width: `${progressPercent}%` }}
                            />
                        </div>
                        <div className="mt-3 flex gap-2">
                            <button
                                type="button"
                                className="rounded-lg border border-slate-600 bg-slate-800 px-2 py-1 text-[11px] text-slate-200 hover:bg-slate-700"
                                onClick={() => setIsProgressHidden(true)}
                            >
                                Ẩn popup
                            </button>
                            <button
                                type="button"
                                className="rounded-lg border border-sky-500/40 bg-sky-500/10 px-2 py-1 text-[11px] text-sky-200 hover:bg-sky-500/20"
                                onClick={() => {
                                    setActiveTab("import");
                                    setIsProgressHidden(false);
                                }}
                            >
                                Xem chi tiết batch
                            </button>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}
