import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

/**
 * POST /api/ai/assistant
 * Body: { mode, context, prompt }
 * mode: "email" | "whatsapp" | "pitch" | "objection" | "free"
 * Used by the in-app AI chat / writer.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = req.headers.get("authorization");
    if (!auth?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "missing_auth" }, { status: 401 });
    }

    const { mode, context, prompt, language = "en" } = await req.json();
    if (!prompt?.trim()) return NextResponse.json({ error: "missing_prompt" }, { status: 400 });

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "missing_anthropic_key" }, { status: 500 });
    const anthropic = new Anthropic({ apiKey });

    const systemByMode: Record<string, string> = {
      email:
        "You are an expert pharma medical rep. Write a professional, concise email (max 150 words) appropriate for healthcare professionals. Match the language requested. Keep regulatory tone — no exaggerated claims.",
      whatsapp:
        "You are a pharma medical rep. Write a short, polite WhatsApp message (max 60 words) suitable for sending to a doctor. Use 1-2 emojis max. Match the language requested.",
      pitch:
        "You are an expert pharma sales coach. Write a focused 60-second product detailing pitch with: (1) opening hook, (2) key differentiator, (3) clinical evidence, (4) call to action. Use the doctor's specialty to tailor it.",
      objection:
        "You are an expert pharma sales coach. Help the rep handle a doctor's objection. Provide: (1) acknowledgment of the concern, (2) reframe with evidence, (3) suggested closing question.",
      free:
        "You are FoxBot, an AI assistant for pharma sales reps. Be concise, practical, and actionable. Reference Egyptian/MENA market context when relevant."
    };

    const system = systemByMode[mode] ?? systemByMode.free;

    const userMsg = `${context ? `Context:\n${context}\n\n` : ""}Task / question:\n${prompt}\n\nLanguage: ${language === "ar" ? "Arabic" : "English"}`;

    const msg = await anthropic.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 800,
      system,
      messages: [{ role: "user", content: userMsg }]
    });

    const textBlock = msg.content.find((b) => b.type === "text");
    const reply = textBlock && "text" in textBlock ? textBlock.text : "";

    return NextResponse.json({ ok: true, reply });
  } catch (err: unknown) {
    const m = err instanceof Error ? err.message : "unknown_error";
    return NextResponse.json({ error: m }, { status: 500 });
  }
}
