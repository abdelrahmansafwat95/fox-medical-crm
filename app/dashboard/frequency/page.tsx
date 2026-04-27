"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import {
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Filter,
  Users,
  Loader2,
  Calendar
} from "lucide-react";

// ----------------- Types ---------------------------------------------

interface HCPRow {
  id: string;
  full_name: string;
  specialty: string | null;
  segment: string | null;
  is_kol: boolean;
  assigned_rep_id: string | null;
}

interface VisitCount {
  hcp_id: string;
  count: number;
}

interface RepRow {
  id: string;
  full_name: string | null;
  product_line: string | null;
  // jsonb: { "A": 4, "B": 3, ... }
  frequency_target: Record<string, number> | null;
}

interface AugmentedHCP extends HCPRow {
  rep_name: string | null;
  rep_id: string | null;
  target: number;
  actual: number;
  pct: number;
  status: "on_target" | "behind" | "critically_behind" | "no_target";
}

// ----------------- Defaults ------------------------------------------

const DEFAULT_FREQ: Record<string, number> = { A: 4, B: 3, C: 2, D: 1, KOL: 4 };

const SEGMENT_COLORS: Record<string, string> = {
  A: "bg-emerald-100 text-emerald-700",
  B: "bg-blue-100 text-blue-700",
  C: "bg-amber-100 text-amber-700",
  D: "bg-slate-100 text-slate-600",
  KOL: "bg-purple-100 text-purple-700"
};

// ----------------- Page ----------------------------------------------

type StatusFilter = "all" | "behind" | "on_target";

