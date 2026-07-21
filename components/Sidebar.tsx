"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  LayoutDashboard,
  Users,
  Building2,
  Pill,
  ClipboardList,
  MapPin,
  Package,
  ShoppingCart,
  BarChart3,
  Settings,
  Calendar,
  Trophy,
  Target as TargetIcon,
  Shield,
  Bell,
  MessageCircle,
  Sparkles,
  Receipt,
  UserCircle,
  Inbox,
  TrendingUp,
  CalendarDays,
  CalendarCheck,
  FileSpreadsheet,
  KeyRound
} from "lucide-react";
import { usePerms } from "@/lib/permissions";
import ThemeToggle from "@/components/ThemeToggle";

interface NavItem {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  /** Permission resource gating this item's visibility (view). */
  resource: string;
  badgeKey?: "inbox" | "notifications";
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    title: "Daily",
    items: [
      { href: "/dashboard", label: "Home", icon: LayoutDashboard, resource: "dashboard" },
      { href: "/dashboard/my-day", label: "My Day", icon: CalendarCheck, resource: "my_day" },
      { href: "/dashboard/visits", label: "Visits", icon: ClipboardList, resource: "visits" },
      { href: "/dashboard/visits/check-in", label: "Check-in", icon: MapPin, resource: "check_in" },
      { href: "/dashboard/tour-plans", label: "Tour Plans", icon: Calendar, resource: "tour_plans" },
      { href: "/dashboard/events", label: "Events", icon: CalendarDays, resource: "events" },
      { href: "/dashboard/notifications", label: "Notifications", icon: Bell, resource: "notifications", badgeKey: "notifications" }
    ]
  },
  {
    title: "Customers",
    items: [
      { href: "/dashboard/hcps", label: "HCPs", icon: Users, resource: "hcps" },
      { href: "/dashboard/institutions", label: "Institutions", icon: Building2, resource: "institutions" },
      { href: "/dashboard/coverage", label: "Coverage", icon: UserCircle, resource: "coverage" },
      { href: "/dashboard/frequency", label: "Frequency", icon: TrendingUp, resource: "frequency" }
    ]
  },
  {
    title: "Products & Sales",
    items: [
      { href: "/dashboard/products", label: "Products", icon: Pill, resource: "products" },
      { href: "/dashboard/samples", label: "Samples", icon: Package, resource: "samples" },
      { href: "/dashboard/orders", label: "Orders", icon: ShoppingCart, resource: "orders" },
      { href: "/dashboard/expenses", label: "Expenses", icon: Receipt, resource: "expenses" }
    ]
  },
  {
    title: "AI & Communication",
    items: [
      { href: "/dashboard/assistant", label: "AI Assistant", icon: Sparkles, resource: "assistant" },
      { href: "/dashboard/whatsapp", label: "WhatsApp", icon: MessageCircle, resource: "whatsapp" }
    ]
  },
  {
    title: "Manager",
    items: [
      { href: "/dashboard/inbox", label: "Approval Inbox", icon: Inbox, resource: "inbox", badgeKey: "inbox" },
      { href: "/dashboard/tracking", label: "Live Tracking", icon: MapPin, resource: "tracking" },
      { href: "/dashboard/reports", label: "Reports", icon: BarChart3, resource: "reports" },
      { href: "/dashboard/leaderboard", label: "Leaderboard", icon: Trophy, resource: "leaderboard" },
      { href: "/dashboard/targets", label: "Targets", icon: TargetIcon, resource: "targets" },
      { href: "/dashboard/compliance", label: "Compliance", icon: Shield, resource: "compliance" },
      { href: "/dashboard/team", label: "Team", icon: Users, resource: "team" },
      { href: "/dashboard/import", label: "Bulk Import", icon: FileSpreadsheet, resource: "import" }
    ]
  },
  {
    title: "Account",
    items: [
      { href: "/dashboard/settings", label: "Settings", icon: Settings, resource: "settings" },
      { href: "/dashboard/permissions", label: "Permissions", icon: KeyRound, resource: "permissions" }
    ]
  }
];

export default function Sidebar() {
  const pathname = usePathname();
  const { can } = usePerms();
  const [counts, setCounts] = useState<{ inbox: number; notifications: number }>({
    inbox: 0,
    notifications: 0
  });

  useEffect(() => {
    loadCounts();
    const id = setInterval(loadCounts, 30_000);
    return () => clearInterval(id);
  }, [pathname]);

  async function loadCounts() {
    const [tp, fv, ex, al, n] = await Promise.all([
      supabase.from("tour_plans").select("id", { count: "exact", head: true }).eq("status", "submitted"),
      supabase.from("visits").select("id", { count: "exact", head: true }).eq("manager_status", "flagged"),
      supabase.from("expenses").select("id", { count: "exact", head: true }).eq("status", "submitted"),
      supabase.from("compliance_alerts").select("id", { count: "exact", head: true }).eq("status", "open").in("severity", ["high", "critical"]),
      supabase.from("notifications").select("id", { count: "exact", head: true }).eq("is_read", false)
    ]);
    setCounts({
      inbox: (tp.count ?? 0) + (fv.count ?? 0) + (ex.count ?? 0) + (al.count ?? 0),
      notifications: n.count ?? 0
    });
  }

  return (
    <aside className="w-60 bg-fox-navy border-r border-white/10 hidden md:flex flex-col h-screen sticky top-0">
      <div className="p-4 border-b border-white/10 flex items-center gap-2">
        <div className="w-9 h-9 rounded-lg bg-white/5 ring-1 ring-white/10 flex items-center justify-center p-1 shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-mark.png" alt="Fox Systems" className="w-full h-full object-contain" />
        </div>
        <div>
          <div className="font-bold text-white text-sm leading-tight">Fox Medical</div>
          <div className="text-[10px] text-slate-400">CRM v0.12</div>
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto p-2">
        {NAV_GROUPS.map((group) => {
          const items = group.items.filter((item) => can(item.resource, "view"));
          if (items.length === 0) return null;
          return (
          <div key={group.title} className="mb-3">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2 mb-1">
              {group.title}
            </div>
            {items.map((item) => {
              const Icon = item.icon;
              const active =
                item.href === "/dashboard"
                  ? pathname === "/dashboard"
                  : pathname?.startsWith(item.href);
              const count = item.badgeKey ? counts[item.badgeKey] : 0;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm transition mb-0.5 ${
                    active
                      ? "bg-brand-600 text-white font-medium shadow-sm shadow-brand-900/40"
                      : "text-slate-300 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="flex-1">{item.label}</span>
                  {count > 0 && (
                    <span className="bg-red-600 text-white text-[10px] font-bold rounded-full min-w-5 h-5 px-1.5 flex items-center justify-center">
                      {count > 99 ? "99+" : count}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
          );
        })}
      </nav>
      <div className="p-2 border-t border-white/10">
        <ThemeToggle />
      </div>
    </aside>
  );
}
