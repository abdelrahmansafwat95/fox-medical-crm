"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import {
  ArrowLeft,
  Phone,
  Mail,
  MessageCircle,
  Sparkles,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  ClipboardList,
  Package,
  ShoppingCart,
  Shield,
  Pencil,
  CalendarDays
} from "lucide-react";
import EditModal, { type FieldConfig } from "@/components/EditModal";

// ----------------- Types ------------------------------------------

interface HCPDetail {
  id: string;
  code: string | null;
  full_name: string;
  full_name_ar: string | null;
  title: string | null;
  specialty: string | null;
  sub_specialty: string | null;
  segment: string | null;
  is_kol: boolean;
  ai_score: number | null;
  ai_segment_recommendation: string | null;
  ai_notes: string | null;
  phone: string | null;
  mobile: string | null;
  email: string | null;
  whatsapp: string | null;
  notes: string | null;
  is_active: boolean;
  assigned_rep_id: string | null;
}

interface VisitItem {
  id: string;
  check_in_at: string | null;
  duration_minutes: number | null;
  visit_type: string | null;
  status: string;
  manager_status: string;
  check_in_within_geofence: boolean | null;
  ai_quality_score: number | null;
  ai_summary: string | null;
  doctor_attitude: string | null;
  profiles: { full_name: string | null } | null;
  institutions: { name: string } | null;
}

interface SampleTx {
  id: string;
  quantity: number;
  batch_number: string | null;
  created_at: string;
  visit_id: string | null;
  hcp_signature_url: string | null;
  products: { name: string; brand_name: string | null } | null;
  profiles: { full_name: string | null } | null;
}

interface OrderItem {
  id: string;
  order_number: string | null;
  status: string;
  total: number;
  currency: string;
  order_date: string;
  items: { qty: number; product_id: string }[];
  profiles: { full_name: string | null } | null;
}

interface WAMessage {
  id: string;
  message: string;
  direction: string;
  created_at: string;
  profiles: { full_name: string | null } | null;
}

interface AlertItem {
  id: string;
  alert_type: string;
  severity: string;
  detected_at: string;
  related_visit_id: string | null;
}

interface EventInviteItem {
  id: string;
  rsvp_status: string;
  attendance_status: string;
  is_speaker: boolean;
  invited_at: string;
  rsvp_at: string | null;
  events: {
    id: string;
    title: string;
    event_type: string;
    starts_at: string;
    venue_name: string | null;
    is_virtual: boolean;
  } | null;
}

type TimelineEvent =
  | ({ kind: "visit"; date: string } & VisitItem)
  | ({ kind: "sample"; date: string } & SampleTx)
  | ({ kind: "order"; date: string } & OrderItem)
  | ({ kind: "whatsapp"; date: string } & WAMessage)
  | ({ kind: "alert"; date: string } & AlertItem)
  | ({ kind: "event"; date: string } & EventInviteItem);

const SEGMENT_COLORS: Record<string, string> = {
  A: "bg-emerald-100 text-emerald-700",
  B: "bg-blue-100 text-blue-700",
  C: "bg-amber-100 text-amber-700",
  D: "bg-slate-100 text-slate-600",
  KOL: "bg-purple-100 text-purple-700"
};

// HCP edit fields (mirror the HCPs page)
const HCP_FIELDS: FieldConfig[] = [
  { name: "full_name", label: "Full name", type: "text", required: true },
  { name: "full_name_ar", label: "Name (Arabic)", type: "text", rtl: true },
  { name: "title", label: "Title", type: "text", placeholder: "Dr." },
  {
    name: "specialty",
    label: "Specialty",
    type: "select",
    options: [
      { value: "Cardiology", label: "Cardiology" },
      { value: "Endocrinology", label: "Endocrinology" },
      { value: "General Practice", label: "General Practice" },
      { value: "Internal Medicine", label: "Internal Medicine" },
      { value: "Pediatrics", label: "Pediatrics" },
      { value: "Pulmonology", label: "Pulmonology" },
      { value: "Other", label: "Other" }
    ]
  },
  { name: "sub_specialty", label: "Sub-specialty", type: "text" },
  { name: "phone", label: "Phone", type: "tel" },
  { name: "mobile", label: "Mobile", type: "tel" },
  { name: "whatsapp", label: "WhatsApp", type: "tel" },
  { name: "email", label: "Email", type: "email" },
  {
    name: "segment",
    label: "Segment",
    type: "select",
    options: [
      { value: "A", label: "A — High prescriber" },
      { value: "B", label: "B — Mid prescriber" },
      { value: "C", label: "C — Low prescriber" },
      { value: "D", label: "D — Minimal" },
      { value: "KOL", label: "KOL" }
    ]
  },
  { name: "is_kol", label: "Is KOL", type: "checkbox" },
  { name: "notes", label: "Notes", type: "textarea" },
  { name: "is_active", label: "Active", type: "checkbox" }
];

