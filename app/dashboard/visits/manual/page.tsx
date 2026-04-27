"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import {
  ArrowLeft,
  ClipboardEdit,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Info
} from "lucide-react";

interface HCPOption {
  id: string;
  full_name: string;
  specialty: string | null;
}

interface InstitutionOption {
  id: string;
  name: string;
}

export default function ManualVisitPage() {
  const router = useRouter();
  const [hcps, setHcps] = useState<HCPOption[]>([]);
  const [institutions, setInstitutions] = useState<InstitutionOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Form
  const [hcpId, setHcpId] = useState("");
  const [institutionId, setInstitutionId] = useState("");
  const [visitType, setVisitType] = useState("detailing");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState(new Date().toTimeString().slice(0, 5));
  const [duration, setDuration] = useState(15);
  const [notes, setNotes] = useState("");
  const [reasonNoCheckIn, setReasonNoCheckIn] = useState("");
  const [doctorAttitude, setDoctorAttitude] = useState("");

  useEffect(() => {
    (async () => {
      const [hcpsRes, instRes] = await Promise.all([
        supabase
          .from("hcps")
          .select("id, full_name, specialty")
          .eq("is_active", true)
          .order("full_name")
          .limit(200),
        supabase
          .from("institutions")
          .select("id, name")
          .eq("is_active", true)
          .order("name")
          .limit(200)
      ]);
      setHcps((hcpsRes.data ?? []) as HCPOption[]);
      setInstitutions((instRes.data ?? []) as InstitutionOption[]);
      setLoading(false);
    })();
  }, []);

  // Auto-pick the HCP's primary institution
  async function onHcpChange(id: string) {
    setHcpId(id);
    if (!id) return;
    const { data } = await supabase
      .from("hcp_workplaces")
      .select("institution_id")
      .eq("hcp_id", id)
      .eq("is_primary", true)
      .maybeSingle();
    if (data?.institution_id) setInstitutionId(data.institution_id);
  }

  async function submit() {
    setError(null);

    if (!hcpId || !institutionId || !date || !time) {
      setError("Please fill in HCP, institution, date and time.");
      return;
    }
    if (!reasonNoCheckIn.trim()) {
      setError("A reason is required for manual visit entry (audit requirement).");
      return;
    }

    setSubmitting(true);

    const { data: u } = await supabase.auth.getUser();
    if (!u.user) {
      setError("Not authenticated.");
      setSubmitting(false);
      return;
    }

    const checkInAt = new Date(`${date}T${time}:00`).toISOString();
    const checkOutAt = new Date(
      new Date(checkInAt).getTime() + duration * 60_000
    ).toISOString();

    const noteText = `[MANUAL ENTRY] Reason: ${reasonNoCheckIn}\n\n${notes}`.trim();

    const { error: insErr } = await supabase.from("visits").insert({
      rep_id: u.user.id,
      hcp_id: hcpId,
      institution_id: institutionId,
      visit_type: visitType,
      status: "completed",
      check_in_at: checkInAt,
      check_out_at: checkOutAt,
      check_in_within_geofence: false, // honestly mark as unverified
      doctor_attitude: doctorAttitude || null,
      notes: noteText,
      manager_status: "pending" // managers will review manual entries
    });

    setSubmitting(false);

    if (insErr) {
      setError(insErr.message);
      return;
    }

    setSuccess(true);
    setTimeout(() => router.push("/dashboard/visits"), 1500);
  }

  if (loading) {
    return (
      <div className="max-w-md mx-auto p-12 text-center text-slate-500">
        <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
        Loading…
      </div>
    );
  }

  if (success) {
    return (
      <div className="max-w-md mx-auto p-12 text-center">
        <div className="text-6xl mb-2">✅</div>
        <h2 className="font-bold text-emerald-900">Visit logged</h2>
        <p className="text-sm text-slate-600 mt-1">
          Marked as &ldquo;pending&rdquo; for manager review.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto pb-24">
      <Link
        href="/dashboard/visits"
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-3"
      >
        <ArrowLeft className="w-4 h-4" /> Back to visits
      </Link>

      {/* Header */}
      <div className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 rounded-xl p-4 mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-white shadow-sm">
            <ClipboardEdit className="w-6 h-6 text-amber-700" />
          </div>
          <div>
            <h1 className="font-bold text-slate-900">Log visit manually</h1>
            <p className="text-xs text-slate-600">
              For visits where you forgot to check in via GPS.
            </p>
          </div>
        </div>
      </div>

      {/* Disclaimer */}
      <div className="mb-4 p-3 rounded-lg bg-blue-50 border border-blue-200 text-sm text-blue-900 flex items-start gap-2">
        <Info className="w-4 h-4 shrink-0 mt-0.5" />
        <div>
          <strong>Manual entries are flagged for manager review</strong> and marked as
          GPS-unverified. They will <em>not</em> count toward GPS-verified visit metrics.
          Use only when GPS check-in wasn&apos;t possible.
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
        {/* HCP */}
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">
            HCP <span className="text-red-600">*</span>
          </label>
          <select
            value={hcpId}
            onChange={(e) => onHcpChange(e.target.value)}
            className="w-full p-2.5 border border-slate-300 rounded-lg text-sm"
          >
            <option value="">— pick a doctor —</option>
            {hcps.map((h) => (
              <option key={h.id} value={h.id}>
                {h.full_name} {h.specialty ? `(${h.specialty})` : ""}
              </option>
            ))}
          </select>
        </div>

        {/* Institution */}
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">
            Institution <span className="text-red-600">*</span>
          </label>
          <select
            value={institutionId}
            onChange={(e) => setInstitutionId(e.target.value)}
            className="w-full p-2.5 border border-slate-300 rounded-lg text-sm"
          >
            <option value="">— pick an institution —</option>
            {institutions.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-slate-500 mt-1">
            Auto-filled when you pick an HCP, but you can change it.
          </p>
        </div>

        {/* Date + time */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Visit date <span className="text-red-600">*</span>
            </label>
            <input
              type="date"
              value={date}
              max={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setDate(e.target.value)}
              className="w-full p-2.5 border border-slate-300 rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Start time <span className="text-red-600">*</span>
            </label>
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="w-full p-2.5 border border-slate-300 rounded-lg text-sm"
            />
          </div>
        </div>

        {/* Duration + type */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Duration (min)
            </label>
            <input
              type="number"
              min={1}
              max={240}
              value={duration}
              onChange={(e) => setDuration(parseInt(e.target.value) || 0)}
              className="w-full p-2.5 border border-slate-300 rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Visit type
            </label>
            <select
              value={visitType}
              onChange={(e) => setVisitType(e.target.value)}
              className="w-full p-2.5 border border-slate-300 rounded-lg text-sm"
            >
              <option value="detailing">Detailing</option>
              <option value="follow_up">Follow-up</option>
              <option value="sample_drop">Sample drop</option>
              <option value="order_visit">Order visit</option>
              <option value="courtesy">Courtesy</option>
              <option value="launch">Launch</option>
              <option value="training">Training</option>
            </select>
          </div>
        </div>

        {/* Doctor attitude */}
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">
            Doctor attitude
          </label>
          <select
            value={doctorAttitude}
            onChange={(e) => setDoctorAttitude(e.target.value)}
            className="w-full p-2.5 border border-slate-300 rounded-lg text-sm"
          >
            <option value="">—</option>
            <option value="positive">Positive</option>
            <option value="neutral">Neutral</option>
            <option value="skeptical">Skeptical</option>
            <option value="negative">Negative</option>
          </select>
        </div>

        {/* Reason - REQUIRED */}
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">
            Reason for not checking in via GPS{" "}
            <span className="text-red-600">*</span>
          </label>
          <textarea
            value={reasonNoCheckIn}
            onChange={(e) => setReasonNoCheckIn(e.target.value)}
            rows={2}
            placeholder="e.g. Phone battery died · Doctor saw me last-minute · Connection issue"
            className="w-full p-2.5 border border-slate-300 rounded-lg text-sm"
          />
          <p className="text-[11px] text-slate-500 mt-1">
            Required for audit. Manager will see this when reviewing.
          </p>
        </div>

        {/* Notes */}
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">
            Visit notes
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="What happened during the visit? Doctor feedback, objections, next steps…"
            className="w-full p-2.5 border border-slate-300 rounded-lg text-sm"
          />
        </div>
      </div>

      <div className="flex gap-2 mt-4">
        <Link
          href="/dashboard/visits"
          className="px-4 py-3 rounded-lg border border-slate-300 text-slate-700 font-medium hover:bg-slate-50"
        >
          Cancel
        </Link>
        <button
          onClick={submit}
          disabled={submitting}
          className="flex-1 bg-amber-600 hover:bg-amber-700 disabled:bg-amber-400 text-white font-bold py-3 rounded-lg inline-flex items-center justify-center gap-2"
        >
          {submitting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <CheckCircle2 className="w-4 h-4" />
          )}
          Log visit
        </button>
      </div>
    </div>
  );
}
