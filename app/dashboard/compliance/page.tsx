"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Shield, AlertTriangle, RefreshCw, Loader2 } from "lucide-react";
import type { ComplianceAlert } from "@/lib/types";

const SEVERITY_COLORS: Record<string, string> = {
  low: "bg-blue-100 text-blue-700",
  medium: "bg-amber-100 text-amber-700",
  high: "bg-orange-100 text-orange-700",
  critical: "bg-red-100 text-red-700"
};

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

export default function CompliancePage() {
  const [alerts, setAlerts] = useState<(ComplianceAlert & { profiles: { full_name: string | null } | null })[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("compliance_alerts")
      .select("*, profiles!compliance_alerts_rep_id_fkey(full_name)")
      .order("detected_at", { ascending: false })
      .limit(100);
    setAlerts((data ?? []) as unknown as (ComplianceAlert & { profiles: { full_name: string | null } | null })[]);
    setLoading(false);
  }

  async function runScan() {
    setScanning(true);
    const { data: sess } = await supabase.auth.getSession();
    const res = await fetch("/api/compliance/scan", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sess.session?.access_token}`
      },
      body: JSON.stringify({ lookback_hours: 168 })
    });
    const j = await res.json();
    setScanning(false);
    if (j.ok) {
      alert(`Scan complete. ${j.alerts_inserted} new alerts found.`);
      load();
    } else {
      alert("Scan failed: " + (j.error ?? "unknown"));
    }
  }

  async function resolveAlert(id: string, status: "resolved" | "false_positive") {
    await supabase
      .from("compliance_alerts")
      .update({ status, reviewed_at: new Date().toISOString() })
      .eq("id", id);
    load();
  }

  const open = alerts.filter((a) => a.status === "open");

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-2">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-red-50 text-red-700">
            <Shield className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Compliance</h1>
        </div>
        <button
          onClick={runScan}
          disabled={scanning}
          className="bg-brand-600 hover:bg-brand-700 disabled:bg-brand-400 text-white px-4 py-2 rounded-lg inline-flex items-center gap-2 font-medium"
        >
          {scanning ? <><Loader2 className="w-4 h-4 animate-spin" /> Scanning…</> : <><RefreshCw className="w-4 h-4" /> Run scan</>}
        </button>
      </div>
      <p className="text-slate-500 mb-4">
        Anomaly detection: outside-geofence, impossible travel speed, duplicate visits, etc.
      </p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <StatCard label="Open" value={open.length} cls="bg-red-50 text-red-700" />
        <StatCard label="Critical" value={open.filter((a) => a.severity === "critical").length} cls="bg-red-100 text-red-800" />
        <StatCard label="High" value={open.filter((a) => a.severity === "high").length} cls="bg-orange-50 text-orange-700" />
        <StatCard label="Resolved" value={alerts.filter((a) => a.status === "resolved").length} cls="bg-emerald-50 text-emerald-700" />
      </div>

      {loading ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12 text-center text-slate-500">Loading…</div>
      ) : alerts.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12 text-center">
          <div className="text-5xl mb-2">✅</div>
          <p className="text-slate-700 font-medium">No alerts</p>
          <p className="text-sm text-slate-500 mt-1">Run a scan to check for anomalies.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm divide-y divide-slate-100">
          {alerts.map((a) => (
            <div key={a.id} className="p-4">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-red-50 text-red-700 shrink-0">
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-slate-900">
                      {ALERT_LABELS[a.alert_type] ?? a.alert_type}
                    </span>
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${SEVERITY_COLORS[a.severity]}`}>
                      {a.severity.toUpperCase()}
                    </span>
                    <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                      {a.status}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    {a.profiles?.full_name ?? "Unknown rep"} · {new Date(a.detected_at).toLocaleString()}
                  </div>
                  {a.evidence && (
                    <pre className="mt-2 text-xs text-slate-700 bg-slate-50 rounded p-2 overflow-x-auto">
                      {JSON.stringify(a.evidence, null, 2)}
                    </pre>
                  )}
                  {a.status === "open" && (
                    <div className="mt-2 flex gap-2">
                      <button
                        onClick={() => resolveAlert(a.id, "resolved")}
                        className="text-xs px-2.5 py-1 rounded bg-emerald-100 text-emerald-700 hover:bg-emerald-200 font-medium"
                      >
                        Mark resolved
                      </button>
                      <button
                        onClick={() => resolveAlert(a.id, "false_positive")}
                        className="text-xs px-2.5 py-1 rounded bg-slate-100 text-slate-700 hover:bg-slate-200 font-medium"
                      >
                        False positive
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, cls }: { label: string; value: number; cls: string }) {
  return (
    <div className={`rounded-xl p-3 ${cls}`}>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs">{label}</div>
    </div>
  );
}
