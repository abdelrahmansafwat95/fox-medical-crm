"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Trophy, Medal, Award, Sparkles, Loader2 } from "lucide-react";

interface Performer {
  rep_id: string;
  full_name: string | null;
  product_line: string | null;
  completed_calls: number;
  verified_calls: number;
  unique_hcps: number;
  avg_quality: number;
  calls_attainment_pct: number | null;
  coverage_attainment_pct: number | null;
}

export default function LeaderboardPage() {
  const [reps, setReps] = useState<Performer[]>([]);
  const [loading, setLoading] = useState(true);
  const [coachingFor, setCoachingFor] = useState<string | null>(null);
  const [coachingText, setCoachingText] = useState<string>("");

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("rep_monthly_performance")
        .select("*")
        .order("completed_calls", { ascending: false });
      setReps((data ?? []) as Performer[]);
      setLoading(false);
    })();
  }, []);

  async function getCoaching(rep_id: string) {
    setCoachingFor(rep_id);
    setCoachingText("");
    const { data: sess } = await supabase.auth.getSession();
    const res = await fetch("/api/ai/coach-rep", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sess.session?.access_token}`
      },
      body: JSON.stringify({ rep_id, days: 30 })
    });
    const j = await res.json();
    if (j.ok) {
      setCoachingText(
        `${j.summary}\n\n` +
        `Strengths:\n${j.strengths.map((s: string) => `• ${s}`).join("\n")}\n\n` +
        `Areas to improve:\n${j.weaknesses.map((s: string) => `• ${s}`).join("\n")}\n\n` +
        `Recommended actions:\n${j.coaching_actions.map((s: string) => `• ${s}`).join("\n")}`
      );
    } else {
      setCoachingText("Failed to generate coaching: " + (j.error ?? "unknown"));
    }
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-2">
        <div className="p-2 rounded-lg bg-yellow-50 text-yellow-700">
          <Trophy className="w-6 h-6" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900">Leaderboard</h1>
      </div>
      <p className="text-slate-500 mb-4">
        Field force ranking by completed calls this month.
      </p>

      {loading ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12 text-center text-slate-500">
          Loading…
        </div>
      ) : reps.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12 text-center text-slate-500">
          No reps to rank yet.
        </div>
      ) : (
        <div className="space-y-2">
          {reps.map((r, i) => (
            <div
              key={r.rep_id}
              className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex items-center gap-4"
            >
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center font-bold shrink-0 ${
                  i === 0
                    ? "bg-yellow-100 text-yellow-700"
                    : i === 1
                    ? "bg-slate-200 text-slate-700"
                    : i === 2
                    ? "bg-amber-100 text-amber-700"
                    : "bg-slate-100 text-slate-500"
                }`}
              >
                {i === 0 ? <Trophy className="w-5 h-5" /> :
                 i === 1 ? <Medal className="w-5 h-5" /> :
                 i === 2 ? <Award className="w-5 h-5" /> :
                 i + 1}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-slate-900">
                  {r.full_name ?? "Unknown"}
                </div>
                <div className="text-xs text-slate-500">
                  {r.product_line ?? "—"} · {r.completed_calls} calls · {r.unique_hcps} HCPs
                  {r.calls_attainment_pct !== null && ` · ${r.calls_attainment_pct}% target`}
                </div>
              </div>
              <div className="text-right hidden sm:block">
                <div className="text-2xl font-bold text-slate-900">{r.completed_calls}</div>
                <div className="text-xs text-slate-500">calls</div>
              </div>
              <button
                onClick={() => getCoaching(r.rep_id)}
                disabled={coachingFor === r.rep_id && !coachingText}
                className="text-xs bg-brand-600 hover:bg-brand-700 disabled:bg-brand-400 text-white px-3 py-2 rounded-lg inline-flex items-center gap-1.5"
              >
                {coachingFor === r.rep_id && !coachingText ? (
                  <><Loader2 className="w-3 h-3 animate-spin" /> Coaching…</>
                ) : (
                  <><Sparkles className="w-3 h-3" /> AI Coach</>
                )}
              </button>
            </div>
          ))}
        </div>
      )}

      {coachingText && (
        <div className="mt-4 bg-blue-50 border border-blue-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-4 h-4 text-blue-700" />
            <span className="font-semibold text-blue-900">AI Coaching Insights</span>
            <button
              onClick={() => { setCoachingText(""); setCoachingFor(null); }}
              className="ml-auto text-xs text-blue-700 underline"
            >
              Close
            </button>
          </div>
          <pre className="whitespace-pre-wrap text-sm text-slate-800 font-sans">
            {coachingText}
          </pre>
        </div>
      )}
    </div>
  );
}
