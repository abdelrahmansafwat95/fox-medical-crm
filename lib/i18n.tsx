"use client";

// Arabic / English interface.
//
// Interface text is written in English in the code and passed through tr();
// lib/i18n-ar.ts holds the Arabic (Modern Standard Arabic, Western digits).
// A string with no Arabic entry is shown in English, so data (doctor names,
// product names) passed through tr() is never changed.
//
// The choice lives in the `foxmed_lang` cookie so the server renders the right
// direction on the first paint (app/layout.tsx), and switching remounts the app
// so every screen re-renders in the new language.

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { AR } from "./i18n-ar";

export type Lang = "en" | "ar";
export const LANG_COOKIE = "foxmed_lang";

let current: Lang = "en";

/** Translate an interface string; anything else is returned unchanged. */
export function tr<T>(s: T): T {
  if (current !== "ar" || typeof s !== "string") return s;
  const hit = AR[s] ?? AR[s.trim()];
  return (hit ?? s) as unknown as T;
}

/** tr() with {placeholders}: trf("{n} visits today", { n: 4 }). */
export function trf(s: string, vars: Record<string, string | number>): string {
  return tr(s).replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`));
}

/** Locale for dates and numbers: Arabic month names, Western digits. */
export const locale = () => (current === "ar" ? "ar-EG-u-nu-latn" : "en-GB");
export const isRTL = () => current === "ar";

const Ctx = createContext<{ lang: Lang; setLang: (l: Lang) => void }>({ lang: "en", setLang: () => {} });
export const useLang = () => useContext(Ctx);

export function LangProvider({ initial, children }: { initial: Lang; children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initial);
  current = lang; // before children render

  const setLang = useCallback((l: Lang) => {
    document.cookie = `${LANG_COOKIE}=${l}; path=/; max-age=31536000; samesite=lax`;
    try { localStorage.setItem(LANG_COOKIE, l); } catch { /* private mode */ }
    document.documentElement.lang = l;
    document.documentElement.dir = l === "ar" ? "rtl" : "ltr";
    current = l;
    setLangState(l);
  }, []);

  // A device that chose a language before the cookie existed.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LANG_COOKIE) as Lang | null;
      if ((saved === "ar" || saved === "en") && saved !== initial) setLang(saved);
    } catch { /* ignore */ }
  }, [initial, setLang]);

  return (
    <Ctx.Provider value={{ lang, setLang }}>
      {/* key: switching language remounts every screen so all text re-renders */}
      <div key={lang} className="contents">{children}</div>
    </Ctx.Provider>
  );
}

export function LangToggle({ className = "" }: { className?: string }) {
  const { lang, setLang } = useLang();
  return (
    <button type="button" onClick={() => setLang(lang === "ar" ? "en" : "ar")}
      className={className || "text-sm font-semibold px-3 py-1.5 rounded-lg border border-white/20 text-white/80 hover:bg-white/10"}
      aria-label={lang === "ar" ? "Switch to English" : "التبديل إلى العربية"}>
      {lang === "ar" ? "English" : "العربية"}
    </button>
  );
}

/** "5m ago" / "منذ 5 دقائق" — short relative time in the current language. */
export function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.max(0, Math.round(ms / 60_000)), h = Math.round(m / 60), d = Math.floor(ms / 86_400_000);
  const ar = current === "ar";
  if (m < 1) return ar ? "الآن" : "just now";
  if (m < 60) return ar ? `منذ ${m} دقيقة` : `${m}m ago`;
  if (h < 24) return ar ? `منذ ${h} ساعة` : `${h}h ago`;
  if (d === 1) return ar ? "أمس" : "yesterday";
  if (d < 30) return ar ? `منذ ${d} يوم` : `${d}d ago`;
  if (d < 365) return ar ? `منذ ${Math.floor(d / 30)} شهر` : `${Math.floor(d / 30)}mo ago`;
  return ar ? `منذ ${Math.floor(d / 365)} سنة` : `${Math.floor(d / 365)}y ago`;
}
