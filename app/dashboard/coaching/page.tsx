"use client";

// Field coaching. A manager spends a day with a rep, rates seven call skills
// (1–5) and writes strengths, what to improve and an action plan. The rep reads
// it and acknowledges it. Managers see each rep's average per skill, so the
// weakest skill across the team is obvious. RLS scopes every query
// (supabase/24-coaching.sql).

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { exportToExcel } from "@/lib/export";
import { isManager, useRole } from "@/lib/roles";
import { CheckCircle2, ChevronDown, ChevronUp, ClipboardCheck, Download, Loader2, Plus, X } from "lucide-react";

import { tr } from "@/lib/i18n";
const SKILLS = [
  { key: "planning", label: "Pre-call planning", hint: "Knew the doctor, the last visit and the goal" },
  { key: "opening", label: "Opening", hint: "Built rapport, linked to the last commitment" },
  { key: "product_knowledge", label: "Product knowledge", hint: "Accurate on indications, dosing, interactions" },
  { key: "key_message", label: "Key message", hint: "Delivered the approved message clearly" },
  { key: "objection_handling", label: "Objection handling", hint: "Listened, answered with evidence" },
  { key: "closing", label: "Closing", hint: "Asked for a specific commitment" },
  { key: "compliance", label: "Compliance", hint: "Approved claims only, samples recorded" },
] as const;
type SkillKey = (typeof SKILLS)[number]["key"];
type Scores = Record<SkillKey, number>;

interface Session {
  id: string; rep_id: string; manager_id: string; coached_on: string; visits_observed: number; visit_ids: string[];
  scores: Scores; overall: number; strengths: string; improvements: string; action_plan: string;
  follow_up_on: string | null; rep_comment: string | null; acknowledged_at: string | null;
}
interface Summary { rep_id: string; sessions: number; last_on: string; overall: number; open_acknowledgements: number; [k: string]: number | string }
interface Person { id: string; full_name: string; role: string; line_manager_id: string | null }
interface DayVisit { id: string; planned_at: string; status: string; hcps: { full_name: string; specialty: string | null } | null }

const REP_ROLES = ["medical_rep", "medical_rep_senior"];
const iso = (d: Date) => d.toISOString().slice(0, 10);
const blank = (): Scores => Object.fromEntries(SKILLS.map((s) => [s.key, 3])) as Scores;
const tone = (n: number) => (n >= 4 ? "bg-emerald-500" : n >= 3 ? "bg-amber-400" : "bg-rose-500");

