"use client";

import { useEffect, useState } from "react";
import { Bell, User } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { Profile } from "@/lib/types";

export default function Topbar() {
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const { data: p } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", u.user.id)
        .single();
      if (p) setProfile(p as Profile);
    })();
  }, []);

  return (
    <header className="sticky top-0 z-20 bg-white/80 backdrop-blur border-b border-slate-200 px-4 md:px-6 py-3 flex items-center justify-between">
      {/* Mobile brand */}
      <div className="md:hidden flex items-center gap-2">
        <span className="text-xl">🦊💊</span>
        <span className="font-semibold text-slate-900">Fox Medical</span>
      </div>

      <div className="hidden md:block" />

      <div className="flex items-center gap-3">
        <button
          aria-label="Notifications"
          className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 relative"
        >
          <Bell className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200">
          <div className="w-7 h-7 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center">
            <User className="w-4 h-4" />
          </div>
          <div className="hidden sm:block text-xs leading-tight">
            <div className="font-medium text-slate-900">
              {profile?.full_name ?? profile?.email ?? "Loading…"}
            </div>
            <div className="text-slate-500 capitalize">
              {profile?.role?.replaceAll("_", " ") ?? ""}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
