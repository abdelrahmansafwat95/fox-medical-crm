"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import {
  ClipboardList,
  Plus,
  MapPin,
  Clock,
  CheckCircle2,
  AlertTriangle,
  PlayCircle,
  ClipboardEdit
} from "lucide-react";

interface VisitWithJoins {
  id: string;
  status: string;
  visit_type: string | null;
  check_in_at: string | null;
  check_out_at: string | null;
  duration_minutes: number | null;
  check_in_within_geofence: boolean | null;
  check_in_distance_m: number | null;
  manager_status: string;
  hcps: { full_name: string; specialty: string | null } | null;
  institutions: { name: string; district: string | null } | null;
}

const STATUS_BADGES: Record<string, { label: string; cls: string; icon: typeof CheckCircle2 }> = {
  in_progress: { label: "In progress", cls: "bg-blue-100 text-blue-700", icon: PlayCircle },
  completed: { label: "Completed", cls: "bg-emerald-100 text-emerald-700", icon: CheckCircle2 },
  planned: { label: "Planned", cls: "bg-slate-100 text-slate-700", icon: Clock },
  missed: { label: "Missed", cls: "bg-red-100 text-red-700", icon: AlertTriangle },
  cancelled: { label: "Cancelled", cls: "bg-slate-100 text-slate-500", icon: Clock },
  rejected_by_manager: { label: "Rejected", cls: "bg-red-100 text-red-700", icon: AlertTriangle }
};

export default function VisitsPage() {
  const [visits, setVisits] = useState<VisitWithJoins[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("visits")
        .select(`
          id, status, visit_type, check_in_at, check_out_at, duration_minutes,
          check_in_within_geofence, check_in_distance_m, manager_status,
          hcps(full_name, specialty),
          institutions(name, district)
        `)
        .order("created_at", { ascending: false })
        .limit(50);
      setVisits((data ?? []) as unknown as VisitWithJoins[]);
      setLoading(false);
    })();
  }, []);

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-brand-50 text-brand-700">
            <ClipboardList className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Visits</h1>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Link
            href="/dashboard/visits/manual"
            className="bg-white border border-amber-300 text-amber-700 hover:bg-amber-50 px-4 py-2 rounded-lg inline-flex items-center gap-2 font-medium text-sm"
          >
            <ClipboardEdit className="w-4 h-4" /> Log manually
          </Link>
          <Link
            href="/dashboard/visits/check-in"
            className="bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-lg inline-flex items-center gap-2 font-medium shadow-sm"
          >
            <Plus className="w-4 h-4" /> New Check-in
          </Link>
        </div>
      </div>
      <p className="text-slate-500 mb-6">
        Daily call reports with GPS-verified check-in.
      </p>

      {loading ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12 text-center text-slate-500">
          Loading…
        </div>
      ) : visits.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12 text-center">
          <div className="text-5xl mb-2">📋</div>
          <p className="text-slate-700 font-medium">No visits yet</p>
          <p className="text-sm text-slate-500 mt-1 mb-4">
            Tap &ldquo;New Check-in&rdquo; to log your first GPS-verified visit.
          </p>
          <Link
            href="/dashboard/visits/check-in"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-600 text-white font-medium hover:bg-brand-700"
          >
            <Plus className="w-4 h-4" /> Start a check-in
          </Link>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden divide-y divide-slate-100">
          {visits.map((v) => {
            const badge = STATUS_BADGES[v.status] ?? STATUS_BADGES.planned;
            const Icon = badge.icon;
            return (
              <Link
                key={v.id}
                href={`/dashboard/visits/${v.id}`}
                className="block p-4 hover:bg-slate-50 transition"
              >
                <div className="flex items-start gap-4">
                  <div className={`p-2 rounded-lg ${badge.cls} shrink-0`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-slate-900 truncate">
                        {v.hcps?.full_name ?? "Unknown HCP"}
                      </span>
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${badge.cls}`}>
                        {badge.label}
                      </span>
                      {v.manager_status === "flagged" && (
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                          ⚠️ Flagged
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                      <span>{v.hcps?.specialty ?? "—"}</span>
                      <span>·</span>
                      <span>📍 {v.institutions?.name ?? "—"}</span>
                      {v.duration_minutes !== null && <><span>·</span><span>⏱️ {v.duration_minutes}m</span></>}
                    </div>
                    <div className="mt-1.5 flex items-center gap-2 text-xs">
                      {v.check_in_within_geofence === true && (
                        <span className="text-emerald-700">
                          ✓ Geo-verified ({v.check_in_distance_m?.toFixed(0)}m)
                        </span>
                      )}
                      {v.check_in_within_geofence === false && (
                        <span className="text-red-700">
                          ✗ Outside geofence ({v.check_in_distance_m?.toFixed(0)}m)
                        </span>
                      )}
                      {v.check_in_at && (
                        <span className="text-slate-400">
                          {new Date(v.check_in_at).toLocaleString()}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
