"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { scoreGpsCheckIn, trustBadgeColor } from "@/lib/gpsTrust";
import {
  ArrowLeft,
  Shield,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Play,
  Bug,
  Lock
} from "lucide-react";

interface HCPOption {
  id: string;
  full_name: string;
  hcp_workplaces: { institution_id: string; is_primary: boolean }[] | null;
}

interface InstitutionOption {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  geofence_radius_m: number;
}

// =====================================================================
// FAKE PATTERNS — each one triggers a specific detection signal
// =====================================================================

interface FakePattern {
  id: string;
  label: string;
  description: string;
  expectedScore: string;
  expectedFlags: string[];
  /** Returns lat/lng/accuracy adjusted from a real institution */
  generate: (inst: InstitutionOption) => {
    lat: number;
    lng: number;
    accuracy: number;
    user_agent_override?: string;
    note: string;
  };
}

const PATTERNS: FakePattern[] = [
  {
    id: "perfect_clone",
    label: "📍 Fake-GPS app — exact preset coordinate",
    description:
      "Mimics the most common Egyptian rep cheat: open a fake-GPS Android app, paste the clinic's exact coordinates, hit set. Accuracy reports as 0m, lat/lng to 4 decimals.",
    expectedScore: "30-45/100",
    expectedFlags: [
      "Suspiciously perfect accuracy (0m)",
      "Coordinates are perfectly round (DevTools or preset)"
    ],
    generate: (inst) => ({
      // Round to 4 decimal places — typical "I copy-pasted from Google Maps"
      lat: Math.round(inst.latitude * 10000) / 10000,
      lng: Math.round(inst.longitude * 10000) / 10000,
      accuracy: 0,
      note: "Exact preset coords + accuracy 0m — classic fake-GPS app signature"
    })
  },
  {
    id: "devtools_inject",
    label: "🛠️ Browser DevTools injection",
    description:
      "What a tech-savvy rep would do: Chrome DevTools → Sensors tab → set custom location. Coords have round trailing zeros, no real GPS noise.",
    expectedScore: "55-75/100",
    expectedFlags: [
      "Coordinates are perfectly round numbers",
      "Suspiciously perfect accuracy"
    ],
    generate: (inst) => ({
      // Whole-degree precision approximation
      lat: Math.round(inst.latitude * 100) / 100,
      lng: Math.round(inst.longitude * 100) / 100,
      accuracy: 1, // DevTools default
      note: "Whole-number coords + 1m accuracy — DevTools sensor pattern"
    })
  },
  {
    id: "teleport",
    label: "✈️ Impossible travel speed",
    description:
      "Rep checks in at clinic A, then 3 minutes later at clinic B 50km away. No human can travel that fast in Cairo traffic.",
    expectedScore: "0-30/100",
    expectedFlags: [
      "Impossible travel: 1000+ km/h since last visit",
      "Multiple weak signals together"
    ],
    generate: (inst) => ({
      // 0.5° offset = roughly 50 km in Cairo
      lat: inst.latitude + 0.5,
      lng: inst.longitude + 0.3,
      accuracy: 12, // Realistic accuracy
      note: "Lat/lng ~50km from where they 'just' checked in 3 minutes ago"
    })
  },
  {
    id: "bot_browser",
    label: "🤖 Headless / emulator browser",
    description:
      "Some reps run a script that submits check-ins automatically from a desktop browser at home, using Puppeteer or Selenium.",
    expectedScore: "40-60/100",
    expectedFlags: [
      "Browser fingerprint suggests automation/emulator",
      "Suspiciously perfect accuracy"
    ],
    generate: (inst) => ({
      lat: inst.latitude,
      lng: inst.longitude,
      accuracy: 0,
      user_agent_override:
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/120.0.0.0 Safari/537.36",
      note: "Real coords + accuracy 0 + HeadlessChrome user-agent"
    })
  },
  {
    id: "honest",
    label: "✅ Honest check-in (control)",
    description:
      "Real rep, real phone, real GPS noise. This should pass with a high trust score. Use this as your 'baseline' before showing the cheating patterns.",
    expectedScore: "85-100/100",
    expectedFlags: ["No flags — clean check-in ✓"],
    generate: (inst) => ({
      // Add realistic GPS jitter (~5m in lat, ~5m in lng)
      lat: inst.latitude + (Math.random() - 0.5) * 0.0001,
      lng: inst.longitude + (Math.random() - 0.5) * 0.0001,
      accuracy: 8 + Math.random() * 12, // 8-20m, realistic urban
      note: "Realistic GPS jitter + accuracy 8-20m"
    })
  }
];

