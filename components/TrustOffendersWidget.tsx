"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { Shield, Loader2 } from "lucide-react";

interface OffenderRow {
  rep_id: string;
  full_name: string | null;
  rep_code: string | null;
  total_visits: number;
  low_trust_visits: number;
  critical_visits: number;
  avg_trust_score: number | null;
  worst_trust_score: number | null;
}

/**
 * "Trust offenders" widget — shows reps with the most low-trust visits this month.
 * Drop this into the manager Inbox or the dashboard home.
 */
export default function TrustOffendersWidget() {
  const [rows, setRows] = useState<OffenderRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("gps_trust_offenders")
        .select("*")
        .limit(5);
      setRows((data ?? []) as OffenderRow[]);
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-amber-600" />
          <span className="font-semibold text-slate-700">Trust offenders</span>
        </div>
        <div className="mt-3 text-center text-slate-500">
          <Loader2 className="w-4 h-4 animate-spin inline-block" /> Loading…
        </div>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-1">
          <Shield className="w-5 h-5 text-emerald-700" />
          <span className="font-semibold text-emerald-900">No trust issues</span>
        </div>
        <p className="text-xs text-emerald-700">
          All reps&apos; GPS check-ins this month are healthy. ✓
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-amber-200 shadow-sm overflow-hidden">
      <div className="bg-amber-50 px-4 py-3 border-b border-amber-200 flex items-center gap-2">
        <Shield className="w-5 h-5 text-amber-700" />
        <span className="font-semibold text-slate-900">Trust offenders this month</span>
        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 ml-auto">
          {rows.length}
        </span>
      </div>
      <div className="divide-y divide-slate-100">
        {rows.map((r) => (
          <Link
            key={r.rep_id}
            href={`/dashboard/visits?rep=${r.rep_id}&trust=low`}
            className="flex items-center gap-3 p-3 hover:bg-slate-50 transition"
          >
            <div className="w-9 h-9 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center font-bold shrink-0">
              {r.full_name?.charAt(0) ?? "?"}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-slate-900 truncate">
                  {r.full_name ?? "Unknown"}
                </span>
                {r.rep_code && (
                  <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                    {r.rep_code}
                  </span>
                )}
              </div>
              <div className="text-xs text-slate-500 mt-0.5">
                <span className="font-semibold text-amber-700">{r.low_trust_visits}</span> low-trust
                {r.critical_visits > 0 && (
                  <>
                    {" "}·{" "}
                    <span className="font-semibold text-red-700">
                      {r.critical_visits} likely fake
                    </span>
                  </>
                )}{" "}
                · avg score {r.avg_trust_score}/100
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
