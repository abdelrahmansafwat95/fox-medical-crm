import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * POST /api/push/subscribe
 * Body: PushSubscriptionJSON from the browser
 * Stores the subscription so server can later send push messages.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = req.headers.get("authorization");
    if (!auth?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "missing_auth" }, { status: 401 });
    }

    const sub = await req.json();
    if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
      return NextResponse.json({ error: "invalid_subscription" }, { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: auth } }, auth: { persistSession: false } }
    );

    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });

    const { error } = await supabase.from("push_subscriptions").upsert(
      {
        user_id: u.user.id,
        endpoint: sub.endpoint,
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth,
        user_agent: req.headers.get("user-agent")
      },
      { onConflict: "endpoint" }
    );

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const m = err instanceof Error ? err.message : "unknown_error";
    return NextResponse.json({ error: m }, { status: 500 });
  }
}