// =====================================================================

interface RunResult {
  patternId: string;
  patternLabel: string;
  score: number;
  signals: ReturnType<typeof scoreGpsCheckIn>["signals"];
  reasons: string[];
  alerts: ReturnType<typeof scoreGpsCheckIn>["alerts"];
  inputUsed: { lat: number; lng: number; accuracy: number; ua: string };
}

export default function TestFakeCheckinPage() {
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [hcps, setHcps] = useState<HCPOption[]>([]);
  const [institutions, setInstitutions] = useState<Record<string, InstitutionOption>>({});
  const [selectedHcpId, setSelectedHcpId] = useState<string>("");
  const [selectedPatternId, setSelectedPatternId] = useState<string>("perfect_clone");
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<RunResult[]>([]);

  // ─── Auth check on mount: only admin/manager roles allowed ─────────
  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) {
        setAuthorized(false);
        return;
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", u.user.id)
        .single();
      const allowed = ["admin", "country_manager", "sales_director", "regional_manager", "district_manager"].includes(
        profile?.role ?? ""
      );
      setAuthorized(allowed);

      if (allowed) {
        // Load HCPs + their primary institutions
        const [hcpsRes, instsRes] = await Promise.all([
          supabase
            .from("hcps")
            .select("id, full_name, hcp_workplaces(institution_id, is_primary)")
            .eq("is_active", true)
            .order("full_name")
            .limit(100),
          supabase
            .from("institutions")
            .select("id, name, latitude, longitude, geofence_radius_m")
            .eq("is_active", true)
            .limit(200)
        ]);
        setHcps((hcpsRes.data ?? []) as HCPOption[]);
        const instMap: Record<string, InstitutionOption> = {};
        (instsRes.data ?? []).forEach((i: InstitutionOption) => {
          instMap[i.id] = i;
        });
        setInstitutions(instMap);
        if (hcpsRes.data && hcpsRes.data.length > 0) {
          setSelectedHcpId(hcpsRes.data[0].id);
        }
      }
    })();
  }, []);

  function getHcpInstitution(hcpId: string): InstitutionOption | null {
    const hcp = hcps.find((h) => h.id === hcpId);
    if (!hcp) return null;
    const primary = hcp.hcp_workplaces?.find((w) => w.is_primary) ?? hcp.hcp_workplaces?.[0];
    return primary ? institutions[primary.institution_id] ?? null : null;
  }

  async function runTest() {
    const hcp = hcps.find((h) => h.id === selectedHcpId);
    const inst = getHcpInstitution(selectedHcpId);
    const pattern = PATTERNS.find((p) => p.id === selectedPatternId);
    if (!hcp || !inst || !pattern) {
      alert("Pick an HCP and a pattern first.");
      return;
    }

    setRunning(true);

    // Generate fake input
    const input = pattern.generate(inst);
    const ua = input.user_agent_override ?? navigator.userAgent;

    // ───────── SCORE IT (client-side only — same logic as the API) ─────
    // We score it locally without actually calling /api/tracking/check-in
    // because we DON'T want to create real visit rows during a demo.

    // Get the rep's prior visit today (if any) and identical-coord count
    // Simulating these with simplified queries:
    let identical_coord_count = 0;
    const lat_key = Math.round(input.lat * 1_000_000) / 1_000_000;
    const lng_key = Math.round(input.lng * 1_000_000) / 1_000_000;
    const { count } = await supabase
      .from("visits")
      .select("id", { count: "exact", head: true })
      .gte("check_in_at", new Date(Date.now() - 30 * 86_400_000).toISOString())
      .eq("check_in_lat", lat_key)
      .eq("check_in_lng", lng_key);
    identical_coord_count = count ?? 0;

    // For the teleport pattern, simulate a prior visit 3 minutes ago at the institution
    const priorVisit =
      pattern.id === "teleport"
        ? {
            latitude: inst.latitude,
            longitude: inst.longitude,
            timestamp_iso: new Date(Date.now() - 3 * 60_000).toISOString()
          }
        : null;

    const trust = scoreGpsCheckIn({
      latitude: input.lat,
      longitude: input.lng,
      accuracy: input.accuracy,
      timestamp_iso: new Date().toISOString(),
      user_agent: ua,
      prior_visit: priorVisit,
      identical_coord_count
    });

    const result: RunResult = {
      patternId: pattern.id,
      patternLabel: pattern.label,
      score: trust.score,
      signals: trust.signals,
      reasons: trust.reasons,
      alerts: trust.alerts,
      inputUsed: { lat: input.lat, lng: input.lng, accuracy: input.accuracy, ua }
    };
    setResults((prev) => [result, ...prev]);
    setRunning(false);
  }

  // ─── Render ───────────────────────────────────────────────────────

  if (authorized === null) {
    return (
      <div className="max-w-md mx-auto p-12 text-center text-slate-500">
        <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
        Checking permissions…
      </div>
    );
  }

  if (!authorized) {
    return (
      <div className="max-w-md mx-auto p-8">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
          <Lock className="w-10 h-10 mx-auto text-red-600 mb-2" />
          <h2 className="font-bold text-red-900">Access denied</h2>
          <p className="text-sm text-red-700 mt-1">
            This admin tool is only available to managers and admins.
          </p>
        </div>
      </div>
    );
  }

  const selectedPattern = PATTERNS.find((p) => p.id === selectedPatternId);
  const selectedInst = getHcpInstitution(selectedHcpId);

  return (
    <div className="max-w-4xl mx-auto pb-24">
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-3"
      >
        <ArrowLeft className="w-4 h-4" /> Back to dashboard
      </Link>

      {/* Header */}
      <div className="bg-gradient-to-br from-purple-50 to-pink-50 border border-purple-200 rounded-xl p-5 mb-4">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-white shadow-sm">
            <Bug className="w-6 h-6 text-purple-700" />
          </div>
          <div>
            <h1 className="font-bold text-slate-900 text-lg">Fake Check-in Tester</h1>
            <p className="text-sm text-slate-700 mt-1">
              Demo tool for managers. Simulates the most common rep cheating patterns and shows how
              the trust scoring system catches each one. <strong>No real visits are created.</strong>
            </p>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 mb-4 space-y-4">
        {/* HCP picker */}
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">Pick an HCP to fake-visit</label>
          <select
            value={selectedHcpId}
            onChange={(e) => setSelectedHcpId(e.target.value)}
            className="w-full p-2.5 border border-slate-300 rounded-lg text-sm"
          >
            {hcps.map((h) => (
              <option key={h.id} value={h.id}>
                {h.full_name}
              </option>
            ))}
          </select>
          {selectedInst && (
            <p className="text-[11px] text-slate-500 mt-1">
              Institution: {selectedInst.name} · ({selectedInst.latitude.toFixed(4)},{" "}
              {selectedInst.longitude.toFixed(4)})
            </p>
          )}
        </div>

        {/* Pattern picker */}
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-2">
            Pick a cheating pattern
          </label>
          <div className="space-y-2">
            {PATTERNS.map((p) => (
              <label
                key={p.id}
                className={`block border rounded-lg p-3 cursor-pointer transition ${
                  selectedPatternId === p.id
                    ? "bg-purple-50 border-purple-400 shadow-sm"
                    : "bg-white border-slate-200 hover:border-slate-300"
                }`}
              >
                <input
                  type="radio"
                  name="pattern"
                  value={p.id}
                  checked={selectedPatternId === p.id}
                  onChange={() => setSelectedPatternId(p.id)}
                  className="sr-only"
                />
                <div className="flex items-start justify-between gap-2">
                  <span className="font-medium text-slate-900 text-sm">{p.label}</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 shrink-0">
                    Expected: {p.expectedScore}
                  </span>
                </div>
                <p className="text-xs text-slate-600 mt-1">{p.description}</p>
              </label>
            ))}
          </div>
        </div>

        {/* Run button */}
        <button
          onClick={runTest}
          disabled={running || !selectedInst}
          className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-purple-300 text-white font-bold py-3 rounded-lg inline-flex items-center justify-center gap-2"
        >
          {running ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" /> Running detection…
            </>
          ) : (
            <>
              <Play className="w-4 h-4" /> Simulate this fake check-in
            </>
          )}
        </button>

        {!selectedInst && (
          <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
            ⚠️ Selected HCP has no primary institution. Pick a different HCP.
          </div>
        )}
      </div>

      {/* Results */}
      {results.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">
            Detection results ({results.length})
          </h2>
          {results.map((r, i) => (
            <ResultCard key={i} result={r} />
          ))}
          {results.length > 0 && (
            <button
              onClick={() => setResults([])}
              className="text-xs text-slate-500 underline"
            >
              Clear results
            </button>
          )}
        </div>
      )}

      {/* Demo script footer */}
      <div className="mt-6 bg-slate-50 border border-slate-200 rounded-xl p-4">
        <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-2">
          📺 Recommended demo flow
        </h3>
        <ol className="text-xs text-slate-700 space-y-1 list-decimal list-inside">
          <li>Run the <strong>Honest check-in (control)</strong> first → high trust score</li>
          <li>Run <strong>Fake-GPS preset</strong> → score drops to ~30, flags trigger</li>
          <li>Run <strong>Impossible travel</strong> → score &lt;30, critical alert</li>
          <li>
            Run the same fake-GPS pattern 2-3 times → identical-coords detection kicks in,
            score crashes
          </li>
          <li>Then open the Approval Inbox → show the auto-flagged visits + compliance alerts</li>
        </ol>
      </div>
    </div>
  );
}

