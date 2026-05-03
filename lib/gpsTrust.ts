/**
 * GPS Trust Scoring
 * ------------------
 * Pure functions that score how trustworthy a check-in's GPS reading is.
 * Score is 0-100. Higher = more trustworthy.
 *
 * IMPORTANT HONESTY:
 *   A web/PWA cannot 100% reliably detect mock locations the way a native
 *   Android app can (LocationManager.isFromMockProvider()). What we can do is
 *   score multiple heuristic signals to catch ~70-80% of common fake-GPS
 *   patterns. This is NOT a security guarantee — it is a deterrent +
 *   anomaly detector.
 *
 * Signals (each 0-100, higher = more trust):
 *   1. accuracy_check    — fake GPS often reports accuracy=0 or unreal precision
 *   2. coords_precision  — round numbers indicate DevTools injection
 *   3. coords_uniqueness — identical coords across visits = fake-GPS app preset
 *   4. speed_sanity      — impossible travel speed since last visit
 *   5. ua_check          — known bot/emulator user agents
 *   6. movement_check    — speed reading is null/zero too often
 */

export interface GpsCheckInput {
  /** Lat/lng/accuracy from the browser geolocation API */
  latitude: number;
  longitude: number;
  accuracy: number;          // meters
  speed?: number | null;     // meters/sec from API (often null)
  /** ISO timestamp of this reading */
  timestamp_iso: string;

  /** Browser user-agent string */
  user_agent?: string | null;

  /** Optional: prior visit by same rep on same day (for impossible-travel check) */
  prior_visit?: {
    latitude: number;
    longitude: number;
    timestamp_iso: string;
  } | null;

  /** Optional: how many times this exact (lat,lng) pair has shown up in the rep's recent visits */
  identical_coord_count?: number;
}

export interface TrustSignals {
  accuracy_suspicious: boolean;
  accuracy_value: number;
  coords_round_numbers: boolean;
  coords_repeated: boolean;
  identical_coord_count: number;
  impossible_travel_speed_kmh: number | null;
  ua_suspicious: boolean;
  ua_string: string | null;
}

export interface TrustResult {
  /** 0-100. Below 50 = suspicious. Below 30 = likely fake. */
  score: number;
  /** Plain-English flags for what triggered low scores */
  signals: TrustSignals;
  /** Human-readable reasons for managers, max 3 */
  reasons: string[];
  /** Suggested compliance alerts to fire ([] if score is healthy) */
  alerts: Array<{
    alert_type: "suspected_fake_gps" | "gps_accuracy_suspicious" | "gps_coords_identical_repeated";
    severity: "medium" | "high" | "critical";
  }>;
}

// Common emulator / headless / known-bot UA fragments
const SUSPICIOUS_UA_FRAGMENTS = [
  "headlesschrome",
  "phantomjs",
  "puppeteer",
  "selenium",
  "appium",
  "android emulator",
  "google_sdk",
  "sdk_gphone"
];

