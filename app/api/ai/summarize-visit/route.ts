import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

/**
 * POST /api/ai/summarize-visit
 * Body: { visit_id, raw_notes: "rough text or voice transcript" }
 * Asks Claude to extract structured fields, writes them back to visits.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = req.headers.get("authorization");
    if (!auth?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "missing_auth" }, { status: 401 });
    }

    const { visit_id, raw_notes } = await req.json();
    if (!visit_id || !raw_notes?.trim()) {
      return NextResponse.json({ error: "missing_payload" }, { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: { headers: { Authorization: auth } },
        auth: { persistSession: false }
      }
    );

    // Pull visit context (HCP, products) so AI has grounding
    const { data: visit } = await supabase
      .from("visits")
      .select("id, hcp_id, products_detailed, hcps(full_name, specialty)")
      .eq("id", visit_id)
      .single();

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "missing_anthropic_key" }, { status: 500 });
    const anthropic = new Anthropic({ apiKey });

    // Type the joined hcps relation safely
    const hcpRel = visit?.hcps as { full_name?: string; specialty?: string } | undefined;

    const prompt = `You are a pharma compliance officer turning a medical rep's rough visit notes into a structured Daily Call Report (DCR).

Doctor: ${hcpRel?.full_name ?? "Unknown"} (${hcpRel?.specialty ?? "Unknown specialty"})

Rep's raw notes:
"""
${raw_notes}
"""

Extract and return ONLY a strict JSON object. Use null when something isn't mentioned. Keep all text concise and professional.

{
  "summary": "<2-4 sentence overview>",
  "doctor_attitude": "<positive|neutral|skeptical|rejecting|null>",
  "doctor_feedback": "<paraphrased verbatim, 1-2 sentences|null>",
  "objections": "<concerns the doctor raised|null>",
  "key_message_delivered": "<the rep's main message|null>",
  "next_action": "<concrete follow-up|null>",
  "next_visit_date": "<YYYY-MM-DD if mentioned|null>",
  "quality_score": <integer 1-10 — visit quality>,
  "coaching_notes": "<2-3 specific, actionable coaching tips for this rep>"
}`;

    const msg = await anthropic.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 900,
      messages: [{ role: "user", content: prompt }]
    });

    const textBlock = msg.content.find((b) => b.type === "text");
    const raw = textBlock && "text" in textBlock ? textBlock.text : "";
    const cleaned = raw.replace(/```json\s*|\s*```/g, "").trim();
    let parsed: {
      summary: string;
      doctor_attitude: string | null;
      doctor_feedback: string | null;
      objections: string | null;
      key_message_delivered: string | null;
      next_action: string | null;
      next_visit_date: string | null;
      quality_score: number;
      coaching_notes: string;
    };
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return NextResponse.json({ error: "ai_parse_failed", raw }, { status: 500 });
    }

    await supabase
      .from("visits")
      .update({
        ai_summary: parsed.summary,
        doctor_attitude: parsed.doctor_attitude,
        doctor_feedback: parsed.doctor_feedback,
        objections: parsed.objections,
        key_message_delivered: parsed.key_message_delivered,
        next_action: parsed.next_action,
        next_visit_date: parsed.next_visit_date,
        ai_quality_score: parsed.quality_score,
        ai_coaching_notes: parsed.coaching_notes,
        ai_updated_at: new Date().toISOString()
      })
      .eq("id", visit_id);

    return NextResponse.json({ ok: true, ...parsed });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "unknown_error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
