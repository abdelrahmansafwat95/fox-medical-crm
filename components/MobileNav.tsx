"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Home, MapPin, Inbox, Sparkles, ClipboardList } from "lucide-react";

const items = [
  { href: "/dashboard", label: "Home", icon: Home, badge: false },
  { href: "/dashboard/visits", label: "Visits", icon: ClipboardList, badge: false },
  { href: "/dashboard/visits/check-in", label: "Check-in", icon: MapPin, badge: false },
  { href: "/dashboard/inbox", label: "Inbox", icon: Inbox, badge: true },
  { href: "/dashboard/assistant", label: "AI", icon: Sparkles, badge: false }
];

export default function MobileNav() {
  const pathname = usePathname();
  const [inboxCount, setInboxCount] = useState(0);

  useEffect(() => {
    loadCount();
    const id = setInterval(loadCount, 30_000);
    return () => clearInterval(id);
  }, [pathname]);

  async function loadCount() {
    const [tp, fv, ex, al] = await Promise.all([
      supabase.from("tour_plans").select("id", { count: "exact", head: true }).eq("status", "submitted"),
      supabase.from("visits").select("id", { count: "exact", head: true }).eq("manager_status", "flagged"),
      supabase.from("expenses").select("id", { count: "exact", head: true }).eq("status", "submitted"),
      supabase.from("compliance_alerts").select("id", { count: "exact", head: true }).eq("status", "open").in("severity", ["high", "critical"])
    ]);
    setInboxCount((tp.count ?? 0) + (fv.count ?? 0) + (ex.count ?? 0) + (al.count ?? 0));
  }

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 z-30 grid grid-cols-5 shadow-lg">
      {items.map((it) => {
        const Icon = it.icon;
        const active =
          it.href === "/dashboard" ? pathname === "/dashboard" : pathname?.startsWith(it.href);
        return (
          <Link
            key={it.href}
            href={it.href}
            className={`flex flex-col items-center justify-center py-2 text-[10px] gap-1 transition relative ${
              active ? "text-brand-700" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <Icon className="w-5 h-5" />
            <span>{it.label}</span>
            {it.badge && inboxCount > 0 && (
              <span className="absolute top-1 right-3 bg-red-600 text-white text-[9px] font-bold rounded-full min-w-4 h-4 px-1 flex items-center justify-center">
                {inboxCount > 9 ? "9+" : inboxCount}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
