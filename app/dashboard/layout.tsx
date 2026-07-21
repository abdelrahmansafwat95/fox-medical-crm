"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { clearRoleCache } from "@/lib/roles";
import { flushQueue } from "@/lib/offlineQueue";
import Sidebar from "@/components/Sidebar";
import MobileNav from "@/components/MobileNav";
import Topbar from "@/components/Topbar";
import GlobalSearch from "@/components/GlobalSearch";

export default function DashboardLayout({
  children
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      if (!data.session) {
        router.replace("/login");
      } else {
        setChecking(false);
      }
    })();

    // Sign-out from another tab → redirect immediately. Clear the cached role
    // on any auth change so a previous user's role can't leak into a new session.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      clearRoleCache();
      if (!session) router.replace("/login");
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [router]);

  // Flush any check-ins queued while offline — on reconnect and once on mount.
  useEffect(() => {
    const onOnline = () => {
      flushQueue().catch(() => {});
    };
    window.addEventListener("online", onOnline);
    if (typeof navigator === "undefined" || navigator.onLine) {
      flushQueue().catch(() => {});
    }
    return () => window.removeEventListener("online", onOnline);
  }, []);

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-500">
        Loading…
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-slate-50">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar />
        <main className="flex-1 p-4 md:p-6 pb-24 md:pb-6">{children}</main>
      </div>
      <MobileNav />
      <GlobalSearch />
    </div>
  );
}
