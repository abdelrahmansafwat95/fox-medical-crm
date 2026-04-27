"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import {
  CalendarDays,
  Plus,
  Users,
  CheckCircle2,
  XCircle,
  Clock,
  MapPin,
  Wifi,
  Loader2,
  Filter
} from "lucide-react";

interface EventSummary {
  id: string;
  title: string;
  event_type: string;
  starts_at: string;
  ends_at: string | null;
  venue_name: string | null;
  city: string | null;
  is_virtual: boolean;
  product_line: string | null;
  budget_egp: number | null;
  actual_cost_egp: number | null;
  status: string;
  invited_count: number;
  accepted_count: number;
  declined_count: number;
  pending_count: number;
  attended_count: number;
  speaker_count: number;
}

const TYPE_LABELS: Record<string, string> = {
  symposium: "Symposium",
  dinner_meeting: "Dinner Meeting",
  product_launch: "Product Launch",
  advisory_board: "Advisory Board",
  training: "Training",
  conference: "Conference",
  round_table: "Round Table",
  webinar: "Webinar",
  other: "Other"
};

const TYPE_COLORS: Record<string, string> = {
  symposium: "bg-purple-100 text-purple-700",
  dinner_meeting: "bg-amber-100 text-amber-700",
  product_launch: "bg-emerald-100 text-emerald-700",
  advisory_board: "bg-blue-100 text-blue-700",
  training: "bg-indigo-100 text-indigo-700",
  conference: "bg-pink-100 text-pink-700",
  round_table: "bg-teal-100 text-teal-700",
  webinar: "bg-cyan-100 text-cyan-700",
  other: "bg-slate-100 text-slate-700"
};

const STATUS_COLORS: Record<string, string> = {
  planned: "bg-slate-100 text-slate-700",
  approved: "bg-blue-100 text-blue-700",
  in_progress: "bg-amber-100 text-amber-700",
  completed: "bg-emerald-100 text-emerald-700",
  cancelled: "bg-red-100 text-red-700"
};

type TimeFilter = "all" | "upcoming" | "past";

export default function EventsPage() {
  const [events, setEvents] = useState<EventSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("upcoming");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("event_summary")
      .select("*")
      .order("starts_at", { ascending: false })
      .limit(200);
    setEvents((data ?? []) as EventSummary[]);
    setLoading(false);
  }

  const now = Date.now();
  const filtered = useMemo(() => {
    return events.filter((e) => {
      const t = new Date(e.starts_at).getTime();
      if (timeFilter === "upcoming" && t < now) return false;
      if (timeFilter === "past" && t >= now) return false;
      if (typeFilter !== "all" && e.event_type !== typeFilter) return false;
      return true;
    });
  }, [events, timeFilter, typeFilter, now]);

  const stats = useMemo(() => {
    const upcoming = events.filter((e) => new Date(e.starts_at).getTime() >= now);
    const totalBudget = events.reduce((s, e) => s + (e.actual_cost_egp ?? 0), 0);
    return {
      total: events.length,
      upcoming: upcoming.length,
      attended: events.reduce((s, e) => s + e.attended_count, 0),
      totalBudget
    };
  }, [events, now]);

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-purple-50 text-purple-700">
            <CalendarDays className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Events</h1>
        </div>
        <Link
          href="/dashboard/events/new"
          className="bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-lg inline-flex items-center gap-2 font-medium"
        >
          <Plus className="w-4 h-4" /> New event
        </Link>
      </div>
      <p className="text-slate-500 mb-6">
        CME, symposiums, dinner meetings, product launches — KOL development tracking.
      </p>

      {/* Quick stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Stat label="Total events" value={stats.total} cls="text-slate-900" />
        <Stat label="Upcoming" value={stats.upcoming} cls="text-blue-700" />
        <Stat label="Total attendees" value={stats.attended} cls="text-emerald-700" />
        <Stat
          label="Total spend"
          value={stats.totalBudget}
          suffix=" EGP"
          cls="text-purple-700"
        />
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-3 mb-4 flex flex-wrap items-center gap-2">
        <Filter className="w-4 h-4 text-slate-400" />
        <div className="flex gap-1">
          {(["upcoming", "past", "all"] as TimeFilter[]).map((t) => (
            <button
              key={t}
              onClick={() => setTimeFilter(t)}
              className={`text-xs px-3 py-1.5 rounded-lg transition capitalize ${
                timeFilter === t
                  ? "bg-brand-600 text-white"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="text-sm bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 ml-auto"
        >
          <option value="all">All types</option>
          {Object.entries(TYPE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </div>

      {/* Events list */}
      {loading ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12 text-center text-slate-500">
          <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
          Loading…
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12 text-center">
          <div className="text-5xl mb-2">🎟️</div>
          <p className="text-slate-700 font-medium">
            {timeFilter === "upcoming" ? "No upcoming events" : "No events match this filter"}
          </p>
          <p className="text-sm text-slate-500 mt-1 mb-4">
            Plan your first symposium or dinner meeting.
          </p>
          <Link
            href="/dashboard/events/new"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-600 text-white font-medium hover:bg-brand-700"
          >
            <Plus className="w-4 h-4" /> Create event
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((e) => (
            <EventCard key={e.id} event={e} />
          ))}
        </div>
      )}
    </div>
  );
}

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

