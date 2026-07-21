"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useRequirePermission } from "@/lib/permissions";
import ActivityFeed from "@/components/ActivityFeed";
import { ArrowLeft, Building2, MapPin, Users, Loader2, ExternalLink } from "lucide-react";

interface Institution {
  id: string;
  name: string;
  name_ar: string | null;
  type: string;
  latitude: number;
  longitude: number;
  geofence_radius_m: number | null;
  address: string | null;
  city: string | null;
  district: string | null;
  governorate: string | null;
  phone: string | null;
}
interface HcpAtInst {
  hcp_id: string;
  is_primary: boolean;
  hcps: { id: string; full_name: string; specialty: string | null; segment: string | null } | null;
}
interface VisitAtInst {
  id: string;
  check_in_at: string | null;
  visit_type: string | null;
  hcps: { full_name: string } | null;
  profiles: { full_name: string | null } | null;
}

export default function InstitutionDetailPage() {
  const { checking } = useRequirePermission("institutions");
  const params = useParams<{ id: string }>();
  const [inst, setInst] = useState<Institution | null>(null);
  const [hcps, setHcps] = useState<HcpAtInst[]>([]);
  const [visits, setVisits] = useState<VisitAtInst[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (checking || !params.id) return;
    (async () => {
      const [i, w, v] = await Promise.all([
        supabase.from("institutions").select("*").eq("id", params.id).single(),
        supabase
          .from("hcp_workplaces")
          .select("hcp_id, is_primary, hcps(id, full_name, specialty, segment)")
          .eq("institution_id", params.id),
        supabase
          .from("visits")
          .select("id, check_in_at, visit_type, hcps(full_name), profiles(full_name)")
          .eq("institution_id", params.id)
          .order("check_in_at", { ascending: false })
          .limit(10)
      ]);
      setInst((i.data ?? null) as Institution | null);
      setHcps((w.data ?? []) as unknown as HcpAtInst[]);
      setVisits((v.data ?? []) as unknown as VisitAtInst[]);
      setLoading(false);
    })();
  }, [checking, params.id]);

  if (checking || loading) {
    return (
      <div className="max-w-3xl mx-auto p-12 text-center text-slate-500">
        <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
        Loading…
      </div>
    );
  }

  if (!inst) {
    return (
      <div className="max-w-md mx-auto p-12 text-center">
        <p className="text-slate-700">Institution not found.</p>
        <Link href="/dashboard/institutions" className="text-brand-700 underline text-sm">
          Back to institutions
        </Link>
      </div>
    );
  }

  const d = 0.008;
  const bbox = `${inst.longitude - d},${inst.latitude - d},${inst.longitude + d},${inst.latitude + d}`;
  const mapSrc = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&marker=${inst.latitude},${inst.longitude}&layer=mapnik`;

  return (
    <div className="max-w-3xl mx-auto space-y-4 pb-10">
      <Link
        href="/dashboard/institutions"
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
      >
        <ArrowLeft className="w-4 h-4" /> Back to institutions
      </Link>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-amber-50 text-amber-700 shrink-0">
            <Building2 className="w-6 h-6" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-slate-900">{inst.name}</h1>
            {inst.name_ar && <div className="text-sm text-slate-600" dir="rtl">{inst.name_ar}</div>}
            <div className="text-xs text-slate-500 mt-1 capitalize">{inst.type.replaceAll("_", " ")}</div>
            <div className="mt-2 text-sm text-slate-600 space-y-0.5">
              {inst.address && <div>📍 {inst.address}</div>}
              {(inst.district || inst.governorate) && (
                <div>🏘️ {[inst.district, inst.governorate].filter(Boolean).join(", ")}</div>
              )}
              {inst.phone && <div>📞 {inst.phone}</div>}
            </div>
          </div>
          <a
            href={`https://www.google.com/maps?q=${inst.latitude},${inst.longitude}`}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-brand-700 hover:underline inline-flex items-center gap-1 shrink-0"
          >
            <ExternalLink className="w-3 h-3" /> Maps
          </a>
        </div>
      </div>

      {/* Map */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-3 border-b border-slate-100 flex items-center gap-2">
          <MapPin className="w-4 h-4 text-slate-500" />
          <span className="text-sm font-semibold text-slate-700">Location</span>
          <span className="ml-auto text-xs text-slate-400">geofence {inst.geofence_radius_m ?? 100}m</span>
        </div>
        <iframe
          title="map"
          src={mapSrc}
          className="w-full h-64 border-0"
          loading="lazy"
        />
      </div>

      {/* HCPs here */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-3 border-b border-slate-100 flex items-center gap-2">
          <Users className="w-4 h-4 text-slate-500" />
          <span className="text-sm font-semibold text-slate-700">HCPs at this institution ({hcps.length})</span>
        </div>
        {hcps.length === 0 ? (
          <div className="p-6 text-center text-sm text-slate-500">No HCPs linked here yet.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {hcps.map((w) =>
              w.hcps ? (
                <Link key={w.hcp_id} href={`/dashboard/hcps/${w.hcps.id}`} className="p-3 flex items-center gap-3 hover:bg-slate-50 text-sm">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-slate-900 truncate">
                      {w.hcps.full_name}
                      {w.is_primary && <span className="ml-1.5 text-[10px] font-bold text-emerald-600">primary</span>}
                    </div>
                    {w.hcps.specialty && <div className="text-xs text-slate-500">{w.hcps.specialty}</div>}
                  </div>
                  {w.hcps.segment && (
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{w.hcps.segment}</span>
                  )}
                </Link>
              ) : null
            )}
          </div>
        )}
      </div>

      {/* Recent visits */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-3 border-b border-slate-100 text-sm font-semibold text-slate-700">Recent visits</div>
        {visits.length === 0 ? (
          <div className="p-6 text-center text-sm text-slate-500">No visits recorded here yet.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {visits.map((v) => (
              <Link key={v.id} href={`/dashboard/visits/${v.id}`} className="p-3 flex items-center gap-3 hover:bg-slate-50 text-sm">
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-slate-900 truncate">{v.hcps?.full_name ?? "—"}</div>
                  <div className="text-xs text-slate-500">
                    {v.profiles?.full_name ?? "Rep"} · {v.visit_type ?? ""}
                  </div>
                </div>
                <span className="text-xs text-slate-400 shrink-0">
                  {v.check_in_at ? new Date(v.check_in_at).toLocaleDateString() : ""}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>

      <ActivityFeed entityType="institutions" entityId={inst.id} />
    </div>
  );
}
