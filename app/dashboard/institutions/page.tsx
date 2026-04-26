"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Building2, MapPin, Search } from "lucide-react";
import type { Institution } from "@/lib/types";

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

export default function InstitutionsPage() {
  const [items, setItems] = useState<Institution[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("institutions")
        .select("*")
        .eq("is_active", true)
        .order("name");
      setItems((data ?? []) as Institution[]);
      setLoading(false);
    })();
  }, []);

  const filtered = items.filter(
    (i) =>
      i.name.toLowerCase().includes(search.toLowerCase()) ||
      (i.district?.toLowerCase().includes(search.toLowerCase()) ?? false)
  );

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-2">
        <div className="p-2 rounded-lg bg-amber-50 text-amber-700">
          <Building2 className="w-6 h-6" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900">Institutions</h1>
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
            placeholder="Search by name or district…"
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
                  <h3 className="font-semibold text-slate-900">{i.name}</h3>
                  {i.name_ar && <div className="text-sm text-slate-600" dir="rtl">{i.name_ar}</div>}
                  <div className="text-xs text-slate-500 mt-1">{TYPE_LABELS[i.type] ?? i.type}</div>
                </div>
                <a
                  href={`https://www.google.com/maps?q=${i.latitude},${i.longitude}`}
                  target="_blank"
                  rel="noreferrer"
                  className="p-2 rounded-lg text-blue-600 hover:bg-blue-50 shrink-0"
                  title="Open in Google Maps"
                >
                  <MapPin className="w-4 h-4" />
                </a>
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
    </div>
  );
}
