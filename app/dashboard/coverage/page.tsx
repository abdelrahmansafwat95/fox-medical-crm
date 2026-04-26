"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Users, AlertTriangle } from "lucide-react";

interface CoverageRow {
  id: string;
  full_name: string;
  specialty: string | null;
  segment: string | null;
  total_visits_last_90d: number;
  last_visit_at: string | null;
  days_since_last_visit: number | null;
}

const SEGMENT_COLORS: Record<string, string> = {
  A: "bg-emerald-100 text-emerald-700",
  B: "bg-blue-100 text-blue-700",
  C: "bg-amber-100 text-amber-700",
  D: "bg-slate-100 text-slate-700",
  KOL: "bg-purple-100 text-purple-700"
};

export default function CoveragePage() {
  const [rows, setRows] = useState<CoverageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "uncovered" | "kol_a">("all");

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("hcp_coverage")
        .select("*")
        .order("days_since_last_visit", { ascending: false, nullsFirst: true })
        .limit(200);
      setRows((data ?? []) as CoverageRow[]);
      setLoading(false);
    })();
  }, []);

  const filtered = rows.filter((r) => {
    if (filter === "uncovered") return r.last_visit_at === null || (r.days_since_last_visit ?? 0) > 30;
    if (filter === "kol_a") return r.segment === "KOL" || r.segment === "A";
    return true;
  });

  const stats = {
    total: rows.length,
    covered: rows.filter((r) => r.last_visit_at !== null).length,
    uncovered: rows.filter((r) => r.last_visit_at === null || (r.days_since_last_visit ?? 999) > 30).length,
    kolACoverage: rows.filter((r) => r.segment === "KOL" || r.segment === "A").length
  };

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-2">
        <div className="p-2 rounded-lg bg-brand-50 text-brand-700">
          <Users className="w-6 h-6" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900">HCP Coverage</h1>
      </div>
      <p className="text-slate-500 mb-4">
        Last visit per HCP. Uncovered HCPs are red flags.
      </p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Stat label="Total HCPs" value={stats.total} />
        <Stat label="Covered (90d)" value={stats.covered} cls="text-emerald-700" />
        <Stat label="Uncovered (>30d)" value={stats.uncovered} cls="text-red-700" />
        <Stat label="KOL + Segment A" value={stats.kolACoverage} cls="text-purple-700" />
      </div>

      <div className="flex gap-2 mb-4">
        {(["all", "uncovered", "kol_a"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`text-sm px-3 py-1.5 rounded-lg ${
              filter === f
                ? "bg-brand-600 text-white"
                : "bg-white border border-slate-200 text-slate-700"
            }`}
          >
            {f === "all" ? "All" : f === "uncovered" ? "Uncovered" : "KOL + A only"}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12 text-center text-slate-500">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12 text-center text-slate-500">
          No HCPs match this filter.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 text-xs">
              <tr>
                <th className="text-left p-3">HCP</th>
                <th className="text-left p-3">Specialty</th>
                <th className="text-center p-3">Segment</th>
                <th className="text-right p-3">Visits (90d)</th>
                <th className="text-right p-3">Last visit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="p-3 font-medium text-slate-900">{r.full_name}</td>
                  <td className="p-3 text-slate-700">{r.specialty ?? "—"}</td>
                  <td className="p-3 text-center">
                    {r.segment ? (
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${SEGMENT_COLORS[r.segment]}`}>
                        {r.segment}
                      </span>
                    ) : "—"}
                  </td>
                  <td className="p-3 text-right">{r.total_visits_last_90d}</td>
                  <td className="p-3 text-right">
                    {r.last_visit_at ? (
                      <span className={(r.days_since_last_visit ?? 0) > 30 ? "text-red-700 font-semibold" : "text-slate-700"}>
                        {r.days_since_last_visit}d ago
                      </span>
                    ) : (
                      <span className="text-red-700 font-semibold inline-flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> never
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, cls = "text-slate-900" }: { label: string; value: number; cls?: string }) {
  return (
    <div className="bg-white rounded-xl p-3 border border-slate-200 shadow-sm">
      <div className={`text-2xl font-bold ${cls}`}>{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  );
}
