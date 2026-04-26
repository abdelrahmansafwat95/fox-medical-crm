"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, MapPin, ClipboardList, Bell, Sparkles } from "lucide-react";

const items = [
  { href: "/dashboard", label: "Home", icon: Home },
  { href: "/dashboard/visits", label: "Visits", icon: ClipboardList },
  { href: "/dashboard/visits/check-in", label: "Check-in", icon: MapPin },
  { href: "/dashboard/assistant", label: "AI", icon: Sparkles },
  { href: "/dashboard/notifications", label: "Alerts", icon: Bell }
];

export default function MobileNav() {
  const pathname = usePathname();
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
            className={`flex flex-col items-center justify-center py-2 text-[10px] gap-1 transition ${
              active ? "text-brand-700" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <Icon className="w-5 h-5" />
            <span>{it.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
