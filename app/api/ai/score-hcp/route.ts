import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

/**
 * POST /api/ai/score-hcp
 * Body: { hcp_id }
 * Pulls the HCP + last 90 days of visits, asks Claude to recommend a segment.
 * Writes results back to hcps.ai_score, ai_segment_recommendation, ai_notes.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = req.headers.get("authorization");
    if (!auth?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "missing_auth" }, { status: 401 });
    }

    const { hcp_id } = await req.json();
    if (!hcp_id) return NextResponse.json({ error: "missing_hcp_id" }, { status: 400 });

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: { headers: { Authorization: auth } },
        auth: { persistSession: false }
      }
    );

    const { data: hcp, error: hcpErr } = await supabase
      .from("hcps")
      .select("id, full_name, specialty, sub_specialty, segment, decile, prescribing_potential, is_kol, notes")
      .eq("id", hcp_id)
      .single();
    if (hcpErr || !hcp) {
      return NextResponse.json({ error: hcpErr?.message ?? "hcp_not_found" }, { status: 404 });
    }

    // Recent visits for context
    const since = new Date(Date.now() - 90 * 24 * 3600_000).toISOString();
    const { data: visits } = await supabase
      .from("visits")
      .select("status, visit_type, doctor_attitude, products_detailed, ai_quality_score, check_in_at")
      .eq("hcp_id", hcp_id)
      .gte("check_in_at", since)
      .order("check_in_at", { ascending: false })
      .limit(20);

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "missing_anthropic_key" }, { status: 500 });
    const anthropic = new Anthropic({ apiKey });

    const prompt = `You are a pharma sales analytics expert. Analyze the following Healthcare Professional (HCP) and recent interaction history. Recommend a segment classification (A, B, C, D, or KOL) with reasoning.

HCP profile:
- Name: ${hcp.full_name}
- Specialty: ${hcp.specialty ?? "unknown"} / ${hcp.sub_specialty ?? "—"}
- Current segment: ${hcp.segment ?? "unsegmented"}
- Decile: ${hcp.decile ?? "—"}
- Prescribing potential (estimated monthly Rx volume): ${hcp.prescribing_potential ?? "unknown"}
- KOL flag: ${hcp.is_kol}
- Free-text notes: ${hcp.notes ?? "none"}

Last ${visits?.length ?? 0} visits in past 90 days:
${(visits ?? []).map((v, i) =>
  `${i + 1}. ${v.check_in_at?.slice(0, 10)} — type=${v.visit_type} status=${v.status} attitude=${v.doctor_attitude ?? "?"} quality=${v.ai_quality_score ?? "?"}`
).join("\n") || "No recent visits."}

Segment definitions:
- A: top prescribers (decile 9-10), highest commercial value, visit weekly
- B: solid prescribers (decile 6-8), visit bi-weekly
- C: occasional prescribers (decile 3-5), visit monthly
- D: minimal/no prescribing (decile 1-2), visit quarterly or de-prioritize
- KOL: Key Opinion Leader — board member, publishes, influences peers

Return ONLY a strict JSON object with no other text:
{
  "ai_score": <integer 1-10 priority>,
  "recommended_segment": "<A|B|C|D|KOL>",
  "reasoning": "<2-3 sentences explaining the recommendation>",
  "recommended_visit_frequency": "<weekly|bi-weekly|monthly|quarterly>",
  "next_action": "<one concrete suggestion for the rep>"
}`;

    const msg = await anthropic.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 700,
      messages: [{ role: "user", content: prompt }]
    });

    // Extract text content
    const textBlock = msg.content.find((b) => b.type === "text");
    const raw = textBlock && "text" in textBlock ? textBlock.text : "";

    // Parse JSON (strip code fences if present)
    const cleaned = raw.replace(/```json\s*|\s*```/g, "").trim();
    let parsed: {
      ai_score: number;
      recommended_segment: string;
      reasoning: string;
      recommended_visit_frequency?: string;
      next_action?: string;
    };
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return NextResponse.json({ error: "ai_parse_failed", raw }, { status: 500 });
    }

    // Persist back to hcps
    await supabase
      .from("hcps")
      .update({
        ai_score: parsed.ai_score,
        ai_segment_recommendation: parsed.recommended_segment,
        ai_notes: `${parsed.reasoning}\n\nFrequency: ${parsed.recommended_visit_frequency ?? "—"}\nNext action: ${parsed.next_action ?? "—"}`,
        ai_updated_at: new Date().toISOString()
      })
      .eq("id", hcp_id);

    return NextResponse.json({ ok: true, ...parsed });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "unknown_error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
