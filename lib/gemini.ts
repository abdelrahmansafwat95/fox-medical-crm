// Google Gemini (Generative Language API) client for the CRM's AI features.
// Shared with the real estate CRM; swapped in for Anthropic, whose key was invalid. Configure GEMINI_API_KEY (and optionally GEMINI_MODEL).

const MODEL = process.env.GEMINI_MODEL || 'gemini-flash-latest'

interface CallOptions {
  maxTokens?: number
  json?: boolean
  temperature?: number
  /** Instructions that frame every answer (Anthropic's `system`). */
  system?: string
}

// Gemini's free tier regularly answers 503 "model is currently experiencing high
// demand" (seen in production 2026-09-27). Retry once, then fall back to the
// lighter model, which does not accept thinkingConfig.
const FALLBACK_MODEL = process.env.GEMINI_FALLBACK_MODEL || 'gemini-flash-lite-latest'
const busy = (status: number, message: string) =>
  status === 503 || status === 429 || /high demand|overloaded|try again later/i.test(message)

/**
 * Sends a single prompt to Gemini and returns the model's text.
 * Thinking is disabled — these CRM tasks are deterministic, so this keeps
 * responses fast, cheap, and predictable (no thinking tokens eating the budget).
 * Pass { json: true } to force a JSON response (response_mime_type).
 * Throws on missing key or API error (callers handle with their fallbacks).
 */
export async function callGemini(prompt: string, opts: CallOptions = {}): Promise<string> {
  const key = process.env.GEMINI_API_KEY
  if (!key) throw new Error('GEMINI_API_KEY is not set')

  const attempts: Array<{ model: string; thinking: boolean }> = [
    { model: MODEL, thinking: true },
    { model: MODEL, thinking: true },
    { model: FALLBACK_MODEL, thinking: false },
  ]
  let lastError = 'Gemini request failed'
  for (let i = 0; i < attempts.length; i++) {
    const { model, thinking } = attempts[i]
    const generationConfig: Record<string, unknown> = {
      maxOutputTokens: opts.maxTokens ?? 1500,
      temperature: opts.temperature ?? 0.7,
    }
    if (thinking) generationConfig.thinkingConfig = { thinkingBudget: 0 }
    if (opts.json) generationConfig.responseMimeType = 'application/json'

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          ...(opts.system ? { systemInstruction: { parts: [{ text: opts.system }] } } : {}),
          generationConfig,
        }),
      }
    )
    const data = await res.json().catch(() => ({}))
    if (res.ok) {
      // A reply can arrive split across several parts; reading only the first cut answers short.
      const parts: Array<{ text?: string }> = data?.candidates?.[0]?.content?.parts ?? []
      const text = parts.some(p => typeof p.text === 'string') ? parts.map(p => p.text ?? '').join('') : undefined
      if (typeof text !== 'string') throw new Error('Gemini returned no text')
      return text
    }
    lastError = data?.error?.message || `Gemini request failed (${res.status})`
    if (!busy(res.status, lastError)) break          // a real error: do not retry
    if (i === 0) await new Promise(r => setTimeout(r, 800))
  }
  throw new Error(lastError)
}
