"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
  UserCircle
} from "lucide-react";

const NAV_GROUPS: { title: string; items: { href: string; label: string; icon: typeof LayoutDashboard }[] }[] = [
  {
    title: "Daily",
    items: [
      { href: "/dashboard", label: "Home", icon: LayoutDashboard },
      { href: "/dashboard/visits", label: "Visits", icon: ClipboardList },
      { href: "/dashboard/visits/check-in", label: "Check-in", icon: MapPin },
      { href: "/dashboard/tour-plans", label: "Tour Plans", icon: Calendar },
      { href: "/dashboard/notifications", label: "Notifications", icon: Bell },
    ]
  },
  {
    title: "Customers",
    items: [
      { href: "/dashboard/hcps", label: "HCPs", icon: Users },
      { href: "/dashboard/institutions", label: "Institutions", icon: Building2 },
      { href: "/dashboard/coverage", label: "Coverage", icon: UserCircle },
    ]
  },
  {
    title: "Products & Sales",
    items: [
      { href: "/dashboard/products", label: "Products", icon: Pill },
      { href: "/dashboard/samples", label: "Samples", icon: Package },
      { href: "/dashboard/orders", label: "Orders", icon: ShoppingCart },
      { href: "/dashboard/expenses", label: "Expenses", icon: Receipt },
    ]
  },
  {
    title: "AI & Communication",
    items: [
      { href: "/dashboard/assistant", label: "AI Assistant", icon: Sparkles },
      { href: "/dashboard/whatsapp", label: "WhatsApp", icon: MessageCircle },
    ]
  },
  {
    title: "Manager",
    items: [
      { href: "/dashboard/tracking", label: "Live Tracking", icon: MapPin },
      { href: "/dashboard/reports", label: "Reports", icon: BarChart3 },
      { href: "/dashboard/leaderboard", label: "Leaderboard", icon: Trophy },
      { href: "/dashboard/targets", label: "Targets", icon: TargetIcon },
      { href: "/dashboard/compliance", label: "Compliance", icon: Shield },
      { href: "/dashboard/team", label: "Team", icon: Users },
      { href: "/dashboard/settings", label: "Settings", icon: Settings }
    ]
  }
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-60 bg-white border-r border-slate-200 hidden md:flex flex-col h-screen sticky top-0">
      <div className="p-4 border-b border-slate-200 flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-brand-600 text-white flex items-center justify-center font-bold">
          🦊
        </div>
        <div>
          <div className="font-bold text-slate-900 text-sm leading-tight">Fox Medical</div>
          <div className="text-[10px] text-slate-500">CRM v0.3</div>
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto p-2">
        {NAV_GROUPS.map((group) => (
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
                  {item.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
    </aside>
  );
}
