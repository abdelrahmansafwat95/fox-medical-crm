"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useGeolocation } from "@/lib/useGeolocation";
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Sparkles,
  Loader2,
  LogOut,
  MapPin,
  AlertTriangle,
  Package,
  Plus,
  ShoppingCart,
  Pencil
} from "lucide-react";
import EditModal, { type FieldConfig } from "@/components/EditModal";

interface VisitFull {
  id: string;
  status: string;
  visit_type: string | null;
  check_in_at: string | null;
  check_out_at: string | null;
  duration_minutes: number | null;
  check_in_lat: number | null;
  check_in_lng: number | null;
  check_in_distance_m: number | null;
  check_in_within_geofence: boolean | null;
  check_in_selfie_url: string | null;
  ai_summary: string | null;
  ai_quality_score: number | null;
  ai_coaching_notes: string | null;
  doctor_attitude: string | null;
  doctor_feedback: string | null;
  objections: string | null;
  key_message_delivered: string | null;
  next_action: string | null;
  next_visit_date: string | null;
  notes: string | null;
  manager_status: string;
  order_id: string | null;
  samples_given_summary: Record<string, number> | null;
  hcps: { full_name: string; specialty: string | null } | null;
  institutions: { name: string; district: string | null } | null;
}

interface SampleTransactionRow {
  id: string;
  quantity: number;
  batch_number: string | null;
  hcp_signature_url: string | null;
  created_at: string;
  products: { name: string; brand_name: string | null } | null;
}

interface OrderRow {
  id: string;
  order_number: string | null;
  status: string;
  total: number;
  currency: string;
  items: { product_id: string; qty: number; total: number }[];
}

const VISIT_EDIT_FIELDS: FieldConfig[] = [
  {
    name: "doctor_attitude",
    label: "Doctor attitude",
    type: "select",
    options: [
      { value: "positive", label: "Positive" },
      { value: "neutral", label: "Neutral" },
      { value: "skeptical", label: "Skeptical" },
      { value: "negative", label: "Negative" }
    ]
  },
  { name: "doctor_feedback", label: "Doctor feedback", type: "textarea" },
  { name: "objections", label: "Objections raised", type: "textarea" },
  { name: "key_message_delivered", label: "Key message delivered", type: "text" },
  { name: "next_action", label: "Next action", type: "text" },
  { name: "next_visit_date", label: "Next visit date", type: "date" },
  { name: "notes", label: "Additional notes", type: "textarea" }
];

