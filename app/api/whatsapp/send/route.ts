import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * POST /api/whatsapp/send
 * Body: { hcp_id?, phone, message, visit_id? }
 *
 * Strategy: log the outbound message, return a wa.me link.
 * Phase 2 will integrate UltraMsg or WhatsApp Business API for true sending.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = req.headers.get("authorization");
    if (!auth?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "missing_auth" }, { status: 401 });
    }

    const { hcp_id, phone, message, visit_id } = await req.json();
    if (!phone || !message) {
      return NextResponse.json({ error: "missing_payload" }, { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: auth } }, auth: { persistSession: false } }
    );

    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });

    // Strip non-digits for the wa.me link
    const cleanPhone = phone.replace(/\D/g, "");
    const waUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;

    // Log to whatsapp_messages
    await supabase.from("whatsapp_messages").insert({
      hcp_id: hcp_id ?? null,
      visit_id: visit_id ?? null,
      rep_id: u.user.id,
      phone: cleanPhone,
      message,
      direction: "out",
      status: "sent",
      provider: "wa_link"
    });

    return NextResponse.json({ ok: true, wa_url: waUrl });
  } catch (err: unknown) {
    const m = err instanceof Error ? err.message : "unknown_error";
    return NextResponse.json({ error: m }, { status: 500 });
  }
}
