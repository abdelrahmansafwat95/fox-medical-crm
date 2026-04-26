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
  UserCog,
  Settings,
  LogOut
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

const NAV: NavItem[] = [
  { href: "/dashboard",              label: "Dashboard",   icon: LayoutDashboard },
  { href: "/dashboard/hcps",         label: "HCPs",        icon: Users },
  { href: "/dashboard/institutions", label: "Institutions",icon: Building2 },
  { href: "/dashboard/products",     label: "Products",    icon: Pill },
  { href: "/dashboard/visits",       label: "Visits",      icon: ClipboardList },
  { href: "/dashboard/tracking",     label: "Live Tracking",icon: MapPin },
  { href: "/dashboard/samples",      label: "Samples",     icon: Package },
  { href: "/dashboard/orders",       label: "Orders",      icon: ShoppingCart },
  { href: "/dashboard/reports",      label: "Reports",     icon: BarChart3 },
  { href: "/dashboard/team",         label: "Team",        icon: UserCog },
  { href: "/dashboard/settings",     label: "Settings",    icon: Settings }
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  return (
    <aside className="hidden md:flex w-64 shrink-0 flex-col bg-white border-e border-slate-200 h-screen sticky top-0">
      {/* Brand */}
      <div className="p-5 border-b border-slate-200">
        <Link href="/dashboard" className="flex items-center gap-2">
          <span className="text-2xl">🦊💊</span>
          <div>
            <div className="font-bold text-slate-900 leading-tight">Fox Medical</div>
            <div className="text-[11px] text-slate-500 leading-tight">FoxSystems Tech</div>
          </div>
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto p-3 space-y-1">
        {NAV.map((item) => {
          const active =
            pathname === item.href ||
            (item.href !== "/dashboard" && pathname?.startsWith(item.href));
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition",
                active
                  ? "bg-brand-50 text-brand-700 font-medium"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              )}
            >
              <Icon className="w-4 h-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Sign out */}
      <div className="p-3 border-t border-slate-200">
        <button
          onClick={handleSignOut}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-600 hover:bg-red-50 hover:text-red-700 transition"
        >
          <LogOut className="w-4 h-4" />
          Sign out
        </button>
      </div>
    </aside>
  );
}
