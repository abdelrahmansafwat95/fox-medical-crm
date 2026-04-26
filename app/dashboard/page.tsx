"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  Users,
  Building2,
  ClipboardList,
  Pill,
  TrendingUp,
  AlertCircle
} from "lucide-react";

type Counts = {
  hcps: number | null;
  institutions: number | null;
  products: number | null;
  visitsToday: number | null;
};

export default function DashboardHome() {
  const [counts, setCounts] = useState<Counts>({
    hcps: null,
    institutions: null,
    products: null,
    visitsToday: null
  });
  const [userName, setUserName] = useState<string>("");

  useEffect(() => {
    (async () => {
      // Pull user name
      const { data: u } = await supabase.auth.getUser();
      if (u.user) {
        const { data: p } = await supabase
          .from("profiles")
          .select("full_name, full_name_ar")
          .eq("id", u.user.id)
          .single();
        setUserName(p?.full_name ?? u.user.email ?? "");
      }

      // Pull counts in parallel
      const [hcps, institutions, products] = await Promise.all([
        supabase.from("hcps").select("id", { count: "exact", head: true }),
        supabase.from("institutions").select("id", { count: "exact", head: true }),
        supabase.from("products").select("id", { count: "exact", head: true })
      ]);

      setCounts({
        hcps: hcps.count ?? 0,
        institutions: institutions.count ?? 0,
        products: products.count ?? 0,
        visitsToday: 0 // wired up in Step 3 once visits table exists
      });
    })();
  }, []);

  const kpis = [
    {
      label: "Visits Today",
      value: counts.visitsToday,
      icon: ClipboardList,
      color: "bg-brand-50 text-brand-700",
      hint: "Coming in Step 3"
    },
    {
      label: "HCPs in Database",
      value: counts.hcps,
      icon: Users,
      color: "bg-blue-50 text-blue-700",
      hint: ""
    },
    {
      label: "Institutions",
      value: counts.institutions,
      icon: Building2,
      color: "bg-amber-50 text-amber-700",
      hint: ""
    },
    {
      label: "Active Products",
      value: counts.products,
      icon: Pill,
      color: "bg-purple-50 text-purple-700",
      hint: ""
    }
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Welcome */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          Welcome{userName ? `, ${userName.split(" ")[0]}` : ""} 👋
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Here&apos;s what&apos;s happening across your field force today.
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {kpis.map((k) => {
          const Icon = k.icon;
          return (
            <div
              key={k.label}
              className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm"
            >
              <div className="flex items-center justify-between">
                <div className={`p-2 rounded-lg ${k.color}`}>
                  <Icon className="w-5 h-5" />
                </div>
              </div>
              <div className="mt-4">
                <div className="text-2xl font-bold text-slate-900">
                  {k.value === null ? "—" : k.value.toLocaleString()}
                </div>
                <div className="text-xs text-slate-500">{k.label}</div>
                {k.hint && (
                  <div className="text-[10px] text-amber-600 mt-1">{k.hint}</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Quick start checklist */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-brand-50 text-brand-700">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <h2 className="font-semibold text-slate-900">Build progress</h2>
            <p className="text-sm text-slate-500 mb-4">
              Step-by-step rollout of FoxSystems Medical CRM.
            </p>
            <ul className="space-y-2 text-sm">
              <Step done label="Step 1 — Database foundation (profiles, RBAC, territories)" />
              <Step done label="Step 2 — Medical entities (HCPs, institutions, products)" />
              <Step done label="Step 3 — Project scaffold + login + dashboard shell (you are here)" />
              <Step label="Step 4 — Visits + GPS check-in + geofencing" />
              <Step label="Step 5 — Live tracking map" />
              <Step label="Step 6 — AI features (segmentation, visit summaries, coaching)" />
              <Step label="Step 7 — Samples, orders, reports" />
            </ul>
          </div>
        </div>
      </div>

      {/* Disclosure */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-amber-900">
          <strong>Note:</strong> If the counts above show zeros, make sure you ran the
          SQL files (00 → 03) in your Supabase project and that you&apos;re signed in as
          the admin user.
        </div>
      </div>
    </div>
  );
}

function Step({ label, done = false }: { label: string; done?: boolean }) {
  return (
    <li className="flex items-center gap-2">
      <span
        className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[11px] font-bold ${
          done ? "bg-brand-600 text-white" : "bg-slate-200 text-slate-500"
        }`}
      >
        {done ? "✓" : "·"}
      </span>
      <span className={done ? "text-slate-900" : "text-slate-500"}>{label}</span>
    </li>
  );
}
