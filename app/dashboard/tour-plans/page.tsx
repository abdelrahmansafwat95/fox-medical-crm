"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Calendar, Plus, Loader2 } from "lucide-react";

interface TourPlanRow {
  id: string;
  rep_id: string;
  plan_date: string;
  status: string;
  planned_hcps: string[] | null;
  estimated_distance_km: number | null;
  notes: string | null;
  submitted_at: string | null;
  approved_at: string | null;
  manager_notes: string | null;
  profiles: { full_name: string | null } | null;
}

interface HCPOption {
  id: string;
  full_name: string;
  segment: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700",
  submitted: "bg-blue-100 text-blue-700",
  approved: "bg-emerald-100 text-emerald-700",
  rejected: "bg-red-100 text-red-700",
  executed: "bg-purple-100 text-purple-700"
};

export default function TourPlansPage() {
  const [plans, setPlans] = useState<TourPlanRow[]>([]);
  const [hcps, setHcps] = useState<HCPOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    plan_date: new Date(Date.now() + 86400_000).toISOString().slice(0, 10),
    selected: [] as string[],
    notes: ""
  });

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const [plansRes, hcpsRes] = await Promise.all([
      supabase
        .from("tour_plans")
        .select("*, profiles!tour_plans_rep_id_fkey(full_name)")
        .order("plan_date", { ascending: false })
        .limit(30),
      supabase
        .from("hcps")
        .select("id, full_name, segment")
        .eq("is_active", true)
        .order("segment", { ascending: true })
        .limit(100)
    ]);
    setPlans((plansRes.data ?? []) as unknown as TourPlanRow[]);
    setHcps((hcpsRes.data ?? []) as HCPOption[]);
    setLoading(false);
  }

  async function submitPlan() {
    if (form.selected.length === 0) return;
    setSubmitting(true);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) {
      setSubmitting(false);
      return;
    }
    await supabase.from("tour_plans").insert({
      rep_id: u.user.id,
      plan_date: form.plan_date,
      status: "submitted",
      planned_hcps: form.selected,
      notes: form.notes || null,
      submitted_at: new Date().toISOString()
    });
    setForm({ plan_date: new Date(Date.now() + 86400_000).toISOString().slice(0, 10), selected: [], notes: "" });
    setShowForm(false);
    setSubmitting(false);
    load();
  }

  async function approve(id: string) {
    await supabase
      .from("tour_plans")
      .update({ status: "approved", approved_at: new Date().toISOString() })
      .eq("id", id);
    load();
  }

  async function reject(id: string) {
    const reason = prompt("Reason for rejection?");
    if (reason === null) return;
    await supabase
      .from("tour_plans")
      .update({ status: "rejected", manager_notes: reason })
      .eq("id", id);
    load();
  }

  function toggleHcp(id: string) {
    setForm((f) => ({
      ...f,
      selected: f.selected.includes(id) ? f.selected.filter((x) => x !== id) : [...f.selected, id]
    }));
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-2">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-purple-50 text-purple-700">
            <Calendar className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Tour Plans</h1>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-lg inline-flex items-center gap-2 font-medium"
        >
          <Plus className="w-4 h-4" /> New plan
        </button>
      </div>
      <p className="text-slate-500 mb-4">Submit a daily plan for manager approval.</p>

      {showForm && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 mb-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Plan date</label>
            <input
              type="date"
              value={form.plan_date}
              onChange={(e) => setForm({ ...form, plan_date: e.target.value })}
              className="p-2 border border-slate-300 rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              HCPs to visit ({form.selected.length} selected)
            </label>
            <div className="max-h-60 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
              {hcps.map((h) => (
                <label key={h.id} className="flex items-center gap-2 p-2 hover:bg-slate-50 cursor-pointer text-sm">
                  <input
                    type="checkbox"
                    checked={form.selected.includes(h.id)}
                    onChange={() => toggleHcp(h.id)}
                  />
                  <span className="flex-1">{h.full_name}</span>
                  {h.segment && (
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                      {h.segment}
                    </span>
                  )}
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Notes (optional)</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={2}
              className="w-full p-2 border border-slate-300 rounded-lg text-sm"
              placeholder="Route or strategy notes for the day"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={submitPlan}
              disabled={form.selected.length === 0 || submitting}
              className="flex-1 bg-brand-600 hover:bg-brand-700 disabled:bg-brand-400 text-white font-medium py-2 rounded-lg inline-flex items-center justify-center gap-2"
            >
              {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Submitting…</> : "Submit for approval"}
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12 text-center text-slate-500">Loading…</div>
      ) : plans.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12 text-center">
          <div className="text-5xl mb-2">📅</div>
          <p className="text-slate-700 font-medium">No tour plans yet</p>
          <p className="text-sm text-slate-500 mt-1">Submit a plan for tomorrow.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm divide-y divide-slate-100">
          {plans.map((p) => (
            <div key={p.id} className="p-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <div className="font-medium text-slate-900">{p.profiles?.full_name ?? "Rep"}</div>
                  <div className="text-xs text-slate-500">
                    {p.plan_date} · {p.planned_hcps?.length ?? 0} HCPs
                  </div>
                </div>
                <span className={`text-[11px] font-bold px-2 py-1 rounded ${STATUS_COLORS[p.status]}`}>
                  {p.status}
                </span>
              </div>
              {p.notes && <div className="text-sm text-slate-600 mt-2">{p.notes}</div>}
              {p.manager_notes && (
                <div className="text-sm text-red-700 mt-2 italic">Manager: {p.manager_notes}</div>
              )}
              {p.status === "submitted" && (
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => approve(p.id)}
                    className="text-xs px-3 py-1 rounded bg-emerald-100 text-emerald-700 hover:bg-emerald-200 font-medium"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => reject(p.id)}
                    className="text-xs px-3 py-1 rounded bg-red-100 text-red-700 hover:bg-red-200 font-medium"
                  >
                    Reject
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
