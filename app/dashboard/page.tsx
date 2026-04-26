"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import {
  Users,
  Building2,
  ClipboardList,
  Pill,
  TrendingUp,
  Plus,
  MapPin,
  AlertTriangle,
  Sparkles,
  Shield,
  Trophy,
  Bell
} from "lucide-react";

type Counts = {
  hcps: number | null;
  institutions: number | null;
  products: number | null;
  visitsToday: number | null;
  visitsInProgress: number | null;
  flaggedVisits: number | null;
  openAlerts: number | null;
  unreadNotifs: number | null;
};

export default function DashboardHome() {
  const [counts, setCounts] = useState<Counts>({
    hcps: null, institutions: null, products: null,
    visitsToday: null, visitsInProgress: null, flaggedVisits: null,
    openAlerts: null, unreadNotifs: null
  });
  const [userName, setUserName] = useState<string>("");

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (u.user) {
        const { data: p } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", u.user.id)
          .single();
        setUserName(p?.full_name ?? u.user.email ?? "");
      }

      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);

      const [hcps, institutions, products, visitsToday, inProgress, flagged, alerts, notifs] = await Promise.all([
        supabase.from("hcps").select("id", { count: "exact", head: true }),
        supabase.from("institutions").select("id", { count: "exact", head: true }),
        supabase.from("products").select("id", { count: "exact", head: true }),
        supabase.from("visits").select("id", { count: "exact", head: true })
          .gte("check_in_at", startOfToday.toISOString()),
        supabase.from("visits").select("id", { count: "exact", head: true })
          .eq("status", "in_progress"),
        supabase.from("visits").select("id", { count: "exact", head: true })
          .eq("manager_status", "flagged"),
        supabase.from("compliance_alerts").select("id", { count: "exact", head: true })
          .eq("status", "open"),
        supabase.from("notifications").select("id", { count: "exact", head: true })
          .eq("is_read", false)
      ]);

      setCounts({
        hcps: hcps.count ?? 0,
        institutions: institutions.count ?? 0,
        products: products.count ?? 0,
        visitsToday: visitsToday.count ?? 0,
        visitsInProgress: inProgress.count ?? 0,
        flaggedVisits: flagged.count ?? 0,
        openAlerts: alerts.count ?? 0,
        unreadNotifs: notifs.count ?? 0
      });
    })();
  }, []);

  const kpis = [
    { label: "Visits Today",      value: counts.visitsToday,      icon: ClipboardList, color: "bg-brand-50 text-brand-700",     href: "/dashboard/visits" },
    { label: "In Progress",       value: counts.visitsInProgress, icon: MapPin,        color: "bg-blue-50 text-blue-700",       href: "/dashboard/tracking" },
    { label: "HCPs",              value: counts.hcps,             icon: Users,         color: "bg-purple-50 text-purple-700",   href: "/dashboard/hcps" },
    { label: "Institutions",      value: counts.institutions,     icon: Building2,     color: "bg-amber-50 text-amber-700",     href: "/dashboard/institutions" },
    { label: "Products",          value: counts.products,         icon: Pill,          color: "bg-pink-50 text-pink-700",       href: "/dashboard/products" },
    { label: "Flagged",           value: counts.flaggedVisits,    icon: AlertTriangle, color: counts.flaggedVisits ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-500", href: "/dashboard/visits" },
    { label: "Open Alerts",       value: counts.openAlerts,       icon: Shield,        color: counts.openAlerts ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-500", href: "/dashboard/compliance" },
    { label: "Unread",            value: counts.unreadNotifs,     icon: Bell,          color: counts.unreadNotifs ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-500", href: "/dashboard/notifications" }
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Welcome{userName ? `, ${userName.split(" ")[0]}` : ""} 👋
          </h1>
          <p className="text-sm text-slate-500 mt-1">Here&apos;s your field force at a glance.</p>
        </div>
        <Link
          href="/dashboard/visits/check-in"
          className="bg-brand-600 hover:bg-brand-700 text-white px-4 py-2.5 rounded-lg inline-flex items-center gap-2 font-medium shadow-sm"
        >
          <Plus className="w-4 h-4" /> New Check-in
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
        {kpis.map((k) => {
          const Icon = k.icon;
          return (
            <Link
              key={k.label}
              href={k.href}
              className="bg-white rounded-xl p-3 border border-slate-200 shadow-sm hover:shadow-md transition"
            >
              <div className={`p-1.5 rounded-lg w-fit ${k.color}`}>
                <Icon className="w-4 h-4" />
              </div>
              <div className="mt-2">
                <div className="text-xl font-bold text-slate-900">
                  {k.value === null ? "—" : k.value.toLocaleString()}
                </div>
                <div className="text-[11px] text-slate-500">{k.label}</div>
              </div>
            </Link>
          );
        })}
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <QuickCard icon={MapPin} title="GPS Check-in" desc="Log a visit with geofence verification" href="/dashboard/visits/check-in" accent="bg-brand-500" />
        <QuickCard icon={Sparkles} title="AI Assistant" desc="Email, WhatsApp, pitches, objections" href="/dashboard/assistant" accent="bg-yellow-500" />
        <QuickCard icon={Trophy} title="Leaderboard" desc="Rank reps + AI coaching insights" href="/dashboard/leaderboard" accent="bg-amber-500" />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-brand-50 text-brand-700">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <h2 className="font-semibold text-slate-900">Build progress — v0.3</h2>
            <ul className="space-y-1 text-sm mt-3">
              <Step done label="Step 1 — Database foundation" />
              <Step done label="Step 2 — Medical entities" />
              <Step done label="Step 3 — Project scaffold + login" />
              <Step done label="Step 4 — Visits + GPS check-in + geofence + selfie ✨" />
              <Step done label="Step 5 — Live tracking map (Mapbox)" />
              <Step done label="Step 6 — AI features (HCP scoring, summaries, coaching)" />
              <Step done label="Step 7 — Samples + Orders + Expenses ✨" />
              <Step done label="Step 8 — Reports + Leaderboard + Coverage ✨" />
              <Step done label="Step 9 — Tour Plans + Targets ✨" />
              <Step done label="Step 10 — Compliance / Anomaly Engine ✨" />
              <Step done label="Step 11 — Push Notifications + WhatsApp + AI Chat ✨" />
              <Step done label="Step 12 — PWA + Offline mode ✨" />
            </ul>
            <p className="text-sm text-slate-600 mt-3">
              <strong>You shipped a feature-complete pharma CRM.</strong> Time to find your first pilot customer.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function QuickCard({ icon: Icon, title, desc, href, accent }: { icon: typeof MapPin; title: string; desc: string; href: string; accent: string }) {
  return (
    <Link href={href} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 hover:shadow-md transition group">
      <div className={`w-10 h-10 rounded-lg ${accent} text-white flex items-center justify-center mb-3`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="font-semibold text-slate-900 group-hover:text-brand-700">{title}</div>
      <div className="text-xs text-slate-500 mt-1">{desc}</div>
    </Link>
  );
}

function Step({ label, done = false }: { label: string; done?: boolean }) {
  return (
    <li className="flex items-center gap-2">
      <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[11px] font-bold ${done ? "bg-brand-600 text-white" : "bg-slate-200 text-slate-500"}`}>
        {done ? "✓" : "·"}
      </span>
      <span className={done ? "text-slate-900" : "text-slate-500"}>{label}</span>
    </li>
  );
}
