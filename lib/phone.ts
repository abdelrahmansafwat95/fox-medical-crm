/** Normalize a phone number to a consistent, wa.me/tel-friendly form.
 *  Egyptian-aware: local mobiles (01xxxxxxxxx) become +20xxxxxxxxxx. Falls back
 *  to a best-effort international shape. Returns null for empty input. */
export function normalizePhone(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const hadPlus = s.startsWith("+");
  const digits = s.replace(/\D/g, "");
  if (!digits) return null;
  if (hadPlus) return "+" + digits;
  if (digits.startsWith("00")) return "+" + digits.slice(2);
  if (digits.startsWith("0") && digits.length === 11) return "+20" + digits.slice(1); // EG mobile
  if (digits.startsWith("20")) return "+" + digits;
  return "+" + digits;
}

/** Loose validity check for a normalized number (8–15 digits). */
export function isPlausiblePhone(value: string | null): boolean {
  if (!value) return true; // empty is allowed (optional fields)
  const d = value.replace(/\D/g, "");
  return d.length >= 8 && d.length <= 15;
}
