"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { Building2, MapPin, Search, Plus, Pencil, Download } from "lucide-react";
import type { Institution } from "@/lib/types";
import EditModal, { type FieldConfig } from "@/components/EditModal";
import { usePerms } from "@/lib/permissions";
import { downloadCsv } from "@/lib/csv";

const TYPE_LABELS: Record<string, string> = {
  private_clinic: "Private Clinic",
  polyclinic: "Polyclinic",
  hospital_govt: "Government Hospital",
  hospital_private: "Private Hospital",
  hospital_university: "University Hospital",
  hospital_military: "Military Hospital",
  pharmacy_independent: "Independent Pharmacy",
  pharmacy_chain: "Chain Pharmacy",
  distributor: "Distributor",
  wholesaler: "Wholesaler",
  lab: "Lab",
  warehouse: "Warehouse"
};

const INST_FIELDS: FieldConfig[] = [
  { name: "name", label: "Name", type: "text", required: true },
  { name: "name_ar", label: "Name (Arabic)", type: "text", rtl: true },
  {
    name: "type",
    label: "Type",
    type: "select",
    required: true,
    options: Object.entries(TYPE_LABELS).map(([value, label]) => ({ value, label }))
  },
  { name: "latitude", label: "Latitude", type: "number", required: true, step: 0.000001, helpText: "From Google Maps — right-click → 'What's here?'" },
  { name: "longitude", label: "Longitude", type: "number", required: true, step: 0.000001 },
  { name: "geofence_radius_m", label: "Geofence radius (meters)", type: "number", min: 25, max: 1000, helpText: "Default 100m. Lower = stricter check-in." },
  { name: "address", label: "Address", type: "text" },
  { name: "city", label: "City", type: "text", placeholder: "Cairo" },
  { name: "district", label: "District", type: "text", placeholder: "Maadi, Heliopolis, …" },
  { name: "governorate", label: "Governorate", type: "text", placeholder: "Cairo, Giza, …" },
  { name: "phone", label: "Phone", type: "tel" },
  { name: "is_active", label: "Active", type: "checkbox" }
];

export default function InstitutionsPage() {
  const { can } = usePerms();
  const [items, setItems] = useState<Institution[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Institution | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("institutions")
      .select("*")
      .eq("is_active", true)
      .order("name");
    setItems((data ?? []) as Institution[]);
    setLoading(false);
  }

  const filtered = items.filter((i) => {
    const q = search.toLowerCase();
    return (
      i.name.toLowerCase().includes(q) ||
      (i.district?.toLowerCase().includes(q) ?? false) ||
      ((i as { code?: string }).code?.toLowerCase().includes(q) ?? false)
    );
  });

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-amber-50 text-amber-700">
            <Building2 className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Institutions</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() =>
              downloadCsv(
                "institutions",
                filtered.map((i) => ({
                  Name: i.name,
                  Type: i.type,
                  City: i.city ?? "",
                  District: i.district ?? "",
                  Governorate: i.governorate ?? "",
                  Latitude: i.latitude,
                  Longitude: i.longitude,
                  "Geofence (m)": i.geofence_radius_m ?? "",
                  Phone: i.phone ?? ""
                }))
              )
            }
            className="border border-slate-300 text-slate-700 hover:bg-slate-50 px-3 py-2 rounded-lg inline-flex items-center gap-2 text-sm font-medium"
          >
            <Download className="w-4 h-4" /> Export
          </button>
          {can("institutions", "create") && (
            <button
              onClick={() => setCreating(true)}
              className="bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-lg inline-flex items-center gap-2 font-medium"
            >
              <Plus className="w-4 h-4" /> Add institution
            </button>
          )}
        </div>
      </div>
      <p className="text-slate-500 mb-6">
        Clinics, hospitals, pharmacies, distributors. Each has a GPS-anchored geofence.
      </p>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, code (H-00042), or district…"
            className="w-full pl-10 pr-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
      </div>

      {loading ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12 text-center text-slate-500">
          Loading…
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {filtered.map((i) => (
            <div key={i.id} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link href={`/dashboard/institutions/${i.id}`} className="font-semibold text-slate-900 hover:text-brand-700">
                      {i.name}
                    </Link>
                    {(i as { code?: string }).code && (
                      <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                        {(i as { code?: string }).code}
                      </span>
                    )}
                  </div>
                  {i.name_ar && <div className="text-sm text-slate-600" dir="rtl">{i.name_ar}</div>}
                  <div className="text-xs text-slate-500 mt-1">{TYPE_LABELS[i.type] ?? i.type}</div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <a
                    href={`https://www.google.com/maps?q=${i.latitude},${i.longitude}`}
                    target="_blank"
                    rel="noreferrer"
                    className="p-2 rounded-lg text-blue-600 hover:bg-blue-50"
                    title="Open in Google Maps"
                  >
                    <MapPin className="w-4 h-4" />
                  </a>
                  {can("institutions", "edit") && (
                    <button
                      onClick={() => setEditing(i)}
                      className="p-2 rounded-lg text-slate-500 hover:bg-slate-100"
                      title="Edit"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
              <div className="mt-3 text-xs text-slate-500 space-y-0.5">
                {i.address && <div>📍 {i.address}</div>}
                {i.district && <div>🏘️ {i.district}, {i.governorate ?? ""}</div>}
                <div className="flex items-center gap-3 mt-2">
                  <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-mono text-[11px]">
                    {i.latitude.toFixed(4)}, {i.longitude.toFixed(4)}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-brand-50 text-brand-700 text-[11px]">
                    Geofence: {i.geofence_radius_m}m
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <EditModal
        open={creating}
        title="Add institution"
        table="institutions"
        fields={INST_FIELDS}
        initialValues={{ type: "private_clinic", is_active: true, geofence_radius_m: 100, latitude: 30.0444, longitude: 31.2357 }}
        duplicateCheck={async (v) => {
          const name = String(v.name ?? "").trim();
          if (!name) return null;
          const district = String(v.district ?? "").trim();
          let query = supabase.from("institutions").select("id, name, district").ilike("name", name);
          if (district) query = query.ilike("district", district);
          const { data } = await query.limit(1);
          if (data && data.length > 0) {
            return `An institution named "${data[0].name}"${district ? ` in ${district}` : ""} already exists.`;
          }
          return null;
        }}
        onClose={() => setCreating(false)}
        onSaved={() => { setCreating(false); load(); }}
      />

      <EditModal
        open={!!editing}
        title="Edit institution"
        table="institutions"
        recordId={editing?.id}
        fields={INST_FIELDS}
        initialValues={editing ? (editing as unknown as Record<string, unknown>) : {}}
        onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); load(); }}
        onDeleted={() => { setEditing(null); load(); }}
        allowDelete={can("institutions", "delete")}
      />
    </div>
  );
}
