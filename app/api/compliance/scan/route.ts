import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * POST /api/compliance/scan
 * Body: { lookback_hours?: 24 }
 * Triggers the SQL anomaly detector. Manager-only.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = req.headers.get("authorization");
    if (!auth?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "missing_auth" }, { status: 401 });
    }

    const { lookback_hours = 24 } = await req.json();

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: auth } }, auth: { persistSession: false } }
    );

    const { data, error } = await supabase.rpc("detect_visit_anomalies", {
      _lookback_hours: lookback_hours
    });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, alerts_inserted: data });
  } catch (err: unknown) {
    const m = err instanceof Error ? err.message : "unknown_error";
    return NextResponse.json({ error: m }, { status: 500 });
  }
}
