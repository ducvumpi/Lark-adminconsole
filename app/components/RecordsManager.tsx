"use client";

import { useState } from "react";
import type { LarkField, LarkRecord } from "@/app/lib/lark-client";
import {
  listRecordsAction,
  createRecordAction,
  updateRecordAction,
  deleteRecordAction,
  findDuplicateBudgetRecordsAction,
} from "@/app/lib/action";
import RecordFormModal from "@/app/components/RecordFormModal";

function displayValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map(displayValue).join(", ");
  if (typeof value === "object") {
    const v = value as { text?: string };
    if (v?.text) return v.text;
    return JSON.stringify(value);
  }
  return String(value);
}

export default function RecordsManager({
  fields,
  initialRecords,
  initialHasMore,
  initialPageToken,
  initialTotal,
}: {
  fields: LarkField[];
  initialRecords: LarkRecord[];
  initialHasMore: boolean;
  initialPageToken?: string;
  initialTotal: number;
}) {
  const [records, setRecords] = useState(initialRecords);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [pageToken, setPageToken] = useState(initialPageToken);
  const [total, setTotal] = useState(initialTotal);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [filterField, setFilterField] = useState("");
  const [filterValue, setFilterValue] = useState("");

  const [editingRecord, setEditingRecord] = useState<LarkRecord | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [duplicateGroups, setDuplicateGroups] = useState<{ budgetName: string; records: LarkRecord[] }[]>([]);
  const [findingDuplicates, setFindingDuplicates] = useState(false);
  const [duplicateSearchPerformed, setDuplicateSearchPerformed] = useState(false);

  const columns = fields.slice(0, 6); // hiển thị tối đa 6 cột đầu cho gọn bảng

  function buildFilter(): string | undefined {
    if (!filterField || !filterValue) return undefined;
    return `CurrentValue.[${filterField}] = "${filterValue}"`;
  }

  async function reload(reset = true) {
    setLoading(true);
    setError(null);
    const result = await listRecordsAction({
      filter: buildFilter(),
      pageSize: 20,
      pageToken: reset ? undefined : pageToken,
    });
    setLoading(false);
    if (!result.success) {
      setError(result.message);
      return;
    }
    setRecords(reset ? result.data!.items : [...records, ...result.data!.items]);
    setHasMore(result.data!.hasMore);
    setPageToken(result.data!.pageToken);
    setTotal(result.data!.total);
  }

  async function handleCreate(newFields: Record<string, unknown>) {
    setSaving(true);
    const result = await createRecordAction(newFields);
    setSaving(false);
    if (!result.success) {
      setError(result.message);
      return;
    }
    setShowCreate(false);
    reload();
  }

  async function handleUpdate(newFields: Record<string, unknown>) {
    if (!editingRecord?.record_id) return;
    setSaving(true);
    const result = await updateRecordAction(editingRecord.record_id, newFields);
    setSaving(false);
    if (!result.success) {
      setError(result.message);
      return;
    }
    setEditingRecord(null);
    reload();
  }

  async function handleDelete(record: LarkRecord) {
    if (!record.record_id) return;
    if (!confirm("Xóa record này? Không thể hoàn tác.")) return;
    const result = await deleteRecordAction(record.record_id);
    if (!result.success) {
      setError(result.message);
      return;
    }
    reload();
  }

  async function handleFindDuplicateBudgets() {
    setFindingDuplicates(true);
    setError(null);
    setDuplicateSearchPerformed(true);
    const result = await findDuplicateBudgetRecordsAction();
    setFindingDuplicates(false);
    if (!result.success) {
      setError(result.message);
      return;
    }
    setDuplicateGroups(result.data ?? []);
  }

  return (
    <div>
      {error && <div className="alert alert-error">{error}</div>}

      <div className="card">
        <div className="row-between">
          <div className="row">
            <select value={filterField} onChange={(e) => setFilterField(e.target.value)} style={{ width: 200 }}>
              <option value="">— Lọc theo cột —</option>
              {fields.map((f) => (
                <option key={f.field_id} value={f.field_name}>
                  {f.field_name}
                </option>
              ))}
            </select>
            <input
              type="text"
              placeholder="Giá trị cần lọc"
              value={filterValue}
              onChange={(e) => setFilterValue(e.target.value)}
              style={{ width: 200 }}
            />
            <button className="btn" onClick={() => reload(true)} disabled={loading}>
              Lọc
            </button>
            <button className="btn" onClick={handleFindDuplicateBudgets} disabled={findingDuplicates}>
              {findingDuplicates ? "Đang tìm..." : "Tìm trùng Tên ngân sách"}
            </button>
            {filterField && (
              <button
                className="btn"
                onClick={() => {
                  setFilterField("");
                  setFilterValue("");
                  reload(true);
                }}
              >
                Xóa lọc
              </button>
            )}
          </div>
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
            + Thêm record
          </button>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {columns.map((f) => (
                  <th key={f.field_id}>{f.field_name}</th>
                ))}
                <th>Hành động</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r) => (
                <tr key={r.record_id}>
                  {columns.map((f) => (
                    <td key={f.field_id} title={displayValue(r.fields[f.field_name])}>
                      {displayValue(r.fields[f.field_name])}
                    </td>
                  ))}
                  <td>
                    <div className="row">
                      <button className="btn btn-sm" onClick={() => setEditingRecord(r)}>
                        Sửa
                      </button>
                      <button className="btn btn-sm btn-danger" onClick={() => handleDelete(r)}>
                        Xóa
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {records.length === 0 && !loading && (
                <tr>
                  <td colSpan={columns.length + 1} className="muted">
                    Không có dữ liệu.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="row-between" style={{ marginTop: 14, marginBottom: 0 }}>
          <span className="muted">
            Hiển thị {records.length} / {total} record
          </span>
          {hasMore && (
            <button className="btn" onClick={() => reload(false)} disabled={loading}>
              {loading ? "Đang tải..." : "Tải thêm"}
            </button>
          )}
        </div>
      </div>

      {duplicateSearchPerformed && (
        <div className="card mt-6">
          <div className="row-between">
            <h2 className="text-lg font-semibold">Kết quả Tìm trùng Tên ngân sách</h2>
            <span className="muted">{duplicateGroups.length} nhóm trùng</span>
          </div>

          {findingDuplicates ? (
            <div className="p-4">Đang tìm nhóm trùng Tên ngân sách...</div>
          ) : duplicateGroups.length === 0 ? (
            <div className="p-4 muted">Không tìm thấy record nào có cùng Tên ngân sách.</div>
          ) : (
            <div className="space-y-4 p-4">
              {duplicateGroups.map((group, groupIndex) => (
                <div key={`${group.budgetName}-${groupIndex}`} className="rounded-xl border border-slate-700 p-4 bg-slate-950">
                  <div className="mb-2 font-semibold">
                    Tên ngân sách: {group.budgetName} — {group.records.length} record
                  </div>
                  <ul className="list-disc space-y-1 pl-5 text-sm">
                    {group.records.map((record, recordIndex) => (
                      <li key={record.record_id ?? `${group.budgetName}-${recordIndex}`} className="flex items-center justify-between gap-4">
                        <span>
                          {displayValue(record.fields["Tên ngân sách"]) || record.record_id} — {displayValue(record.fields["Tổng ngân sách"])}
                        </span>
                        <button
                          className="btn btn-sm btn-danger"
                          onClick={() => handleDelete(record)}
                        >
                          Xóa
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {showCreate && (
        <RecordFormModal
          key="create"
          fields={fields}
          onCancel={() => setShowCreate(false)}
          onSubmit={handleCreate}
          submitting={saving}
        />
      )}

      {editingRecord && (
        <RecordFormModal
          key={editingRecord.record_id ?? "edit"}
          fields={fields}
          initialRecord={editingRecord}
          onCancel={() => setEditingRecord(null)}
          onSubmit={handleUpdate}
          submitting={saving}
        />
      )}
    </div>
  );
}
