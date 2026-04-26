import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

/**
 * POST /api/ai/optimize-route
 * Body: { hcp_ids: string[], start_lat?, start_lng? }
 * Returns the optimized visit order with reasoning.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = req.headers.get("authorization");
    if (!auth?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "missing_auth" }, { status: 401 });
    }

    const { hcp_ids, start_lat, start_lng } = await req.json();
    if (!Array.isArray(hcp_ids) || hcp_ids.length === 0) {
      return NextResponse.json({ error: "missing_hcp_ids" }, { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: { headers: { Authorization: auth } },
        auth: { persistSession: false }
      }
    );

    // Fetch HCPs with their primary workplace (institution) for coords
    const { data: hcps } = await supabase
      .from("hcps")
      .select(`
        id, full_name, segment, preferred_visit_time,
        hcp_workplaces!inner(
          institution_id,
          is_primary,
          institutions(name, latitude, longitude, district)
        )
      `)
      .in("id", hcp_ids);

    if (!hcps || hcps.length === 0) {
      return NextResponse.json({ error: "no_hcps_found" }, { status: 404 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "missing_anthropic_key" }, { status: 500 });
    const anthropic = new Anthropic({ apiKey });

    // Type the joined relations safely
    type WorkplaceRow = {
      institution_id: string;
      is_primary: boolean;
      institutions: { name: string; latitude: number; longitude: number; district: string | null };
    };

    const list = hcps.map((h) => {
      const wp = h.hcp_workplaces as unknown as WorkplaceRow[];
      const primary = wp.find((w) => w.is_primary) ?? wp[0];
      return {
        id: h.id,
        name: h.full_name,
        segment: h.segment,
        preferred_time: h.preferred_visit_time,
        institution: primary?.institutions?.name,
        district: primary?.institutions?.district,
        lat: primary?.institutions?.latitude,
        lng: primary?.institutions?.longitude
      };
    });

    const prompt = `You are a logistics expert for a Cairo-based pharma rep. Given today's HCP list, recommend the optimal visit order to minimize driving time and maximize productive doctor time.

${start_lat && start_lng ? `Rep starts day at: ${start_lat}, ${start_lng}` : "Starting location not provided."}

HCPs to visit today:
${list.map((h, i) =>
  `${i + 1}. ${h.name} (segment ${h.segment ?? "?"}) — ${h.institution} in ${h.district ?? "?"} [${h.lat}, ${h.lng}], preferred time: ${h.preferred_time ?? "any"}`
).join("\n")}

Constraints to consider:
- Cairo traffic worsens 7:30-10am and 3-7pm. Cluster nearby HCPs to avoid backtracking.
- Segment A and KOLs deserve longer visits (30 min+); B/C are quicker (15-20 min).
- Respect doctor preferred times when given.
- Aim to finish within 8 working hours.

Return ONLY a strict JSON object:
{
  "order": [<HCP id strings in optimal visit order>],
  "reasoning": "<2-4 sentences explaining the order>",
  "estimated_total_minutes": <integer>,
  "tips": ["<actionable tip 1>", "<tip 2>"]
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
      return NextResponse.json({ ok: true, hcps: list, ...parsed });
    } catch {
      return NextResponse.json({ error: "ai_parse_failed", raw }, { status: 500 });
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "unknown_error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
