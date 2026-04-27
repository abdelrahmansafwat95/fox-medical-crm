"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import {
  ArrowLeft,
  CalendarDays,
  MapPin,
  Wifi,
  Users,
  Plus,
  Search,
  CheckCircle2,
  XCircle,
  Clock,
  Mic,
  Pencil,
  Trash2,
  Loader2,
  AlertTriangle,
  MessageCircle,
  Mail
} from "lucide-react";
import EditModal, { type FieldConfig } from "@/components/EditModal";

interface EventDetail {
  id: string;
  title: string;
  title_ar: string | null;
  event_type: string;
  description: string | null;
  starts_at: string;
  ends_at: string | null;
  venue_name: string | null;
  venue_address: string | null;
  city: string | null;
  is_virtual: boolean;
  meeting_url: string | null;
  product_line: string | null;
  budget_egp: number | null;
  actual_cost_egp: number | null;
  status: string;
  organizer_id: string;
  external_speakers: string | null;
  notes: string | null;
  profiles: { full_name: string | null } | null;
}

interface InviteeRow {
  id: string;
  hcp_id: string;
  invitation_status: string;
  rsvp_status: string;
  attendance_status: string;
  is_speaker: boolean;
  invited_at: string;
  rsvp_at: string | null;
  notes: string | null;
  hcps: {
    id: string;
    full_name: string;
    specialty: string | null;
    segment: string | null;
    is_kol: boolean;
    phone: string | null;
    whatsapp: string | null;
    email: string | null;
  } | null;
}

interface HCPOption {
  id: string;
  full_name: string;
  specialty: string | null;
  segment: string | null;
  is_kol: boolean;
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

const SEGMENT_COLORS: Record<string, string> = {
  A: "bg-emerald-100 text-emerald-700",
  B: "bg-blue-100 text-blue-700",
  C: "bg-amber-100 text-amber-700",
  D: "bg-slate-100 text-slate-600",
  KOL: "bg-purple-100 text-purple-700"
};

const STATUS_LABELS: Record<string, string> = {
  planned: "Planned",
  approved: "Approved",
  in_progress: "In progress",
  completed: "Completed",
  cancelled: "Cancelled"
};

const STATUS_COLORS: Record<string, string> = {
  planned: "bg-slate-100 text-slate-700",
  approved: "bg-blue-100 text-blue-700",
  in_progress: "bg-amber-100 text-amber-700",
  completed: "bg-emerald-100 text-emerald-700",
  cancelled: "bg-red-100 text-red-700"
};

const EVENT_EDIT_FIELDS: FieldConfig[] = [
  { name: "title", label: "Title", type: "text", required: true },
  { name: "description", label: "Description", type: "textarea" },
  {
    name: "status",
    label: "Status",
    type: "select",
    options: Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label }))
  },
  { name: "venue_name", label: "Venue", type: "text" },
  { name: "city", label: "City", type: "text" },
  { name: "product_line", label: "Product line", type: "text" },
  { name: "budget_egp", label: "Budget (EGP)", type: "number", min: 0 },
  { name: "actual_cost_egp", label: "Actual cost (EGP)", type: "number", min: 0 },
  { name: "external_speakers", label: "External speakers", type: "text" },
  { name: "notes", label: "Internal notes", type: "textarea" }
];

