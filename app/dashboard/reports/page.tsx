"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { BarChart3, Download, FileSpreadsheet, FileText } from "lucide-react";
import { exportToExcel, exportToPDF } from "@/lib/export";

interface ReportRow {
  rep_id: string;
  rep_name: string;
  visits: number;
  verified: number;
  flagged: number;
  unique_hcps: number;
  avg_quality: number | null;
}

export default function ReportsPage() {
  const [data, setData] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);

  async function load() {
    setLoading(true);
    const since = new Date(Date.now() - days * 86400_000).toISOString();
    const { data: visits } = await supabase
      .from("visits")
      .select(`rep_id, status, manager_status, hcp_id, ai_quality_score, check_in_within_geofence,
               profiles!inner(full_name)`)
      .gte("check_in_at", since);

    type Row = {
      rep_id: string;
      status: string;
      manager_status: string;
      hcp_id: string;
      ai_quality_score: number | null;
      check_in_within_geofence: boolean | null;
      profiles: { full_name: string | null } | null;
    };

    const grouped = new Map<string, ReportRow>();
    for (const v of (visits ?? []) as unknown as Row[]) {
      const existing = grouped.get(v.rep_id) ?? {
        rep_id: v.rep_id,
        rep_name: v.profiles?.full_name ?? "Rep",
        visits: 0,
        verified: 0,
        flagged: 0,
        unique_hcps: 0,
        avg_quality: null,
        _hcps: new Set<string>(),
        _qScores: [] as number[]
      } as ReportRow & { _hcps: Set<string>; _qScores: number[] };

      existing.visits += 1;
      if (v.check_in_within_geofence) existing.verified += 1;
      if (v.manager_status === "flagged") existing.flagged += 1;
      existing._hcps.add(v.hcp_id);
      if (v.ai_quality_score !== null) existing._qScores.push(v.ai_quality_score);

      grouped.set(v.rep_id, existing);
    }

    const rows: ReportRow[] = Array.from(grouped.values()).map((r) => {
      const enriched = r as ReportRow & { _hcps: Set<string>; _qScores: number[] };
      return {
        rep_id: r.rep_id,
        rep_name: r.rep_name,
        visits: r.visits,
        verified: r.verified,
        flagged: r.flagged,
        unique_hcps: enriched._hcps.size,
        avg_quality:
          enriched._qScores.length > 0
            ? Math.round((enriched._qScores.reduce((s, n) => s + n, 0) / enriched._qScores.length) * 10) / 10
            : null
      };
    });

    setData(rows.sort((a, b) => b.visits - a.visits));
    setLoading(false);
  }

  function downloadXlsx() {
    exportToExcel(
      data.map((r) => ({
        Rep: r.rep_name,
        Visits: r.visits,
        Verified: r.verified,
        Flagged: r.flagged,
        "Unique HCPs": r.unique_hcps,
        "Avg Quality": r.avg_quality ?? "—"
      })),
      `fox-medical-report-${days}d`,
      "Field Force Report"
    );
  }

  function downloadPdf() {
    exportToPDF({
      title: "Field Force Performance Report",
      subtitle: `Last ${days} days · generated ${new Date().toLocaleDateString()}`,
      columns: ["Rep", "Visits", "Verified", "Flagged", "Unique HCPs", "Avg Quality"],
      rows: data.map((r) => [
        r.rep_name,
        r.visits,
        r.verified,
        r.flagged,
        r.unique_hcps,
        r.avg_quality ?? "—"
      ]),
      filename: `fox-medical-report-${days}d.pdf`
    });
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-2">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-blue-50 text-blue-700">
            <BarChart3 className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Reports</h1>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={days}
            onChange={(e) => setDays(parseInt(e.target.value))}
            className="text-sm px-3 py-2 border border-slate-300 rounded-lg"
          >
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
          </select>
          <button
            onClick={downloadXlsx}
            disabled={data.length === 0}
            className="text-sm bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white px-3 py-2 rounded-lg inline-flex items-center gap-1.5"
          >
            <FileSpreadsheet className="w-4 h-4" /> Excel
          </button>
          <button
            onClick={downloadPdf}
            disabled={data.length === 0}
            className="text-sm bg-red-600 hover:bg-red-700 disabled:bg-slate-300 text-white px-3 py-2 rounded-lg inline-flex items-center gap-1.5"
          >
            <FileText className="w-4 h-4" /> PDF
          </button>
        </div>
      </div>
      <p className="text-slate-500 mb-4">
        Field force performance, GPS verification rate, and quality scores.
      </p>

      {loading ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12 text-center text-slate-500">
          Loading…
        </div>
      ) : data.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12 text-center">
          <div className="text-5xl mb-2">📊</div>
          <p className="text-slate-700 font-medium">No data in this period</p>
          <p className="text-sm text-slate-500 mt-1">Reps need to log visits first.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 text-xs">
              <tr>
                <th className="text-left p-3">Rep</th>
                <th className="text-right p-3">Visits</th>
                <th className="text-right p-3">Verified ✓</th>
                <th className="text-right p-3">Flagged ⚠️</th>
                <th className="text-right p-3">Unique HCPs</th>
                <th className="text-right p-3">Avg Quality</th>
                <th className="text-right p-3">Verify Rate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.map((r) => {
                const verifyRate = r.visits > 0 ? Math.round((r.verified / r.visits) * 100) : 0;
                return (
                  <tr key={r.rep_id} className="hover:bg-slate-50">
                    <td className="p-3 font-medium text-slate-900">{r.rep_name}</td>
                    <td className="p-3 text-right">{r.visits}</td>
                    <td className="p-3 text-right text-emerald-700">{r.verified}</td>
                    <td className="p-3 text-right text-red-700">{r.flagged}</td>
                    <td className="p-3 text-right">{r.unique_hcps}</td>
                    <td className="p-3 text-right">{r.avg_quality ?? "—"}</td>
                    <td className="p-3 text-right">
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-bold ${
                          verifyRate >= 90
                            ? "bg-emerald-100 text-emerald-700"
                            : verifyRate >= 70
                            ? "bg-amber-100 text-amber-700"
                            : "bg-red-100 text-red-700"
                        }`}
                      >
                        {verifyRate}%
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
