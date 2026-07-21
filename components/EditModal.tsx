"use client";

import { useEffect, useState } from "react";
import { Loader2, X, Save, AlertTriangle, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { normalizePhone } from "@/lib/phone";

export type FieldType = "text" | "textarea" | "number" | "select" | "checkbox" | "tel" | "email" | "date";

export interface FieldConfig {
  name: string;          // column name in DB
  label: string;         // shown to user
  type: FieldType;
  required?: boolean;
  options?: { value: string; label: string }[]; // for select
  placeholder?: string;
  min?: number;
  max?: number;
  step?: number;
  helpText?: string;
  rtl?: boolean;
}

interface Props {
  open: boolean;
  title: string;
  table: string;             // supabase table to update/insert
  recordId?: string | null;  // null = create, string = edit
  fields: FieldConfig[];
  initialValues?: Record<string, unknown>;
  onClose: () => void;
  onSaved: () => void;
  onDeleted?: () => void;
  allowDelete?: boolean;
  /** Extra fields to set on insert that aren't in the form (e.g. created_by) */
  insertDefaults?: Record<string, unknown>;
  /** Optional dup check run only on CREATE. Return a warning string to prompt
   *  the user to confirm before inserting, or null to proceed silently. */
  duplicateCheck?: (values: Record<string, unknown>) => Promise<string | null>;
}

export default function EditModal({
  open,
  title,
  table,
  recordId,
  fields,
  initialValues,
  onClose,
  onSaved,
  onDeleted,
  allowDelete,
  insertDefaults,
  duplicateCheck
}: Props) {
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset when opened
  useEffect(() => {
    if (open) {
      const blanks: Record<string, unknown> = {};
      fields.forEach((f) => {
        blanks[f.name] = f.type === "checkbox" ? false : f.type === "number" ? 0 : "";
      });
      setValues({ ...blanks, ...(initialValues ?? {}) });
      setError(null);
    }
  }, [open, initialValues, fields]);

  function setField(name: string, value: unknown) {
    setValues((v) => ({ ...v, [name]: value }));
  }

  async function save() {
    // Validate required
    for (const f of fields) {
      if (f.required) {
        const v = values[f.name];
        if (v === null || v === undefined || v === "") {
          setError(`${f.label} is required.`);
          return;
        }
      }
    }
    setSaving(true);
    setError(null);

    // Convert empty strings to null for nullable text columns
    const payload: Record<string, unknown> = {};
    for (const f of fields) {
      const v = values[f.name];
      if (f.type === "number") {
        payload[f.name] = v === "" || v === null ? null : Number(v);
      } else if (f.type === "checkbox") {
        payload[f.name] = !!v;
      } else if (f.type === "tel") {
        payload[f.name] = v === "" || v === null ? null : normalizePhone(v);
      } else {
        payload[f.name] = v === "" ? null : v;
      }
    }

    // Duplicate guard (create only)
    if (!recordId && duplicateCheck) {
      const warn = await duplicateCheck(payload);
      if (warn && !confirm(`${warn}\n\nCreate it anyway?`)) {
        setSaving(false);
        return;
      }
    }

    let err: { message: string } | null = null;
    if (recordId) {
      const { error: updErr } = await supabase.from(table).update(payload).eq("id", recordId);
      err = updErr;
    } else {
      const insertPayload = { ...payload, ...(insertDefaults ?? {}) };
      const { error: insErr } = await supabase.from(table).insert(insertPayload);
      err = insErr;
    }

    setSaving(false);
    if (err) {
      setError(err.message);
      return;
    }
    onSaved();
  }

  async function del() {
    if (!recordId) return;
    if (!confirm("Are you sure? This cannot be undone.")) return;
    setDeleting(true);
    setError(null);
    const { error: delErr } = await supabase.from(table).delete().eq("id", recordId);
    setDeleting(false);
    if (delErr) {
      // If FK violation, suggest soft-delete via is_active
      if (delErr.message.includes("foreign key") || delErr.message.includes("violates")) {
        setError(
          "This record is referenced by other data. Try deactivating it instead (uncheck 'Active')."
        );
      } else {
        setError(delErr.message);
      }
      return;
    }
    onDeleted?.();
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-slate-900/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-t-2xl sm:rounded-xl shadow-2xl w-full sm:max-w-md max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="font-semibold text-slate-900">{title}</h2>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-700"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {error && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {fields.map((f) => (
            <FieldRow key={f.name} field={f} value={values[f.name]} onChange={(v) => setField(f.name, v)} />
          ))}
        </div>

        <div className="p-4 border-t border-slate-200 flex items-center gap-2">
          {allowDelete && recordId && onDeleted && (
            <button
              onClick={del}
              disabled={saving || deleting}
              className="px-3 py-2 rounded-lg text-red-700 hover:bg-red-50 inline-flex items-center gap-1 text-sm disabled:opacity-50"
            >
              {deleting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
              Delete
            </button>
          )}
          <button
            onClick={onClose}
            disabled={saving || deleting}
            className="ml-auto px-4 py-2 rounded-lg border border-slate-300 text-slate-700 font-medium hover:bg-slate-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving || deleting}
            className="bg-brand-600 hover:bg-brand-700 disabled:bg-brand-400 text-white font-medium px-4 py-2 rounded-lg inline-flex items-center gap-2"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function FieldRow({
  field,
  value,
  onChange
}: {
  field: FieldConfig;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const common = "w-full p-2.5 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-brand-500";
  const v = value === null || value === undefined ? "" : String(value);

  if (field.type === "checkbox") {
    return (
      <label className="flex items-center gap-2 text-sm cursor-pointer">
        <input
          type="checkbox"
          checked={!!value}
          onChange={(e) => onChange(e.target.checked)}
          className="w-4 h-4"
        />
        <span className="text-slate-700">{field.label}</span>
      </label>
    );
  }

  return (
    <div>
      <label className="block text-xs font-medium text-slate-700 mb-1">
        {field.label}
        {field.required && <span className="text-red-600 ml-0.5">*</span>}
      </label>

      {field.type === "textarea" ? (
        <textarea
          value={v}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          rows={3}
          dir={field.rtl ? "rtl" : "ltr"}
          className={common}
        />
      ) : field.type === "select" ? (
        <select value={v} onChange={(e) => onChange(e.target.value)} className={common}>
          <option value="">—</option>
          {field.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : field.type === "number" ? (
        <input
          type="number"
          value={v}
          min={field.min}
          max={field.max}
          step={field.step ?? 1}
          onChange={(e) => onChange(e.target.value === "" ? "" : parseFloat(e.target.value))}
          placeholder={field.placeholder}
          className={common}
        />
      ) : (
        <input
          type={field.type === "tel" ? "tel" : field.type === "email" ? "email" : field.type === "date" ? "date" : "text"}
          value={v}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          dir={field.rtl ? "rtl" : "ltr"}
          className={common}
        />
      )}

      {field.helpText && <p className="text-[11px] text-slate-500 mt-1">{field.helpText}</p>}
    </div>
  );
}