export default function EventDetailPage() {
  const params = useParams<{ id: string }>();
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [invitees, setInvitees] = useState<InviteeRow[]>([]);
  const [allHcps, setAllHcps] = useState<HCPOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  // Invite modal
  const [showInvite, setShowInvite] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [makeSpeakers, setMakeSpeakers] = useState(false);
  const [inviting, setInviting] = useState(false);

  useEffect(() => {
    if (params.id) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  async function load() {
    setLoading(true);
    const [eRes, iRes, hRes] = await Promise.all([
      supabase
        .from("events")
        .select("*, profiles(full_name)")
        .eq("id", params.id)
        .single(),
      supabase
        .from("event_invitees")
        .select(
          `id, hcp_id, invitation_status, rsvp_status, attendance_status, is_speaker,
           invited_at, rsvp_at, notes,
           hcps(id, full_name, specialty, segment, is_kol, phone, whatsapp, email)`
        )
        .eq("event_id", params.id)
        .order("created_at", { ascending: true }),
      supabase
        .from("hcps")
        .select("id, full_name, specialty, segment, is_kol")
        .eq("is_active", true)
        .order("full_name")
        .limit(500)
    ]);

    setEvent((eRes.data ?? null) as unknown as EventDetail | null);
    setInvitees((iRes.data ?? []) as unknown as InviteeRow[]);
    setAllHcps((hRes.data ?? []) as HCPOption[]);
    setLoading(false);
  }

  // Filter HCPs not yet invited
  const inviteableHcps = useMemo(() => {
    const invitedIds = new Set(invitees.map((i) => i.hcp_id));
    const filtered = allHcps.filter((h) => !invitedIds.has(h.id));
    if (!search) return filtered;
    return filtered.filter((h) =>
      h.full_name.toLowerCase().includes(search.toLowerCase()) ||
      (h.specialty?.toLowerCase().includes(search.toLowerCase()) ?? false)
    );
  }, [allHcps, invitees, search]);

  async function bulkInvite() {
    if (selected.size === 0 || !event) return;
    setInviting(true);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) {
      setInviting(false);
      return;
    }
    const rows = Array.from(selected).map((hcp_id) => ({
      event_id: event.id,
      hcp_id,
      invited_by: u.user!.id,
      invitation_status: "sent",
      rsvp_status: "pending",
      attendance_status: "unknown",
      is_speaker: makeSpeakers
    }));
    const { error } = await supabase.from("event_invitees").insert(rows);
    setInviting(false);

    if (error) {
      alert("Failed to invite: " + error.message);
      return;
    }
    setShowInvite(false);
    setSelected(new Set());
    setSearch("");
    setMakeSpeakers(false);
    await load();
  }

  async function updateRsvp(invitee_id: string, rsvp: string) {
    setBusyId(invitee_id);
    await supabase
      .from("event_invitees")
      .update({ rsvp_status: rsvp, rsvp_at: new Date().toISOString() })
      .eq("id", invitee_id);
    await load();
    setBusyId(null);
  }

  async function updateAttendance(invitee_id: string, attendance: string) {
    setBusyId(invitee_id);
    await supabase
      .from("event_invitees")
      .update({
        attendance_status: attendance,
        attendance_marked_at: new Date().toISOString()
      })
      .eq("id", invitee_id);
    await load();
    setBusyId(null);
  }

  async function toggleSpeaker(invitee_id: string, current: boolean) {
    setBusyId(invitee_id);
    await supabase
      .from("event_invitees")
      .update({ is_speaker: !current })
      .eq("id", invitee_id);
    await load();
    setBusyId(null);
  }

  async function removeInvitee(invitee_id: string) {
    if (!confirm("Remove this invitee?")) return;
    setBusyId(invitee_id);
    await supabase.from("event_invitees").delete().eq("id", invitee_id);
    await load();
    setBusyId(null);
  }

  // ----------- Stats ---------------------------------------------------

  const stats = useMemo(() => {
    return {
      invited: invitees.length,
      accepted: invitees.filter((i) => i.rsvp_status === "accepted").length,
      declined: invitees.filter((i) => i.rsvp_status === "declined").length,
      pending: invitees.filter((i) => i.rsvp_status === "pending").length,
      attended: invitees.filter((i) => i.attendance_status === "attended").length,
      speakers: invitees.filter((i) => i.is_speaker).length
    };
  }, [invitees]);

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto p-12 text-center text-slate-500">
        <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
        Loading…
      </div>
    );
  }

  if (!event) {
    return (
      <div className="max-w-md mx-auto p-12 text-center">
        <p className="text-slate-700">Event not found.</p>
        <Link href="/dashboard/events" className="text-brand-700 underline text-sm">
          Back to events
        </Link>
      </div>
    );
  }

  const startsAt = new Date(event.starts_at);
  const isPast = startsAt.getTime() < Date.now();

  return (
    <div className="max-w-4xl mx-auto pb-24">
      <Link
        href="/dashboard/events"
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-3"
      >
        <ArrowLeft className="w-4 h-4" /> Back to events
      </Link>

      {/* Header card */}
      <div className="bg-gradient-to-br from-purple-50 to-pink-50 border border-purple-200 rounded-xl p-5 mb-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-4 flex-1 min-w-0">
            <div className="w-16 shrink-0 bg-white rounded-lg p-2 text-center border border-slate-200 shadow-sm">
              <div className="text-[10px] font-bold text-slate-500 uppercase">
                {startsAt.toLocaleDateString("en-EG", { month: "short" })}
              </div>
              <div className="text-2xl font-bold text-slate-900 leading-none">
                {startsAt.getDate()}
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">
                {startsAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-bold text-slate-900">{event.title}</h1>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-white text-purple-700 border border-purple-200">
                  {TYPE_LABELS[event.event_type]}
                </span>
                <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${STATUS_COLORS[event.status]}`}>
                  {STATUS_LABELS[event.status]}
                </span>
              </div>
              {event.title_ar && (
                <div className="text-sm text-slate-700 mt-1" dir="rtl">{event.title_ar}</div>
              )}
              <div className="text-xs text-slate-600 mt-2 flex items-center gap-3 flex-wrap">
                <span>{startsAt.toLocaleString()}</span>
                {event.is_virtual ? (
                  <span className="inline-flex items-center gap-1">
                    <Wifi className="w-3 h-3" /> Virtual
                  </span>
                ) : (
                  event.venue_name && (
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="w-3 h-3" /> {event.venue_name}
                      {event.city && `, ${event.city}`}
                    </span>
                  )
                )}
                {event.product_line && <span>📦 {event.product_line}</span>}
                {event.profiles?.full_name && <span>👤 {event.profiles.full_name}</span>}
              </div>
              {event.description && (
                <p className="text-sm text-slate-700 mt-3">{event.description}</p>
              )}
            </div>
          </div>
          <button
            onClick={() => setEditing(true)}
            className="p-2 rounded-lg bg-white text-slate-600 hover:bg-slate-50 border border-slate-200 shrink-0"
            title="Edit event"
          >
            <Pencil className="w-4 h-4" />
          </button>
        </div>

        {(event.budget_egp ?? 0) > 0 && (
          <div className="mt-4 flex items-center gap-3 flex-wrap text-xs">
            <div className="px-3 py-1.5 rounded-lg bg-white border border-slate-200">
              <span className="text-slate-500">Budget: </span>
              <span className="font-bold text-slate-900">
                {event.budget_egp?.toLocaleString()} EGP
              </span>
            </div>
            {(event.actual_cost_egp ?? 0) > 0 && (
              <div className="px-3 py-1.5 rounded-lg bg-white border border-slate-200">
                <span className="text-slate-500">Actual: </span>
                <span
                  className={`font-bold ${
                    (event.actual_cost_egp ?? 0) > (event.budget_egp ?? 0)
                      ? "text-red-700"
                      : "text-emerald-700"
                  }`}
                >
                  {event.actual_cost_egp?.toLocaleString()} EGP
                </span>
              </div>
            )}
          </div>
        )}

        {event.external_speakers && (
          <div className="mt-3 text-sm">
            <span className="text-slate-500 font-medium">External speakers: </span>
            <span className="text-slate-900">{event.external_speakers}</span>
          </div>
        )}
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-2 mb-4">
        <Stat label="Invited" value={stats.invited} cls="bg-slate-50 text-slate-900" />
        <Stat label="Accepted" value={stats.accepted} cls="bg-emerald-50 text-emerald-700" />
        <Stat label="Declined" value={stats.declined} cls="bg-red-50 text-red-700" />
        <Stat label="Pending" value={stats.pending} cls="bg-amber-50 text-amber-700" />
        <Stat label="Speakers" value={stats.speakers} cls="bg-purple-50 text-purple-700" />
        <Stat label="Attended" value={stats.attended} cls="bg-blue-50 text-blue-700" />
      </div>

      {/* Invitees list */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-3 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-slate-500" />
            <span className="font-semibold text-slate-700 text-sm">
              Invitees {invitees.length > 0 && `(${invitees.length})`}
            </span>
          </div>
          <button
            onClick={() => setShowInvite(true)}
            className="text-xs bg-brand-600 hover:bg-brand-700 text-white px-3 py-1.5 rounded-lg inline-flex items-center gap-1 font-medium"
          >
            <Plus className="w-3 h-3" /> Invite HCPs
          </button>
        </div>

        {invitees.length === 0 ? (
          <div className="p-12 text-center">
            <Users className="w-10 h-10 mx-auto text-slate-300 mb-2" />
            <p className="text-sm text-slate-700 font-medium">No invitees yet</p>
            <p className="text-xs text-slate-500 mt-1 mb-3">
              Click &ldquo;Invite HCPs&rdquo; to add doctors to this event.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {invitees.map((inv) => (
              <InviteeRow
                key={inv.id}
                invitee={inv}
                isPast={isPast}
                busy={busyId === inv.id}
                onRsvp={(s) => updateRsvp(inv.id, s)}
                onAttendance={(s) => updateAttendance(inv.id, s)}
                onToggleSpeaker={() => toggleSpeaker(inv.id, inv.is_speaker)}
                onRemove={() => removeInvitee(inv.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Invite modal */}
      {showInvite && (
        <div
          className="fixed inset-0 bg-slate-900/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setShowInvite(false)}
        >
          <div
            className="bg-white rounded-t-2xl sm:rounded-xl shadow-2xl w-full sm:max-w-lg max-h-[85vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <span className="font-semibold text-slate-900">Invite HCPs</span>
              <button
                onClick={() => setShowInvite(false)}
                className="text-slate-400 hover:text-slate-700 text-xl leading-none px-2"
              >
                ×
              </button>
            </div>

            <div className="p-3 border-b border-slate-100 space-y-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name or specialty…"
                  className="w-full pl-10 pr-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={makeSpeakers}
                  onChange={(e) => setMakeSpeakers(e.target.checked)}
                />
                <span className="text-slate-700">Mark all as speakers</span>
              </label>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
              {inviteableHcps.length === 0 ? (
                <div className="p-8 text-center text-sm text-slate-500">
                  {search ? "No HCPs match your search." : "All active HCPs are already invited."}
                </div>
              ) : (
                inviteableHcps.map((h) => (
                  <label
                    key={h.id}
                    className="flex items-center gap-3 p-3 hover:bg-slate-50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(h.id)}
                      onChange={() => {
                        const next = new Set(selected);
                        if (next.has(h.id)) next.delete(h.id);
                        else next.add(h.id);
                        setSelected(next);
                      }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-slate-900 text-sm">
                          {h.full_name}
                        </span>
                        {h.is_kol && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">
                            KOL
                          </span>
                        )}
                        {h.segment && (
                          <span
                            className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${SEGMENT_COLORS[h.segment]}`}
                          >
                            {h.segment}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500">{h.specialty ?? "—"}</div>
                    </div>
                  </label>
                ))
              )}
            </div>

            <div className="p-3 border-t border-slate-200 flex items-center gap-2 bg-slate-50">
              <span className="text-sm text-slate-700 mr-auto">{selected.size} selected</span>
              <button
                onClick={() => setShowInvite(false)}
                className="px-3 py-2 rounded-lg border border-slate-300 text-slate-700 text-sm hover:bg-white"
              >
                Cancel
              </button>
              <button
                onClick={bulkInvite}
                disabled={inviting || selected.size === 0}
                className="bg-brand-600 hover:bg-brand-700 disabled:bg-brand-400 text-white font-bold px-4 py-2 rounded-lg text-sm inline-flex items-center gap-1"
              >
                {inviting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Invite {selected.size}
              </button>
            </div>
          </div>
        </div>
      )}

      <EditModal
        open={editing}
        title="Edit event"
        table="events"
        recordId={event.id}
        fields={EVENT_EDIT_FIELDS}
        initialValues={event as unknown as Record<string, unknown>}
        onClose={() => setEditing(false)}
        onSaved={() => {
          setEditing(false);
          load();
        }}
        onDeleted={() => {
          window.location.href = "/dashboard/events";
        }}
        allowDelete
      />
    </div>
  );
}

