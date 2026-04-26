import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * POST /api/tracking/check-in
 * Body: { hcp_id, institution_id, lat, lng, accuracy_m, selfie_url?, visit_type?, plan_id? }
 *
 * Calls Supabase RPC `record_check_in` which:
 *   1. validates geofence via PostGIS
 *   2. creates a visit row with status='in_progress'
 *   3. returns visit_id + distance_m, OR error="outside_geofence"
 */
export async function POST(req: NextRequest) {
  try {
    const auth = req.headers.get("authorization");
    if (!auth?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "missing_auth" }, { status: 401 });
    }

    const {
      hcp_id,
      institution_id,
      lat,
      lng,
      accuracy_m,
      selfie_url,
      visit_type,
      plan_id
    } = await req.json();

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

    const { data, error } = await supabase.rpc("record_check_in", {
      _hcp_id: hcp_id,
      _institution_id: institution_id,
      _lat: lat,
      _lng: lng,
      _accuracy_m: accuracy_m ?? null,
      _selfie_url: selfie_url ?? null,
      _visit_type: visit_type ?? "detailing",
      _plan_id: plan_id ?? null
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    // RPC returns jsonb — pass through to client
    return NextResponse.json(data);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "unknown_error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
