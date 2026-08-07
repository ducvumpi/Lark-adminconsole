"use client";

import { useState, type FormEvent } from "react";
import type { LarkField, LarkRecord } from "@/app/lib/lark-client";

type RecordFormModalProps = {
  fields: LarkField[];
  onCancel: () => void;
  onSubmit: (newFields: Record<string, unknown>) => Promise<void>;
  submitting: boolean;
  initialRecord?: LarkRecord | null;
};

function normalizeValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map(normalizeValue).join(", ");
  if (typeof value === "object") {
    const v = value as { text?: string };
    if (v?.text) return v.text;
    return JSON.stringify(value);
  }
  return String(value);
}

function parseValue(field: LarkField, value: string): unknown {
  if (value === "") return null;
  if (field.type === 2) {
    const normalized = value.replace(/,/g, "");
    const num = Number(normalized);
    return Number.isNaN(num) ? value : num;
  }
  return value;
}

export default function RecordFormModal({ fields, onCancel, onSubmit, submitting, initialRecord }: RecordFormModalProps) {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const initialValues: Record<string, string> = {};
    for (const field of fields) {
      const raw = initialRecord?.fields[field.field_name];
      initialValues[field.field_name] = normalizeValue(raw);
    }
    return initialValues;
  });

  function handleChange(fieldName: string, value: string) {
    setValues((current) => ({ ...current, [fieldName]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const newFields: Record<string, unknown> = {};
    for (const field of fields) {
      const value = values[field.field_name] ?? "";
      const parsed = parseValue(field, value);
      if (parsed !== null && parsed !== "") {
        newFields[field.field_name] = parsed;
      }
    }
    await onSubmit(newFields);
  }

  return (
    <div className="modal-overlay">
      <div className="modal card" style={{ maxWidth: 640, margin: "auto" }}>
        <div className="card-header row-between">
          <h2 className="text-xl font-semibold">{initialRecord ? "Sửa record" : "Thêm record"}</h2>
          <button className="btn btn-sm" type="button" onClick={onCancel}>
            Đóng
          </button>
        </div>

        <form onSubmit={handleSubmit} className="card-body space-y-4">
          {fields.map((field) => {
            const isNumber = field.type === 2;
            return (
              <label key={field.field_id} className="block">
                <span className="font-medium">{field.field_name}</span>
                <input
                  type={isNumber ? "number" : "text"}
                  value={values[field.field_name] ?? ""}
                  onChange={(e) => handleChange(field.field_name, e.target.value)}
                  className="input w-full"
                  placeholder={field.field_name}
                />
              </label>
            );
          })}

          <div className="row-between" style={{ gap: 8 }}>
            <button type="button" className="btn" onClick={onCancel} disabled={submitting}>
              Hủy
            </button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? "Đang lưu..." : "Lưu"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
