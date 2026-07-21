"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { CalendarCheck, MapPin, CheckCircle2, Circle, Loader2, ClipboardList } from "lucide-react";

interface HCPLite {
  id: string;
  full_name: string;
  specialty: string | null;
}
interface VisitLite {
  id: string;
  hcp_id: string;
  check_in_at: string | null;
  status: string;
  hcps: { full_name: string } | null;
  institutions: { name: string } | null;
}

export default function MyDayPage() {
  const [loading, setLoading] = useState(true);
  const [planStatus, setPlanStatus] = useState<string | null>(null);
  const [planned, setPlanned] = useState<HCPLite[]>([]);
  const [visits, setVisits] = useState<VisitLite[]>([]);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) {
        setLoading(false);
        return;
      }
      const today = new Date().toISOString().slice(0, 10);
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);

      // Today's tour plan (most recent for today)
      const { data: planRows } = await supabase
        .from("tour_plans")
        .select("planned_hcps, status")
        .eq("rep_id", u.user.id)
        .eq("plan_date", today)
        .order("submitted_at", { ascending: false })
        .limit(1);

      const plan = planRows?.[0] as { planned_hcps: string[] | null; status: string } | undefined;
      setPlanStatus(plan?.status ?? null);

      const plannedIds = plan?.planned_hcps ?? [];
      if (plannedIds.length > 0) {
        const { data: hcpRows } = await supabase
          .from("hcps")
          .select("id, full_name, specialty")
          .in("id", plannedIds);
        // preserve the planned order
        const byId = new Map((hcpRows ?? []).map((h) => [h.id, h as HCPLite]));
        setPlanned(plannedIds.map((id) => byId.get(id)).filter(Boolean) as HCPLite[]);
      }

      // Visits logged today
      const { data: visitRows } = await supabase
        .from("visits")
        .select("id, hcp_id, check_in_at, status, hcps(full_name), institutions(name)")
        .eq("rep_id", u.user.id)
        .gte("check_in_at", startOfToday.toISOString())
        .order("check_in_at", { ascending: false });
      setVisits((visitRows ?? []) as unknown as VisitLite[]);

      setLoading(false);
    })();
  }, []);

  const visitedIds = new Set(visits.map((v) => v.hcp_id));
  const plannedDone = planned.filter((h) => visitedIds.has(h.id)).length;
  const pct = planned.length > 0 ? Math.round((plannedDone / planned.length) * 100) : 0;

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto p-12 text-center text-slate-500">
        <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
        Loading your day…
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-brand-50 text-brand-700">
            <CalendarCheck className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">My Day</h1>
            <p className="text-xs text-slate-500">
              {new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
            </p>
          </div>
        </div>
        <Link
          href="/dashboard/visits/check-in"
          className="bg-brand-600 hover:bg-brand-700 text-white px-4 py-2.5 rounded-lg inline-flex items-center gap-2 font-medium shadow-sm"
        >
          <MapPin className="w-4 h-4" /> Check in
        </Link>
      </div>

      {/* Progress */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold text-slate-700">Today&apos;s plan</span>
          <span className="text-sm text-slate-500">
            {planned.length > 0 ? `${plannedDone}/${planned.length} visited` : `${visits.length} visit${visits.length === 1 ? "" : "s"} today`}
          </span>
        </div>
        <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
          <div className="h-full bg-brand-600 transition-all" style={{ width: `${planned.length > 0 ? pct : visits.length > 0 ? 100 : 0}%` }} />
        </div>
        {planStatus && planStatus !== "approved" && (
          <p className="text-[11px] text-amber-700 mt-2">Your plan for today is {planStatus} — pending manager approval.</p>
        )}
      </div>

      {/* Planned HCPs */}
      {planned.length > 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-3 border-b border-slate-100 text-sm font-semibold text-slate-700">Planned HCPs</div>
          <div className="divide-y divide-slate-100">
            {planned.map((h) => {
              const done = visitedIds.has(h.id);
              return (
                <Link
                  key={h.id}
                  href={`/dashboard/hcps/${h.id}`}
                  className="p-3 flex items-center gap-3 hover:bg-slate-50"
                >
                  {done ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                  ) : (
                    <Circle className="w-5 h-5 text-slate-300 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm font-medium ${done ? "text-slate-400 line-through" : "text-slate-900"}`}>
                      {h.full_name}
                    </div>
                    {h.specialty && <div className="text-xs text-slate-500">{h.specialty}</div>}
                  </div>
                  {done && <span className="text-[11px] text-emerald-700 shrink-0">visited</span>}
                </Link>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 text-center">
          <div className="text-4xl mb-2">🗺️</div>
          <p className="text-slate-700 font-medium">No plan for today</p>
          <p className="text-sm text-slate-500 mt-1">
            Submit a{" "}
            <Link href="/dashboard/tour-plans" className="text-brand-700 underline">
              tour plan
            </Link>{" "}
            to line up your visits, or just check in on the go.
          </p>
        </div>
      )}

      {/* Today's visits */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-3 border-b border-slate-100 flex items-center gap-2">
          <ClipboardList className="w-4 h-4 text-slate-500" />
          <span className="text-sm font-semibold text-slate-700">Visits logged today ({visits.length})</span>
        </div>
        {visits.length === 0 ? (
          <div className="p-6 text-center text-sm text-slate-500">No visits yet today — your first check-in will show here.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {visits.map((v) => (
              <Link key={v.id} href={`/dashboard/visits/${v.id}`} className="p-3 flex items-center gap-3 hover:bg-slate-50 text-sm">
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-slate-900 truncate">{v.hcps?.full_name ?? "—"}</div>
                  <div className="text-xs text-slate-500 truncate">{v.institutions?.name ?? "—"}</div>
                </div>
                <span className="text-xs text-slate-400 shrink-0">
                  {v.check_in_at ? new Date(v.check_in_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
