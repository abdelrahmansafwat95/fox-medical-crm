import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * The door in front of every AI route. The routes used to accept any request
 * that merely said "Bearer …", so anyone could spend the Gemini key. Now the
 * session must be real, and each call takes one unit of the caller's daily
 * allowance (supabase/18: 25 for a demo visitor, 200 for staff).
 *
 * Returns the caller's Authorization header, or the response to send instead.
 */
export async function aiGuard(req: NextRequest, route: string): Promise<{ auth: string } | NextResponse> {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "missing_auth" }, { status: 401 });
  }
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: auth } }, auth: { persistSession: false } }
  );
  const { data: user } = await supabase.auth.getUser(auth.slice(7));
  if (!user?.user) return NextResponse.json({ error: "missing_auth" }, { status: 401 });

  const { data: ok, error } = await supabase.rpc("ai_quota_take");
  if (error) {
    console.error(`[ai/${route}] quota check failed:`, error.message);
    return NextResponse.json({ error: "The AI assistant is unavailable right now. Please try again in a few minutes." }, { status: 503 });
  }
  if (!ok) {
    return NextResponse.json(
      { error: "You have used today's AI allowance. It renews tomorrow." },
      { status: 429 }
    );
  }
  return { auth };
}