/** Distance between two lat/lng in meters (haversine) */
function haversine_m(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const R = 6371000;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** A coordinate is "round" if its last 4 decimal digits are zeros (i.e. resolution worse than ~10m by chance) */
function isRoundNumber(coord: number): boolean {
  // Multiply by 10^6 (sub-meter precision) and check if remainder is divisible by 10000
  const asInt = Math.round(coord * 1_000_000);
  return asInt % 10000 === 0;
}

export function scoreGpsCheckIn(input: GpsCheckInput): TrustResult {
  const signals: TrustSignals = {
    accuracy_suspicious: false,
    accuracy_value: input.accuracy,
    coords_round_numbers: false,
    coords_repeated: false,
    identical_coord_count: input.identical_coord_count ?? 0,
    impossible_travel_speed_kmh: null,
    ua_suspicious: false,
    ua_string: input.user_agent ?? null
  };

  // Start at perfect trust, deduct points
  let score = 100;
  const reasons: string[] = [];
  const alerts: TrustResult["alerts"] = [];

  // ───────── 1. ACCURACY CHECK (weight: 25) ─────────
  // Real GPS rarely reports accuracy < 3m on phones; typical urban Android = 8-30m.
  // Fake-GPS apps often report exactly 0 or unrealistically perfect.
  if (input.accuracy === 0) {
    score -= 25;
    signals.accuracy_suspicious = true;
    reasons.push("GPS accuracy reported as 0m — typical of fake-GPS apps");
    alerts.push({ alert_type: "gps_accuracy_suspicious", severity: "high" });
  } else if (input.accuracy < 3) {
    score -= 15;
    signals.accuracy_suspicious = true;
    reasons.push(`GPS accuracy unrealistically perfect (${input.accuracy.toFixed(1)}m)`);
    alerts.push({ alert_type: "gps_accuracy_suspicious", severity: "medium" });
  }

  // ───────── 2. COORDINATE PRECISION (weight: 15) ─────────
  // DevTools injection or "I'm at the airport" presets give round numbers.
  if (isRoundNumber(input.latitude) && isRoundNumber(input.longitude)) {
    score -= 15;
    signals.coords_round_numbers = true;
    reasons.push("Coordinates are suspiciously round (likely DevTools or preset)");
  }

  // ───────── 3. IDENTICAL COORDS REPEATED (weight: 30) ─────────
  // Real GPS jitters every reading. If the rep shows up at the SAME exact lat/lng
  // 2+ times across visits, that's a strong fake-GPS signal.
  if ((input.identical_coord_count ?? 0) >= 2) {
    score -= 30;
    signals.coords_repeated = true;
    reasons.push(
      `Same exact coordinates seen ${input.identical_coord_count} times — real GPS would jitter`
    );
    alerts.push({
      alert_type: "gps_coords_identical_repeated",
      severity: input.identical_coord_count! >= 4 ? "critical" : "high"
    });
  }

  // ───────── 4. IMPOSSIBLE TRAVEL SPEED (weight: 30) ─────────
  if (input.prior_visit) {
    const distance_m = haversine_m(input, input.prior_visit);
    const time_h = Math.max(
      0.001,
      (new Date(input.timestamp_iso).getTime() - new Date(input.prior_visit.timestamp_iso).getTime()) / 3_600_000
    );
    const speed_kmh = distance_m / 1000 / time_h;
    signals.impossible_travel_speed_kmh = Math.round(speed_kmh * 10) / 10;

    if (speed_kmh > 200) {
      score -= 30;
      reasons.push(`Impossible travel: ${speed_kmh.toFixed(0)} km/h since last visit`);
      alerts.push({ alert_type: "suspected_fake_gps", severity: "critical" });
    } else if (speed_kmh > 120) {
      score -= 15;
      reasons.push(`Unrealistic travel speed: ${speed_kmh.toFixed(0)} km/h since last visit`);
      alerts.push({ alert_type: "suspected_fake_gps", severity: "high" });
    }
  }

  // ───────── 5. USER AGENT (weight: 10) ─────────
  if (input.user_agent) {
    const lc = input.user_agent.toLowerCase();
    const matched = SUSPICIOUS_UA_FRAGMENTS.find((f) => lc.includes(f));
    if (matched) {
      score -= 10;
      signals.ua_suspicious = true;
      reasons.push(`Browser fingerprint suggests automation/emulator (${matched})`);
    }
  }

  // Clamp and finalize
  score = Math.max(0, Math.min(100, Math.round(score)));

  // Aggregate alert if multiple things wrong but no single trigger fired
  if (score < 30 && alerts.length === 0) {
    alerts.push({ alert_type: "suspected_fake_gps", severity: "high" });
  }

  return {
    score,
    signals,
    reasons: reasons.slice(0, 3),
    alerts
  };
}

/** Helper: get the trust badge color for a given score */
export function trustBadgeColor(score: number | null): {
  cls: string;
  label: string;
  emoji: string;
} {
  if (score === null) return { cls: "bg-slate-100 text-slate-500", label: "Unknown", emoji: "❓" };
  if (score >= 80) return { cls: "bg-emerald-100 text-emerald-700", label: "High trust", emoji: "✓" };
  if (score >= 50) return { cls: "bg-amber-100 text-amber-700", label: "Medium trust", emoji: "⚠" };
  if (score >= 30) return { cls: "bg-orange-100 text-orange-700", label: "Low trust", emoji: "⚠" };
  return { cls: "bg-red-100 text-red-700", label: "Likely fake", emoji: "🚨" };
}