export default function CoachingPage() {
  const { role } = useRole();
  const manager = isManager(role);
  const [me, setMe] = useState<string | null>(null);
  const [from, setFrom] = useState(iso(new Date(Date.now() - 90 * 864e5)));
  const [to, setTo] = useState(iso(new Date()));
  const [sessions, setSessions] = useState<Session[]>([]);
  const [summary, setSummary] = useState<Summary[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [repFilter, setRepFilter] = useState("");

  async function load() {
    setLoading(true); setError(null);
    const [{ data: sess }, s, sum, ppl] = await Promise.all([
      supabase.auth.getSession(),
      supabase.from("coaching_sessions").select("*").gte("coached_on", from).lte("coached_on", to).order("coached_on", { ascending: false }),
      supabase.rpc("coaching_summary", { p_from: from, p_to: to }),
      supabase.from("profiles").select("id, full_name, role, line_manager_id").eq("is_active", true),
    ]);
    if (s.error || sum.error) setError((s.error ?? sum.error)!.message);
    setMe(sess.session?.user.id ?? null);
    setSessions((s.data ?? []) as Session[]);
    setSummary((sum.data ?? []) as Summary[]);
    setPeople((ppl.data ?? []) as Person[]);
    setLoading(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [from, to]);

  const name = (id: string) => people.find((p) => p.id === id)?.full_name ?? "—";
  // District managers coach their own reps; head office can coach any rep.
  const coachable = useMemo(() => people.filter((p) => REP_ROLES.includes(p.role) && p.id !== me &&
    (role === "district_manager" || role === "regional_manager" ? p.line_manager_id === me : true)), [people, me, role]);
  const shown = sessions.filter((s) => !repFilter || s.rep_id === repFilter);
  const pending = sessions.filter((s) => s.rep_id === me && !s.acknowledged_at);

  // Team average per skill, to show the weakest skill across the team.
  const teamAvg = useMemo(() => {
    if (!sessions.length) return null;
    return SKILLS.map((sk) => ({ ...sk, avg: sessions.reduce((a, s) => a + Number(s.scores[sk.key]), 0) / sessions.length }))
      .sort((a, b) => a.avg - b.avg);
  }, [sessions]);

  function exportRows() {
    exportToExcel(shown.map((s) => ({
      Date: s.coached_on, Rep: name(s.rep_id), Manager: name(s.manager_id), "Visits observed": s.visits_observed, Overall: s.overall,
      ...Object.fromEntries(SKILLS.map((sk) => [sk.label, s.scores[sk.key]])),
      Strengths: s.strengths, "To improve": s.improvements, "Action plan": s.action_plan, "Follow-up": s.follow_up_on ?? "",
      Acknowledged: s.acknowledged_at ? s.acknowledged_at.slice(0, 10) : "", "Rep comment": s.rep_comment ?? "",
    })), `coaching_${from}_${to}`);
  }

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-violet-50 text-violet-700"><ClipboardCheck className="w-6 h-6" /></div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{tr("Field Coaching")}</h1>
            <p className="text-sm text-slate-500">{manager ? tr("Joint visits: rate the call skills, agree an action plan, follow progress.") : tr("Feedback from your joint visits with your manager.")}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap text-sm">
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg" />
          <span className="text-slate-400">{tr("to")}</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg" />
          <button onClick={exportRows} className="px-3 py-2 border border-slate-300 rounded-lg inline-flex items-center gap-2 hover:bg-slate-50"><Download className="w-4 h-4" /> {tr("Excel")}</button>
          {manager && (
            <button onClick={() => setCreating(true)} className="bg-brand-600 hover:bg-brand-700 text-white px-3 py-2 rounded-lg inline-flex items-center gap-2 font-medium">
              <Plus className="w-4 h-4" /> {tr("New coaching session")}
            </button>
          )}
        </div>
      </div>

      {error && <div className="p-3 rounded-lg bg-rose-50 text-rose-700 text-sm">{error}</div>}
      {loading ? <div className="p-10 text-center text-slate-400"><Loader2 className="w-6 h-6 animate-spin inline" /></div> : (
        <>
          {pending.map((s) => <Acknowledge key={s.id} session={s} managerName={name(s.manager_id)} onDone={load} />)}

          {manager && summary.length > 0 && (
            <div className="grid lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-slate-500 text-xs">
                    <tr>
                      <th className="p-3 text-start">{tr("Rep")}</th><th className="p-3 text-end">{tr("Sessions")}</th><th className="p-3 text-end">{tr("Overall")}</th>
                      <th className="p-3 text-start">{tr("Weakest skill")}</th><th className="p-3 text-start">{tr("Last")}</th><th className="p-3 text-end">{tr("Awaiting rep")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.map((r) => {
                      const weakest = [...SKILLS].sort((a, b) => Number(r[a.key]) - Number(r[b.key]))[0];
                      return (
                        <tr key={r.rep_id} className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer" onClick={() => setRepFilter(repFilter === r.rep_id ? "" : r.rep_id)}>
                          <td className={`p-3 font-medium ${repFilter === r.rep_id ? "text-brand-700" : "text-slate-900"}`}>{name(r.rep_id)}</td>
                          <td className="p-3 text-end">{r.sessions}</td>
                          <td className="p-3 text-end font-semibold">{Number(r.overall).toFixed(2)}</td>
                          <td className="p-3">{tr(weakest.label)} <span className="text-slate-400">({Number(r[weakest.key]).toFixed(1)})</span></td>
                          <td className="p-3 text-slate-500">{r.last_on}</td>
                          <td className="p-3 text-end">{r.open_acknowledgements > 0 ? <span className="text-amber-600 font-semibold">{r.open_acknowledgements}</span> : "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {teamAvg && (
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                  <div className="font-semibold text-slate-900 mb-1">{tr("Team skills")}</div>
                  <div className="text-xs text-slate-500 mb-3">{tr("Average of all sessions in the period, weakest first.")}</div>
                  <div className="space-y-2">
                    {teamAvg.map((s) => (
                      <div key={s.key} className="text-xs">
                        <div className="flex justify-between text-slate-600"><span>{tr(s.label)}</span><span>{s.avg.toFixed(2)}</span></div>
                        <div className="h-1.5 bg-slate-100 rounded"><div className={`h-1.5 rounded ${tone(s.avg)}`} style={{ width: `${(s.avg / 5) * 100}%` }} /></div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm divide-y divide-slate-100">
            <div className="p-3 flex items-center justify-between text-sm">
              <span className="font-semibold text-slate-900">{tr("Sessions")} {repFilter && <>· {name(repFilter)} <button onClick={() => setRepFilter("")} className="text-brand-600 ms-1">{tr("show all")}</button></>}</span>
              <span className="text-slate-500">{shown.length}</span>
            </div>
            {shown.length === 0 && <div className="p-8 text-center text-slate-400 text-sm">{tr("No coaching sessions in this period.")}</div>}
            {shown.map((s) => (
              <div key={s.id}>
                <button onClick={() => setOpen(open === s.id ? null : s.id)} className="w-full p-3 flex items-center gap-3 text-start hover:bg-slate-50">
                  <span className="text-sm text-slate-500 w-24 shrink-0">{s.coached_on}</span>
                  <span className="font-medium text-slate-900 flex-1 min-w-0 truncate">{name(s.rep_id)} <span className="text-slate-400 font-normal">{tr("with")} {name(s.manager_id)}</span></span>
                  <span className="hidden sm:flex gap-0.5" aria-hidden="true">
                    {SKILLS.map((sk) => <span key={sk.key} title={`${sk.label}: ${s.scores[sk.key]}`} className={`w-2 rounded-sm ${tone(s.scores[sk.key])}`} style={{ height: 4 + s.scores[sk.key] * 4 }} />)}
                  </span>
                  <span className="font-semibold w-10 text-end">{Number(s.overall).toFixed(1)}</span>
                  {s.acknowledged_at ? <CheckCircle2 className="w-4 h-4 text-emerald-500" aria-label={tr("Acknowledged")} /> : <span className="w-2 h-2 rounded-full bg-amber-400" title={tr("Awaiting the rep")} />}
                  {open === s.id ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                </button>
                {open === s.id && (
                  <div className="px-4 pb-4 grid md:grid-cols-2 gap-4 text-sm">
                    <div className="space-y-1.5">
                      {SKILLS.map((sk) => (
                        <div key={sk.key} className="flex items-center gap-2">
                          <span className="w-40 text-slate-600">{tr(sk.label)}</span>
                          <span className="flex gap-1">{[1, 2, 3, 4, 5].map((n) => <span key={n} className={`w-5 h-2 rounded ${n <= s.scores[sk.key] ? tone(s.scores[sk.key]) : "bg-slate-100"}`} />)}</span>
                          <span className="text-slate-500">{s.scores[sk.key]}</span>
                        </div>
                      ))}
                      <div className="text-xs text-slate-500 pt-1">{s.visits_observed} {tr("visits observed")}{s.follow_up_on && <> {tr("· follow-up")} {s.follow_up_on}</>}</div>
                    </div>
                    <div className="space-y-2">
                      {[["Strengths", s.strengths], ["To improve", s.improvements], ["Action plan", s.action_plan]].map(([k, v]) => v && (
                        <div key={k}><div className="text-xs font-semibold text-slate-500">{k}</div><div className="text-slate-800 whitespace-pre-wrap">{v}</div></div>
                      ))}
                      {s.acknowledged_at && (
                        <div className="text-xs text-emerald-700 bg-emerald-50 rounded p-2">
                          {tr("Acknowledged")} {s.acknowledged_at.slice(0, 10)}{s.rep_comment && <>: “{s.rep_comment}”</>}
                        </div>
                      )}
                      {manager && s.manager_id === me && !s.acknowledged_at && (
                        <button onClick={async () => { if (confirm(tr("Delete this coaching session?"))) { await supabase.from("coaching_sessions").delete().eq("id", s.id); load(); } }}
                          className="text-xs text-rose-600 hover:underline">{tr("Delete (possible until the rep acknowledges it)")}</button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {creating && me && <NewSession me={me} reps={coachable} onClose={() => setCreating(false)} onSaved={() => { setCreating(false); load(); }} />}
    </div>
  );
}

function Acknowledge({ session, managerName, onDone }: { session: Session; managerName: string; onDone: () => void }) {
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 space-y-2">
      <div className="font-semibold text-slate-900">{tr("New feedback from")} {managerName} · {session.coached_on} {tr("· overall")} {Number(session.overall).toFixed(1)}</div>
      {session.improvements && <div className="text-sm"><span className="font-semibold">{tr("To improve:")} </span>{session.improvements}</div>}
      {session.action_plan && <div className="text-sm"><span className="font-semibold">{tr("Action plan:")} </span>{session.action_plan}</div>}
      <div className="flex gap-2 flex-wrap">
        <input value={comment} onChange={(e) => setComment(e.target.value)} maxLength={2000} placeholder={tr("Your comment (optional)")}
          className="flex-1 min-w-[200px] px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white" />
        <button disabled={busy} onClick={async () => {
          setBusy(true); setErr(null);
          const { error } = await supabase.rpc("coaching_acknowledge", { p_id: session.id, p_comment: comment || null });
          setBusy(false);
          if (error) setErr(error.message); else onDone();
        }} className="bg-brand-600 hover:bg-brand-700 text-white px-3 py-2 rounded-lg text-sm font-medium inline-flex items-center gap-2 disabled:opacity-60">
          <CheckCircle2 className="w-4 h-4" /> {tr("Acknowledge")}
        </button>
      </div>
      {err && <div className="text-xs text-rose-700">{err}</div>}
    </div>
  );
}

function NewSession({ me, reps, onClose, onSaved }: { me: string; reps: Person[]; onClose: () => void; onSaved: () => void }) {
  const [repId, setRepId] = useState(reps[0]?.id ?? "");
  const [date, setDate] = useState(iso(new Date()));
  const [scores, setScores] = useState<Scores>(blank());
  const [visits, setVisits] = useState<DayVisit[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [observed, setObserved] = useState(4);
  const [text, setText] = useState({ strengths: "", improvements: "", action_plan: "" });
  const [follow, setFollow] = useState(iso(new Date(Date.now() + 21 * 864e5)));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // The rep's visits that day, to tick the ones observed.
  useEffect(() => {
    if (!repId || !date) return;
    supabase.from("visits").select("id, planned_at, status, hcps(full_name, specialty)").eq("rep_id", repId)
      .gte("planned_at", `${date}T00:00:00`).lte("planned_at", `${date}T23:59:59`).order("planned_at")
      .then(({ data }) => { const v = (data ?? []) as unknown as DayVisit[]; setVisits(v); setPicked(v.filter((x) => x.status === "completed").map((x) => x.id)); });
  }, [repId, date]);
  useEffect(() => { if (picked.length) setObserved(picked.length); }, [picked]);

  async function save() {
    setBusy(true); setErr(null);
    const { error } = await supabase.from("coaching_sessions").insert({
      rep_id: repId, manager_id: me, coached_on: date, visits_observed: observed, visit_ids: picked, scores,
      strengths: text.strengths.trim(), improvements: text.improvements.trim(), action_plan: text.action_plan.trim(), follow_up_on: follow || null,
    });
    setBusy(false);
    if (error) setErr(error.message.includes("row-level security") ? tr("You can only coach reps in your own team.") : error.message); else onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center overflow-y-auto p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl my-8" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b flex items-center justify-between">
          <h2 className="font-bold text-lg">{tr("New coaching session")}</h2>
          <button onClick={onClose} aria-label={tr("Close")}><X className="w-5 h-5 text-slate-400" /></button>
        </div>
        <div className="p-4 space-y-4 text-sm">
          {reps.length === 0 ? <div className="text-slate-500">{tr("No reps in your team.")}</div> : (
            <>
              <div className="grid sm:grid-cols-3 gap-3">
                <label className="space-y-1"><span className="text-slate-600">{tr("Rep")}</span>
                  <select value={repId} onChange={(e) => setRepId(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg">
                    {reps.map((r) => <option key={r.id} value={r.id}>{r.full_name}</option>)}
                  </select></label>
                <label className="space-y-1"><span className="text-slate-600">{tr("Day in the field")}</span>
                  <input type="date" value={date} max={iso(new Date())} onChange={(e) => setDate(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg" /></label>
                <label className="space-y-1"><span className="text-slate-600">{tr("Visits observed")}</span>
                  <input type="number" min={0} max={30} value={observed} onChange={(e) => setObserved(Math.max(0, Math.min(30, +e.target.value)))} className="w-full px-3 py-2 border border-slate-300 rounded-lg" /></label>
              </div>
              {visits.length > 0 && (
                <div>
                  <div className="text-slate-600 mb-1">{tr("Visits that day (tick the ones you joined)")}</div>
                  <div className="flex flex-wrap gap-2">
                    {visits.map((v) => (
                      <label key={v.id} className={`px-2 py-1 rounded-lg border cursor-pointer ${picked.includes(v.id) ? "border-brand-500 bg-brand-50" : "border-slate-200"}`}>
                        <input type="checkbox" className="me-1" checked={picked.includes(v.id)} onChange={() => setPicked((p) => p.includes(v.id) ? p.filter((x) => x !== v.id) : [...p, v.id])} />
                        {v.planned_at.slice(11, 16)} {v.hcps?.full_name ?? "—"}
                      </label>
                    ))}
                  </div>
                </div>
              )}
              <div className="space-y-2">
                {SKILLS.map((sk) => (
                  <div key={sk.key} className="grid sm:grid-cols-[1fr_auto] gap-2 items-center">
                    <div><div className="font-medium text-slate-900">{tr(sk.label)}</div><div className="text-xs text-slate-500">{tr(sk.hint)}</div></div>
                    <div className="flex gap-1" role="radiogroup" aria-label={sk.label}>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button key={n} type="button" role="radio" aria-checked={scores[sk.key] === n} onClick={() => setScores((s) => ({ ...s, [sk.key]: n }))}
                          className={`w-9 h-9 rounded-lg border font-semibold ${scores[sk.key] === n ? `${tone(n)} text-white border-transparent` : "border-slate-300 text-slate-600 hover:bg-slate-50"}`}>{n}</button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              {([["strengths", "Strengths"], ["improvements", "To improve"], ["action_plan", "Action plan until the next session"]] as const).map(([k, l]) => (
                <label key={k} className="block space-y-1"><span className="text-slate-600">{l}</span>
                  <textarea rows={2} maxLength={2000} value={text[k]} onChange={(e) => setText((t) => ({ ...t, [k]: e.target.value }))} className="w-full px-3 py-2 border border-slate-300 rounded-lg" /></label>
              ))}
              <label className="block space-y-1 max-w-xs"><span className="text-slate-600">{tr("Follow-up session")}</span>
                <input type="date" value={follow} onChange={(e) => setFollow(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg" /></label>
              {err && <div className="p-2 rounded bg-rose-50 text-rose-700">{err}</div>}
            </>
          )}
        </div>
        <div className="p-4 border-t flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 border border-slate-300 rounded-lg">{tr("Cancel")}</button>
          <button disabled={busy || !repId} onClick={save} className="bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-lg font-medium disabled:opacity-60">
            {busy ? tr("Saving…") : tr("Save and send to rep")}
          </button>
        </div>
      </div>
    </div>
  );
}
