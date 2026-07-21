"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Search, Users, Building2, Pill, Loader2, CornerDownLeft } from "lucide-react";

type Result = {
  kind: "hcp" | "institution" | "product";
  id: string;
  label: string;
  sub: string | null;
  href: string;
};

const ICON = { hcp: Users, institution: Building2, product: Pill };

/** Global ⌘K / Ctrl-K search across HCPs, institutions, and products.
 *  Also opens on a `foxmed:search` window event (fired by the top-bar button). */
export default function GlobalSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Open/close hotkeys + external trigger
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    };
    const onTrigger = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("foxmed:search", onTrigger);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("foxmed:search", onTrigger);
    };
  }, []);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 30);
    } else {
      setQ("");
      setResults([]);
    }
  }, [open]);

  const runSearch = useCallback(async (term: string) => {
    const t = term.trim();
    if (t.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const like = `%${t}%`;
    const [hcps, insts, prods] = await Promise.all([
      supabase.from("hcps").select("id, full_name, specialty").ilike("full_name", like).eq("is_active", true).limit(6),
      supabase.from("institutions").select("id, name, district").ilike("name", like).eq("is_active", true).limit(6),
      supabase.from("products").select("id, name, brand_name").or(`name.ilike.${like},brand_name.ilike.${like}`).eq("is_active", true).limit(6)
    ]);
    const out: Result[] = [];
    for (const h of (hcps.data ?? []) as { id: string; full_name: string; specialty: string | null }[]) {
      out.push({ kind: "hcp", id: h.id, label: h.full_name, sub: h.specialty, href: `/dashboard/hcps/${h.id}` });
    }
    for (const i of (insts.data ?? []) as { id: string; name: string; district: string | null }[]) {
      out.push({ kind: "institution", id: i.id, label: i.name, sub: i.district, href: `/dashboard/institutions` });
    }
    for (const p of (prods.data ?? []) as { id: string; name: string; brand_name: string | null }[]) {
      out.push({ kind: "product", id: p.id, label: p.brand_name ?? p.name, sub: p.brand_name ? p.name : null, href: `/dashboard/products` });
    }
    setResults(out);
    setLoading(false);
  }, []);

  // Debounce
  useEffect(() => {
    if (!open) return;
    const id = setTimeout(() => runSearch(q), 250);
    return () => clearTimeout(id);
  }, [q, open, runSearch]);

  function go(r: Result) {
    setOpen(false);
    router.push(r.href);
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] bg-slate-900/50 backdrop-blur-sm flex items-start justify-center pt-[12vh] px-4"
      onClick={() => setOpen(false)}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 border-b border-slate-200">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search HCPs, institutions, products…"
            className="flex-1 py-3.5 outline-none text-sm bg-transparent text-slate-900"
          />
          {loading && <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />}
        </div>

        <div className="max-h-[55vh] overflow-y-auto">
          {q.trim().length < 2 ? (
            <div className="p-6 text-center text-sm text-slate-400">Type at least 2 characters…</div>
          ) : results.length === 0 && !loading ? (
            <div className="p-6 text-center text-sm text-slate-500">No matches for &ldquo;{q}&rdquo;.</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {results.map((r) => {
                const Icon = ICON[r.kind];
                return (
                  <button
                    key={`${r.kind}-${r.id}`}
                    onClick={() => go(r)}
                    className="w-full px-4 py-2.5 flex items-center gap-3 text-left hover:bg-slate-50"
                  >
                    <div className="p-1.5 rounded-lg bg-slate-100 text-slate-600 shrink-0">
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-900 truncate">{r.label}</div>
                      {r.sub && <div className="text-xs text-slate-500 truncate">{r.sub}</div>}
                    </div>
                    <span className="text-[10px] uppercase tracking-wide text-slate-400 shrink-0">{r.kind}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="px-4 py-2 border-t border-slate-200 text-[11px] text-slate-400 flex items-center gap-2">
          <CornerDownLeft className="w-3 h-3" /> to open · Esc to close · ⌘K anytime
        </div>
      </div>
    </div>
  );
}
