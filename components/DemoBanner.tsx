"use client";

/**
 * Shown only to public-demo visitors (profiles.is_demo_visitor): a slim strip
 * saying what this is and how to reach Fox Systems, plus a where-to-start card
 * the first time they arrive from the website (/dashboard?demo=welcome).
 * Renders nothing for everyone else.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { Sparkles, MessageCircle, X, MapPin, Stethoscope, BarChart3, ShieldAlert, ClipboardCheck } from "lucide-react";

const WHATSAPP = "201038450546";
const PRICING = "https://foxsystemstech.com/services/crm";

const TOUR = [
  { href: "/dashboard/visits", icon: ClipboardCheck, title: "Visits", text: "Every call with its GPS check-in, trust score and manager approval." },
  { href: "/dashboard/hcps", icon: Stethoscope, title: "HCPs", text: "Doctors and pharmacists with segment, workplace and visit history." },
  { href: "/dashboard/coverage", icon: MapPin, title: "Coverage", text: "Who is overdue for a visit, by segment and territory." },
  { href: "/dashboard/compliance", icon: ShieldAlert, title: "Compliance", text: "Check-ins outside the geofence, impossible speeds and duplicates." },
  { href: "/dashboard/reports", icon: BarChart3, title: "Reports", text: "Rep performance, call rates and exports to Excel or PDF." }
];

export default function DemoBanner() {
  const [visitor, setVisitor] = useState<{ name: string; endsAt: number } | null>(null);
  const [welcome, setWelcome] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const { data: p } = await supabase
        .from("profiles")
        .select("full_name, is_demo_visitor, created_at")
        .eq("id", u.user.id)
        .single();
      if (!p?.is_demo_visitor) return;
      // Trials last 3 days from sign-up (public.demo_trial_days()).
      setVisitor({ name: p.full_name ?? "", endsAt: new Date(p.created_at).getTime() + 3 * 864e5 });
      const params = new URLSearchParams(window.location.search);
      if (params.get("demo") === "welcome") {
        setWelcome(true);
        window.history.replaceState(null, "", window.location.pathname);
      }
    })();
  }, []);

  if (!visitor) return null;

  const daysLeft = Math.max(0, Math.ceil((visitor.endsAt - Date.now()) / 864e5));
  const countdown = daysLeft === 0 ? " · ends today" : daysLeft === 1 ? " · 1 day left" : ` · ${daysLeft} days left`;

  const wa = `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(
    "Hi, I've been trying the Fox medical CRM demo and would like to know more."
  )}`;

  return (
    <>
      <div className="mb-4 rounded-xl bg-fox-navy text-white px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-start gap-2.5 flex-1 min-w-0">
          <Sparkles className="w-4 h-4 text-fox-cyan flex-shrink-0 mt-0.5" />
          <p className="text-xs sm:text-sm leading-relaxed text-white/85">
            <strong className="text-white">Live demo{countdown}.</strong> Sample data that resets every night, and other
            visitors can see it, so please don&apos;t enter real doctor or patient details. Deleting, settings
            and team changes are switched off.
          </p>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <a href={wa} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#25D366] hover:bg-[#1ebe5a] px-3 py-2 text-xs font-semibold text-white">
            <MessageCircle className="w-3.5 h-3.5" /> Talk to us
          </a>
          <a href={`${PRICING}#pricing`} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center rounded-lg bg-fox-cyan hover:opacity-90 px-3 py-2 text-xs font-bold text-fox-navy">
            Get it for my company
          </a>
        </div>
      </div>

      {welcome && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setWelcome(false)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg rounded-2xl bg-white shadow-xl p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-4 mb-1">
              <h2 className="text-lg font-bold text-slate-900">
                Welcome{visitor.name ? `, ${visitor.name}` : ""}. This is a complete sample pharma field force
              </h2>
              <button onClick={() => setWelcome(false)} className="p-1 text-slate-400 hover:text-slate-600" aria-label="Close">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-sm text-slate-500 mb-4">
              You&apos;re signed in as the country manager, so you see every rep and territory. Good places to start:
            </p>
            <div className="space-y-2">
              {TOUR.map(({ href, icon: Icon, title, text }) => (
                <Link key={href} href={href} onClick={() => setWelcome(false)}
                  className="flex items-start gap-3 rounded-xl border border-slate-100 hover:border-brand-200 hover:bg-brand-50/40 p-3 transition-colors">
                  <Icon className="w-4 h-4 text-brand-500 mt-0.5 flex-shrink-0" />
                  <span>
                    <span className="block text-sm font-semibold text-slate-800">{title}</span>
                    <span className="block text-xs text-slate-500">{text}</span>
                  </span>
                </Link>
              ))}
            </div>
            <p className="text-xs text-slate-400 mt-4">
              Your demo lasts 3 days, then the account and anything you added are deleted. To come back during it, request access on the website with the same phone number.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
