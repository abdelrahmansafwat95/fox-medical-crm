"use client";

import { useState } from "react";
import { trustBadgeColor } from "@/lib/gpsTrust";
import { Shield, ChevronDown, ChevronUp } from "lucide-react";

interface TrustSignals {
  accuracy_suspicious?: boolean;
  accuracy_value?: number;
  coords_round_numbers?: boolean;
  coords_repeated?: boolean;
  identical_coord_count?: number;
  impossible_travel_speed_kmh?: number | null;
  ua_suspicious?: boolean;
  ua_string?: string | null;
}

interface Props {
  score: number | null;
  signals?: TrustSignals | null;
  /** Show a compact pill (default), or a full inline panel */
  variant?: "pill" | "panel";
}

/**
 * Visual indicator of how trustworthy a visit's GPS reading is.
 * Pass `variant="panel"` for the visit detail page, `"pill"` for inline use.
 */
export default function TrustBadge({ score, signals, variant = "pill" }: Props) {
  const [expanded, setExpanded] = useState(false);

  if (score === null || score === undefined) {
    if (variant === "pill") return null;
    return (
      <div className="rounded-lg p-3 bg-slate-50 border border-slate-200 text-sm text-slate-600">
        Trust score not yet calculated for this visit.
      </div>
    );
  }

  const badge = trustBadgeColor(score);

  // Build the list of red flags from the signals object
  const flags: string[] = [];
  if (signals) {
    if (signals.accuracy_suspicious) {
      flags.push(
        signals.accuracy_value === 0
          ? "GPS accuracy reported as 0m (typical of fake-GPS apps)"
          : `Suspiciously perfect accuracy (${signals.accuracy_value?.toFixed(1)}m)`
      );
    }
    if (signals.coords_round_numbers) {
      flags.push("Coordinates are perfectly round numbers (DevTools or preset)");
    }
    if (signals.coords_repeated && (signals.identical_coord_count ?? 0) >= 2) {
      flags.push(
        `Same exact coordinates seen ${signals.identical_coord_count} times in last 30 days (real GPS jitters every reading)`
      );
    }
    if ((signals.impossible_travel_speed_kmh ?? 0) > 120) {
      flags.push(
        `Impossible travel: ${signals.impossible_travel_speed_kmh!.toFixed(0)} km/h since last visit today`
      );
    }
    if (signals.ua_suspicious) {
      flags.push("Browser fingerprint suggests automation or emulator");
    }
  }

  if (variant === "pill") {
    return (
      <span
        className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full ${badge.cls}`}
        title={badge.label + (flags.length ? ` — ${flags.join("; ")}` : "")}
      >
        <Shield className="w-3 h-3" />
        Trust: {score}
      </span>
    );
  }

  // PANEL VARIANT
  return (
    <div className={`rounded-lg p-3 border text-sm ${badge.cls.replace("text-", "border-").replace("bg-", "bg-").replace("-100", "-200")}`}>
      <div className="flex items-center gap-2">
        <Shield className="w-4 h-4" />
        <span className="font-semibold">
          GPS Trust: {score}/100 — {badge.label}
        </span>
        {flags.length > 0 && (
          <button
            onClick={() => setExpanded((e) => !e)}
            className="ml-auto text-xs underline opacity-80 hover:opacity-100 inline-flex items-center gap-1"
          >
            {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            {flags.length} flag{flags.length === 1 ? "" : "s"}
          </button>
        )}
      </div>
      {expanded && flags.length > 0 && (
        <ul className="mt-2 space-y-1 text-xs opacity-90">
          {flags.map((f, i) => (
            <li key={i} className="flex items-start gap-1.5">
              <span>•</span>
              <span>{f}</span>
            </li>
          ))}
        </ul>
      )}
      {flags.length === 0 && score >= 80 && (
        <p className="mt-1 text-xs opacity-80">
          All GPS signals look healthy. ✓
        </p>
      )}
    </div>
  );
}