function EventCard({ event: e }: { event: EventSummary }) {
  const startsAt = new Date(e.starts_at);
  const isUpcoming = startsAt.getTime() >= Date.now();
  const dateStr = startsAt.toLocaleDateString("en-EG", {
    weekday: "short",
    month: "short",
    day: "numeric"
  });
  const timeStr = startsAt.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });

  const acceptanceRate =
    e.invited_count > 0 ? Math.round((e.accepted_count / e.invited_count) * 100) : 0;

  return (
    <Link
      href={`/dashboard/events/${e.id}`}
      className="block bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition p-4"
    >
      <div className="flex items-start gap-4">
        {/* Date pill */}
        <div className="w-16 shrink-0 bg-slate-50 rounded-lg p-2 text-center border border-slate-200">
          <div className="text-[10px] font-bold text-slate-500 uppercase">
            {startsAt.toLocaleDateString("en-EG", { month: "short" })}
          </div>
          <div className="text-2xl font-bold text-slate-900 leading-none">
            {startsAt.getDate()}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">{timeStr}</div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-slate-900">{e.title}</span>
            <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${TYPE_COLORS[e.event_type]}`}>
              {TYPE_LABELS[e.event_type]}
            </span>
            <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${STATUS_COLORS[e.status]}`}>
              {e.status}
            </span>
          </div>
          <div className="text-xs text-slate-500 mt-1 flex items-center gap-3 flex-wrap">
            <span>{dateStr}</span>
            {e.is_virtual ? (
              <span className="inline-flex items-center gap-1">
                <Wifi className="w-3 h-3" /> Virtual
              </span>
            ) : (
              e.venue_name && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="w-3 h-3" /> {e.venue_name}
                  {e.city && `, ${e.city}`}
                </span>
              )
            )}
            {e.product_line && (
              <span className="inline-flex items-center gap-1">📦 {e.product_line}</span>
            )}
          </div>

          {/* Stats */}
          <div className="mt-3 flex items-center gap-3 flex-wrap text-xs">
            <div className="inline-flex items-center gap-1 text-slate-600">
              <Users className="w-3 h-3" />
              <span className="font-semibold">{e.invited_count}</span> invited
            </div>
            {e.accepted_count > 0 && (
              <div className="inline-flex items-center gap-1 text-emerald-700">
                <CheckCircle2 className="w-3 h-3" />
                <span className="font-semibold">{e.accepted_count}</span> accepted
                {e.invited_count > 0 && (
                  <span className="text-slate-400">({acceptanceRate}%)</span>
                )}
              </div>
            )}
            {e.declined_count > 0 && (
              <div className="inline-flex items-center gap-1 text-red-700">
                <XCircle className="w-3 h-3" />
                <span className="font-semibold">{e.declined_count}</span> declined
              </div>
            )}
            {e.pending_count > 0 && (
              <div className="inline-flex items-center gap-1 text-amber-700">
                <Clock className="w-3 h-3" />
                <span className="font-semibold">{e.pending_count}</span> pending
              </div>
            )}
            {!isUpcoming && e.attended_count > 0 && (
              <div className="inline-flex items-center gap-1 text-purple-700">
                ✨ <span className="font-semibold">{e.attended_count}</span> attended
              </div>
            )}
            {e.actual_cost_egp && e.actual_cost_egp > 0 && (
              <div className="ml-auto font-semibold text-slate-900">
                {e.actual_cost_egp.toLocaleString()} EGP
              </div>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
