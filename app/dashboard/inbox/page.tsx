"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useRequireManager } from "@/lib/roles";
import { notifyUser } from "@/lib/notify";
import {
  Inbox,
  Calendar,
  AlertTriangle,
  Receipt,
  Shield,
  CheckCircle2,
  XCircle,
  Loader2,
  ChevronDown,
  ChevronUp,
  Filter,
  RefreshCw
} from "lucide-react";

// ----------- Types ----------------------------------------------------

interface TourPlanItem {
  id: string;
  rep_id: string;
  plan_date: string;
  planned_hcps: string[] | null;
  notes: string | null;
  submitted_at: string | null;
  profiles: { full_name: string | null } | null;
}

interface FlaggedVisitItem {
  id: string;
  rep_id: string;
  check_in_at: string | null;
  duration_minutes: number | null;
  check_in_within_geofence: boolean | null;
  check_in_distance_m: number | null;
  visit_type: string | null;
  ai_quality_score: number | null;
  profiles: { full_name: string | null } | null;
  hcps: { full_name: string } | null;
  institutions: { name: string } | null;
}

interface ExpenseItem {
  id: string;
  rep_id: string;
  expense_date: string;
  category: string;
  amount: number;
  currency: string;
  description: string | null;
  receipt_photo_url: string | null;
  profiles: { full_name: string | null } | null;
}

interface ComplianceItem {
  id: string;
  rep_id: string;
  alert_type: string;
  severity: string;
  detected_at: string;
  evidence: Record<string, unknown> | null;
  profiles: { full_name: string | null } | null;
}

interface RepOption { id: string; full_name: string | null; }

// ----------- Helper labels --------------------------------------------

const ALERT_LABELS: Record<string, string> = {
  check_in_outside_geofence: "Outside geofence",
  impossible_travel_speed: "Impossible travel speed",
  duplicate_visit: "Duplicate visit",
  visit_too_short: "Visit too short",
  no_movement_during_hours: "No movement during hours",
  sample_discrepancy: "Sample discrepancy",
  after_hours_check_in: "After-hours check-in",
  off_territory: "Off territory"
};

const SEVERITY_BADGE: Record<string, string> = {
  low: "bg-blue-100 text-blue-700",
  medium: "bg-amber-100 text-amber-700",
  high: "bg-orange-100 text-orange-700",
  critical: "bg-red-100 text-red-700"
};

// ----------- Page -----------------------------------------------------

