"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import {
  Users,
  Building2,
  ClipboardList,
  Pill,
  Plus,
  MapPin,
  AlertTriangle,
  Sparkles,
  Shield,
  Trophy,
  Bell,
  Inbox,
  ArrowRight
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
  pendingTourPlans: number | null;
  pendingExpenses: number | null;
};

export default function DashboardHome() {
  const [counts, setCounts] = useState<Counts>({
    hcps: null, institutions: null, products: null,
    visitsToday: null, visitsInProgress: null, flaggedVisits: null,
    openAlerts: null, unreadNotifs: null,
    pendingTourPlans: null, pendingExpenses: null
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

      const [hcps, institutions, products, visitsToday, inProgress, flagged, alerts, notifs, tp, ex] = await Promise.all([
        supabase.from("hcps").select("id", { count: "exact", head: true }),
        supabase.from("institutions").select("id", { count: "exact", head: true }),
        supabase.from("products").select("id", { count: "exact", head: true }),
        supabase.from("visits").select("id", { count: "exact", head: true })
          .gte("check_in_at", startOfToday.toISOString()),
        supabase.from("visits").select("id", { count: "exact", head: true })
          .eq("status", "in_progress"),
        supabase.from("visits").select("id", { count: "exact", head: true })
          .in("manager_status", ["flagged", "pending"]),
        supabase.from("compliance_alerts").select("id", { count: "exact", head: true })
          .eq("status", "open").in("severity", ["high", "critical"]),
        supabase.from("notifications").select("id", { count: "exact", head: true })
          .eq("is_read", false),
        supabase.from("tour_plans").select("id", { count: "exact", head: true })
          .eq("status", "submitted"),
        supabase.from("expenses").select("id", { count: "exact", head: true })
          .eq("status", "submitted")
      ]);

      setCounts({
        hcps: hcps.count ?? 0,
        institutions: institutions.count ?? 0,
        products: products.count ?? 0,
        visitsToday: visitsToday.count ?? 0,
        visitsInProgress: inProgress.count ?? 0,
        flaggedVisits: flagged.count ?? 0,
        openAlerts: alerts.count ?? 0,
        unreadNotifs: notifs.count ?? 0,
        pendingTourPlans: tp.count ?? 0,
        pendingExpenses: ex.count ?? 0
      });
    })();
  }, []);

  const totalInbox =
    (counts.pendingTourPlans ?? 0) +
    (counts.flaggedVisits ?? 0) +
    (counts.pendingExpenses ?? 0) +
    (counts.openAlerts ?? 0);

  const kpis = [
    { label: "Visits Today",   value: counts.visitsToday,      icon: ClipboardList, color: "bg-brand-50 text-brand-700",   href: "/dashboard/visits" },
    { label: "In Progress",    value: counts.visitsInProgress, icon: MapPin,        color: "bg-blue-50 text-blue-700",     href: "/dashboard/tracking" },
    { label: "HCPs",           value: counts.hcps,             icon: Users,         color: "bg-purple-50 text-purple-700", href: "/dashboard/hcps" },
    { label: "Institutions",   value: counts.institutions,     icon: Building2,     color: "bg-amber-50 text-amber-700",   href: "/dashboard/institutions" },
    { label: "Products",       value: counts.products,         icon: Pill,          color: "bg-pink-50 text-pink-700",     href: "/dashboard/products" },
    { label: "Review Needed",  value: counts.flaggedVisits,    icon: AlertTriangle, color: counts.flaggedVisits ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-500", href: "/dashboard/inbox" },
    { label: "Critical Alerts",value: counts.openAlerts,       icon: Shield,        color: counts.openAlerts ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-500", href: "/dashboard/inbox" },
    { label: "Unread",         value: counts.unreadNotifs,     icon: Bell,          color: counts.unreadNotifs ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-500", href: "/dashboard/notifications" }
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

      {/* INBOX BANNER — only shown when there are pending items */}
      {totalInbox > 0 && (
        <Link
          href="/dashboard/inbox"
          className="block bg-gradient-to-r from-brand-50 to-blue-50 border border-brand-200 rounded-xl p-5 hover:shadow-md transition group"
        >
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-white shadow-sm relative">
              <Inbox className="w-6 h-6 text-brand-700" />
              <span className="absolute -top-1 -right-1 bg-red-600 text-white text-xs font-bold rounded-full min-w-6 h-6 px-1.5 flex items-center justify-center">
                {totalInbox}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-slate-900">
                {totalInbox} item{totalInbox === 1 ? "" : "s"} need your attention
              </div>
              <div className="text-xs text-slate-600 mt-0.5">
                {[
                  counts.pendingTourPlans ? `${counts.pendingTourPlans} tour plan${counts.pendingTourPlans === 1 ? "" : "s"}` : null,
                  counts.flaggedVisits ? `${counts.flaggedVisits} visit${counts.flaggedVisits === 1 ? "" : "s"} to review` : null,
                  counts.pendingExpenses ? `${counts.pendingExpenses} expense${counts.pendingExpenses === 1 ? "" : "s"}` : null,
                  counts.openAlerts ? `${counts.openAlerts} compliance alert${counts.openAlerts === 1 ? "" : "s"}` : null
                ].filter(Boolean).join(" · ")}
              </div>
            </div>
            <ArrowRight className="w-5 h-5 text-brand-700 group-hover:translate-x-1 transition" />
          </div>
        </Link>
      )}

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
        <QuickCard icon={MapPin}    title="GPS Check-in"   desc="Log a visit with geofence verification"   href="/dashboard/visits/check-in" accent="bg-brand-500" />
        <QuickCard icon={Sparkles}  title="AI Assistant"   desc="Email, WhatsApp, pitches, objections"     href="/dashboard/assistant"       accent="bg-yellow-500" />
        <QuickCard icon={Trophy}    title="Leaderboard"    desc="Rank reps + AI coaching insights"         href="/dashboard/leaderboard"     accent="bg-amber-500" />
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

