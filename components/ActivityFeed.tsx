"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { History } from "lucide-react";

interface ActivityRow {
  id: string;
  actor_id: string | null;
  action: string;
  summary: string | null;
  created_at: string;
}

function timeAgo(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.round(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}

/** Audit trail for a single record (from the activity_log table). */
export default function ActivityFeed({ entityType, entityId }: { entityType: string; entityId: string }) {
  const [rows, setRows] = useState<ActivityRow[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("activity_log")
        .select("id, actor_id, action, summary, created_at")
        .eq("entity_type", entityType)
        .eq("entity_id", entityId)
        .order("created_at", { ascending: false })
        .limit(50);
      const list = (data ?? []) as ActivityRow[];
      setRows(list);
      const ids = Array.from(new Set(list.map((r) => r.actor_id).filter(Boolean))) as string[];
      if (ids.length) {
        const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", ids);
        const m: Record<string, string> = {};
        for (const p of (profs ?? []) as { id: string; full_name: string | null }[]) {
          m[p.id] = p.full_name ?? "A user";
        }
        setNames(m);
      }
      setLoading(false);
    })();
  }, [entityType, entityId]);

  if (loading || rows.length === 0) return null;

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="p-3 border-b border-slate-100 flex items-center gap-2">
        <History className="w-4 h-4 text-slate-500" />
        <span className="text-sm font-semibold text-slate-700">Activity</span>
      </div>
      <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
        {rows.map((r) => (
          <div key={r.id} className="p-3 text-sm flex items-start gap-3">
            <div className="w-1.5 h-1.5 rounded-full bg-brand-500 mt-1.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-slate-800">{r.summary ?? r.action}</div>
              <div className="text-xs text-slate-400">
                {(r.actor_id && names[r.actor_id]) || "A user"} · {timeAgo(r.created_at)}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
