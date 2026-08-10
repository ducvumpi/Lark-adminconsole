"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  deleteBaseProfileAction,
  deleteTableProfileAction,
  saveBaseSettingsAction,
  saveTableSettingsAction,
  switchBaseAction,
  switchTableAction,
} from "@/app/lib/action";
import type { LarkBaseProfile } from "@/app/lib/config";

export default function SettingsForm({
  initial,
}: {
  initial: {
    profiles: LarkBaseProfile[];
    activeBaseId?: string;
    activeTableId?: string;
  };
}) {
  const router = useRouter();
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const [activeBaseId, setActiveBaseId] = useState(
    initial.activeBaseId ?? initial.profiles[0]?.id ?? "default"
  );
  const [baseDraftMode, setBaseDraftMode] = useState(false);

  const profiles = useMemo(() => initial.profiles, [initial.profiles]);
  const activeProfile = profiles.find((p) => p.id === activeBaseId) ?? profiles[0];

  const [activeTableId, setActiveTableId] = useState(
    initial.activeTableId ?? activeProfile?.tables[0]?.id ?? ""
  );
  const [tableDraftMode, setTableDraftMode] = useState(false);

  const activeTable = activeProfile?.tables.find((t) => t.id === activeTableId) ?? activeProfile?.tables[0];

  // ── Base handlers ────────────────────────────────────────────────────────

  async function handleSaveBase(formData: FormData) {
    setMessage(null);
    const result = await saveBaseSettingsAction(formData);
    if (!result.success) {
      setMessage({ type: "error", text: result.message });
      return;
    }
    setBaseDraftMode(false);
    setMessage({ type: "success", text: "Đã lưu thông tin Base." });
    router.refresh();
  }

  async function handleSwitchBase(baseId: string) {
    setActiveBaseId(baseId);
    const newProfile = profiles.find((p) => p.id === baseId);
    setActiveTableId(newProfile?.tables[0]?.id ?? "");
    const result = await switchBaseAction(baseId);
    if (!result.success) {
      setMessage({ type: "error", text: result.message });
      return;
    }
    setBaseDraftMode(false);
    router.refresh();
  }

  function handleAddBase() {
    setBaseDraftMode(true);
    setActiveBaseId("");
    setMessage({ type: "success", text: "Đang tạo Base mới. Điền thông tin và lưu." });
  }

  async function handleDeleteBase() {
    if (!activeBaseId) return;
    const confirmed = window.confirm("Xóa Base đang chọn (kèm toàn bộ Table bên trong)?");
    if (!confirmed) return;
    const result = await deleteBaseProfileAction(activeBaseId);
    if (!result.success) {
      setMessage({ type: "error", text: result.message });
      return;
    }
    setBaseDraftMode(false);
    setActiveBaseId(profiles[0]?.id ?? "default");
    router.refresh();
  }

  // ── Table handlers ───────────────────────────────────────────────────────

  async function handleSaveTable(formData: FormData) {
    setMessage(null);
    const result = await saveTableSettingsAction(formData);
    if (!result.success) {
      setMessage({ type: "error", text: result.message });
      return;
    }
    setTableDraftMode(false);
    setMessage({ type: "success", text: "Đã lưu Table." });
    router.refresh();
  }

  async function handleSwitchTable(tableProfileId: string) {
    setActiveTableId(tableProfileId);
    const result = await switchTableAction(activeBaseId, tableProfileId);
    if (!result.success) {
      setMessage({ type: "error", text: result.message });
      return;
    }
    router.refresh();
  }

  function handleAddTable() {
    setTableDraftMode(true);
    setActiveTableId("");
  }

  async function handleDeleteTable() {
    if (!activeTableId) return;
    const confirmed = window.confirm("Xóa Table đang chọn?");
    if (!confirmed) return;
    const result = await deleteTableProfileAction(activeBaseId, activeTableId);
    if (!result.success) {
      setMessage({ type: "error", text: result.message });
      return;
    }
    setTableDraftMode(false);
    setActiveTableId(activeProfile?.tables[0]?.id ?? "");
    router.refresh();
  }

  const baseFormId = baseDraftMode ? "" : (activeProfile?.id ?? "");
  const tableFormProfileId = tableDraftMode ? "" : (activeTable?.id ?? "");

  return (
    <div className="space-y-6">
      {message && <div className={`alert alert-${message.type}`}>{message.text}</div>}

      {/* ── Chọn Base ─────────────────────────────────────────────────── */}
      <div className="card">
        <div className="field-group">
          <label htmlFor="baseSelect">Base đang chọn</label>
          <select
            id="baseSelect"
            value={activeBaseId}
            onChange={(e) => handleSwitchBase(e.target.value)}
          >
            {profiles.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.name} ({profile.tables.length} bảng)
              </option>
            ))}
          </select>
          <div className="row" style={{ marginTop: 8, gap: 8 }}>
            <button type="button" className="btn btn-sm" onClick={handleAddBase}>
              + Thêm Base mới
            </button>
            <button type="button" className="btn btn-sm btn-danger" onClick={handleDeleteBase}>
              Xóa Base này
            </button>
          </div>
        </div>
      </div>

      {/* ── Form thông tin Base (credentials) ────────────────────────── */}
      <form action={(fd) => startTransition(() => handleSaveBase(fd))} className="card">
        <h3>Thông tin kết nối Base</h3>
        <input type="hidden" name="baseId" value={baseFormId} />

        <div className="field-group">
          <label htmlFor="name">Tên Base</label>
          <input
            type="text"
            id="name"
            name="name"
            defaultValue={baseDraftMode ? "" : (activeProfile?.name ?? "")}
            placeholder="Ví dụ: Base Sales"
          />
        </div>

        <div className="field-group">
          <label htmlFor="appId">App ID</label>
          <input
            type="text"
            id="appId"
            name="appId"
            defaultValue={baseDraftMode ? "" : (activeProfile?.appId ?? "")}
            placeholder="cli_xxxxxxxxxx"
          />
        </div>

        <div className="field-group">
          <label htmlFor="appSecret">App Secret</label>
          <input
            type="password"
            id="appSecret"
            name="appSecret"
            defaultValue={baseDraftMode ? "" : (activeProfile?.appSecret ?? "")}
          />
        </div>

        <div className="field-group">
          <label htmlFor="baseAppToken">Base App Token</label>
          <input
            type="text"
            id="baseAppToken"
            name="baseAppToken"
            defaultValue={baseDraftMode ? "" : (activeProfile?.baseAppToken ?? "")}
            placeholder="Lấy từ URL của Lark Base"
          />
        </div>

        <div className="field-group">
          <label htmlFor="apiBaseUrl">API Base URL</label>
          <input
            type="text"
            id="apiBaseUrl"
            name="apiBaseUrl"
            defaultValue={baseDraftMode ? "" : (activeProfile?.apiBaseUrl ?? "")}
          />
          <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>
            Lark quốc tế: https://open.larksuite.com/open-apis · Feishu Trung Quốc: https://open.feishu.cn/open-apis
          </div>
        </div>

        <button type="submit" className="btn btn-primary" disabled={isPending}>
          {isPending ? "Đang lưu..." : "Lưu thông tin Base"}
        </button>
      </form>

      {/* ── Chọn + quản lý Table thuộc Base đang active ──────────────── */}
      {!baseDraftMode && activeProfile && (
        <div className="card">
          <div className="field-group">
            <label htmlFor="tableSelect">Bảng (Table) đang chọn</label>
            <select
              id="tableSelect"
              value={activeTableId}
              onChange={(e) => handleSwitchTable(e.target.value)}
              disabled={activeProfile.tables.length === 0}
            >
              {activeProfile.tables.length === 0 && <option value="">— Chưa có bảng nào —</option>}
              {activeProfile.tables.map((table) => (
                <option key={table.id} value={table.id}>
                  {table.name}
                </option>
              ))}
            </select>
            <div className="row" style={{ marginTop: 8, gap: 8 }}>
              <button type="button" className="btn btn-sm" onClick={handleAddTable}>
                + Thêm bảng mới
              </button>
              <button
                type="button"
                className="btn btn-sm btn-danger"
                onClick={handleDeleteTable}
                disabled={!activeTableId}
              >
                Xóa bảng này
              </button>
            </div>
          </div>

          <form action={(fd) => startTransition(() => handleSaveTable(fd))} style={{ marginTop: 16 }}>
            <input type="hidden" name="baseId" value={activeProfile.id} />
            <input type="hidden" name="tableProfileId" value={tableFormProfileId} />

            <div className="field-group">
              <label htmlFor="tableName">Tên bảng (hiển thị)</label>
              <input
                type="text"
                id="tableName"
                name="tableName"
                defaultValue={tableDraftMode ? "" : (activeTable?.name ?? "")}
                placeholder="Ví dụ: Ngân sách Q3"
              />
            </div>

            <div className="field-group">
              <label htmlFor="tableId">Table ID</label>
              <input
                type="text"
                id="tableId"
                name="tableId"
                defaultValue={tableDraftMode ? "" : (activeTable?.tableId ?? "")}
                placeholder="tblxxxxxxxxxx"
              />
            </div>

            <button type="submit" className="btn btn-primary" disabled={isPending}>
              {isPending ? "Đang lưu..." : "Lưu bảng"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}