"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Target, Save, Loader2 } from "lucide-react";

interface RepRow {
  id: string;
  full_name: string | null;
  product_line: string | null;
}

interface TargetRow {
  id: string;
  rep_id: string;
  month: string;
  calls_target: number;
  coverage_target: number;
  order_value_target: number;
}

export default function TargetsPage() {
  const [reps, setReps] = useState<RepRow[]>([]);
  const [targets, setTargets] = useState<Record<string, TargetRow>>({});
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  async function load() {
    setLoading(true);
    const [repsRes, targetsRes] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, full_name, product_line")
        .in("role", ["medical_rep", "medical_rep_senior"])
        .eq("is_active", true),
      supabase.from("call_targets").select("*").eq("month", month)
    ]);

    setReps((repsRes.data ?? []) as RepRow[]);
    const map: Record<string, TargetRow> = {};
    for (const t of (targetsRes.data ?? []) as TargetRow[]) {
      map[t.rep_id] = t;
    }
    setTargets(map);
    setLoading(false);
  }

  async function saveTarget(rep_id: string, calls: number, coverage: number, orderValue: number) {
    setSavingId(rep_id);
    const existing = targets[rep_id];
    if (existing) {
      await supabase
        .from("call_targets")
        .update({
          calls_target: calls,
          coverage_target: coverage,
          order_value_target: orderValue
        })
        .eq("id", existing.id);
    } else {
      await supabase.from("call_targets").insert({
        rep_id,
        month,
        calls_target: calls,
        coverage_target: coverage,
        order_value_target: orderValue
      });
    }
    setSavingId(null);
    load();
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-2">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-pink-50 text-pink-700">
            <Target className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Sales Targets</h1>
        </div>
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="text-sm px-3 py-2 border border-slate-300 rounded-lg"
        />
      </div>
      <p className="text-slate-500 mb-4">Set monthly KPIs for each rep.</p>

      {loading ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12 text-center text-slate-500">Loading…</div>
      ) : reps.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12 text-center text-slate-500">
          No reps in the team.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 text-xs">
              <tr>
                <th className="text-left p-3">Rep</th>
                <th className="text-right p-3">Calls target</th>
                <th className="text-right p-3">Coverage target</th>
                <th className="text-right p-3">Order value (EGP)</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {reps.map((rep) => (
                <RepTargetRow
                  key={rep.id}
                  rep={rep}
                  current={targets[rep.id]}
                  saving={savingId === rep.id}
                  onSave={(c, cov, ov) => saveTarget(rep.id, c, cov, ov)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function RepTargetRow({
  rep,
  current,
  saving,
  onSave
}: {
  rep: RepRow;
  current?: TargetRow;
  saving: boolean;
  onSave: (calls: number, coverage: number, orderValue: number) => void;
}) {
  const [calls, setCalls] = useState(current?.calls_target ?? 80);
  const [coverage, setCoverage] = useState(current?.coverage_target ?? 60);
  const [orderValue, setOrderValue] = useState(current?.order_value_target ?? 0);

  return (
    <tr className="hover:bg-slate-50">
      <td className="p-3">
        <div className="font-medium text-slate-900">{rep.full_name ?? "Rep"}</div>
        <div className="text-xs text-slate-500">{rep.product_line ?? "—"}</div>
      </td>
      <td className="p-3">
        <input
          type="number"
          value={calls}
          onChange={(e) => setCalls(parseInt(e.target.value) || 0)}
          className="w-24 p-1.5 border border-slate-300 rounded text-sm text-right"
        />
      </td>
      <td className="p-3">
        <input
          type="number"
          value={coverage}
          onChange={(e) => setCoverage(parseInt(e.target.value) || 0)}
          className="w-24 p-1.5 border border-slate-300 rounded text-sm text-right"
        />
      </td>
      <td className="p-3">
        <input
          type="number"
          value={orderValue}
          onChange={(e) => setOrderValue(parseInt(e.target.value) || 0)}
          className="w-32 p-1.5 border border-slate-300 rounded text-sm text-right"
        />
      </td>
      <td className="p-3 text-right">
        <button
          onClick={() => onSave(calls, coverage, orderValue)}
          disabled={saving}
          className="text-xs bg-brand-600 hover:bg-brand-700 disabled:bg-brand-400 text-white px-3 py-1.5 rounded inline-flex items-center gap-1"
        >
          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
          Save
        </button>
      </td>
    </tr>
  );
}
