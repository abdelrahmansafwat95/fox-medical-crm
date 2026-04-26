import { NextRequest, NextResponse } from "next/server";
import webpush from "web-push";
import { createClient } from "@supabase/supabase-js";

/**
 * POST /api/push/send
 * Body: { user_ids: string[], title, body, link_url? }
 * Sends a Web Push notification to all matching subscriptions.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = req.headers.get("authorization");
    if (!auth?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "missing_auth" }, { status: 401 });
    }

    const { user_ids, title, body, link_url } = await req.json();
    if (!Array.isArray(user_ids) || !title) {
      return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
    }

    const pubKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const privKey = process.env.VAPID_PRIVATE_KEY;
    if (!pubKey || !privKey) {
      return NextResponse.json({ error: "missing_vapid_keys" }, { status: 500 });
    }

    webpush.setVapidDetails(
      "mailto:abdelrahman@foxsystemstech.com",
      pubKey,
      privKey
    );

    // Use service-role to read all subscriptions for the targeted users
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );

    const { data: subs } = await supabase
      .from("push_subscriptions")
      .select("user_id, endpoint, p256dh, auth")
      .in("user_id", user_ids);

    const payload = JSON.stringify({ title, body: body ?? "", url: link_url ?? "/dashboard" });

    let success = 0;
    let failed = 0;
    for (const s of subs ?? []) {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload
        );
        success++;
      } catch (e: unknown) {
        failed++;
        // Drop expired subscriptions
        const status = (e as { statusCode?: number })?.statusCode;
        if (status === 410 || status === 404) {
          await supabase.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
        }
      }
    }

    // Also write in-app notifications
    const rows = user_ids.map((uid: string) => ({
      user_id: uid,
      type: "system",
      title,
      body: body ?? null,
      link_url: link_url ?? null
    }));
    await supabase.from("notifications").insert(rows);

    return NextResponse.json({ ok: true, success, failed });
  } catch (err: unknown) {
    const m = err instanceof Error ? err.message : "unknown_error";
    return NextResponse.json({ error: m }, { status: 500 });
  }
}