export default function VisitDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const geo = useGeolocation();
  const [visit, setVisit] = useState<VisitFull | null>(null);
  const [samplesGiven, setSamplesGiven] = useState<SampleTransactionRow[]>([]);
  const [order, setOrder] = useState<OrderRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [rawNotes, setRawNotes] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [checkOutBusy, setCheckOutBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (params.id) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  async function load() {
    setLoading(true);

    const { data: vData, error: vErr } = await supabase
      .from("visits")
      .select(`
        id, status, visit_type, check_in_at, check_out_at, duration_minutes,
        check_in_lat, check_in_lng, check_in_distance_m, check_in_within_geofence, check_in_selfie_url,
        ai_summary, ai_quality_score, ai_coaching_notes,
        doctor_attitude, doctor_feedback, objections, key_message_delivered,
        next_action, next_visit_date, notes, manager_status, order_id, samples_given_summary,
        hcps(full_name, specialty),
        institutions(name, district)
      `)
      .eq("id", params.id)
      .single();
    if (vErr) setError(vErr.message);
    const vRow = (vData ?? null) as unknown as VisitFull | null;
    setVisit(vRow);

    // Samples
    const { data: sData } = await supabase
      .from("samples_transactions")
      .select(`id, quantity, batch_number, hcp_signature_url, created_at,
               products(name, brand_name)`)
      .eq("visit_id", params.id)
      .eq("transaction_type", "given_to_hcp")
      .order("created_at", { ascending: false });
    setSamplesGiven((sData ?? []) as unknown as SampleTransactionRow[]);

    // Linked order, if any
    if (vRow?.order_id) {
      const { data: oData } = await supabase
        .from("orders")
        .select("id, order_number, status, total, currency, items")
        .eq("id", vRow.order_id)
        .maybeSingle();
      setOrder((oData ?? null) as unknown as OrderRow | null);
    } else {
      setOrder(null);
    }

    setLoading(false);
  }

  async function runAiSummary() {
    if (!rawNotes.trim()) {
      setError("Type in your rough notes first.");
      return;
    }
    setAiBusy(true);
    setError(null);
    const { data: sess } = await supabase.auth.getSession();
    const res = await fetch("/api/ai/summarize-visit", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sess.session?.access_token}`
      },
      body: JSON.stringify({ visit_id: params.id, raw_notes: rawNotes })
    });
    const j = await res.json();
    setAiBusy(false);
    if (!res.ok || !j.ok) {
      setError("AI summary failed: " + (j.error ?? "unknown"));
      return;
    }
    setRawNotes("");
    await load();
  }

  async function checkOut() {
    if (!geo.position) {
      geo.refresh();
      setError("Waiting for GPS — tap again in a second.");
      return;
    }
    setCheckOutBusy(true);
    const { data: sess } = await supabase.auth.getSession();
    const res = await fetch("/api/tracking/check-out", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sess.session?.access_token}`
      },
      body: JSON.stringify({
        visit_id: params.id,
        lat: geo.position.latitude,
        lng: geo.position.longitude
      })
    });
    const j = await res.json();
    setCheckOutBusy(false);
    if (!j.success) {
      setError("Check-out failed: " + (j.error ?? "unknown"));
      return;
    }
    await load();
  }

  if (loading)
    return (
      <div className="max-w-3xl mx-auto p-12 text-center text-slate-500">Loading…</div>
    );
  if (!visit)
    return (
      <div className="max-w-3xl mx-auto p-12 text-center">
        <p className="text-slate-700">Visit not found.</p>
        <Link href="/dashboard/visits" className="text-brand-700 underline text-sm">
          Back to visits
        </Link>
      </div>
    );

  const canDistributeSamples =
    visit.status === "in_progress" || visit.status === "completed";
  const canAddOrder = canDistributeSamples && !visit.order_id;
  const canEdit = visit.status === "completed" || visit.status === "in_progress";

  return (
    <div className="max-w-3xl mx-auto">
      <Link
        href="/dashboard/visits"
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-3"
      >
        <ArrowLeft className="w-4 h-4" /> Back to visits
      </Link>

      {/* Header card */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 mb-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-xl font-bold text-slate-900">
              {visit.hcps?.full_name ?? "Unknown HCP"}
            </h1>
            <p className="text-sm text-slate-500">
              {visit.hcps?.specialty ?? "—"} · {visit.institutions?.name ?? "—"}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                visit.status === "completed"
                  ? "bg-emerald-100 text-emerald-700"
                  : visit.status === "in_progress"
                  ? "bg-blue-100 text-blue-700"
                  : "bg-slate-100 text-slate-700"
              }`}
            >
              {visit.status.replace("_", " ").toUpperCase()}
            </span>
            {visit.manager_status === "flagged" && (
              <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-red-100 text-red-700 inline-flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> Flagged
              </span>
            )}
            {canEdit && (
              <button
                onClick={() => setEditing(true)}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"
                title="Edit visit details"
              >
                <Pencil className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Geo verification banner */}
        <div
          className={`mt-4 p-3 rounded-lg border text-sm flex items-center gap-2 ${
            visit.check_in_within_geofence
              ? "bg-emerald-50 border-emerald-200 text-emerald-900"
              : "bg-red-50 border-red-200 text-red-900"
          }`}
        >
          {visit.check_in_within_geofence ? (
            <CheckCircle2 className="w-4 h-4" />
          ) : (
            <AlertTriangle className="w-4 h-4" />
          )}
          <span>
            {visit.check_in_within_geofence ? "GPS-verified" : "Outside geofence"} ·{" "}
            {visit.check_in_distance_m?.toFixed(0)}m from anchor
          </span>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div>
            <div className="text-xs text-slate-500">Check-in</div>
            <div className="font-medium">
              {visit.check_in_at ? new Date(visit.check_in_at).toLocaleString() : "—"}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Check-out</div>
            <div className="font-medium">
              {visit.check_out_at ? new Date(visit.check_out_at).toLocaleString() : "—"}
            </div>
          </div>
          {visit.duration_minutes !== null && (
            <div>
              <div className="text-xs text-slate-500">Duration</div>
              <div className="font-medium inline-flex items-center gap-1">
                <Clock className="w-3 h-3" /> {visit.duration_minutes} min
              </div>
            </div>
          )}
          {visit.visit_type && (
            <div>
              <div className="text-xs text-slate-500">Type</div>
              <div className="font-medium capitalize">{visit.visit_type.replace("_", " ")}</div>
            </div>
          )}
        </div>

        {visit.check_in_selfie_url && (
          <div className="mt-4">
            <div className="text-xs text-slate-500 mb-1">Verification selfie</div>
            <img
              src={visit.check_in_selfie_url}
              alt="Selfie"
              className="w-24 h-24 rounded-lg object-cover border border-slate-200"
            />
          </div>
        )}

        {error && (
          <div className="mt-3 text-sm text-red-700 bg-red-50 rounded-lg p-2 border border-red-200">
            {error}
          </div>
        )}

        {/* Action buttons */}
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-2">
          {canDistributeSamples && (
            <Link
              href={`/dashboard/visits/${visit.id}/give-sample`}
              className="bg-amber-600 hover:bg-amber-700 text-white font-medium py-2.5 rounded-lg inline-flex items-center justify-center gap-2"
            >
              <Package className="w-4 h-4" /> Give sample
            </Link>
          )}
          {canAddOrder && (
            <Link
              href={`/dashboard/visits/${visit.id}/add-order`}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium py-2.5 rounded-lg inline-flex items-center justify-center gap-2"
            >
              <ShoppingCart className="w-4 h-4" /> Add order
            </Link>
          )}
          {visit.status === "in_progress" && (
            <button
              onClick={checkOut}
              disabled={checkOutBusy}
              className="bg-orange-600 hover:bg-orange-700 disabled:bg-orange-400 text-white font-medium py-2.5 rounded-lg inline-flex items-center justify-center gap-2"
            >
              {checkOutBusy ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Checking out…
                </>
              ) : (
                <>
                  <LogOut className="w-4 h-4" /> Check out
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Linked order */}
      {order && (
        <div className="bg-white rounded-xl border border-emerald-200 shadow-sm p-4 mb-4">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2">
              <ShoppingCart className="w-5 h-5 text-emerald-600" />
              <h2 className="font-semibold text-slate-900">Order placed</h2>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-700">
                {order.status}
              </span>
            </div>
            <Link
              href="/dashboard/orders"
              className="text-xs text-brand-700 underline"
            >
              View all orders
            </Link>
          </div>
          <div className="flex items-center justify-between text-sm">
            <div className="text-slate-600">
              Order <span className="font-mono">{order.order_number ?? "—"}</span> ·{" "}
              {order.items?.length ?? 0} line item
              {(order.items?.length ?? 0) === 1 ? "" : "s"}
            </div>
            <div className="font-bold text-slate-900">
              {order.total.toLocaleString()} {order.currency}
            </div>
          </div>
        </div>
      )}

      {/* Samples given during this visit */}
      {samplesGiven.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 mb-4">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <Package className="w-5 h-5 text-amber-600" />
              <h2 className="font-semibold text-slate-900">
                Samples given ({samplesGiven.reduce((s, t) => s + t.quantity, 0)} units)
              </h2>
            </div>
            {canDistributeSamples && (
              <Link
                href={`/dashboard/visits/${visit.id}/give-sample`}
                className="text-xs text-brand-700 hover:underline inline-flex items-center gap-1"
              >
                <Plus className="w-3 h-3" /> Give more
              </Link>
            )}
          </div>
          <div className="divide-y divide-slate-100">
            {samplesGiven.map((tx) => (
              <div key={tx.id} className="py-2 flex items-center gap-3 text-sm">
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-slate-900">
                    {tx.products?.brand_name ?? tx.products?.name ?? "—"}
                  </div>
                  <div className="text-xs text-slate-500">
                    Batch {tx.batch_number ?? "—"} ·{" "}
                    {new Date(tx.created_at).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit"
                    })}
                  </div>
                </div>
                {tx.hcp_signature_url && (
                  <a
                    href={tx.hcp_signature_url}
                    target="_blank"
                    rel="noreferrer"
                    title="View signature"
                    className="text-xs text-emerald-700"
                  >
                    ✍️ signed
                  </a>
                )}
                <div className="font-bold text-slate-900 shrink-0">×{tx.quantity}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* AI summary */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 mb-4">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="w-5 h-5 text-yellow-600" />
          <h2 className="font-semibold text-slate-900">AI visit summary</h2>
          {visit.ai_quality_score !== null && (
            <span className="ml-auto text-xs font-bold px-2 py-1 rounded-full bg-yellow-100 text-yellow-700">
              Quality: {visit.ai_quality_score}/10
            </span>
          )}
        </div>

        {visit.ai_summary ? (
          <div className="space-y-3">
            <div className="text-sm text-slate-700 bg-yellow-50 border border-yellow-200 rounded-lg p-3">
              {visit.ai_summary}
            </div>
            <div className="grid sm:grid-cols-2 gap-3 text-sm">
              {visit.doctor_attitude && (
                <Field label="Doctor attitude" value={visit.doctor_attitude} />
              )}
              {visit.doctor_feedback && (
                <Field label="Doctor feedback" value={visit.doctor_feedback} />
              )}
              {visit.key_message_delivered && (
                <Field label="Key message delivered" value={visit.key_message_delivered} />
              )}
              {visit.objections && <Field label="Objections" value={visit.objections} />}
              {visit.next_action && <Field label="Next action" value={visit.next_action} />}
              {visit.next_visit_date && (
                <Field label="Next visit" value={visit.next_visit_date} />
              )}
            </div>
            {visit.ai_coaching_notes && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm">
                <div className="font-semibold text-blue-900 text-xs uppercase tracking-wide mb-1">
                  Coaching notes for manager
                </div>
                <div className="text-slate-700">{visit.ai_coaching_notes}</div>
              </div>
            )}
          </div>
        ) : (
          <div>
            <p className="text-sm text-slate-500 mb-2">
              Type rough notes from the visit and let AI structure them into a clean DCR.
            </p>
            <textarea
              value={rawNotes}
              onChange={(e) => setRawNotes(e.target.value)}
              placeholder="e.g. Met Dr. Hassan, discussed Cardia 5mg, he was open but worried about pricing..."
              rows={5}
              className="w-full p-3 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-brand-500 text-sm"
            />
            <button
              onClick={runAiSummary}
              disabled={aiBusy || !rawNotes.trim()}
              className="mt-3 w-full sm:w-auto bg-brand-600 hover:bg-brand-700 disabled:bg-brand-400 text-white font-medium px-5 py-2 rounded-lg inline-flex items-center justify-center gap-2"
            >
              {aiBusy ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Analyzing…
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" /> Generate AI summary
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {visit.check_in_lat && visit.check_in_lng && (
        <a
          href={`https://www.google.com/maps?q=${visit.check_in_lat},${visit.check_in_lng}`}
          target="_blank"
          rel="noreferrer"
          className="block bg-white rounded-xl border border-slate-200 shadow-sm p-3 hover:bg-slate-50 transition text-center text-sm text-blue-700 inline-flex items-center justify-center gap-2 w-full"
        >
          <MapPin className="w-4 h-4" /> View check-in location on Google Maps
        </a>
      )}

      <EditModal
        open={editing}
        title="Edit visit details"
        table="visits"
        recordId={visit.id}
        fields={VISIT_EDIT_FIELDS}
        initialValues={visit as unknown as Record<string, unknown>}
        onClose={() => setEditing(false)}
        onSaved={() => { setEditing(false); load(); }}
      />
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-slate-800">{value}</div>
    </div>
  );
}
