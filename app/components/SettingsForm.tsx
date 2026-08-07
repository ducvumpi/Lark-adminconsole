"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteBaseProfileAction, saveSettingsAction, switchBaseAction } from "@/app/lib/action";
import type { LarkBaseProfile, LarkConfig } from "@/app/lib/config";

export default function SettingsForm({
  initial,
}: {
  initial: LarkConfig & { profiles: LarkBaseProfile[]; activeBaseId?: string };
}) {
  const router = useRouter();
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();
  const [activeBaseId, setActiveBaseId] = useState(initial.activeBaseId ?? initial.profiles[0]?.id ?? "default");
  const [draftMode, setDraftMode] = useState(false);

  const profiles = useMemo(() => initial.profiles, [initial.profiles]);

  async function handleSubmit(formData: FormData) {
    setMessage(null);
    const result = await saveSettingsAction(formData);
    if (!result.success) {
      setMessage({ type: "error", text: result.message });
      return;
    }
    setDraftMode(false);
    setMessage({ type: "success", text: "Đã lưu cấu hình." });
    router.refresh();
  }

  async function handleSwitchBase(baseId: string) {
    setActiveBaseId(baseId);
    const result = await switchBaseAction(baseId);
    if (!result.success) {
      setMessage({ type: "error", text: result.message });
      return;
    }
    setDraftMode(false);
    router.refresh();
  }

  async function handleAddBase() {
    setDraftMode(true);
    setActiveBaseId("");
    setMessage({ type: "success", text: "Đang tạo profile Base mới. Điền thông tin và lưu." });
  }

  async function handleDeleteBase() {
    if (!activeBaseId) return;
    const confirmed = window.confirm("Xóa profile base đang chọn này?");
    if (!confirmed) return;
    const result = await deleteBaseProfileAction(activeBaseId);
    if (!result.success) {
      setMessage({ type: "error", text: result.message });
      return;
    }
    setDraftMode(false);
    setActiveBaseId(profiles[0]?.id ?? "default");
    router.refresh();
  }

  const activeProfile = profiles.find((profile) => profile.id === activeBaseId) ?? profiles[0];
  const formBaseId = draftMode ? "" : (activeProfile?.id ?? "");

  return (
    <form action={(fd) => startTransition(() => handleSubmit(fd))} className="card">
      {message && <div className={`alert alert-${message.type}`}>{message.text}</div>}

      <div className="field-group">
        <label htmlFor="baseId">Base đang chọn</label>
        <select id="baseId" name="baseId" value={activeBaseId} onChange={(e) => setActiveBaseId(e.target.value)}>
          {profiles.map((profile) => (
            <option key={profile.id} value={profile.id}>
              {profile.name}
            </option>
          ))}
        </select>
        <div className="row" style={{ marginTop: 8, gap: 8 }}>
          <button type="button" className="btn btn-sm" onClick={() => handleSwitchBase(activeBaseId)}>
            Chuyển active base
          </button>
          <button type="button" className="btn btn-sm" onClick={handleAddBase}>
            + Thêm base mới
          </button>
          <button type="button" className="btn btn-sm btn-danger" onClick={handleDeleteBase}>
            Xóa base
          </button>
        </div>
      </div>

      <input type="hidden" name="baseId" value={formBaseId} />

      <div className="field-group">
        <label htmlFor="name">Tên profile Base</label>
        <input
          type="text"
          id="name"
          name="name"
          defaultValue={draftMode ? "" : (activeProfile?.name ?? "Base mới")}
          placeholder="Ví dụ: Base Sales"
        />
      </div>

      <div className="field-group">
        <label htmlFor="appId">App ID</label>
        <input type="text" id="appId" name="appId" defaultValue={draftMode ? "" : (activeProfile?.appId ?? initial.appId)} placeholder="cli_xxxxxxxxxx" />
      </div>

      <div className="field-group">
        <label htmlFor="appSecret">App Secret</label>
        <input type="password" id="appSecret" name="appSecret" defaultValue={draftMode ? "" : (activeProfile?.appSecret ?? initial.appSecret)} />
      </div>

      <div className="field-group">
        <label htmlFor="baseAppToken">Base App Token</label>
        <input
          type="text"
          id="baseAppToken"
          name="baseAppToken"
          defaultValue={draftMode ? "" : (activeProfile?.baseAppToken ?? initial.baseAppToken)}
          placeholder="Lấy từ URL của Lark Base"
        />
      </div>

      <div className="field-group">
        <label htmlFor="tableId">Table ID</label>
        <input type="text" id="tableId" name="tableId" defaultValue={draftMode ? "" : (activeProfile?.tableId ?? initial.tableId)} placeholder="tblxxxxxxxxxx" />
      </div>

      <div className="field-group">
        <label htmlFor="apiBaseUrl">API Base URL</label>
        <input type="text" id="apiBaseUrl" name="apiBaseUrl" defaultValue={draftMode ? "" : (activeProfile?.apiBaseUrl ?? initial.apiBaseUrl)} />
        <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>
          Lark quốc tế: https://open.larksuite.com/open-apis · Feishu Trung Quốc: https://open.feishu.cn/open-apis
        </div>
      </div>

      <button type="submit" className="btn btn-primary" disabled={isPending}>
        {isPending ? "Đang lưu..." : "Lưu cấu hình cho base đang chọn"}
      </button>
    </form>
  );
}
