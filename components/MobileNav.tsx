"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  ClipboardList,
  MapPin,
  Menu
} from "lucide-react";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/dashboard",          label: "Home",     icon: LayoutDashboard },
  { href: "/dashboard/hcps",     label: "HCPs",     icon: Users },
  { href: "/dashboard/visits",   label: "Visits",   icon: ClipboardList },
  { href: "/dashboard/tracking", label: "Tracking", icon: MapPin },
  { href: "/dashboard/settings", label: "More",     icon: Menu }
];

export default function MobileNav() {
  const pathname = usePathname();
  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 bg-white border-t border-slate-200 grid grid-cols-5 z-30 pb-[env(safe-area-inset-bottom)]">
      {ITEMS.map((item) => {
        const active =
          pathname === item.href ||
          (item.href !== "/dashboard" && pathname?.startsWith(item.href));
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex flex-col items-center justify-center py-2 gap-0.5 text-[11px]",
              active ? "text-brand-600" : "text-slate-500"
            )}
          >
            <Icon className="w-5 h-5" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
