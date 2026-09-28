"use client";

// E-detailing: the rep presents product slides to the doctor on the phone or
// tablet. Time on every slide is recorded (paused while the app is in the
// background) and saved with the visit — offline too — so managers see which
// messages doctors actually spent time on.

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { offlineInsert } from "@/lib/offlineQueue";
import { ArrowLeft, ChevronLeft, ChevronRight, Loader2, Presentation, StickyNote, X, CheckCircle2 } from "lucide-react";

import { tr, trf } from "@/lib/i18n";
interface Slide {
  id: string;
  product_id: string;
  position: number;
  title: string | null;
  image_url: string;
  key_message: string | null;
  products: { name: string; brand_name: string | null } | null;
}
interface VisitInfo {
  id: string;
  rep_id: string;
  hcp_id: string | null;
  status: string;
  hcps: { full_name: string } | null;
}

export default function DetailingPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [visit, setVisit] = useState<VisitInfo | null>(null);
  const [slides, setSlides] = useState<Slide[]>([]);
  const [loading, setLoading] = useState(true);
  const [chosen, setChosen] = useState<string[]>([]);
  const [deck, setDeck] = useState<Slide[] | null>(null);   // the running presentation
  const [idx, setIdx] = useState(0);
  const [notes, setNotes] = useState(false);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<{ queued: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // timing
  const seconds = useRef<Record<string, number>>({});
  const shownAt = useRef<number | null>(null);
  const startedAt = useRef<Record<string, string>>({});

  useEffect(() => {
    if (!params.id) return;
    (async () => {
      const [v, s] = await Promise.all([
        supabase.from("visits").select("id, rep_id, hcp_id, status, hcps(full_name)").eq("id", params.id).single(),
        supabase.from("detailing_slides").select("id, product_id, position, title, image_url, key_message, products(name, brand_name)").order("position")
      ]);
      setVisit((v.data ?? null) as unknown as VisitInfo | null);
      setSlides((s.data ?? []) as unknown as Slide[]);
      setLoading(false);
    })();
  }, [params.id]);

  const products = Array.from(new Map(slides.map((s) => [s.product_id, s.products?.name ?? "Product"])).entries());

  // bank the time spent on the slide being shown
  const bank = useCallback(() => {
    if (!deck || shownAt.current == null) return;
    const s = deck[idx];
    seconds.current[s.id] = (seconds.current[s.id] ?? 0) + (Date.now() - shownAt.current) / 1000;
    shownAt.current = Date.now();
  }, [deck, idx]);

  const go = useCallback((to: number) => {
    if (!deck) return;
    bank();
    const next = Math.max(0, Math.min(deck.length - 1, to));
    const pid = deck[next].product_id;
    if (!startedAt.current[pid]) startedAt.current[pid] = new Date().toISOString();
    setIdx(next);
  }, [deck, bank]);

  // keyboard + pause while hidden
  useEffect(() => {
    if (!deck) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " ") go(idx + 1);
      if (e.key === "ArrowLeft") go(idx - 1);
    };
    const onVis = () => {
      if (document.hidden) { bank(); shownAt.current = null; } else { shownAt.current = Date.now(); }
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("visibilitychange", onVis);
    return () => { window.removeEventListener("keydown", onKey); document.removeEventListener("visibilitychange", onVis); };
  }, [deck, idx, go, bank]);

  function start() {
    const d = slides.filter((s) => chosen.includes(s.product_id))
      .sort((a, b) => chosen.indexOf(a.product_id) - chosen.indexOf(b.product_id) || a.position - b.position);
    if (!d.length) return;
    // load every image now: they are then cached on the phone for offline use
    d.forEach((s) => { const img = new Image(); img.src = s.image_url; });
    seconds.current = {};
    startedAt.current = { [d[0].product_id]: new Date().toISOString() };
    shownAt.current = Date.now();
    setIdx(0);
    setDeck(d);
    document.documentElement.requestFullscreen?.().catch(() => {});
  }

  async function finish() {
    if (!deck || !visit) return;
    bank();
    shownAt.current = null;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    setSaving(true);
    setError(null);
    let queued = false;
    for (const pid of chosen) {
      const own = deck.filter((s) => s.product_id === pid);
      const viewed = own.map((s) => ({ slide_id: s.id, seconds: Math.round(seconds.current[s.id] ?? 0) })).filter((x) => x.seconds > 0);
      if (!viewed.length) continue;
      const total = Math.min(7200, viewed.reduce((a, x) => a + x.seconds, 0));
      const r = await offlineInsert("detailing_sessions", {
        visit_id: visit.id, rep_id: visit.rep_id, hcp_id: visit.hcp_id, product_id: pid,
        started_at: startedAt.current[pid] ?? new Date().toISOString(), total_seconds: total, slides: viewed
      }, `Detailing — ${own[0].products?.name ?? "product"} to ${visit.hcps?.full_name ?? "HCP"}`);
      if (r.error) { setError(r.error); setSaving(false); setDeck(null); return; }
      queued = queued || r.queued;
    }
    setSaving(false);
    setDeck(null);
    setDone({ queued });
    setTimeout(() => router.push(`/dashboard/visits/${visit.id}`), 2200);
  }

  // touch swipe
  const touchX = useRef<number | null>(null);

  if (loading) {
    return <div className="p-12 text-center text-slate-500"><Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />{tr("Loading…")}</div>;
  }
  if (!visit) return <div className="p-12 text-center text-slate-500">{tr("Visit not found.")}</div>;

  if (done) {
    return (
      <div className="max-w-md mx-auto p-12 text-center">
        <CheckCircle2 className="w-14 h-14 text-brand-600 mx-auto mb-3" />
        <h2 className="font-bold text-slate-900">{tr("Detailing saved with the visit")}</h2>
        <p className="text-sm text-slate-600 mt-1">{done.queued ? tr("You're offline — it will sync when the signal is back.") : tr("Your manager can see which slides the doctor spent time on.")}</p>
      </div>
    );
  }

  if (deck) {
    const s = deck[idx];
    const productSlides = deck.filter((x) => x.product_id === s.product_id);
    return (
      <div
        className="fixed inset-0 z-[100] bg-slate-950 flex flex-col select-none"
        onTouchStart={(e) => { touchX.current = e.touches[0].clientX; }}
        onTouchEnd={(e) => {
          if (touchX.current == null) return;
          const dx = e.changedTouches[0].clientX - touchX.current;
          if (Math.abs(dx) > 50) go(idx + (dx < 0 ? 1 : -1));
          touchX.current = null;
        }}
      >
        <div className="flex items-center gap-3 px-4 py-2 text-slate-300 text-sm">
          <span className="font-semibold text-white">{s.products?.name}</span>
          <span className="opacity-70">{productSlides.indexOf(s) + 1} / {productSlides.length}</span>
          <span className="flex-1" />
          <button onClick={() => setNotes((n) => !n)} className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 ${notes ? "bg-amber-500 text-slate-950" : "bg-white/10"}`}>
            <StickyNote className="w-4 h-4" /> {tr("Notes")}
          </button>
          <button onClick={finish} disabled={saving} className="inline-flex items-center gap-1 rounded-lg bg-brand-600 text-white px-3 py-1.5 font-semibold">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />} {tr("Finish")}
          </button>
        </div>
        {/* min-h-0 lets the slide shrink to the space left, so it never pushes the dots off screen */}
        <div className="flex-1 min-h-0 relative flex items-center justify-center px-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={s.image_url} alt={s.title ?? ""} className="h-full w-full object-contain" draggable={false} />
          <button aria-label={tr("Previous")} onClick={() => go(idx - 1)} disabled={idx === 0} className="absolute start-0 top-0 bottom-0 w-1/4 flex items-center justify-start ps-2 text-white/40 hover:text-white disabled:opacity-0">
            <ChevronLeft className="w-10 h-10 rtl:-scale-x-100" />
          </button>
          <button aria-label={tr("Next")} onClick={() => go(idx + 1)} disabled={idx === deck.length - 1} className="absolute end-0 top-0 bottom-0 w-1/4 flex items-center justify-end pe-2 text-white/40 hover:text-white disabled:opacity-0">
            <ChevronRight className="w-10 h-10 rtl:-scale-x-100" />
          </button>
          {notes && s.key_message && (
            <div className="absolute bottom-3 start-3 end-3 md:start-auto md:w-96 rounded-xl bg-amber-100 text-amber-950 p-3 text-sm shadow-xl">
              <b>{tr("For you:")}</b> {s.key_message}
            </div>
          )}
        </div>
        <div className="flex justify-center gap-1.5 py-3">
          {deck.map((x, i) => (
            <button key={x.id} aria-label={trf("Slide {n}", { n: i + 1 })} onClick={() => go(i)}
              className={`h-2 rounded-full transition-all ${i === idx ? "w-6 bg-cyan-400" : x.product_id === s.product_id ? "w-2 bg-white/50" : "w-2 bg-white/20"}`} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto pb-24">
      <Link href={`/dashboard/visits/${visit.id}`} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-3">
        <ArrowLeft className="w-4 h-4 rtl:-scale-x-100" /> {tr("Back to visit")}
      </Link>
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <div className="flex items-center gap-2 mb-1">
          <Presentation className="w-5 h-5 text-brand-600" />
          <h1 className="text-lg font-bold text-slate-900">{tr("Detail to")} {visit.hcps?.full_name ?? tr("the doctor")}</h1>
        </div>
        <p className="text-sm text-slate-500 mb-4">{tr("Pick the products to present, in the order you want. Swipe or tap the sides to move; time on each slide is recorded with the visit.")}</p>
        {products.length === 0 ? (
          <p className="text-sm text-slate-600 bg-slate-50 rounded-lg p-4">{tr("No slide decks yet. A manager can add them on the")} <Link href="/dashboard/products" className="underline">{tr("Products")}</Link> {tr("page.")}</p>
        ) : (
          <div className="space-y-2">
            {products.map(([pid, name]) => {
              const n = slides.filter((s) => s.product_id === pid).length;
              const order = chosen.indexOf(pid);
              return (
                <button key={pid} onClick={() => setChosen((c) => (c.includes(pid) ? c.filter((x) => x !== pid) : [...c, pid]))}
                  className={`w-full flex items-center gap-3 rounded-lg border p-3 text-start transition-colors ${order >= 0 ? "border-brand-500 bg-brand-50" : "border-slate-200 hover:border-brand-300"}`}>
                  <span className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold ${order >= 0 ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-400"}`}>{order >= 0 ? order + 1 : ""}</span>
                  <span className="flex-1 font-medium text-slate-900">{name}</span>
                  <span className="text-xs text-slate-500">{n} {tr("slide")}{n === 1 ? "" : "s"}</span>
                </button>
              );
            })}
          </div>
        )}
        {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
        <button onClick={start} disabled={!chosen.length}
          className="mt-5 w-full bg-brand-600 hover:bg-brand-700 disabled:bg-brand-300 text-white font-semibold py-3 rounded-lg inline-flex items-center justify-center gap-2">
          <Presentation className="w-4 h-4" /> {tr("Start presenting")}
        </button>
      </div>
    </div>
  );
}
