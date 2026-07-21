"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "./supabase";

/** Roles that may approve/reject and use manager tooling. Mirrors the RLS
 *  manager checks (get_user_role() IN (...)) used across the DB policies. */
export const MANAGER_ROLES = [
  "admin",
  "country_manager",
  "sales_director",
  "regional_manager",
  "district_manager"
];

export function isManager(role?: string | null): boolean {
  return !!role && MANAGER_ROLES.includes(role);
}

// Module-level cache so we don't re-query the role on every page mount.
// `undefined` = not loaded yet; `null` = loaded, no role. Cleared on any
// auth-state change (see dashboard layout + login) to avoid a previous user's
// role leaking into a new session on the same tab.
let cachedRole: string | null | undefined = undefined;

export function clearRoleCache() {
  cachedRole = undefined;
}

/** Current signed-in user's role (cached). */
export function useRole(): { role: string | null; loading: boolean } {
  const [role, setRole] = useState<string | null | undefined>(cachedRole);
  const [loading, setLoading] = useState<boolean>(cachedRole === undefined);

  useEffect(() => {
    let mounted = true;
    if (cachedRole !== undefined) {
      setRole(cachedRole);
      setLoading(false);
      return;
    }
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) {
        cachedRole = null;
        if (mounted) {
          setRole(null);
          setLoading(false);
        }
        return;
      }
      const { data: p } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", u.user.id)
        .single();
      cachedRole = p?.role ?? null;
      if (mounted) {
        setRole(cachedRole);
        setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  return { role: role ?? null, loading };
}

/** Guard for manager-only pages: redirects non-managers to /dashboard.
 *  `checking` is true while loading OR when the user is not allowed (redirect
 *  in flight) — render a placeholder until it clears. */
export function useRequireManager(): { checking: boolean; allowed: boolean } {
  const router = useRouter();
  const { role, loading } = useRole();
  const allowed = isManager(role);

  useEffect(() => {
    if (!loading && !allowed) router.replace("/dashboard");
  }, [loading, allowed, router]);

  return { checking: loading || !allowed, allowed };
}