export default function InboxPage() {
  const { checking } = useRequireManager();
  const [tourPlans, setTourPlans] = useState<TourPlanItem[]>([]);
  const [flaggedVisits, setFlaggedVisits] = useState<FlaggedVisitItem[]>([]);
  const [expenses, setExpenses] = useState<ExpenseItem[]>([]);
  const [alerts, setAlerts] = useState<ComplianceItem[]>([]);
  const [reps, setReps] = useState<RepOption[]>([]);

  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [filterRep, setFilterRep] = useState<string>("all");

  // Selected items for bulk actions, keyed by section + id
  const [selected, setSelected] = useState<Record<string, Set<string>>>({
    tour_plans: new Set(),
    flagged_visits: new Set(),
    expenses: new Set(),
    alerts: new Set()
  });

  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    tour_plans: true,
    flagged_visits: true,
    expenses: true,
    alerts: true
  });

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    const repsRes = supabase
      .from("profiles")
      .select("id, full_name")
      .in("role", ["medical_rep", "medical_rep_senior"])
      .eq("is_active", true);

    const tpRes = supabase
      .from("tour_plans")
      .select("id, rep_id, plan_date, planned_hcps, notes, submitted_at, profiles(full_name)")
      .eq("status", "submitted")
      .order("plan_date", { ascending: true });

    const fvRes = supabase
      .from("visits")
      .select(
        "id, rep_id, check_in_at, duration_minutes, check_in_within_geofence, check_in_distance_m, visit_type, ai_quality_score, profiles(full_name), hcps(full_name), institutions(name)"
      )
      .in("manager_status", ["flagged", "pending"])
      .order("check_in_at", { ascending: false })
      .limit(50);

    const exRes = supabase
      .from("expenses")
      .select(
        "id, rep_id, expense_date, category, amount, currency, description, receipt_photo_url, profiles(full_name)"
      )
      .eq("status", "submitted")
      .order("expense_date", { ascending: false });

    const alRes = supabase
      .from("compliance_alerts")
      .select("id, rep_id, alert_type, severity, detected_at, evidence, profiles(full_name)")
      .eq("status", "open")
      .in("severity", ["high", "critical"])
      .order("detected_at", { ascending: false })
      .limit(50);

    const [reps_, tp, fv, ex, al] = await Promise.all([repsRes, tpRes, fvRes, exRes, alRes]);

    setReps((reps_.data ?? []) as RepOption[]);
    setTourPlans((tp.data ?? []) as unknown as TourPlanItem[]);
    setFlaggedVisits((fv.data ?? []) as unknown as FlaggedVisitItem[]);
    setExpenses((ex.data ?? []) as unknown as ExpenseItem[]);
    setAlerts((al.data ?? []) as unknown as ComplianceItem[]);
    setLoading(false);
  }

  // Apply rep filter
  const f = useMemo(() => {
    if (filterRep === "all") {
      return { tourPlans, flaggedVisits, expenses, alerts };
    }
    return {
      tourPlans: tourPlans.filter((x) => x.rep_id === filterRep),
      flaggedVisits: flaggedVisits.filter((x) => x.rep_id === filterRep),
      expenses: expenses.filter((x) => x.rep_id === filterRep),
      alerts: alerts.filter((x) => x.rep_id === filterRep)
    };
  }, [filterRep, tourPlans, flaggedVisits, expenses, alerts]);

  const totalPending =
    f.tourPlans.length + f.flaggedVisits.length + f.expenses.length + f.alerts.length;

  // ---------- Action handlers -------------------------------------------

  async function approveTourPlan(id: string) {
    setBusyId(id);
    const plan = tourPlans.find((p) => p.id === id);
    await supabase
      .from("tour_plans")
      .update({ status: "approved", approved_at: new Date().toISOString() })
      .eq("id", id);
    await notifyUser(plan?.rep_id, {
      type: "tour_plan",
      title: "Tour plan approved",
      body: `Your plan for ${plan?.plan_date ?? ""} was approved.`,
      link_url: "/dashboard/tour-plans"
    });
    setTourPlans((prev) => prev.filter((p) => p.id !== id));
    setBusyId(null);
  }

  async function rejectTourPlan(id: string) {
    const reason = prompt("Reason for rejection?");
    if (reason === null) return;
    setBusyId(id);
    const plan = tourPlans.find((p) => p.id === id);
    await supabase
      .from("tour_plans")
      .update({ status: "rejected", manager_notes: reason })
      .eq("id", id);
    await notifyUser(plan?.rep_id, {
      type: "tour_plan",
      title: "Tour plan rejected",
      body: reason || undefined,
      link_url: "/dashboard/tour-plans"
    });
    setTourPlans((prev) => prev.filter((p) => p.id !== id));
    setBusyId(null);
  }

  async function approveVisit(id: string) {
    setBusyId(id);
    const v = flaggedVisits.find((x) => x.id === id);
    await supabase.from("visits").update({ manager_status: "approved" }).eq("id", id);
    await notifyUser(v?.rep_id, {
      type: "visit",
      title: "Visit approved",
      body: "Your visit was reviewed and approved.",
      link_url: `/dashboard/visits/${id}`
    });
    setFlaggedVisits((prev) => prev.filter((v) => v.id !== id));
    setBusyId(null);
  }

  async function rejectVisit(id: string) {
    const reason = prompt("Reason for rejection?");
    if (reason === null) return;
    setBusyId(id);
    const v = flaggedVisits.find((x) => x.id === id);
    await supabase
      .from("visits")
      .update({ manager_status: "rejected", manager_notes: reason })
      .eq("id", id);
    await notifyUser(v?.rep_id, {
      type: "visit",
      title: "Visit rejected",
      body: reason || undefined,
      link_url: `/dashboard/visits/${id}`
    });
    setFlaggedVisits((prev) => prev.filter((v) => v.id !== id));
    setBusyId(null);
  }

  async function approveExpense(id: string) {
    setBusyId(id);
    const ex = expenses.find((x) => x.id === id);
    const { data: u } = await supabase.auth.getUser();
    await supabase
      .from("expenses")
      .update({
        status: "approved",
        approved_by: u.user?.id,
        approved_at: new Date().toISOString()
      })
      .eq("id", id);
    await notifyUser(ex?.rep_id, {
      type: "expense",
      title: "Expense approved",
      body: ex ? `${ex.amount.toLocaleString()} ${ex.currency} approved.` : undefined,
      link_url: "/dashboard/expenses"
    });
    setExpenses((prev) => prev.filter((e) => e.id !== id));
    setBusyId(null);
  }

  async function rejectExpense(id: string) {
    const reason = prompt("Reason for rejection?");
    if (reason === null) return;
    setBusyId(id);
    const ex = expenses.find((x) => x.id === id);
    await supabase
      .from("expenses")
      .update({ status: "rejected", rejection_reason: reason })
      .eq("id", id);
    await notifyUser(ex?.rep_id, {
      type: "expense",
      title: "Expense rejected",
      body: reason || undefined,
      link_url: "/dashboard/expenses"
    });
    setExpenses((prev) => prev.filter((e) => e.id !== id));
    setBusyId(null);
  }

  async function resolveAlert(id: string, status: "resolved" | "false_positive") {
    setBusyId(id);
    await supabase
      .from("compliance_alerts")
      .update({ status, reviewed_at: new Date().toISOString() })
      .eq("id", id);
    setAlerts((prev) => prev.filter((a) => a.id !== id));
    setBusyId(null);
  }

  // ---------- Bulk approve ----------------------------------------------

  async function bulkApprove(section: "tour_plans" | "expenses") {
    const ids = Array.from(selected[section]);
    if (ids.length === 0) return;
    setBusyId("bulk-" + section);

    if (section === "tour_plans") {
      const affected = tourPlans.filter((p) => ids.includes(p.id));
      await supabase
        .from("tour_plans")
        .update({ status: "approved", approved_at: new Date().toISOString() })
        .in("id", ids);
      await Promise.all(
        affected.map((p) =>
          notifyUser(p.rep_id, {
            type: "tour_plan",
            title: "Tour plan approved",
            body: `Your plan for ${p.plan_date} was approved.`,
            link_url: "/dashboard/tour-plans"
          })
        )
      );
      setTourPlans((prev) => prev.filter((p) => !ids.includes(p.id)));
    } else if (section === "expenses") {
      const affected = expenses.filter((e) => ids.includes(e.id));
      const { data: u } = await supabase.auth.getUser();
      await supabase
        .from("expenses")
        .update({
          status: "approved",
          approved_by: u.user?.id,
          approved_at: new Date().toISOString()
        })
        .in("id", ids);
      await Promise.all(
        affected.map((e) =>
          notifyUser(e.rep_id, {
            type: "expense",
            title: "Expense approved",
            body: `${e.amount.toLocaleString()} ${e.currency} approved.`,
            link_url: "/dashboard/expenses"
          })
        )
      );
      setExpenses((prev) => prev.filter((e) => !ids.includes(e.id)));
    }

    setSelected((s) => ({ ...s, [section]: new Set() }));
    setBusyId(null);
  }

  function toggleSelect(section: keyof typeof selected, id: string) {
    setSelected((s) => {
      const next = new Set(s[section]);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { ...s, [section]: next };
    });
  }

  function selectAll(section: keyof typeof selected, ids: string[]) {
    setSelected((s) => ({ ...s, [section]: new Set(ids) }));
  }

  function clearAll(section: keyof typeof selected) {
    setSelected((s) => ({ ...s, [section]: new Set() }));
  }

  // ---------- Render ----------------------------------------------------

  if (checking) {
    return (
      <div className="max-w-6xl mx-auto p-12 text-center text-slate-500">
        <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
        Loading…
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-brand-50 text-brand-700 relative">
            <Inbox className="w-6 h-6" />
            {totalPending > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-600 text-white text-[10px] font-bold rounded-full min-w-5 h-5 px-1 flex items-center justify-center">
                {totalPending}
              </span>
            )}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Approval Inbox</h1>
            <p className="text-xs text-slate-500">
              {totalPending === 0
                ? "All caught up — nothing pending"
                : `${totalPending} item${totalPending === 1 ? "" : "s"} need your attention`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Rep filter */}
          <div className="inline-flex items-center gap-1 bg-white border border-slate-200 rounded-lg px-2 py-1.5">
            <Filter className="w-3 h-3 text-slate-400" />
            <select
              value={filterRep}
              onChange={(e) => setFilterRep(e.target.value)}
              className="text-sm bg-transparent outline-none"
            >
              <option value="all">All reps</option>
              {reps.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.full_name ?? "Rep"}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={loadAll}
            disabled={loading}
            className="text-xs px-3 py-2 rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>
      </div>

      {/* Quick stats strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatTile icon={Calendar}     count={f.tourPlans.length}     label="Tour plans"     cls="bg-purple-50 text-purple-700" />
        <StatTile icon={AlertTriangle} count={f.flaggedVisits.length} label="Flagged visits" cls="bg-red-50 text-red-700" />
        <StatTile icon={Receipt}      count={f.expenses.length}      label="Expenses"       cls="bg-orange-50 text-orange-700" />
        <StatTile icon={Shield}       count={f.alerts.length}        label="Critical alerts" cls="bg-red-50 text-red-700" />
      </div>

      {loading ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12 text-center text-slate-500">
          <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
          Loading approval queue…
        </div>
      ) : totalPending === 0 ? (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-12 text-center">
          <div className="text-6xl mb-2">🎉</div>
          <p className="font-semibold text-emerald-900">All caught up!</p>
          <p className="text-sm text-emerald-700 mt-1">
            No pending tour plans, flagged visits, expenses, or alerts.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* ============ TOUR PLANS =================== */}
          <Section
            title="Tour plans"
            icon={Calendar}
            count={f.tourPlans.length}
            expanded={expanded.tour_plans}
            onToggle={() => setExpanded((e) => ({ ...e, tour_plans: !e.tour_plans }))}
            color="text-purple-700"
          >
            {f.tourPlans.length > 0 && (
              <BulkBar
                selected={selected.tour_plans}
                allIds={f.tourPlans.map((p) => p.id)}
                onSelectAll={() => selectAll("tour_plans", f.tourPlans.map((p) => p.id))}
                onClear={() => clearAll("tour_plans")}
                onApprove={() => bulkApprove("tour_plans")}
                busy={busyId === "bulk-tour_plans"}
              />
            )}
            <div className="divide-y divide-slate-100">
              {f.tourPlans.map((p) => (
                <div key={p.id} className="p-4 flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={selected.tour_plans.has(p.id)}
                    onChange={() => toggleSelect("tour_plans", p.id)}
                    className="mt-1"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-slate-900">
                      {p.profiles?.full_name ?? "Rep"}
                    </div>
                    <div className="text-xs text-slate-500">
                      {p.plan_date} · {p.planned_hcps?.length ?? 0} HCPs planned
                      {p.submitted_at && ` · submitted ${timeAgo(p.submitted_at)}`}
                    </div>
                    {p.notes && (
                      <div className="text-sm text-slate-600 mt-1 italic">
                        &ldquo;{p.notes}&rdquo;
                      </div>
                    )}
                  </div>
                  <ActionButtons
                    busy={busyId === p.id}
                    onApprove={() => approveTourPlan(p.id)}
                    onReject={() => rejectTourPlan(p.id)}
                  />
                </div>
              ))}
            </div>
          </Section>

          {/* ============ FLAGGED VISITS =============== */}
          <Section
            title="Visits needing review"
            icon={AlertTriangle}
            count={f.flaggedVisits.length}
            expanded={expanded.flagged_visits}
            onToggle={() => setExpanded((e) => ({ ...e, flagged_visits: !e.flagged_visits }))}
            color="text-red-700"
          >
            <div className="divide-y divide-slate-100">
              {f.flaggedVisits.map((v) => (
                <div key={v.id} className="p-4 flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-slate-900">
                      {v.profiles?.full_name ?? "Rep"} → {v.hcps?.full_name ?? "—"}
                    </div>
                    <div className="text-xs text-slate-500">
                      {v.institutions?.name ?? "—"} ·{" "}
                      {v.check_in_at ? timeAgo(v.check_in_at) : "—"}
                    </div>
                    <div className="flex flex-wrap gap-2 mt-1.5">
                      {!v.check_in_within_geofence && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-red-100 text-red-700">
                          OUTSIDE GEOFENCE ({v.check_in_distance_m?.toFixed(0)}m)
                        </span>
                      )}
                      {v.duration_minutes !== null && v.duration_minutes < 3 && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-orange-100 text-orange-700">
                          ONLY {v.duration_minutes} MIN
                        </span>
                      )}
                      {v.ai_quality_score !== null && v.ai_quality_score <= 4 && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-700">
                          LOW QUALITY ({v.ai_quality_score}/10)
                        </span>
                      )}
                    </div>
                    <Link
                      href={`/dashboard/visits/${v.id}`}
                      className="text-xs text-brand-700 underline mt-1 inline-block"
                    >
                      View visit details
                    </Link>
                  </div>
                  <ActionButtons
                    busy={busyId === v.id}
                    onApprove={() => approveVisit(v.id)}
                    onReject={() => rejectVisit(v.id)}
                    approveLabel="Accept"
                    rejectLabel="Reject"
                  />
                </div>
              ))}
            </div>
          </Section>

          {/* ============ EXPENSES ===================== */}
          <Section
            title="Expenses"
            icon={Receipt}
            count={f.expenses.length}
            expanded={expanded.expenses}
            onToggle={() => setExpanded((e) => ({ ...e, expenses: !e.expenses }))}
            color="text-orange-700"
          >
            {f.expenses.length > 0 && (
              <BulkBar
                selected={selected.expenses}
                allIds={f.expenses.map((e) => e.id)}
                onSelectAll={() => selectAll("expenses", f.expenses.map((e) => e.id))}
                onClear={() => clearAll("expenses")}
                onApprove={() => bulkApprove("expenses")}
                busy={busyId === "bulk-expenses"}
                totalLabel={`Total: ${f.expenses
                  .filter((e) => selected.expenses.has(e.id))
                  .reduce((s, e) => s + e.amount, 0)
                  .toLocaleString()} EGP`}
              />
            )}
            <div className="divide-y divide-slate-100">
              {f.expenses.map((e) => (
                <div key={e.id} className="p-4 flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={selected.expenses.has(e.id)}
                    onChange={() => toggleSelect("expenses", e.id)}
                    className="mt-1"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-slate-900">
                        {e.profiles?.full_name ?? "Rep"}
                      </span>
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700 capitalize">
                        {e.category}
                      </span>
                      <span className="font-bold text-slate-900 ml-auto">
                        {e.amount.toLocaleString()} {e.currency}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">{e.expense_date}</div>
                    {e.description && (
                      <div className="text-sm text-slate-600 mt-1">{e.description}</div>
                    )}
                    {e.receipt_photo_url && (
                      <a
                        href={e.receipt_photo_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-brand-700 underline mt-1 inline-block"
                      >
                        View receipt
                      </a>
                    )}
                  </div>
                  <ActionButtons
                    busy={busyId === e.id}
                    onApprove={() => approveExpense(e.id)}
                    onReject={() => rejectExpense(e.id)}
                  />
                </div>
              ))}
            </div>
          </Section>

          {/* ============ COMPLIANCE ALERTS ============ */}
          <Section
            title="Critical compliance alerts"
            icon={Shield}
            count={f.alerts.length}
            expanded={expanded.alerts}
            onToggle={() => setExpanded((e) => ({ ...e, alerts: !e.alerts }))}
            color="text-red-700"
          >
            <div className="divide-y divide-slate-100">
              {f.alerts.map((a) => (
                <div key={a.id} className="p-4 flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-slate-900">
                        {ALERT_LABELS[a.alert_type] ?? a.alert_type}
                      </span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${SEVERITY_BADGE[a.severity]}`}
                      >
                        {a.severity.toUpperCase()}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {a.profiles?.full_name ?? "Rep"} · {timeAgo(a.detected_at)}
                    </div>
                    {a.evidence && (
                      <pre className="mt-2 text-[11px] text-slate-700 bg-slate-50 rounded p-2 overflow-x-auto">
                        {JSON.stringify(a.evidence, null, 2)}
                      </pre>
                    )}
                  </div>
                  <div className="flex flex-col gap-1.5 shrink-0">
                    <button
                      onClick={() => resolveAlert(a.id, "resolved")}
                      disabled={busyId === a.id}
                      className="text-xs px-3 py-1.5 rounded-lg bg-emerald-100 text-emerald-700 hover:bg-emerald-200 font-medium inline-flex items-center gap-1 disabled:opacity-50"
                    >
                      {busyId === a.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                      Resolve
                    </button>
                    <button
                      onClick={() => resolveAlert(a.id, "false_positive")}
                      disabled={busyId === a.id}
                      className="text-xs px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 font-medium disabled:opacity-50"
                    >
                      False positive
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </Section>
        </div>
      )}
    </div>
  );
}

// ----------- Sub-components -------------------------------------------

function StatTile({
  icon: Icon,
  count,
  label,
  cls
}: {
  icon: typeof Inbox;
  count: number;
  label: string;
  cls: string;
}) {
  return (
    <div className={`rounded-xl p-3 border border-slate-200 shadow-sm bg-white`}>
      <div className={`p-1.5 rounded-lg w-fit ${cls}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="mt-2">
        <div className="text-2xl font-bold text-slate-900">{count}</div>
        <div className="text-[11px] text-slate-500">{label}</div>
      </div>
    </div>
  );
}

function Section({
  title,
  icon: Icon,
  count,
  expanded,
  onToggle,
  color,
  children
}: {
  title: string;
  icon: typeof Inbox;
  count: number;
  expanded: boolean;
  onToggle: () => void;
  color: string;
  children: React.ReactNode;
}) {
  if (count === 0) return null;
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full p-4 flex items-center gap-3 hover:bg-slate-50 transition text-left"
      >
        <Icon className={`w-5 h-5 ${color}`} />
        <span className="font-semibold text-slate-900">{title}</span>
        <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
          {count}
        </span>
        <span className="ml-auto">
          {expanded ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
        </span>
      </button>
      {expanded && children}
    </div>
  );
}

function BulkBar({
  selected,
  allIds,
  onSelectAll,
  onClear,
  onApprove,
  busy,
  totalLabel
}: {
  selected: Set<string>;
  allIds: string[];
  onSelectAll: () => void;
  onClear: () => void;
  onApprove: () => void;
  busy: boolean;
  totalLabel?: string;
}) {
  if (selected.size === 0) {
    return (
      <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 text-xs text-slate-500 flex items-center gap-3">
        <button onClick={onSelectAll} className="text-brand-700 underline font-medium">
          Select all {allIds.length}
        </button>
      </div>
    );
  }
  return (
    <div className="px-4 py-2 bg-brand-50 border-b border-brand-200 text-sm flex items-center gap-3 flex-wrap">
      <span className="font-medium text-brand-900">{selected.size} selected</span>
      {totalLabel && <span className="text-xs text-brand-700">{totalLabel}</span>}
      <button onClick={onClear} className="text-xs text-slate-600 underline ml-auto">
        Clear
      </button>
      <button
        onClick={onApprove}
        disabled={busy}
        className="text-xs px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white font-bold inline-flex items-center gap-1"
      >
        {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
        Approve {selected.size}
      </button>
    </div>
  );
}

function ActionButtons({
  busy,
  onApprove,
  onReject,
  approveLabel = "Approve",
  rejectLabel = "Reject"
}: {
  busy: boolean;
  onApprove: () => void;
  onReject: () => void;
  approveLabel?: string;
  rejectLabel?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5 shrink-0">
      <button
        onClick={onApprove}
        disabled={busy}
        className="text-xs px-3 py-1.5 rounded-lg bg-emerald-100 text-emerald-700 hover:bg-emerald-200 font-medium inline-flex items-center gap-1 disabled:opacity-50"
      >
        {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
        {approveLabel}
      </button>
      <button
        onClick={onReject}
        disabled={busy}
        className="text-xs px-3 py-1.5 rounded-lg bg-red-100 text-red-700 hover:bg-red-200 font-medium inline-flex items-center gap-1 disabled:opacity-50"
      >
        <XCircle className="w-3 h-3" />
        {rejectLabel}
      </button>
    </div>
  );
}

// ----------- Helpers --------------------------------------------------

function timeAgo(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.round(ms / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}
