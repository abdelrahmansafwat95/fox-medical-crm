"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import {
  ArrowLeft,
  CalendarDays,
  Loader2,
  AlertTriangle,
  CheckCircle2
} from "lucide-react";

const EVENT_TYPES = [
  { value: "symposium", label: "Symposium" },
  { value: "dinner_meeting", label: "Dinner Meeting" },
  { value: "product_launch", label: "Product Launch" },
  { value: "advisory_board", label: "Advisory Board" },
  { value: "training", label: "Training" },
  { value: "conference", label: "Conference" },
  { value: "round_table", label: "Round Table" },
  { value: "webinar", label: "Webinar" },
  { value: "other", label: "Other" }
];

export default function NewEventPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state — defaults sensibly for typical Egyptian pharma event
  const tomorrow = new Date(Date.now() + 86_400_000);
  const dateDefault = tomorrow.toISOString().slice(0, 10);

  const [form, setForm] = useState({
    title: "",
    title_ar: "",
    event_type: "symposium",
    description: "",
    starts_date: dateDefault,
    starts_time: "19:00",
    duration_hours: 3,
    venue_name: "",
    venue_address: "",
    city: "Cairo",
    is_virtual: false,
    meeting_url: "",
    product_line: "",
    budget_egp: 0,
    external_speakers: "",
    notes: ""
  });

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function submit() {
    if (!form.title.trim()) {
      setError("Event title is required.");
      return;
    }
    if (!form.starts_date || !form.starts_time) {
      setError("Date and start time are required.");
      return;
    }

    setSubmitting(true);
    setError(null);

    const { data: u } = await supabase.auth.getUser();
    if (!u.user) {
      setError("Not authenticated.");
      setSubmitting(false);
      return;
    }

    const startsAt = new Date(`${form.starts_date}T${form.starts_time}:00`).toISOString();
    const endsAt = new Date(
      new Date(startsAt).getTime() + form.duration_hours * 3_600_000
    ).toISOString();

    const { data: insertedRow, error: insErr } = await supabase
      .from("events")
      .insert({
        title: form.title,
        title_ar: form.title_ar || null,
        event_type: form.event_type,
        description: form.description || null,
        starts_at: startsAt,
        ends_at: endsAt,
        venue_name: form.venue_name || null,
        venue_address: form.venue_address || null,
        city: form.city || null,
        is_virtual: form.is_virtual,
        meeting_url: form.meeting_url || null,
        product_line: form.product_line || null,
        budget_egp: form.budget_egp,
        external_speakers: form.external_speakers || null,
        notes: form.notes || null,
        status: "planned",
        organizer_id: u.user.id
      })
      .select("id")
      .single();

    setSubmitting(false);

    if (insErr) {
      setError(insErr.message);
      return;
    }

    router.push(`/dashboard/events/${insertedRow.id}`);
  }

  return (
    <div className="max-w-2xl mx-auto pb-24">
      <Link
        href="/dashboard/events"
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-3"
      >
        <ArrowLeft className="w-4 h-4" /> Back to events
      </Link>

      <div className="bg-gradient-to-br from-purple-50 to-pink-50 border border-purple-200 rounded-xl p-4 mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-white shadow-sm">
            <CalendarDays className="w-6 h-6 text-purple-700" />
          </div>
          <div>
            <h1 className="font-bold text-slate-900">New event</h1>
            <p className="text-xs text-slate-600">Plan a CME, symposium, dinner meeting, or product launch</p>
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
        {/* Title */}
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">
            Event title <span className="text-red-600">*</span>
          </label>
          <input
            type="text"
            value={form.title}
            onChange={(e) => update("title", e.target.value)}
            placeholder="e.g. Cardia Q3 Cardiology Symposium"
            className="w-full p-2.5 border border-slate-300 rounded-lg text-sm"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">
            Title (Arabic)
          </label>
          <input
            type="text"
            value={form.title_ar}
            onChange={(e) => update("title_ar", e.target.value)}
            dir="rtl"
            className="w-full p-2.5 border border-slate-300 rounded-lg text-sm"
          />
        </div>

        {/* Type */}
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">
            Event type <span className="text-red-600">*</span>
          </label>
          <select
            value={form.event_type}
            onChange={(e) => update("event_type", e.target.value)}
            className="w-full p-2.5 border border-slate-300 rounded-lg text-sm"
          >
            {EVENT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        {/* Description */}
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">Description</label>
          <textarea
            value={form.description}
            onChange={(e) => update("description", e.target.value)}
            rows={2}
            placeholder="What is this event about?"
            className="w-full p-2.5 border border-slate-300 rounded-lg text-sm"
          />
        </div>

        {/* Date + time */}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Date <span className="text-red-600">*</span>
            </label>
            <input
              type="date"
              value={form.starts_date}
              onChange={(e) => update("starts_date", e.target.value)}
              className="w-full p-2.5 border border-slate-300 rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Start <span className="text-red-600">*</span>
            </label>
            <input
              type="time"
              value={form.starts_time}
              onChange={(e) => update("starts_time", e.target.value)}
              className="w-full p-2.5 border border-slate-300 rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Duration (hrs)
            </label>
            <input
              type="number"
              min={0.5}
              max={24}
              step={0.5}
              value={form.duration_hours}
              onChange={(e) => update("duration_hours", parseFloat(e.target.value) || 0)}
              className="w-full p-2.5 border border-slate-300 rounded-lg text-sm"
            />
          </div>
        </div>

        {/* Virtual toggle */}
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={form.is_virtual}
            onChange={(e) => update("is_virtual", e.target.checked)}
            className="w-4 h-4"
          />
          <span className="text-slate-700">Virtual / online event</span>
        </label>

        {form.is_virtual ? (
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Meeting URL
            </label>
            <input
              type="url"
              value={form.meeting_url}
              onChange={(e) => update("meeting_url", e.target.value)}
              placeholder="https://zoom.us/…"
              className="w-full p-2.5 border border-slate-300 rounded-lg text-sm"
            />
          </div>
        ) : (
          <>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Venue name
              </label>
              <input
                type="text"
                value={form.venue_name}
                onChange={(e) => update("venue_name", e.target.value)}
                placeholder="e.g. Sheraton Heliopolis Ballroom"
                className="w-full p-2.5 border border-slate-300 rounded-lg text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Venue address
                </label>
                <input
                  type="text"
                  value={form.venue_address}
                  onChange={(e) => update("venue_address", e.target.value)}
                  placeholder="Street + district"
                  className="w-full p-2.5 border border-slate-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">City</label>
                <input
                  type="text"
                  value={form.city}
                  onChange={(e) => update("city", e.target.value)}
                  className="w-full p-2.5 border border-slate-300 rounded-lg text-sm"
                />
              </div>
            </div>
          </>
        )}

        {/* Product line */}
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">
            Product line being promoted
          </label>
          <input
            type="text"
            value={form.product_line}
            onChange={(e) => update("product_line", e.target.value)}
            placeholder="e.g. Cardio, Endo, Antibiotic"
            className="w-full p-2.5 border border-slate-300 rounded-lg text-sm"
          />
        </div>

        {/* Budget */}
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">
            Budget (EGP)
          </label>
          <input
            type="number"
            min={0}
            step={500}
            value={form.budget_egp}
            onChange={(e) => update("budget_egp", parseFloat(e.target.value) || 0)}
            className="w-full p-2.5 border border-slate-300 rounded-lg text-sm"
          />
          <p className="text-[11px] text-slate-500 mt-1">
            Used for compliance audit. Update with actual cost after the event.
          </p>
        </div>

        {/* External speakers */}
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">
            External speakers
          </label>
          <input
            type="text"
            value={form.external_speakers}
            onChange={(e) => update("external_speakers", e.target.value)}
            placeholder="e.g. Prof. John Smith (Harvard)"
            className="w-full p-2.5 border border-slate-300 rounded-lg text-sm"
          />
          <p className="text-[11px] text-slate-500 mt-1">
            For HCPs from your database, add them as speakers from the event detail page after creation.
          </p>
        </div>

        {/* Notes */}
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">
            Internal notes
          </label>
          <textarea
            value={form.notes}
            onChange={(e) => update("notes", e.target.value)}
            rows={2}
            placeholder="Catering, A/V, sponsor logos…"
            className="w-full p-2.5 border border-slate-300 rounded-lg text-sm"
          />
        </div>
      </div>

      <div className="flex gap-2 mt-4">
        <Link
          href="/dashboard/events"
          className="px-4 py-3 rounded-lg border border-slate-300 text-slate-700 font-medium hover:bg-slate-50"
        >
          Cancel
        </Link>
        <button
          onClick={submit}
          disabled={submitting}
          className="flex-1 bg-brand-600 hover:bg-brand-700 disabled:bg-brand-400 text-white font-bold py-3 rounded-lg inline-flex items-center justify-center gap-2"
        >
          {submitting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <CheckCircle2 className="w-4 h-4" />
          )}
          Create event
        </button>
      </div>
    </div>
  );
}
