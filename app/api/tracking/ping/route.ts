import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * POST /api/tracking/ping
 * Body: { latitude, longitude, accuracy_m, speed_kmh, heading, battery_level, is_charging }
 * Inserts a row into rep_locations using the user's bearer token (so RLS applies).
 */
export async function POST(req: NextRequest) {
  try {
    const auth = req.headers.get("authorization");
    if (!auth?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "missing_auth" }, { status: 401 });
    }

    const body = await req.json();
    const { latitude, longitude, accuracy_m, speed_kmh, heading, battery_level, is_charging } = body;

    if (typeof latitude !== "number" || typeof longitude !== "number") {
      return NextResponse.json({ error: "invalid_coords" }, { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: { headers: { Authorization: auth } },
        auth: { persistSession: false }
      }
    );

    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });

    const { error } = await supabase.from("rep_locations").insert({
      rep_id: u.user.id,
      latitude,
      longitude,
      accuracy_m: accuracy_m ?? null,
      speed_kmh: speed_kmh ?? null,
      heading: heading ?? null,
      battery_level: battery_level ?? null,
      is_charging: is_charging ?? null
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "unknown_error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