// ----------------- Page -------------------------------------------

export default function HCPDetailPage() {
  const params = useParams<{ id: string }>();
  const [hcp, setHcp] = useState<HCPDetail | null>(null);
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [aiBusy, setAiBusy] = useState(false);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (params.id) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  async function load() {
    setLoading(true);

    // 1. HCP detail
    const { data: hcpData } = await supabase
      .from("hcps")
      .select("*")
      .eq("id", params.id)
      .single();
    setHcp(hcpData as HCPDetail | null);

    if (!hcpData) {
      setLoading(false);
      return;
    }

    // 2. All related events in parallel
    const [visitsRes, samplesRes, ordersRes, waRes, eventsRes] = await Promise.all([
      supabase
        .from("visits")
        .select(
          `id, check_in_at, duration_minutes, visit_type, status, manager_status,
           check_in_within_geofence, ai_quality_score, ai_summary, doctor_attitude,
           profiles(full_name), institutions(name)`
        )
        .eq("hcp_id", params.id)
        .order("check_in_at", { ascending: false })
        .limit(100),

      supabase
        .from("samples_transactions")
        .select(
          `id, quantity, batch_number, created_at, visit_id, hcp_signature_url,
           products(name, brand_name), profiles(full_name)`
        )
        .eq("hcp_id", params.id)
        .eq("transaction_type", "given_to_hcp")
        .order("created_at", { ascending: false })
        .limit(50),

      supabase
        .from("orders")
        .select(
          `id, order_number, status, total, currency, order_date, items,
           profiles(full_name)`
        )
        .eq("hcp_id", params.id)
        .order("order_date", { ascending: false })
        .limit(30),

      supabase
        .from("whatsapp_messages")
        .select(`id, message, direction, created_at, profiles(full_name)`)
        .eq("hcp_id", params.id)
        .order("created_at", { ascending: false })
        .limit(50),

      supabase
        .from("event_invitees")
        .select(
          `id, rsvp_status, attendance_status, is_speaker, invited_at, rsvp_at,
           events(id, title, event_type, starts_at, venue_name, is_virtual)`
        )
        .eq("hcp_id", params.id)
        .order("invited_at", { ascending: false })
        .limit(30)
    ]);

    // Compliance alerts: query separately using visit IDs we just loaded
    type RawVisit = { id: string };
    const visitIds = ((visitsRes.data ?? []) as RawVisit[]).map((v) => v.id);
    let alertsRows: AlertItem[] = [];
    if (visitIds.length > 0) {
      const { data: alertsData } = await supabase
        .from("compliance_alerts")
        .select(`id, alert_type, severity, detected_at, related_visit_id`)
        .in("related_visit_id", visitIds)
        .order("detected_at", { ascending: false })
        .limit(30);
      alertsRows = (alertsData ?? []) as AlertItem[];
    }

    // Merge into one timeline
    const merged: TimelineEvent[] = [];

    (visitsRes.data ?? []).forEach((v: unknown) => {
      const r = v as VisitItem;
      if (r.check_in_at)
        merged.push({ kind: "visit", date: r.check_in_at, ...r });
    });

    (samplesRes.data ?? []).forEach((s: unknown) => {
      const r = s as SampleTx;
      merged.push({ kind: "sample", date: r.created_at, ...r });
    });

    (ordersRes.data ?? []).forEach((o: unknown) => {
      const r = o as OrderItem;
      merged.push({ kind: "order", date: r.order_date, ...r });
    });

    (waRes.data ?? []).forEach((w: unknown) => {
      const r = w as WAMessage;
      merged.push({ kind: "whatsapp", date: r.created_at, ...r });
    });

    (alertsRows ?? []).forEach((a: unknown) => {
      const r = a as AlertItem;
      merged.push({ kind: "alert", date: r.detected_at, ...r });
    });

    (eventsRes.data ?? []).forEach((e: unknown) => {
      const r = e as EventInviteItem;
      // Use rsvp_at if present, else invited_at — most recent action wins
      const date = r.rsvp_at ?? r.invited_at;
      merged.push({ kind: "event", date, ...r });
    });

    merged.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    setEvents(merged);
    setLoading(false);
  }

  async function aiScore() {
    if (!hcp) return;
    setAiBusy(true);
    try {
      const { data } = await supabase.auth.getSession();
      const res = await fetch("/api/ai/score-hcp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${data.session?.access_token}`
        },
        body: JSON.stringify({ hcp_id: hcp.id })
      });
      const j = await res.json();
      if (!res.ok) {
        alert("AI scoring failed: " + (j.error || "unknown"));
      } else {
        await load();
      }
    } finally {
      setAiBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto p-12 text-center text-slate-500">
        <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
        Loading…
      </div>
    );
  }

  if (!hcp) {
    return (
      <div className="max-w-3xl mx-auto p-12 text-center">
        <p className="text-slate-700">HCP not found.</p>
        <Link href="/dashboard/hcps" className="text-brand-700 underline text-sm">
          Back to HCPs
        </Link>
      </div>
    );
  }

  const segmentKey = hcp.is_kol ? "KOL" : hcp.segment ?? "";

  // Quick stats
  const stats = {
    visits: events.filter((e) => e.kind === "visit").length,
    samplesGiven: (events.filter((e) => e.kind === "sample") as (TimelineEvent & { kind: "sample" })[]).reduce(
      (s, e) => s + e.quantity,
      0
    ),
    orders: events.filter((e) => e.kind === "order").length,
    eventsAttended: events.filter(
      (e) => e.kind === "event" && (e as TimelineEvent & { kind: "event" }).attendance_status === "attended"
    ).length
  };

  return (
    <div className="max-w-4xl mx-auto pb-24">
      <Link
        href="/dashboard/hcps"
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-3"
      >
        <ArrowLeft className="w-4 h-4" /> Back to HCPs
      </Link>

      {/* Header */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 mb-4">
        <div className="flex items-start gap-4">
          <div className="w-16 h-16 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center font-bold text-2xl shrink-0">
            {hcp.full_name.charAt(0)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold text-slate-900">
                {hcp.title ?? "Dr."} {hcp.full_name}
              </h1>
              {hcp.code && (
                <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                  {hcp.code}
                </span>
              )}
              {segmentKey && (
                <span
                  className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                    SEGMENT_COLORS[segmentKey] ?? "bg-slate-100 text-slate-600"
                  }`}
                >
                  {segmentKey}
                </span>
              )}
              {hcp.ai_score !== null && (
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 inline-flex items-center gap-1">
                  <Sparkles className="w-3 h-3" /> {hcp.ai_score}/10
                </span>
              )}
            </div>
            <div className="text-sm text-slate-500 mt-0.5">
              {hcp.specialty ?? "—"}
              {hcp.sub_specialty ? ` · ${hcp.sub_specialty}` : ""}
            </div>
            {hcp.full_name_ar && (
              <div className="text-sm text-slate-600 mt-1" dir="rtl">
                {hcp.full_name_ar}
              </div>
            )}
            <div className="mt-3 flex items-center gap-1 flex-wrap">
              {hcp.mobile && (
                <a
                  href={`tel:${hcp.mobile}`}
                  className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200"
                >
                  <Phone className="w-3 h-3" /> {hcp.mobile}
                </a>
              )}
              {hcp.whatsapp && (
                <a
                  href={`https://wa.me/${hcp.whatsapp.replace(/\D/g, "")}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                >
                  <MessageCircle className="w-3 h-3" /> WhatsApp
                </a>
              )}
              {hcp.email && (
                <a
                  href={`mailto:${hcp.email}`}
                  className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200"
                >
                  <Mail className="w-3 h-3" /> Email
                </a>
              )}
            </div>
          </div>
          <div className="flex flex-col gap-1 shrink-0">
            <button
              onClick={() => setEditing(true)}
              className="p-2 rounded-lg text-slate-500 hover:bg-slate-100"
              title="Edit"
            >
              <Pencil className="w-4 h-4" />
            </button>
            <button
              onClick={aiScore}
              disabled={aiBusy}
              className="text-xs px-2.5 py-1.5 rounded-lg bg-brand-600 text-white hover:bg-brand-700 disabled:bg-brand-400 inline-flex items-center gap-1"
            >
              {aiBusy ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Sparkles className="w-3 h-3" />
              )}
              AI Score
            </button>
          </div>
        </div>

        {hcp.ai_notes && (
          <div className="mt-4 bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm">
            <div className="font-semibold text-yellow-900 text-xs uppercase tracking-wide mb-1">
              AI insights
            </div>
            <div className="text-slate-700 whitespace-pre-line">{hcp.ai_notes}</div>
          </div>
        )}

        {hcp.notes && (
          <div className="mt-3 bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm">
            <div className="font-semibold text-slate-700 text-xs uppercase tracking-wide mb-1">
              Notes
            </div>
            <div className="text-slate-700 whitespace-pre-line">{hcp.notes}</div>
          </div>
        )}
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <StatCard icon={ClipboardList} value={stats.visits}         label="Visits"         cls="bg-brand-50 text-brand-700" />
        <StatCard icon={Package}       value={stats.samplesGiven}    label="Sample units"   cls="bg-amber-50 text-amber-700" />
        <StatCard icon={ShoppingCart}  value={stats.orders}         label="Orders"         cls="bg-emerald-50 text-emerald-700" />
        <StatCard icon={CalendarDays}  value={stats.eventsAttended} label="Events attended" cls="bg-purple-50 text-purple-700" />
      </div>

      {/* Timeline */}
      <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-2">
        Activity timeline
      </h2>

      {events.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12 text-center">
          <div className="text-5xl mb-2">📋</div>
          <p className="text-slate-700 font-medium">No activity yet</p>
          <p className="text-sm text-slate-500 mt-1">
            Once visits, samples, or orders happen, they&apos;ll appear here.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="divide-y divide-slate-100">
            {events.map((e, i) => (
              <TimelineRow key={`${e.kind}-${i}-${e.date}`} event={e} />
            ))}
          </div>
        </div>
      )}

      <EditModal
        open={editing}
        title="Edit HCP"
        table="hcps"
        recordId={hcp.id}
        fields={HCP_FIELDS}
        initialValues={hcp as unknown as Record<string, unknown>}
        onClose={() => setEditing(false)}
        onSaved={() => {
          setEditing(false);
          load();
        }}
      />
    </div>
  );
}

