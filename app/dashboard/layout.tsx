"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { clearRoleCache } from "@/lib/roles";
import { clearPermsCache, usePerms } from "@/lib/permissions";
import { resourceFor } from "@/lib/routeResource";
import { flushQueue } from "@/lib/offlineQueue";
import Sidebar from "@/components/Sidebar";
import MobileNav from "@/components/MobileNav";
import Topbar from "@/components/Topbar";
import GlobalSearch from "@/components/GlobalSearch";
import DemoBanner from "@/components/DemoBanner";
import OfflineStatus from "@/components/OfflineStatus";

export default function DashboardLayout({
  children
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [checking, setChecking] = useState(true);
  const { can, loading: permsLoading } = usePerms();
  // Every page is checked against its permission here (lib/routeResource),
  // so a page switched off on the Permissions screen cannot be opened by URL.
  const resource = resourceFor(pathname);
  const denied = !checking && !permsLoading && !!resource && !can(resource, "view");

  useEffect(() => {
    if (denied) router.replace("/dashboard");
  }, [denied, router]);

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
      clearPermsCache();
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
        <main className="flex-1 p-4 md:p-6 pb-24 md:pb-6">
          <DemoBanner />
          <OfflineStatus />
          {resource && (permsLoading || denied) ? (
            <div className="p-12 text-center text-slate-500">Loading…</div>
          ) : (
            children
          )}
        </main>
      </div>
      <MobileNav />
      <GlobalSearch />
    </div>
  );
}