export default function FrequencyPage() {
  const [hcps, setHcps] = useState<AugmentedHCP[]>([]);
  const [reps, setReps] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterRep, setFilterRep] = useState("all");
  const [filterStatus, setFilterStatus] = useState<StatusFilter>("all");
  const [filterSegment, setFilterSegment] = useState("all");

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);

    // 1. Get current month's start
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const monthKey = `${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, "0")}`;

    // 2. Fetch HCPs, rep targets, and visits in parallel
    const [hcpsRes, targetsRes, visitsRes] = await Promise.all([
      supabase
        .from("hcps")
        .select("id, full_name, specialty, segment, is_kol, assigned_rep_id")
        .eq("is_active", true)
        .limit(500),
      supabase
        .from("call_targets")
        .select("rep_id, frequency_target, profiles(full_name, product_line)")
        .eq("month", monthKey),
      supabase
        .from("visits")
        .select("hcp_id")
        .gte("check_in_at", monthStart.toISOString())
        .eq("status", "completed")
    ]);

    type RawTarget = {
      rep_id: string;
      frequency_target: Record<string, number> | null;
      profiles: { full_name: string | null; product_line: string | null } | null;
    };
    const targets = (targetsRes.data ?? []) as unknown as RawTarget[];
    const targetByRep = new Map<string, RepRow>();
    targets.forEach((t) => {
      targetByRep.set(t.rep_id, {
        id: t.rep_id,
        full_name: t.profiles?.full_name ?? null,
        product_line: t.profiles?.product_line ?? null,
        frequency_target: t.frequency_target
      });
    });

    // 3. Count visits per HCP this month
    const visits = (visitsRes.data ?? []) as { hcp_id: string }[];
    const countByHcp = new Map<string, number>();
    visits.forEach((v) => {
      countByHcp.set(v.hcp_id, (countByHcp.get(v.hcp_id) ?? 0) + 1);
    });

    // 4. Build the augmented HCP list
    const augmented: AugmentedHCP[] = (hcpsRes.data ?? []).map((h: HCPRow) => {
      const rep = h.assigned_rep_id ? targetByRep.get(h.assigned_rep_id) : undefined;
      const segmentKey = h.is_kol ? "KOL" : h.segment ?? "";
      const repFreqTarget = rep?.frequency_target?.[segmentKey];
      const target = repFreqTarget ?? DEFAULT_FREQ[segmentKey] ?? 0;
      const actual = countByHcp.get(h.id) ?? 0;
      const pct = target > 0 ? Math.round((actual / target) * 100) : 0;

      let status: AugmentedHCP["status"];
      if (target === 0) status = "no_target";
      else if (pct >= 100) status = "on_target";
      else if (pct >= 50) status = "behind";
      else status = "critically_behind";

      return {
        ...h,
        rep_id: h.assigned_rep_id,
        rep_name: rep?.full_name ?? null,
        target,
        actual,
        pct,
        status
      };
    });

    // Build the rep options for the filter
    const repsList = Array.from(targetByRep.values()).map((r) => ({
      id: r.id,
      name: r.full_name ?? "Rep"
    }));

    setHcps(augmented);
    setReps(repsList);
    setLoading(false);
  }

  // ----------- Filters --------------------------------------------------

  const filtered = useMemo(() => {
    return hcps.filter((h) => {
      if (filterRep !== "all" && h.rep_id !== filterRep) return false;
      if (filterSegment !== "all") {
        const seg = h.is_kol ? "KOL" : h.segment;
        if (seg !== filterSegment) return false;
      }
      if (filterStatus === "behind" && h.status !== "behind" && h.status !== "critically_behind")
        return false;
      if (filterStatus === "on_target" && h.status !== "on_target") return false;
      return true;
    });
  }, [hcps, filterRep, filterSegment, filterStatus]);

  // ----------- Summary stats -------------------------------------------

  const summary = useMemo(() => {
    const tracked = hcps.filter((h) => h.target > 0);
    const onTarget = tracked.filter((h) => h.status === "on_target").length;
    const behind = tracked.filter(
      (h) => h.status === "behind" || h.status === "critically_behind"
    ).length;
    const totalActual = tracked.reduce((s, h) => s + h.actual, 0);
    const totalTarget = tracked.reduce((s, h) => s + h.target, 0);
    const overallPct = totalTarget > 0 ? Math.round((totalActual / totalTarget) * 100) : 0;
    return { tracked: tracked.length, onTarget, behind, overallPct, totalActual, totalTarget };
  }, [hcps]);

  // ----------- Render --------------------------------------------------

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-2">
        <div className="p-2 rounded-lg bg-brand-50 text-brand-700">
          <TrendingUp className="w-6 h-6" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900">Frequency Tracker</h1>
      </div>
      <p className="text-slate-500 mb-6">
        Monthly visits vs target per HCP, based on segment.
      </p>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Stat label="Tracked HCPs" value={summary.tracked} cls="text-slate-900" />
        <Stat label="On target" value={summary.onTarget} cls="text-emerald-700" />
        <Stat label="Behind" value={summary.behind} cls="text-red-700" />
        <Stat
          label="Overall attainment"
          value={summary.overallPct}
          suffix="%"
          cls={
            summary.overallPct >= 100
              ? "text-emerald-700"
              : summary.overallPct >= 70
              ? "text-amber-700"
              : "text-red-700"
          }
        />
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-3 mb-4 flex flex-wrap items-center gap-2">
        <Filter className="w-4 h-4 text-slate-400" />

        <select
          value={filterRep}
          onChange={(e) => setFilterRep(e.target.value)}
          className="text-sm bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5"
        >
          <option value="all">All reps</option>
          {reps.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>

        <select
          value={filterSegment}
          onChange={(e) => setFilterSegment(e.target.value)}
          className="text-sm bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5"
        >
          <option value="all">All segments</option>
          <option value="KOL">KOL</option>
          <option value="A">Segment A</option>
          <option value="B">Segment B</option>
          <option value="C">Segment C</option>
          <option value="D">Segment D</option>
        </select>

        <div className="ml-auto flex gap-1">
          <FilterChip
            active={filterStatus === "all"}
            onClick={() => setFilterStatus("all")}
            label={`All (${hcps.length})`}
          />
          <FilterChip
            active={filterStatus === "behind"}
            onClick={() => setFilterStatus("behind")}
            label={`Behind (${summary.behind})`}
            color="red"
          />
          <FilterChip
            active={filterStatus === "on_target"}
            onClick={() => setFilterStatus("on_target")}
            label={`On target (${summary.onTarget})`}
            color="emerald"
          />
        </div>
      </div>

      {/* HCP list */}
      {loading ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12 text-center text-slate-500">
          <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
          Loading…
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12 text-center">
          <Users className="w-10 h-10 mx-auto text-slate-300 mb-2" />
          <p className="text-slate-700 font-medium">No HCPs match this filter</p>
          <p className="text-xs text-slate-500 mt-1">Try widening your filter.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="divide-y divide-slate-100">
            {filtered.map((h) => (
              <HCPRow key={h.id} hcp={h} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ----------------- Sub-components -----------------------------------

function Stat({
  label,
  value,
  suffix,
  cls
}: {
  label: string;
  value: number;
  suffix?: string;
  cls: string;
}) {
  return (
    <div className="bg-white rounded-xl p-3 border border-slate-200 shadow-sm">
      <div className={`text-2xl font-bold ${cls}`}>
        {value.toLocaleString()}
        {suffix}
      </div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  label,
  color
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  color?: "red" | "emerald";
}) {
  const activeCls =
    color === "red"
      ? "bg-red-600 text-white"
      : color === "emerald"
      ? "bg-emerald-600 text-white"
      : "bg-brand-600 text-white";
  return (
    <button
      onClick={onClick}
      className={`text-xs px-2.5 py-1.5 rounded-lg transition ${
        active ? activeCls : "bg-slate-100 text-slate-700 hover:bg-slate-200"
      }`}
    >
      {label}
    </button>
  );
}

function HCPRow({ hcp }: { hcp: AugmentedHCP }) {
  const segmentKey = hcp.is_kol ? "KOL" : hcp.segment ?? "—";
  const barWidth = Math.min(100, hcp.pct);
  const barColor =
    hcp.status === "on_target"
      ? "bg-emerald-500"
      : hcp.status === "behind"
      ? "bg-amber-500"
      : hcp.status === "critically_behind"
      ? "bg-red-500"
      : "bg-slate-300";

  const statusBadge = {
    on_target: { label: "On target", cls: "bg-emerald-100 text-emerald-700", icon: CheckCircle2 },
    behind: { label: "Behind", cls: "bg-amber-100 text-amber-700", icon: AlertTriangle },
    critically_behind: { label: "Critical", cls: "bg-red-100 text-red-700", icon: AlertTriangle },
    no_target: { label: "No target", cls: "bg-slate-100 text-slate-600", icon: Calendar }
  }[hcp.status];

  const StatusIcon = statusBadge.icon;

  return (
    <Link
      href={`/dashboard/hcps/${hcp.id}`}
      className="block p-4 hover:bg-slate-50 transition"
    >
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center font-bold shrink-0">
          {hcp.full_name.charAt(0)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-slate-900 truncate">{hcp.full_name}</span>
            <span
              className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                SEGMENT_COLORS[segmentKey] ?? "bg-slate-100 text-slate-600"
              }`}
            >
              {segmentKey}
            </span>
            <span
              className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${statusBadge.cls} inline-flex items-center gap-1`}
            >
              <StatusIcon className="w-3 h-3" />
              {statusBadge.label}
            </span>
          </div>
          <div className="text-xs text-slate-500 mt-0.5">
            {hcp.specialty ?? "—"} {hcp.rep_name && ` · Rep: ${hcp.rep_name}`}
          </div>
          {/* Visual bar */}
          <div className="mt-2 flex items-center gap-2">
            <div className="flex-1 bg-slate-100 rounded-full h-2 overflow-hidden">
              <div
                className={`h-full ${barColor} transition-all`}
                style={{ width: `${barWidth}%` }}
              />
            </div>
            <div className="text-xs font-medium text-slate-700 shrink-0 w-20 text-right">
              {hcp.actual} / {hcp.target} ({hcp.pct}%)
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}
