import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { scoreGpsCheckIn } from "@/lib/gpsTrust";

/**
 * POST /api/tracking/check-in
 * Body: {
 *   hcp_id, institution_id, lat, lng, accuracy_m,
 *   selfie_url?, visit_type?, plan_id?,
 *   speed_mps?,        // m/s from browser geolocation
 *   timestamp_iso?,    // browser-side timestamp
 * }
 *
 * Pipeline:
 *   1. record_check_in RPC (unchanged) → creates visit, validates geofence
 *   2. Trust scoring: query prior visit + identical-coord history
 *   3. Update visit with gps_trust_score, gps_trust_signals
 *   4. Insert compliance_alerts for low-trust readings
 *   5. Return visit_id + trust_score + trust_reasons to the client
 */
export async function POST(req: NextRequest) {
  try {
    const auth = req.headers.get("authorization");
    if (!auth?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "missing_auth" }, { status: 401 });
    }

    const body = await req.json();
    const {
      hcp_id,
      institution_id,
      lat,
      lng,
      accuracy_m,
      selfie_url,
      visit_type,
      plan_id,
      speed_mps,
      timestamp_iso
    } = body;

    if (!hcp_id || !institution_id || typeof lat !== "number" || typeof lng !== "number") {
      return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: { headers: { Authorization: auth } },
        auth: { persistSession: false }
      }
    );

    // ───────── 1. Run the existing check-in RPC ─────────
    const { data: rpcData, error: rpcErr } = await supabase.rpc("record_check_in", {
      _hcp_id: hcp_id,
      _institution_id: institution_id,
      _lat: lat,
      _lng: lng,
      _accuracy_m: accuracy_m ?? null,
      _selfie_url: selfie_url ?? null,
      _visit_type: visit_type ?? "detailing",
      _plan_id: plan_id ?? null
    });

    if (rpcErr) {
      return NextResponse.json({ error: rpcErr.message }, { status: 500 });
    }

    type RpcCheckInResult = {
      success: boolean;
      visit_id?: string;
      distance_m?: number;
      within_geofence?: boolean;
      error?: string;
    };
    const result = rpcData as RpcCheckInResult;
    if (!result.success || !result.visit_id) {
      // Geofence failed or other RPC error — return as-is, no trust scoring needed
      return NextResponse.json(rpcData);
    }

    const visit_id = result.visit_id;

    // ───────── 2. Trust-scoring side queries ─────────
    // Get the rep's user_id from auth
    const {
      data: { user }
    } = await supabase.auth.getUser();
    const rep_id = user?.id;

    // Prior visit today by same rep (for impossible-travel-speed)
    let prior_visit: { latitude: number; longitude: number; timestamp_iso: string } | null = null;
    if (rep_id) {
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      const { data: priorRows } = await supabase
        .from("visits")
        .select("check_in_lat, check_in_lng, check_in_at")
        .eq("rep_id", rep_id)
        .gte("check_in_at", startOfToday.toISOString())
        .neq("id", visit_id)
        .order("check_in_at", { ascending: false })
        .limit(1);

      if (priorRows && priorRows.length > 0 && priorRows[0].check_in_lat) {
        prior_visit = {
          latitude: priorRows[0].check_in_lat,
          longitude: priorRows[0].check_in_lng,
          timestamp_iso: priorRows[0].check_in_at
        };
      }
    }

    // Count how many visits in the last 30 days had this exact (lat, lng)
    let identical_coord_count = 0;
    if (rep_id) {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000).toISOString();
      // Round to 6 decimal places for comparison (sub-meter precision)
      const lat_key = Math.round(lat * 1_000_000) / 1_000_000;
      const lng_key = Math.round(lng * 1_000_000) / 1_000_000;
      const { count } = await supabase
        .from("visits")
        .select("id", { count: "exact", head: true })
        .eq("rep_id", rep_id)
        .gte("check_in_at", thirtyDaysAgo)
        .eq("check_in_lat", lat_key)
        .eq("check_in_lng", lng_key)
        .neq("id", visit_id);
      identical_coord_count = count ?? 0;
    }

    // ───────── 3. Score it ─────────
    const trust = scoreGpsCheckIn({
      latitude: lat,
      longitude: lng,
      accuracy: accuracy_m ?? 999, // unknown accuracy → assume worst
      speed: speed_mps,
      timestamp_iso: timestamp_iso ?? new Date().toISOString(),
      user_agent: req.headers.get("user-agent"),
      prior_visit,
      identical_coord_count
    });

    // ───────── 4. Persist the score to the visit ─────────
    await supabase
      .from("visits")
      .update({
        gps_trust_score: trust.score,
        gps_trust_signals: trust.signals
      })
      .eq("id", visit_id);

    // If the trust score is low, also flip manager_status to flagged
    if (trust.score < 50) {
      await supabase
        .from("visits")
        .update({ manager_status: "flagged" })
        .eq("id", visit_id);
    }

    // ───────── 5. Fire compliance alerts ─────────
    if (rep_id && trust.alerts.length > 0) {
      const alertRows = trust.alerts.map((a) => ({
        rep_id,
        alert_type: a.alert_type,
        severity: a.severity,
        related_visit_id: visit_id,
        evidence: {
          trust_score: trust.score,
          reasons: trust.reasons,
          ...trust.signals
        },
        status: "open" as const
      }));
      // Use upsert with no conflict resolution to avoid blocking on dedupe
      await supabase.from("compliance_alerts").insert(alertRows);
    }

    // ───────── 6. Return everything to the client ─────────
    return NextResponse.json({
      ...rpcData,
      trust_score: trust.score,
      trust_reasons: trust.reasons
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "unknown_error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