// ----------------- Sub-components ---------------------------------

function StatCard({
  icon: Icon,
  value,
  label,
  cls
}: {
  icon: typeof ClipboardList;
  value: number;
  label: string;
  cls: string;
}) {
  return (
    <div className="bg-white rounded-xl p-3 border border-slate-200 shadow-sm">
      <div className={`p-1.5 rounded-lg w-fit ${cls}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="mt-2">
        <div className="text-2xl font-bold text-slate-900">{value.toLocaleString()}</div>
        <div className="text-[11px] text-slate-500">{label}</div>
      </div>
    </div>
  );
}

function TimelineRow({ event }: { event: TimelineEvent }) {
  if (event.kind === "visit") return <VisitRow v={event} />;
  if (event.kind === "sample") return <SampleRow s={event} />;
  if (event.kind === "order") return <OrderRow o={event} />;
  if (event.kind === "whatsapp") return <WARow w={event} />;
  if (event.kind === "alert") return <AlertRow a={event} />;
  if (event.kind === "event") return <EventRow e={event} />;
  return null;
}

function timeAgo(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const days = Math.floor(ms / 86_400_000);
  if (days === 0) {
    const hrs = Math.floor(ms / 3_600_000);
    if (hrs === 0) return `${Math.max(1, Math.floor(ms / 60_000))}m ago`;
    return `${hrs}h ago`;
  }
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

function VisitRow({ v }: { v: TimelineEvent & { kind: "visit" } }) {
  return (
    <Link
      href={`/dashboard/visits/${v.id}`}
      className="block p-4 hover:bg-slate-50 transition"
    >
      <div className="flex items-start gap-3">
        <div className="p-1.5 rounded-lg bg-brand-50 text-brand-700 shrink-0 mt-0.5">
          <ClipboardList className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-slate-900 text-sm">
              Visit by {v.profiles?.full_name ?? "rep"}
            </span>
            {v.check_in_within_geofence === true && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">
                ✓ GPS-verified
              </span>
            )}
            {v.check_in_within_geofence === false && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-700">
                ✗ Outside geofence
              </span>
            )}
            {v.manager_status === "flagged" && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-700">
                ⚠️ Flagged
              </span>
            )}
            {v.ai_quality_score !== null && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-700">
                Q: {v.ai_quality_score}/10
              </span>
            )}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">
            {v.institutions?.name ?? "—"} · {v.visit_type ?? "visit"} ·{" "}
            {v.duration_minutes !== null ? `${v.duration_minutes}m` : "—"}
          </div>
          {v.ai_summary && (
            <p className="text-xs text-slate-600 mt-1 line-clamp-2 italic">
              {v.ai_summary}
            </p>
          )}
        </div>
        <div className="text-xs text-slate-400 shrink-0">{timeAgo(v.date)}</div>
      </div>
    </Link>
  );
}

function SampleRow({ s }: { s: TimelineEvent & { kind: "sample" } }) {
  return (
    <div className="p-4 hover:bg-slate-50 transition">
      <div className="flex items-start gap-3">
        <div className="p-1.5 rounded-lg bg-amber-50 text-amber-700 shrink-0 mt-0.5">
          <Package className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-slate-900 text-sm">
              Received {s.quantity} × {s.products?.brand_name ?? s.products?.name ?? "—"}
            </span>
            {s.hcp_signature_url && (
              <a
                href={s.hcp_signature_url}
                target="_blank"
                rel="noreferrer"
                className="text-[10px] text-emerald-700 hover:underline"
              >
                ✍️ signed
              </a>
            )}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">
            From {s.profiles?.full_name ?? "rep"}
            {s.batch_number && ` · Batch ${s.batch_number}`}
          </div>
        </div>
        <div className="text-xs text-slate-400 shrink-0">{timeAgo(s.date)}</div>
      </div>
    </div>
  );
}

function OrderRow({ o }: { o: TimelineEvent & { kind: "order" } }) {
  return (
    <div className="p-4 hover:bg-slate-50 transition">
      <div className="flex items-start gap-3">
        <div className="p-1.5 rounded-lg bg-emerald-50 text-emerald-700 shrink-0 mt-0.5">
          <ShoppingCart className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-slate-900 text-sm">
              Order {o.order_number ?? "—"} ·{" "}
              <span className="font-bold">
                {o.total.toLocaleString()} {o.currency}
              </span>
            </span>
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 capitalize">
              {o.status}
            </span>
          </div>
          <div className="text-xs text-slate-500 mt-0.5">
            {o.items?.length ?? 0} line item{(o.items?.length ?? 0) === 1 ? "" : "s"} · placed by{" "}
            {o.profiles?.full_name ?? "rep"}
          </div>
        </div>
        <div className="text-xs text-slate-400 shrink-0">{timeAgo(o.date)}</div>
      </div>
    </div>
  );
}

function WARow({ w }: { w: TimelineEvent & { kind: "whatsapp" } }) {
  return (
    <div className="p-4 hover:bg-slate-50 transition">
      <div className="flex items-start gap-3">
        <div className="p-1.5 rounded-lg bg-emerald-50 text-emerald-700 shrink-0 mt-0.5">
          <MessageCircle className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-slate-900 text-sm">
              WhatsApp {w.direction === "out" ? "sent" : "received"}
            </span>
            <span className="text-xs text-slate-500">
              from {w.profiles?.full_name ?? "rep"}
            </span>
          </div>
          <p className="text-xs text-slate-600 mt-1 line-clamp-2">{w.message}</p>
        </div>
        <div className="text-xs text-slate-400 shrink-0">{timeAgo(w.date)}</div>
      </div>
    </div>
  );
}

function AlertRow({ a }: { a: TimelineEvent & { kind: "alert" } }) {
  const sevColor =
    a.severity === "critical"
      ? "bg-red-100 text-red-700"
      : a.severity === "high"
      ? "bg-orange-100 text-orange-700"
      : a.severity === "medium"
      ? "bg-amber-100 text-amber-700"
      : "bg-blue-100 text-blue-700";

  const link = a.related_visit_id ? `/dashboard/visits/${a.related_visit_id}` : "/dashboard/compliance";

  return (
    <Link href={link} className="block p-4 hover:bg-slate-50 transition">
      <div className="flex items-start gap-3">
        <div className="p-1.5 rounded-lg bg-red-50 text-red-700 shrink-0 mt-0.5">
          <AlertTriangle className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-slate-900 text-sm capitalize">
              {a.alert_type.replaceAll("_", " ")}
            </span>
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${sevColor}`}>
              {a.severity.toUpperCase()}
            </span>
          </div>
          <div className="text-xs text-slate-500 mt-0.5">Compliance alert</div>
        </div>
        <div className="text-xs text-slate-400 shrink-0">{timeAgo(a.date)}</div>
      </div>
    </Link>
  );
}

