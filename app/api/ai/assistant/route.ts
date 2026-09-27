import { NextRequest, NextResponse } from "next/server";
import { aiUnavailable } from "@/lib/aiErrors";
import { aiGuard } from "@/lib/aiGuard";
import { callGemini } from "@/lib/gemini";

/**
 * POST /api/ai/assistant
 * Body: { mode, context, prompt }
 * mode: "email" | "whatsapp" | "pitch" | "objection" | "free"
 * Used by the in-app AI chat / writer.
 */
export async function POST(req: NextRequest) {
  try {
    const guard = await aiGuard(req, "assistant");
    if (guard instanceof NextResponse) return guard;

    const { mode, context, prompt, language = "en" } = await req.json();
    if (!prompt?.trim()) return NextResponse.json({ error: "missing_prompt" }, { status: 400 });

    if (!process.env.GEMINI_API_KEY) return aiUnavailable("assistant");

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

    const reply = await callGemini(userMsg, { maxTokens: 800, system: system });

    
    return NextResponse.json({ ok: true, reply });
  } catch (err: unknown) {
    return aiUnavailable("assistant", err);
  }
}
