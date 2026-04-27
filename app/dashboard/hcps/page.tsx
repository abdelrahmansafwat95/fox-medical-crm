"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Users, Sparkles, Search, Phone, MessageCircle, Plus, Pencil } from "lucide-react";
import type { HCP } from "@/lib/types";
import EditModal, { type FieldConfig } from "@/components/EditModal";

const SEGMENT_COLORS: Record<string, string> = {
  A: "bg-emerald-100 text-emerald-700",
  B: "bg-blue-100 text-blue-700",
  C: "bg-amber-100 text-amber-700",
  D: "bg-slate-100 text-slate-600",
  KOL: "bg-purple-100 text-purple-700"
};

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
      { value: "Gastroenterology", label: "Gastroenterology" },
      { value: "Neurology", label: "Neurology" },
      { value: "Oncology", label: "Oncology" },
      { value: "Orthopedics", label: "Orthopedics" },
      { value: "Dermatology", label: "Dermatology" },
      { value: "Other", label: "Other" }
    ]
  },
  { name: "sub_specialty", label: "Sub-specialty", type: "text" },
  { name: "phone", label: "Phone", type: "tel", placeholder: "+201234567890" },
  { name: "mobile", label: "Mobile", type: "tel", placeholder: "+201234567890" },
  { name: "whatsapp", label: "WhatsApp", type: "tel", placeholder: "+201234567890" },
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
  { name: "is_kol", label: "Is KOL (Key Opinion Leader)", type: "checkbox" },
  { name: "notes", label: "Notes", type: "textarea" },
  { name: "is_active", label: "Active", type: "checkbox" }
];

export default function HCPsPage() {
  const [hcps, setHcps] = useState<HCP[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [scoringId, setScoringId] = useState<string | null>(null);
  const [editing, setEditing] = useState<HCP | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("hcps")
      .select("*")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(200);
    setHcps((data ?? []) as HCP[]);
    setLoading(false);
  }

  async function aiScore(hcp_id: string) {
    setScoringId(hcp_id);
    try {
      const { data } = await supabase.auth.getSession();
      const res = await fetch("/api/ai/score-hcp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${data.session?.access_token}`
        },
        body: JSON.stringify({ hcp_id })
      });
      const j = await res.json();
      if (!res.ok) {
        alert("AI scoring failed: " + (j.error || "unknown"));
      } else {
        await load();
      }
    } finally {
      setScoringId(null);
    }
  }

  const filtered = hcps.filter((h) =>
    h.full_name.toLowerCase().includes(search.toLowerCase()) ||
    (h.specialty?.toLowerCase().includes(search.toLowerCase()) ?? false)
  );

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-brand-50 text-brand-700">
            <Users className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">HCPs</h1>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-lg inline-flex items-center gap-2 font-medium"
        >
          <Plus className="w-4 h-4" /> Add HCP
        </button>
      </div>
      <p className="text-slate-500 mb-6">Healthcare professionals — doctors, pharmacists, nurses</p>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or specialty…"
            className="w-full pl-10 pr-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-500">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <div className="text-5xl mb-2">👨‍⚕️</div>
            <p className="text-slate-700 font-medium">No HCPs yet</p>
            <p className="text-sm text-slate-500 mt-1">
              Click &ldquo;Add HCP&rdquo; to create your first one.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filtered.map((h) => (
              <div key={h.id} className="p-4 hover:bg-slate-50 transition flex items-start gap-4">
                <div className="w-12 h-12 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center font-bold shrink-0">
                  {h.full_name.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-slate-900">
                      {h.title ?? "Dr."} {h.full_name}
                    </span>
                    {h.segment && (
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${SEGMENT_COLORS[h.segment]}`}>
                        {h.segment}
                      </span>
                    )}
                    {h.is_kol && (
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">
                        KOL
                      </span>
                    )}
                    {h.ai_score !== null && (
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 inline-flex items-center gap-1">
                        <Sparkles className="w-3 h-3" /> {h.ai_score}/10
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {h.specialty ?? "—"}{h.sub_specialty ? ` · ${h.sub_specialty}` : ""}
                  </div>
                  {h.ai_notes && (
                    <div className="mt-2 text-xs text-slate-600 bg-yellow-50 border border-yellow-200 rounded p-2 max-w-2xl">
                      <span className="font-semibold">AI insight: </span>{h.ai_notes.split("\n")[0]}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {h.mobile && (
                    <a href={`tel:${h.mobile}`} className="p-2 rounded-lg text-slate-500 hover:bg-slate-100">
                      <Phone className="w-4 h-4" />
                    </a>
                  )}
                  {h.whatsapp && (
                    <a href={`https://wa.me/${h.whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noreferrer" className="p-2 rounded-lg text-emerald-600 hover:bg-emerald-50">
                      <MessageCircle className="w-4 h-4" />
                    </a>
                  )}
                  <button
                    onClick={() => setEditing(h)}
                    className="p-2 rounded-lg text-slate-500 hover:bg-slate-100"
                    title="Edit"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => aiScore(h.id)}
                    disabled={scoringId === h.id}
                    className="text-xs px-2.5 py-1.5 rounded-lg bg-brand-600 text-white hover:bg-brand-700 disabled:bg-brand-400 inline-flex items-center gap-1"
                  >
                    <Sparkles className="w-3 h-3" />
                    {scoringId === h.id ? "Scoring…" : "AI Score"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <EditModal
        open={creating}
        title="Add HCP"
        table="hcps"
        fields={HCP_FIELDS}
        initialValues={{ title: "Dr.", is_active: true, is_kol: false }}
        onClose={() => setCreating(false)}
        onSaved={() => { setCreating(false); load(); }}
      />

      <EditModal
        open={!!editing}
        title="Edit HCP"
        table="hcps"
        recordId={editing?.id}
        fields={HCP_FIELDS}
        initialValues={editing ? (editing as unknown as Record<string, unknown>) : {}}
        onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); load(); }}
        onDeleted={() => { setEditing(null); load(); }}
        allowDelete
      />
    </div>
  );
}
