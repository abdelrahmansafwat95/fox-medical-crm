"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { MapPin, Users, RefreshCw, AlertCircle } from "lucide-react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

interface RepLatest {
  rep_id: string;
  rep_name: string;
  recorded_at: string;
  latitude: number;
  longitude: number;
  battery_level: number | null;
  accuracy_m: number | null;
}

const CAIRO_CENTER: [number, number] = [31.2357, 30.0444];

export default function LiveTrackingPage() {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<Record<string, mapboxgl.Marker>>({});
  const [reps, setReps] = useState<RepLatest[]>([]);
  const [loading, setLoading] = useState(true);
  const [tokenMissing, setTokenMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 1. Initialize Mapbox map
  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (!token) {
      setTokenMissing(true);
      setLoading(false);
      return;
    }
    mapboxgl.accessToken = token;

    mapRef.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/streets-v12",
      center: CAIRO_CENTER,
      zoom: 10
    });

    mapRef.current.addControl(new mapboxgl.NavigationControl(), "top-right");

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // 2. Load latest location per rep
  async function loadLocations() {
    setLoading(true);
    setError(null);

    // Pull last 24h of pings, then keep latest per rep
    const since = new Date(Date.now() - 24 * 3600_000).toISOString();
    const { data, error } = await supabase
      .from("rep_locations")
      .select(`
        rep_id, recorded_at, latitude, longitude, battery_level, accuracy_m,
        profiles!inner(full_name)
      `)
      .gte("recorded_at", since)
      .order("recorded_at", { ascending: false })
      .limit(2000);

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    // Group: latest ping per rep
    const latest = new Map<string, RepLatest>();
    type Row = {
      rep_id: string;
      recorded_at: string;
      latitude: number;
      longitude: number;
      battery_level: number | null;
      accuracy_m: number | null;
      profiles: { full_name: string | null } | null;
    };
    for (const row of (data ?? []) as unknown as Row[]) {
      if (latest.has(row.rep_id)) continue;
      latest.set(row.rep_id, {
        rep_id: row.rep_id,
        rep_name: row.profiles?.full_name ?? "Rep",
        recorded_at: row.recorded_at,
        latitude: row.latitude,
        longitude: row.longitude,
        battery_level: row.battery_level,
        accuracy_m: row.accuracy_m
      });
    }
    const list = Array.from(latest.values());
    setReps(list);
    setLoading(false);

    // Render markers
    if (mapRef.current) {
      // Remove old markers
      Object.values(markersRef.current).forEach((m) => m.remove());
      markersRef.current = {};

      list.forEach((r) => {
        const el = document.createElement("div");
        const minutesAgo = (Date.now() - new Date(r.recorded_at).getTime()) / 60_000;
        const color =
          minutesAgo < 5 ? "#10b981" : minutesAgo < 30 ? "#f59e0b" : "#94a3b8";
        el.innerHTML = `
          <div style="
            background:${color}; width:20px; height:20px; border-radius:50%;
            border:3px solid white; box-shadow:0 2px 8px rgba(0,0,0,0.3);
            position:relative;
          ">
            <div style="
              position:absolute; top:-4px; left:-4px; width:28px; height:28px;
              border-radius:50%; background:${color}; opacity:0.3;
              animation: pulse 2s infinite;
            "></div>
          </div>
        `;

        const popup = new mapboxgl.Popup({ offset: 25 }).setHTML(`
          <div style="font-family:system-ui;">
            <div style="font-weight:600; margin-bottom:4px;">${r.rep_name}</div>
            <div style="font-size:11px; color:#64748b;">
              Last ping: ${Math.round(minutesAgo)} min ago<br/>
              Accuracy: ${r.accuracy_m ? Math.round(r.accuracy_m) + "m" : "—"}<br/>
              Battery: ${r.battery_level ?? "—"}${r.battery_level ? "%" : ""}
            </div>
          </div>
        `);

        const marker = new mapboxgl.Marker({ element: el })
          .setLngLat([r.longitude, r.latitude])
          .setPopup(popup)
          .addTo(mapRef.current!);
        markersRef.current[r.rep_id] = marker;
      });

      // Fit to bounds if any markers
      if (list.length > 0) {
        const bounds = new mapboxgl.LngLatBounds();
        list.forEach((r) => bounds.extend([r.longitude, r.latitude]));
        mapRef.current.fitBounds(bounds, { padding: 80, maxZoom: 13 });
      }
    }
  }

  // 3. Load + auto-refresh every 60s
  useEffect(() => {
    if (tokenMissing) return;
    loadLocations();
    const id = setInterval(loadLocations, 60_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokenMissing]);

  return (
    <div className="max-w-7xl mx-auto h-[calc(100vh-180px)]">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-brand-50 text-brand-700">
            <MapPin className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Live Tracking</h1>
            <p className="text-xs text-slate-500">Real-time field force locations · auto-refreshes every 60s</p>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500" /> Active (&lt;5m)
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-500 ml-3" /> Idle
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-slate-400 ml-3" /> Stale
          </div>
          <button
            onClick={loadLocations}
            disabled={loading}
            className="text-xs px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>
      </div>

      {tokenMissing && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-sm text-amber-900">
            <strong>Mapbox token missing.</strong> Add{" "}
            <code className="bg-amber-100 px-1 rounded">NEXT_PUBLIC_MAPBOX_TOKEN</code> to your{" "}
            <code className="bg-amber-100 px-1 rounded">.env.local</code> (and Vercel env vars).
            Get a free token at{" "}
            <a
              className="underline"
              href="https://account.mapbox.com/access-tokens/"
              target="_blank"
              rel="noreferrer"
            >
              account.mapbox.com
            </a>
            .
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700 mb-3">
          {error}
        </div>
      )}

      {!tokenMissing && (
        <div className="grid lg:grid-cols-4 gap-4 h-full">
          {/* Map */}
          <div className="lg:col-span-3">
            <div
              ref={mapContainer}
              className="w-full h-[500px] lg:h-full rounded-xl overflow-hidden border border-slate-200 shadow-sm"
            />
          </div>

          {/* Side panel with rep list */}
          <div className="lg:col-span-1 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
            <div className="p-3 border-b border-slate-100 flex items-center gap-2">
              <Users className="w-4 h-4 text-slate-500" />
              <span className="font-semibold text-sm">Reps online ({reps.length})</span>
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
              {reps.length === 0 ? (
                <div className="p-6 text-center text-sm text-slate-500">
                  No active reps in the last 24h.
                </div>
              ) : (
                reps.map((r) => {
                  const minutesAgo = Math.round(
                    (Date.now() - new Date(r.recorded_at).getTime()) / 60_000
                  );
                  return (
                    <div
                      key={r.rep_id}
                      className="p-3 hover:bg-slate-50 cursor-pointer text-sm"
                      onClick={() =>
                        mapRef.current?.flyTo({
                          center: [r.longitude, r.latitude],
                          zoom: 15,
                          duration: 1500
                        })
                      }
                    >
                      <div className="font-medium text-slate-900">{r.rep_name}</div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {minutesAgo}m ago{" "}
                        {r.battery_level !== null && `· 🔋 ${r.battery_level}%`}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