// ─── Result card ─────────────────────────────────────────────────────

function ResultCard({ result }: { result: RunResult }) {
  const badge = trustBadgeColor(result.score);
  return (
    <div className="bg-white rounded-xl border-2 border-slate-200 shadow-sm overflow-hidden">
      <div className={`p-4 ${badge.cls.replace("text-", "border-l-4 border-")}`}>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="text-xs text-slate-500">{result.patternLabel}</div>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-3xl font-bold text-slate-900">{result.score}</span>
              <span className="text-sm text-slate-500">/100</span>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${badge.cls} ml-2`}>
                {badge.emoji} {badge.label}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {result.alerts.length > 0 ? (
              <span className="text-xs font-bold px-2 py-1 rounded bg-red-100 text-red-700 inline-flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                {result.alerts.length} alert{result.alerts.length === 1 ? "" : "s"} would fire
              </span>
            ) : (
              <span className="text-xs font-bold px-2 py-1 rounded bg-emerald-100 text-emerald-700 inline-flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" />
                Healthy — no alerts
              </span>
            )}
          </div>
        </div>
      </div>

      {result.reasons.length > 0 && (
        <div className="px-4 py-3 border-t border-slate-100 bg-slate-50">
          <div className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1.5">
            Why it scored low
          </div>
          <ul className="text-xs text-slate-700 space-y-1">
            {result.reasons.map((r, i) => (
              <li key={i} className="flex items-start gap-1.5">
                <Shield className="w-3 h-3 mt-0.5 text-amber-600 shrink-0" />
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="px-4 py-2 border-t border-slate-100 text-[10px] font-mono text-slate-500">
        Input: lat={result.inputUsed.lat.toFixed(6)}, lng={result.inputUsed.lng.toFixed(6)}, acc=
        {result.inputUsed.accuracy.toFixed(1)}m
      </div>
    </div>
  );
}
