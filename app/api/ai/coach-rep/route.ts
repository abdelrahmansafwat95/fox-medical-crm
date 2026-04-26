import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

/**
 * POST /api/ai/coach-rep
 * Body: { rep_id, days?: 30 }
 * Returns 3 strengths + 3 weaknesses + concrete coaching actions.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = req.headers.get("authorization");
    if (!auth?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "missing_auth" }, { status: 401 });
    }

    const { rep_id, days = 30 } = await req.json();
    if (!rep_id) return NextResponse.json({ error: "missing_rep_id" }, { status: 400 });

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: { headers: { Authorization: auth } },
        auth: { persistSession: false }
      }
    );

    const { data: rep } = await supabase
      .from("profiles")
      .select("full_name, role, product_line")
      .eq("id", rep_id)
      .single();

    if (!rep) return NextResponse.json({ error: "rep_not_found" }, { status: 404 });

    const since = new Date(Date.now() - days * 24 * 3600_000).toISOString();
    const { data: visits } = await supabase
      .from("visits")
      .select("status, visit_type, doctor_attitude, ai_quality_score, duration_minutes, check_in_within_geofence, check_in_at, manager_status")
      .eq("rep_id", rep_id)
      .gte("check_in_at", since);

    const stats = {
      total_visits: visits?.length ?? 0,
      completed: visits?.filter((v) => v.status === "completed").length ?? 0,
      flagged: visits?.filter((v) => v.manager_status === "flagged").length ?? 0,
      avg_duration: visits?.length
        ? Math.round(
            visits.reduce((s, v) => s + (v.duration_minutes ?? 0), 0) / visits.length
          )
        : 0,
      avg_quality: visits?.length
        ? Math.round(
            (visits.reduce((s, v) => s + (v.ai_quality_score ?? 0), 0) / visits.length) * 10
          ) / 10
        : 0,
      positive_attitudes: visits?.filter((v) => v.doctor_attitude === "positive").length ?? 0,
      outside_geofence: visits?.filter((v) => v.check_in_within_geofence === false).length ?? 0
    };

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "missing_anthropic_key" }, { status: 500 });
    const anthropic = new Anthropic({ apiKey });

    const prompt = `You are a senior pharma sales coach. Generate concise, actionable coaching feedback for a District Manager about one of their reps.

Rep: ${rep.full_name} — ${rep.role} ${rep.product_line ? "(" + rep.product_line + " line)" : ""}

Last ${days} days of activity:
- Total visits: ${stats.total_visits}
- Completed: ${stats.completed}
- Flagged by manager: ${stats.flagged}
- Avg visit duration: ${stats.avg_duration} min
- Avg AI quality score: ${stats.avg_quality}/10
- Positive doctor reactions: ${stats.positive_attitudes}
- Visits outside geofence: ${stats.outside_geofence}

Return ONLY a strict JSON object:
{
  "summary": "<1-2 sentence overall assessment>",
  "strengths": ["<strength 1>", "<strength 2>", "<strength 3>"],
  "weaknesses": ["<weakness 1>", "<weakness 2>", "<weakness 3>"],
  "coaching_actions": [
    "<concrete action the District Manager should take>",
    "<another concrete action>",
    "<another concrete action>"
  ],
  "risk_level": "<low|medium|high>"
}`;

    const msg = await anthropic.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 800,
      messages: [{ role: "user", content: prompt }]
    });

    const textBlock = msg.content.find((b) => b.type === "text");
    const raw = textBlock && "text" in textBlock ? textBlock.text : "";
    const cleaned = raw.replace(/```json\s*|\s*```/g, "").trim();

    try {
      const parsed = JSON.parse(cleaned);
      return NextResponse.json({ ok: true, stats, ...parsed });
    } catch {
      return NextResponse.json({ error: "ai_parse_failed", raw, stats }, { status: 500 });
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "unknown_error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
