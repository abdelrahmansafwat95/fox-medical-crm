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
  FileSpreadsheet
} from "lucide-react";
import { useRole, isManager } from "@/lib/roles";

interface NavItem {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  badgeKey?: "inbox" | "notifications";
}

interface NavGroup {
  title: string;
  items: NavItem[];
  /** Only shown to manager roles (admin / country / sales / regional / district). */
  managerOnly?: boolean;
}

const NAV_GROUPS: NavGroup[] = [
  {
    title: "Daily",
    items: [
      { href: "/dashboard", label: "Home", icon: LayoutDashboard },
      { href: "/dashboard/visits", label: "Visits", icon: ClipboardList },
      { href: "/dashboard/visits/check-in", label: "Check-in", icon: MapPin },
      { href: "/dashboard/tour-plans", label: "Tour Plans", icon: Calendar },
      { href: "/dashboard/events", label: "Events", icon: CalendarDays },
      { href: "/dashboard/notifications", label: "Notifications", icon: Bell, badgeKey: "notifications" }
    ]
  },
  {
    title: "Customers",
    items: [
      { href: "/dashboard/hcps", label: "HCPs", icon: Users },
      { href: "/dashboard/institutions", label: "Institutions", icon: Building2 },
      { href: "/dashboard/coverage", label: "Coverage", icon: UserCircle },
      { href: "/dashboard/frequency", label: "Frequency", icon: TrendingUp }
    ]
  },
  {
    title: "Products & Sales",
    items: [
      { href: "/dashboard/products", label: "Products", icon: Pill },
      { href: "/dashboard/samples", label: "Samples", icon: Package },
      { href: "/dashboard/orders", label: "Orders", icon: ShoppingCart },
      { href: "/dashboard/expenses", label: "Expenses", icon: Receipt }
    ]
  },
  {
    title: "AI & Communication",
    items: [
      { href: "/dashboard/assistant", label: "AI Assistant", icon: Sparkles },
      { href: "/dashboard/whatsapp", label: "WhatsApp", icon: MessageCircle }
    ]
  },
  {
    title: "Manager",
    managerOnly: true,
    items: [
      { href: "/dashboard/inbox", label: "Approval Inbox", icon: Inbox, badgeKey: "inbox" },
      { href: "/dashboard/tracking", label: "Live Tracking", icon: MapPin },
      { href: "/dashboard/reports", label: "Reports", icon: BarChart3 },
      { href: "/dashboard/leaderboard", label: "Leaderboard", icon: Trophy },
      { href: "/dashboard/targets", label: "Targets", icon: TargetIcon },
      { href: "/dashboard/compliance", label: "Compliance", icon: Shield },
      { href: "/dashboard/team", label: "Team", icon: Users },
      { href: "/dashboard/import", label: "Bulk Import", icon: FileSpreadsheet }
    ]
  },
  {
    title: "Account",
    items: [{ href: "/dashboard/settings", label: "Settings", icon: Settings }]
  }
];

export default function Sidebar() {
  const pathname = usePathname();
  const { role } = useRole();
  const manager = isManager(role);
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
    <aside className="w-60 bg-white border-r border-slate-200 hidden md:flex flex-col h-screen sticky top-0">
      <div className="p-4 border-b border-slate-200 flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-brand-600 text-white flex items-center justify-center font-bold">
          🦊
        </div>
        <div>
          <div className="font-bold text-slate-900 text-sm leading-tight">Fox Medical</div>
          <div className="text-[10px] text-slate-500">CRM v0.12</div>
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto p-2">
        {NAV_GROUPS.filter((group) => !group.managerOnly || manager).map((group) => (
          <div key={group.title} className="mb-3">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2 mb-1">
              {group.title}
            </div>
            {group.items.map((item) => {
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
                      ? "bg-brand-50 text-brand-700 font-medium"
                      : "text-slate-700 hover:bg-slate-50"
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
        ))}
      </nav>
    </aside>
  );
}
