"use client";

// Monthly incentive statement: bonus tiers on GPS-verified calls and on HCP
// coverage against each rep's targets, reduced when the average visit quality
// is below the plan's floor. Managers approve and mark payouts paid; a rep
// sees only their own line.

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { exportToExcel } from "@/lib/export";
import { isManager, useRole } from "@/lib/roles";
import { BadgeCheck, Banknote, Download, Loader2, Pencil, Save, X } from "lucide-react";

interface Row {
  rep_id: string; rep_name: string; role: string;
  calls_target: number | null; verified_calls: number; calls_pct: number | null;
  coverage_target: number | null; hcps_covered: number; coverage_pct: number | null; avg_quality: number | null;
  calls_bonus: number; coverage_bonus: number; quality_ok: boolean; total: number; currency: string;
  plan_name: string; payout_status: string | null;
}
interface Tier { from_pct: number; amount: number }
interface Plan { id: string; name: string; effective_from: string; calls_tiers: Tier[]; coverage_tiers: Tier[]; quality_min: number; quality_factor: number; currency: string }

const PLAN_EDITORS = ["admin", "country_manager", "sales_director"];
const fmt = (n: number | null | undefined) => (n == null ? "—" : Number(n).toLocaleString("en-US"));

export default function IncentivesPanel({ month }: { month: string }) {
  const { role } = useRole();
  const manager = isManager(role);
  const [rows, setRows] = useState<Row[]>([]);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [me, setMe] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [editPlan, setEditPlan] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    const [{ data: sess }, st, pl] = await Promise.all([
      supabase.auth.getSession(),
      supabase.rpc("incentive_statement", { p_month: month }),
      supabase.from("incentive_plans").select("*").eq("is_active", true).order("effective_from", { ascending: false }).limit(1).maybeSingle()
    ]);
    if (st.error) setError(st.error.message);
    setMe(sess.session?.user.id ?? null);
    setRows((st.data ?? []) as Row[]);
    setPlan((pl.data ?? null) as Plan | null);
    setLoading(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [month]);

  const visible = manager ? rows : rows.filter((r) => r.rep_id === me);

  async function approve(list: Row[]) {
    setBusy("approve");
    const payload = list.filter((r) => !r.payout_status).map((r) => ({
      month, rep_id: r.rep_id, amount: r.total, currency: r.currency, status: "approved",
      breakdown: { calls_target: r.calls_target, verified_calls: r.verified_calls, calls_pct: r.calls_pct, coverage_pct: r.coverage_pct,
                   avg_quality: r.avg_quality, calls_bonus: r.calls_bonus, coverage_bonus: r.coverage_bonus, quality_ok: r.quality_ok, plan: r.plan_name }
    }));
    if (payload.length) {
      const { error: e } = await supabase.from("incentive_payouts").upsert(payload, { onConflict: "month,rep_id" });
      if (e) setError(e.message);
    }
    setBusy(null);
    load();
  }
  async function markPaid(r: Row) {
    setBusy(r.rep_id);
    const { error: e } = await supabase.from("incentive_payouts").update({ status: "paid", paid_at: new Date().toISOString() })
      .eq("month", month).eq("rep_id", r.rep_id);
    if (e) setError(e.message);
    setBusy(null);
    load();
  }

  const total = visible.reduce((s, r) => s + Number(r.total), 0);

  return (
    <div className="space-y-4">
      {plan && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 text-sm">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-slate-900">{plan.name}</span>
            <span className="text-slate-500">from {plan.effective_from}</span>
            <span className="flex-1" />
            {role && PLAN_EDITORS.includes(role) && (
              <button onClick={() => setEditPlan(true)} className="inline-flex items-center gap-1 text-brand-700 hover:underline"><Pencil className="w-3.5 h-3.5" /> Edit plan</button>
            )}
          </div>
          <div className="mt-2 grid sm:grid-cols-3 gap-2 text-slate-600">
            <div><b className="text-slate-800">Verified calls:</b> {plan.calls_tiers.map((t) => `${t.from_pct}% → ${fmt(t.amount)}`).join(" · ")}</div>
            <div><b className="text-slate-800">Coverage:</b> {plan.coverage_tiers.map((t) => `${t.from_pct}% → ${fmt(t.amount)}`).join(" · ")}</div>
            <div><b className="text-slate-800">Quality floor:</b> avg {plan.quality_min}/10, else × {plan.quality_factor}</div>
          </div>
          <p className="text-xs text-slate-400 mt-2">Only completed, GPS-verified visits that weren&apos;t rejected by a manager count. Amounts in {plan.currency}.</p>
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <div className="text-sm text-slate-600">Total for {month}: <b className="text-slate-900">{fmt(total)} {plan?.currency ?? "EGP"}</b></div>
        <span className="flex-1" />
        <button onClick={() => exportToExcel(visible.map((r) => ({
          Rep: r.rep_name, "Calls target": r.calls_target ?? "", "Verified calls": r.verified_calls, "Calls %": r.calls_pct ?? "",
          "Coverage target": r.coverage_target ?? "", "HCPs covered": r.hcps_covered, "Coverage %": r.coverage_pct ?? "",
          "Avg quality": r.avg_quality ?? "", "Calls bonus": r.calls_bonus, "Coverage bonus": r.coverage_bonus,
          "Quality floor met": r.quality_ok ? "Yes" : "No", Total: r.total, Currency: r.currency, Status: r.payout_status ?? "not approved"
        })), `incentives-${month}`, "Incentives")}
          className="border border-slate-300 text-slate-700 hover:bg-slate-50 px-3 py-2 rounded-lg inline-flex items-center gap-2 text-sm font-medium">
          <Download className="w-4 h-4" /> Excel
        </button>
        {manager && visible.some((r) => !r.payout_status) && (
          <button onClick={() => approve(visible)} disabled={busy === "approve"}
            className="bg-brand-600 hover:bg-brand-700 disabled:bg-brand-400 text-white px-3 py-2 rounded-lg inline-flex items-center gap-2 text-sm font-medium">
            {busy === "approve" ? <Loader2 className="w-4 h-4 animate-spin" /> : <BadgeCheck className="w-4 h-4" />} Approve all
          </button>
        )}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}

      {loading ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12 text-center text-slate-500">Loading…</div>
      ) : visible.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12 text-center text-slate-500">No incentive plan or reps for this month.</div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
          <table className="w-full text-sm min-w-[820px]">
            <thead className="bg-slate-50 text-slate-600 text-xs">
              <tr>
                <th className="text-left p-3">Rep</th>
                <th className="text-right p-3">Verified calls</th>
                <th className="text-right p-3">Coverage</th>
                <th className="text-right p-3">Quality</th>
                <th className="text-right p-3">Calls bonus</th>
                <th className="text-right p-3">Coverage bonus</th>
                <th className="text-right p-3">Total</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visible.map((r) => (
                <tr key={r.rep_id} className="hover:bg-slate-50">
                  <td className="p-3 font-medium text-slate-900">{r.rep_name}</td>
                  <td className="p-3 text-right">{r.verified_calls}{r.calls_target ? ` / ${r.calls_target}` : ""}<div className="text-xs text-slate-500">{r.calls_pct != null ? `${r.calls_pct}%` : "no target"}</div></td>
                  <td className="p-3 text-right">{r.hcps_covered}{r.coverage_target ? ` / ${r.coverage_target}` : ""}<div className="text-xs text-slate-500">{r.coverage_pct != null ? `${r.coverage_pct}%` : "no target"}</div></td>
                  <td className={`p-3 text-right ${r.quality_ok ? "" : "text-amber-700 font-semibold"}`}>{r.avg_quality ?? "—"}{!r.quality_ok && <div className="text-xs">below floor</div>}</td>
                  <td className="p-3 text-right">{fmt(r.calls_bonus)}</td>
                  <td className="p-3 text-right">{fmt(r.coverage_bonus)}</td>
                  <td className="p-3 text-right font-bold text-slate-900">{fmt(r.total)} <span className="text-xs font-normal text-slate-500">{r.currency}</span></td>
                  <td className="p-3 text-right whitespace-nowrap">
                    {r.payout_status === "paid" ? (
                      <span className="text-xs font-bold px-2 py-1 rounded bg-cyan-100 text-cyan-800">Paid</span>
                    ) : r.payout_status === "approved" ? (
                      manager ? (
                        <button onClick={() => markPaid(r)} disabled={busy === r.rep_id} className="text-xs border border-slate-300 rounded px-2 py-1 inline-flex items-center gap-1 hover:bg-slate-50">
                          {busy === r.rep_id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Banknote className="w-3 h-3" />} Mark paid
                        </button>
                      ) : <span className="text-xs font-bold px-2 py-1 rounded bg-blue-100 text-blue-700">Approved</span>
                    ) : manager ? (
                      <button onClick={() => approve([r])} disabled={busy === "approve"} className="text-xs bg-brand-600 text-white rounded px-2 py-1 inline-flex items-center gap-1">
                        <BadgeCheck className="w-3 h-3" /> Approve
                      </button>
                    ) : <span className="text-xs text-slate-500">Pending approval</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editPlan && plan && <PlanEditor plan={plan} onClose={() => setEditPlan(false)} onSaved={() => { setEditPlan(false); load(); }} />}
    </div>
  );
}

function PlanEditor({ plan, onClose, onSaved }: { plan: Plan; onClose: () => void; onSaved: () => void }) {
  const [p, setP] = useState<Plan>({ ...plan, calls_tiers: plan.calls_tiers.map((t) => ({ ...t })), coverage_tiers: plan.coverage_tiers.map((t) => ({ ...t })) });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tiers = (key: "calls_tiers" | "coverage_tiers", label: string) => (
    <div>
      <div className="text-sm font-semibold text-slate-800 mb-1">{label}</div>
      {p[key].map((t, i) => (
        <div key={i} className="flex items-center gap-2 mb-1 text-sm">
          from <input type="number" value={t.from_pct} onChange={(e) => setP({ ...p, [key]: p[key].map((x, j) => (j === i ? { ...x, from_pct: Number(e.target.value) } : x)) })} className="w-20 border border-slate-300 rounded px-2 py-1 text-right" />%
          pays <input type="number" value={t.amount} onChange={(e) => setP({ ...p, [key]: p[key].map((x, j) => (j === i ? { ...x, amount: Number(e.target.value) } : x)) })} className="w-28 border border-slate-300 rounded px-2 py-1 text-right" /> {p.currency}
          <button onClick={() => setP({ ...p, [key]: p[key].filter((_, j) => j !== i) })} className="text-slate-400 hover:text-red-600"><X className="w-4 h-4" /></button>
        </div>
      ))}
      <button onClick={() => setP({ ...p, [key]: [...p[key], { from_pct: 100, amount: 0 }] })} className="text-xs text-brand-700 hover:underline">+ Add tier</button>
    </div>
  );
  async function save() {
    setSaving(true);
    const { error: e } = await supabase.from("incentive_plans").update({
      name: p.name, effective_from: p.effective_from, calls_tiers: p.calls_tiers, coverage_tiers: p.coverage_tiers,
      quality_min: p.quality_min, quality_factor: p.quality_factor, currency: p.currency
    }).eq("id", p.id);
    setSaving(false);
    if (e) { setError(e.message); return; }
    onSaved();
  }
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center"><h2 className="font-semibold text-slate-900 flex-1">Incentive plan</h2><button onClick={onClose}><X className="w-5 h-5 text-slate-400" /></button></div>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <label className="col-span-2">Name <input value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} className="w-full border border-slate-300 rounded px-2 py-1" /></label>
          <label>Effective from <input type="date" value={p.effective_from} onChange={(e) => setP({ ...p, effective_from: e.target.value })} className="w-full border border-slate-300 rounded px-2 py-1" /></label>
          <label>Currency <input value={p.currency} onChange={(e) => setP({ ...p, currency: e.target.value.toUpperCase().slice(0, 3) })} className="w-full border border-slate-300 rounded px-2 py-1" /></label>
          <label>Quality floor (0-10) <input type="number" step="0.5" value={p.quality_min} onChange={(e) => setP({ ...p, quality_min: Number(e.target.value) })} className="w-full border border-slate-300 rounded px-2 py-1" /></label>
          <label>Below floor, × <input type="number" step="0.1" min={0} max={1} value={p.quality_factor} onChange={(e) => setP({ ...p, quality_factor: Number(e.target.value) })} className="w-full border border-slate-300 rounded px-2 py-1" /></label>
        </div>
        {tiers("calls_tiers", "Verified calls vs target")}
        {tiers("coverage_tiers", "HCP coverage vs target")}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button onClick={save} disabled={saving} className="w-full bg-brand-600 hover:bg-brand-700 text-white rounded-lg py-2 font-medium inline-flex items-center justify-center gap-2">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save plan
        </button>
      </div>
    </div>
  );
}
