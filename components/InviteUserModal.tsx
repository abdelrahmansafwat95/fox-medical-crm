"use client";

/**
 * Admin-only: add a team member. Calls the team-invite Edge Function, which
 * creates the account with a temporary password and returns it once. The
 * admin passes it on (Copy / WhatsApp); the new person changes it in Settings.
 * No email is sent — see supabase/functions/team-invite for why.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { normalizePhone } from "@/lib/phone";
import { Loader2, X, UserPlus, Copy, Check, MessageCircle, AlertTriangle } from "lucide-react";

import { tr } from "@/lib/i18n";
type Option = { value: string; label: string };

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  roles: Option[];
  managers: Option[];
  branches: Option[];
  territories: Option[];
}

const APP_URL = "https://fox-medical-crm.vercel.app/login";

const EMPTY = {
  full_name: "", email: "", phone: "", role: "medical_rep",
  line_manager_id: "", branch_id: "", territory_id: "", product_line: ""
};

export default function InviteUserModal({ open, onClose, onCreated, roles, managers, branches, territories }: Props) {
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ email: string; temp_password: string; code: string | null } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(EMPTY);
      setError(null);
      setResult(null);
      setCopied(false);
    }
  }, [open]);

  if (!open) return null;

  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const { data, error: fnError } = await supabase.functions.invoke("team-invite", {
      body: { ...form, phone: form.phone ? normalizePhone(form.phone) : "" }
    });
    setSaving(false);
    if (fnError) {
      // FunctionsHttpError carries the function's own JSON message.
      const detail = await (fnError as any).context?.json?.().catch(() => null);
      setError(detail?.error ?? fnError.message);
      return;
    }
    setResult(data);
    onCreated();
  }

  const message = result
    ? `Your Fox Medical CRM login:\n${APP_URL}\nEmail: ${result.email}\nTemporary password: ${result.temp_password}\nPlease change it in Settings after you sign in.`
    : "";

  async function copy() {
    await navigator.clipboard.writeText(message);
    setCopied(true);
  }

  const phoneDigits = (normalizePhone(form.phone) ?? "").replace(/\D/g, "");
  const wa = `https://wa.me/${phoneDigits}?text=${encodeURIComponent(message)}`;

  const field = "w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-brand-500 bg-white";
  const label = "block text-sm font-medium text-slate-700 mb-1";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg rounded-2xl bg-white shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-900 flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-brand-600" /> {result ? tr("Account created") : tr("Invite a team member")}
          </h2>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600" aria-label={tr("Close")}>
            <X className="w-5 h-5" />
          </button>
        </div>

        {result ? (
          <div className="p-5 space-y-4">
            <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800 flex gap-2">
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{tr("This password is shown only once. Send it now. If it is lost, set a new one in Supabase → Authentication → Users.")}</span>
            </div>
            <dl className="text-sm space-y-2">
              <div><dt className="text-slate-500">{tr("Email")}</dt><dd className="font-medium text-slate-900">{result.email}</dd></div>
              <div><dt className="text-slate-500">{tr("Temporary password")}</dt>
                <dd className="font-mono text-base font-semibold text-slate-900 select-all">{result.temp_password}</dd></div>
              {result.code && <div><dt className="text-slate-500">{tr("Rep code")}</dt><dd className="font-mono text-slate-900">{result.code}</dd></div>}
            </dl>
            <div className="flex flex-wrap gap-2">
              <button onClick={copy} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50">
                {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />} {copied ? tr("Copied") : tr("Copy login details")}
              </button>
              {phoneDigits.length >= 8 && (
                <a href={wa} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#25D366] hover:bg-[#1ebe5a] px-3 py-2 text-sm font-semibold text-white">
                  <MessageCircle className="w-4 h-4" /> {tr("Send on WhatsApp")}
                </a>
              )}
            </div>
            <button onClick={onClose} className="w-full rounded-lg bg-brand-600 hover:bg-brand-700 text-white py-2 font-semibold">{tr("Done")}</button>
          </div>
        ) : (
          <form onSubmit={submit} className="p-5 space-y-3">
            {error && <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">{error}</div>}
            <div>
              <label className={label}>{tr("Full name *")}</label>
              <input className={field} value={form.full_name} onChange={set("full_name")} required />
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className={label}>{tr("Email *")}</label>
                <input type="email" className={field} value={form.email} onChange={set("email")} required />
              </div>
              <div>
                <label className={label}>{tr("Phone / WhatsApp")}</label>
                <input type="tel" dir="ltr" className={field} value={form.phone} onChange={set("phone")} placeholder="01xxxxxxxxx" />
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className={label}>{tr("Role *")}</label>
                <select className={field} value={form.role} onChange={set("role")}>
                  {roles.map((r) => <option key={r.value} value={r.value}>{tr(r.label)}</option>)}
                </select>
              </div>
              <div>
                <label className={label}>{tr("Reports to")}</label>
                <select className={field} value={form.line_manager_id} onChange={set("line_manager_id")}>
                  <option value="">—</option>
                  {managers.map((m) => <option key={m.value} value={m.value}>{tr(m.label)}</option>)}
                </select>
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className={label}>{tr("Branch")}</label>
                <select className={field} value={form.branch_id} onChange={set("branch_id")} disabled={!branches.length}>
                  <option value="">{branches.length ? "—" : tr("None created yet")}</option>
                  {branches.map((o) => <option key={o.value} value={o.value}>{tr(o.label)}</option>)}
                </select>
              </div>
              <div>
                <label className={label}>{tr("Territory")}</label>
                <select className={field} value={form.territory_id} onChange={set("territory_id")} disabled={!territories.length}>
                  <option value="">{territories.length ? "—" : tr("None created yet")}</option>
                  {territories.map((o) => <option key={o.value} value={o.value}>{tr(o.label)}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className={label}>{tr("Product line")}</label>
              <input className={field} value={form.product_line} onChange={set("product_line")} />
            </div>
            <p className="text-xs text-slate-500">
              {tr("No email is sent. You'll get a temporary password to pass on; they change it in Settings after signing in.")}
            </p>
            <button type="submit" disabled={saving}
              className="w-full rounded-lg bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white py-2 font-semibold inline-flex items-center justify-center gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
              {saving ? tr("Creating…") : tr("Create account")}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