function EventRow({ e }: { e: TimelineEvent & { kind: "event" } }) {
  const ev = e.events;
  if (!ev) return null;

  const eventDate = new Date(ev.starts_at);
  const isPast = eventDate.getTime() < Date.now();

  // Determine the action verb based on RSVP / attendance status
  let verb = "Invited to";
  let badgeCls = "bg-purple-100 text-purple-700";

  if (e.attendance_status === "attended") {
    verb = "Attended";
    badgeCls = "bg-emerald-100 text-emerald-700";
  } else if (e.attendance_status === "no_show" && isPast) {
    verb = "No-show at";
    badgeCls = "bg-red-100 text-red-700";
  } else if (e.rsvp_status === "accepted") {
    verb = "Accepted invite to";
    badgeCls = "bg-emerald-100 text-emerald-700";
  } else if (e.rsvp_status === "declined") {
    verb = "Declined invite to";
    badgeCls = "bg-red-100 text-red-700";
  }

  return (
    <Link
      href={`/dashboard/events/${ev.id}`}
      className="block p-4 hover:bg-slate-50 transition"
    >
      <div className="flex items-start gap-3">
        <div className="p-1.5 rounded-lg bg-purple-50 text-purple-700 shrink-0 mt-0.5">
          <CalendarDays className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-slate-900 text-sm">
              {verb} <span className="text-brand-700">{ev.title}</span>
            </span>
            {e.is_speaker && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">
                🎤 SPEAKER
              </span>
            )}
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${badgeCls} capitalize`}>
              {e.rsvp_status}
            </span>
          </div>
          <div className="text-xs text-slate-500 mt-0.5">
            {ev.event_type.replaceAll("_", " ")} ·{" "}
            {eventDate.toLocaleDateString("en-EG", { month: "short", day: "numeric", year: "numeric" })}
            {ev.is_virtual ? " · Virtual" : ev.venue_name ? ` · ${ev.venue_name}` : ""}
          </div>
        </div>
        <div className="text-xs text-slate-400 shrink-0">{timeAgo(e.date)}</div>
      </div>
    </Link>
  );
}
