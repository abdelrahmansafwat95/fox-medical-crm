"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useGeolocation } from "@/lib/useGeolocation";
import { fetchOrQueue } from "@/lib/offlineQueue";
import {
  MapPin,
  Crosshair,
  CheckCircle2,
  XCircle,
  Camera,
  Loader2,
  AlertTriangle,
  ArrowLeft,
  Building2
} from "lucide-react";
import type { NearestInstitution } from "@/lib/types";

interface HCPOption {
  id: string;
  full_name: string;
  specialty: string | null;
  segment: string | null;
}

export default function CheckInPage() {
  const router = useRouter();
  const geo = useGeolocation();

  const [step, setStep] = useState<"locate" | "select" | "selfie" | "submit">("locate");
  const [nearest, setNearest] = useState<NearestInstitution[]>([]);
  const [selectedInst, setSelectedInst] = useState<NearestInstitution | null>(null);
  const [hcpsAtInst, setHcpsAtInst] = useState<HCPOption[]>([]);
  const [selectedHcp, setSelectedHcp] = useState<string>("");
  const [visitType, setVisitType] = useState("detailing");
  const [selfieDataUrl, setSelfieDataUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 1. Get GPS location on mount
  useEffect(() => {
    geo.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 2. When position arrives, query nearest institutions
  useEffect(() => {
    if (!geo.position) return;
    (async () => {
      const { data, error } = await supabase.rpc("nearest_institutions", {
        _lat: geo.position!.latitude,
        _lng: geo.position!.longitude,
        _limit: 8
      });
      if (error) {
        setError(error.message);
        return;
      }
      setNearest((data ?? []) as NearestInstitution[]);
      setStep("select");
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geo.position]);

  // 3. When institution chosen, load HCPs that work there
  async function pickInstitution(inst: NearestInstitution) {
    setSelectedInst(inst);
    setError(null);

    const { data: workplaces } = await supabase
      .from("hcp_workplaces")
      .select("hcp_id, hcps(id, full_name, specialty, segment)")
      .eq("institution_id", inst.id);

    type WP = { hcp_id: string; hcps: HCPOption | null };
    const list: HCPOption[] = ((workplaces ?? []) as unknown as WP[])
      .map((w) => w.hcps)
      .filter((h): h is HCPOption => h !== null);

    if (list.length === 0) {
      // Fallback — show all HCPs (no workplace records yet)
      const { data: anyHcps } = await supabase
        .from("hcps")
        .select("id, full_name, specialty, segment")
        .eq("is_active", true)
        .limit(20);
      setHcpsAtInst((anyHcps ?? []) as HCPOption[]);
    } else {
      setHcpsAtInst(list);
    }
  }

  // 4. Capture selfie via getUserMedia → take photo → base64
  async function captureSelfie() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: 480, height: 480 }
      });
      const video = document.createElement("video");
      video.srcObject = stream;
      await video.play();

      // Wait a moment for the stream to settle, then snap
      await new Promise((r) => setTimeout(r, 800));

      const canvas = document.createElement("canvas");
      canvas.width = 480;
      canvas.height = 480;
      const ctx = canvas.getContext("2d");
      ctx?.drawImage(video, 0, 0, 480, 480);

      // Stop the camera
      stream.getTracks().forEach((t) => t.stop());

      const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
      setSelfieDataUrl(dataUrl);
      setStep("submit");
    } catch (err: unknown) {
      const m = err instanceof Error ? err.message : "Camera error";
      setError("Camera access denied or unavailable: " + m);
    }
  }

  // 5. Submit check-in
  async function submitCheckIn() {
    if (!selectedInst || !selectedHcp || !geo.position) {
      setError("Missing required data.");
      return;
    }
    setSubmitting(true);
    setError(null);

    try {
      // Upload selfie to storage if we have one
      let selfie_url: string | null = null;
      if (selfieDataUrl) {
        const blob = await (await fetch(selfieDataUrl)).blob();
        const filename = `selfie-${Date.now()}.jpg`;
        const { data: u } = await supabase.auth.getUser();
        const path = `${u.user?.id ?? "anon"}/${filename}`;
        const { error: upErr } = await supabase.storage
          .from("visit-selfies")
          .upload(path, blob, { contentType: "image/jpeg" });
        if (upErr) {
          // Non-fatal — proceed without selfie URL
          console.warn("Selfie upload failed:", upErr.message);
        } else {
          const { data: urlData } = supabase.storage.from("visit-selfies").getPublicUrl(path);
          selfie_url = urlData.publicUrl;
        }
      }

      // Call the check-in RPC via API route — through the offline queue so a
      // dropped connection in the field doesn't lose the visit.
      const { data: sess } = await supabase.auth.getSession();
      const init: RequestInit = {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sess.session?.access_token}`
        },
        body: JSON.stringify({
          hcp_id: selectedHcp,
          institution_id: selectedInst.id,
          lat: geo.position.latitude,
          lng: geo.position.longitude,
          accuracy_m: geo.position.accuracy,
          selfie_url,
          visit_type: visitType
        })
      };

      const outcome = await fetchOrQueue("/api/tracking/check-in", init);

      if (outcome.queued) {
        const offline = typeof navigator !== "undefined" && !navigator.onLine;
        if (offline) {
          alert(
            "You're offline — this check-in was saved on your device and will sync automatically when you're back online."
          );
          router.replace("/dashboard/visits");
        } else {
          setError("Check-in couldn't be submitted just now — it's been queued and will retry automatically.");
          setSubmitting(false);
        }
        return;
      }

      const result = outcome.data as {
        success?: boolean;
        visit_id?: string;
        message?: string;
        error?: string;
      };
      if (!result?.success) {
        setError(result?.message || result?.error || "Check-in failed.");
        setSubmitting(false);
        return;
      }

      router.replace(`/dashboard/visits/${result.visit_id}`);
    } catch (err: unknown) {
      const m = err instanceof Error ? err.message : "Unknown error";
      setError(m);
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <Link
        href="/dashboard/visits"
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-3"
      >
        <ArrowLeft className="w-4 h-4" /> Back to visits
      </Link>
      <h1 className="text-2xl font-bold text-slate-900 mb-2">GPS Check-in</h1>
      <p className="text-slate-500 mb-6">
        Verifies your visit by checking your location is within the institution&apos;s geofence.
      </p>

      {/* GPS status card */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 mb-4">
        <div className="flex items-start gap-3">
          <div
            className={`p-2 rounded-lg ${
              geo.position ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
            }`}
          >
            <Crosshair className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <div className="font-semibold text-slate-900">
              {geo.loading
                ? "Locating you…"
                : geo.position
                ? "Location locked"
                : "Location unavailable"}
            </div>
            <div className="text-xs text-slate-500 mt-0.5">
              {geo.position ? (
                <>
                  {geo.position.latitude.toFixed(6)}, {geo.position.longitude.toFixed(6)} ·
                  accuracy {Math.round(geo.position.accuracy)}m
                </>
              ) : (
                geo.error ?? "Tap to retry"
              )}
            </div>
          </div>
          <button
            onClick={geo.refresh}
            disabled={geo.loading}
            className="text-xs text-brand-700 font-medium hover:underline disabled:opacity-50"
          >
            {geo.loading ? "…" : "Refresh"}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* STEP: select institution */}
      {step === "select" && !selectedInst && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-slate-500" />
              <span className="font-semibold text-slate-900">Nearby institutions</span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Sorted by distance. You can only check in at green ones.
            </p>
          </div>
          <div className="divide-y divide-slate-100">
            {nearest.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500">
                No institutions found. Add some in the Institutions page first.
              </div>
            ) : (
              nearest.map((i) => (
                <button
                  key={i.id}
                  onClick={() => i.within_geofence && pickInstitution(i)}
                  disabled={!i.within_geofence}
                  className={`w-full p-4 flex items-center gap-3 text-left transition ${
                    i.within_geofence
                      ? "hover:bg-emerald-50 cursor-pointer"
                      : "cursor-not-allowed opacity-60"
                  }`}
                >
                  <div
                    className={`p-2 rounded-lg shrink-0 ${
                      i.within_geofence
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {i.within_geofence ? (
                      <CheckCircle2 className="w-5 h-5" />
                    ) : (
                      <XCircle className="w-5 h-5" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-slate-900">{i.name}</div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {i.district ? `${i.district} · ` : ""}
                      {i.distance_m < 1000
                        ? `${i.distance_m.toFixed(0)}m away`
                        : `${(i.distance_m / 1000).toFixed(1)}km away`}{" "}
                      · radius {i.geofence_radius_m}m
                    </div>
                  </div>
                  {i.within_geofence ? (
                    <span className="text-xs font-bold text-emerald-700 shrink-0">CHECK IN</span>
                  ) : (
                    <span className="text-[11px] text-slate-500 shrink-0">
                      get {(i.distance_m - i.geofence_radius_m).toFixed(0)}m closer
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {/* STEP: select HCP at chosen institution */}
      {selectedInst && step === "select" && (
        <>
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mb-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-700" />
              <div>
                <div className="font-semibold text-emerald-900">{selectedInst.name}</div>
                <div className="text-xs text-emerald-700">
                  {selectedInst.distance_m.toFixed(0)}m from geofence anchor (allowed{" "}
                  {selectedInst.geofence_radius_m}m) ✓
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 mb-4">
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Which HCP are you visiting?
            </label>
            {hcpsAtInst.length === 0 ? (
              <div className="text-sm text-slate-500 italic">
                No HCPs registered at this institution yet. Add some in the HCPs page.
              </div>
            ) : (
              <select
                value={selectedHcp}
                onChange={(e) => setSelectedHcp(e.target.value)}
                className="w-full p-2.5 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="">— pick a doctor —</option>
                {hcpsAtInst.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.full_name} {h.specialty ? `(${h.specialty})` : ""}{" "}
                    {h.segment ? `· segment ${h.segment}` : ""}
                  </option>
                ))}
              </select>
            )}

            <label className="block text-sm font-medium text-slate-700 mb-2 mt-4">Visit type</label>
            <select
              value={visitType}
              onChange={(e) => setVisitType(e.target.value)}
              className="w-full p-2.5 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-brand-500"
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

          <div className="flex gap-2">
            <button
              onClick={() => setSelectedInst(null)}
              className="px-4 py-2.5 rounded-lg border border-slate-300 text-slate-700 font-medium hover:bg-slate-50"
            >
              Back
            </button>
            <button
              disabled={!selectedHcp}
              onClick={() => setStep("selfie")}
              className="flex-1 bg-brand-600 hover:bg-brand-700 disabled:bg-slate-300 text-white font-medium py-2.5 rounded-lg inline-flex items-center justify-center gap-2"
            >
              <Camera className="w-4 h-4" /> Take selfie & continue
            </button>
          </div>
        </>
      )}

      {/* STEP: selfie */}
      {step === "selfie" && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 text-center">
          <div className="text-5xl mb-3">🤳</div>
          <h2 className="font-semibold text-slate-900">Quick selfie for verification</h2>
          <p className="text-sm text-slate-500 mt-1 mb-4">
            We capture one photo to confirm you&apos;re actually here. Stored privately.
          </p>
          <button
            onClick={captureSelfie}
            className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white font-medium px-6 py-3 rounded-lg"
          >
            <Camera className="w-5 h-5" /> Open camera
          </button>
          <button
            onClick={() => setStep("submit")}
            className="block mx-auto mt-3 text-xs text-slate-500 underline"
          >
            Skip selfie (managers may flag)
          </button>
        </div>
      )}

      {/* STEP: confirm + submit */}
      {step === "submit" && selectedInst && selectedHcp && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-4">
          {selfieDataUrl && (
            <div className="text-center">
              <img
                src={selfieDataUrl}
                alt="Selfie"
                className="w-32 h-32 rounded-full mx-auto object-cover border-4 border-emerald-200"
              />
            </div>
          )}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <div className="text-xs text-slate-500">Institution</div>
              <div className="font-medium">{selectedInst.name}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Distance</div>
              <div className="font-medium text-emerald-700">
                {selectedInst.distance_m.toFixed(0)}m ✓
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">HCP</div>
              <div className="font-medium">
                {hcpsAtInst.find((h) => h.id === selectedHcp)?.full_name}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Visit type</div>
              <div className="font-medium capitalize">{visitType.replace("_", " ")}</div>
            </div>
          </div>
          <button
            onClick={submitCheckIn}
            disabled={submitting}
            className="w-full bg-brand-600 hover:bg-brand-700 disabled:bg-brand-400 text-white font-semibold py-3 rounded-lg inline-flex items-center justify-center gap-2"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Checking in…
              </>
            ) : (
              <>
                <MapPin className="w-4 h-4" /> Confirm check-in
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