function Stat({ label, value, cls }: { label: string; value: number; cls: string }) {
  return (
    <div className={`rounded-lg p-2 text-center ${cls}`}>
      <div className="text-xl font-bold">{value}</div>
      <div className="text-[10px] uppercase tracking-wide opacity-75">{label}</div>
    </div>
  );
}

function InviteeRow({
  invitee,
  isPast,
  busy,
  onRsvp,
  onAttendance,
  onToggleSpeaker,
  onRemove
}: {
  invitee: InviteeRow;
  isPast: boolean;
  busy: boolean;
  onRsvp: (s: string) => void;
  onAttendance: (s: string) => void;
  onToggleSpeaker: () => void;
  onRemove: () => void;
}) {
  const h = invitee.hcps;
  if (!h) return null;

  return (
    <div className="p-3 hover:bg-slate-50">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center font-bold shrink-0">
          {h.full_name.charAt(0)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              href={`/dashboard/hcps/${h.id}`}
              className="font-medium text-slate-900 hover:text-brand-700"
            >
              {h.full_name}
            </Link>
            {invitee.is_speaker && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">
                <Mic className="w-3 h-3" /> SPEAKER
              </span>
            )}
            {h.is_kol && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">
                KOL
              </span>
            )}
            {h.segment && (
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${SEGMENT_COLORS[h.segment]}`}>
                {h.segment}
              </span>
            )}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">{h.specialty ?? "—"}</div>

          {/* RSVP buttons */}
          <div className="mt-2 flex flex-wrap gap-1.5">
            <RsvpButton
              active={invitee.rsvp_status === "accepted"}
              icon={CheckCircle2}
              label="Accepted"
              color="emerald"
              onClick={() => onRsvp("accepted")}
              busy={busy}
            />
            <RsvpButton
              active={invitee.rsvp_status === "declined"}
              icon={XCircle}
              label="Declined"
              color="red"
              onClick={() => onRsvp("declined")}
              busy={busy}
            />
            <RsvpButton
              active={invitee.rsvp_status === "pending"}
              icon={Clock}
              label="Pending"
              color="slate"
              onClick={() => onRsvp("pending")}
              busy={busy}
            />

            {/* Attendance buttons (only show after event date or accepted RSVP) */}
            {(isPast || invitee.rsvp_status === "accepted") && (
              <>
                <span className="text-slate-300">|</span>
                <RsvpButton
                  active={invitee.attendance_status === "attended"}
                  label="Attended"
                  color="blue"
                  onClick={() => onAttendance("attended")}
                  busy={busy}
                />
                <RsvpButton
                  active={invitee.attendance_status === "no_show"}
                  label="No-show"
                  color="amber"
                  onClick={() => onAttendance("no_show")}
                  busy={busy}
                />
              </>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-1 shrink-0 items-end">
          {/* WhatsApp + Email quick actions */}
          {h.whatsapp && (
            <a
              href={`https://wa.me/${h.whatsapp.replace(/\D/g, "")}`}
              target="_blank"
              rel="noreferrer"
              title="WhatsApp"
              className="p-1.5 rounded text-emerald-600 hover:bg-emerald-50"
            >
              <MessageCircle className="w-4 h-4" />
            </a>
          )}
          {h.email && (
            <a
              href={`mailto:${h.email}`}
              title="Email"
              className="p-1.5 rounded text-slate-500 hover:bg-slate-100"
            >
              <Mail className="w-4 h-4" />
            </a>
          )}
          <button
            onClick={onToggleSpeaker}
            disabled={busy}
            title={invitee.is_speaker ? "Remove as speaker" : "Mark as speaker"}
            className={`p-1.5 rounded ${
              invitee.is_speaker
                ? "text-purple-700 bg-purple-50"
                : "text-slate-400 hover:bg-slate-100"
            }`}
          >
            <Mic className="w-4 h-4" />
          </button>
          <button
            onClick={onRemove}
            disabled={busy}
            title="Remove invitee"
            className="p-1.5 rounded text-slate-400 hover:bg-red-50 hover:text-red-600"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}

function RsvpButton({
  active,
  icon: Icon,
  label,
  color,
  onClick,
  busy
}: {
  active: boolean;
  icon?: typeof CheckCircle2;
  label: string;
  color: "emerald" | "red" | "amber" | "blue" | "slate";
  onClick: () => void;
  busy: boolean;
}) {
  const activeCls = {
    emerald: "bg-emerald-600 text-white",
    red: "bg-red-600 text-white",
    amber: "bg-amber-600 text-white",
    blue: "bg-blue-600 text-white",
    slate: "bg-slate-600 text-white"
  }[color];

  return (
    <button
      onClick={onClick}
      disabled={busy}
      className={`text-[11px] px-2 py-1 rounded inline-flex items-center gap-1 font-medium transition disabled:opacity-50 ${
        active ? activeCls : "bg-slate-100 text-slate-700 hover:bg-slate-200"
      }`}
    >
      {Icon && <Icon className="w-3 h-3" />}
      {label}
    </button>
  );
}
