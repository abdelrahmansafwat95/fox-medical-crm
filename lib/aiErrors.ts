import { NextResponse } from "next/server";

/**
 * What a customer sees when an AI feature cannot run: a plain sentence, never a
 * provider error. The AI routes used to return err.message straight to the
 * screen, e.g. "Error: 401 … API key is invalid." The real cause goes to the
 * server log instead.
 */
export const AI_UNAVAILABLE =
  "The AI assistant is unavailable right now. Please try again in a few minutes.";

export function aiUnavailable(route: string, err?: unknown) {
  if (err !== undefined) console.error(`[ai/${route}]`, err instanceof Error ? err.message : err);
  else console.error(`[ai/${route}] GEMINI_API_KEY is not set`);
  return NextResponse.json({ error: AI_UNAVAILABLE }, { status: 503 });
}
