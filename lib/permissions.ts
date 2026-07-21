"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "./supabase";
import { useRole, isManager, MANAGER_ROLES } from "./roles";

/** Every feature is a `resource`; each has one or more `action`s. The admin
 *  Permissions page renders this catalog as a matrix. `view` gates the
 *  page/nav; other actions gate buttons. */
export interface ResourceDef {
  key: string;
  label: string;
  group: string;
  actions: string[];
}

export const RESOURCES: ResourceDef[] = [
  { key: "dashboard", label: "Home", group: "Daily", actions: ["view"] },
  { key: "my_day", label: "My Day", group: "Daily", actions: ["view"] },
  { key: "visits", label: "Visits", group: "Daily", actions: ["view", "approve"] },
  { key: "check_in", label: "GPS Check-in", group: "Daily", actions: ["view"] },
  { key: "tour_plans", label: "Tour Plans", group: "Daily", actions: ["view", "approve"] },
  { key: "events", label: "Events", group: "Daily", actions: ["view", "create"] },
  { key: "notifications", label: "Notifications", group: "Daily", actions: ["view"] },
  { key: "hcps", label: "HCPs", group: "Customers", actions: ["view", "create", "edit", "delete", "assign"] },
  { key: "institutions", label: "Institutions", group: "Customers", actions: ["view", "create", "edit", "delete"] },
  { key: "coverage", label: "Coverage", group: "Customers", actions: ["view"] },
  { key: "frequency", label: "Frequency", group: "Customers", actions: ["view"] },
  { key: "products", label: "Products", group: "Products & Sales", actions: ["view", "create", "edit", "delete"] },
  { key: "samples", label: "Samples", group: "Products & Sales", actions: ["view", "issue", "distribute"] },
  { key: "orders", label: "Orders", group: "Products & Sales", actions: ["view", "create", "manage"] },
  { key: "expenses", label: "Expenses", group: "Products & Sales", actions: ["view", "create", "approve"] },
  { key: "assistant", label: "AI Assistant", group: "AI & Comms", actions: ["view"] },
  { key: "inbox", label: "Approval Inbox", group: "Manager", actions: ["view"] },
  { key: "tracking", label: "Live Tracking", group: "Manager", actions: ["view"] },
  { key: "reports", label: "Reports", group: "Manager", actions: ["view", "export"] },
  { key: "leaderboard", label: "Leaderboard", group: "Manager", actions: ["view"] },
  { key: "targets", label: "Targets", group: "Manager", actions: ["view", "edit"] },
  { key: "compliance", label: "Compliance", group: "Manager", actions: ["view", "manage"] },
  { key: "team", label: "Team", group: "Manager", actions: ["view"] },
  { key: "import", label: "Bulk Import", group: "Manager", actions: ["view"] },
  { key: "settings", label: "Settings", group: "Account", actions: ["view"] },
  { key: "permissions", label: "Permissions", group: "Account", actions: ["view", "manage"] }
];

export const ROLES = [
  "admin",
  "country_manager",
  "sales_director",
  "regional_manager",
  "district_manager",
  "medical_rep_senior",
  "medical_rep"
];

export const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  country_manager: "Country Manager",
  sales_director: "Sales Director",
  regional_manager: "Regional Manager",
  district_manager: "District Manager",
  medical_rep_senior: "Senior Rep",
  medical_rep: "Medical Rep"
};

const REP_VIEW = new Set([
  "dashboard", "my_day", "visits", "check_in", "tour_plans", "events",
  "notifications", "hcps", "institutions", "coverage", "frequency",
  "products", "samples", "orders", "expenses", "assistant", "whatsapp", "settings"
]);
const MANAGER_VIEW = new Set([
  "inbox", "tracking", "reports", "leaderboard", "targets", "compliance", "team", "import"
]);

/** Code-level default grant for a (role, resource, action) when there's no
 *  explicit permission-table override. Admin is granted everything. */
export function defaultCan(role: string | null, resource: string, action: string): boolean {
  if (!role) return false;
  if (role === "admin") return true;
  const mgr = isManager(role);
  const senior = role === "medical_rep_senior";

  if (action === "view") {
    if (resource === "permissions") return false;
    if (MANAGER_VIEW.has(resource)) return mgr;
    return REP_VIEW.has(resource);
  }

  switch (`${resource}:${action}`) {
    case "hcps:create":
    case "hcps:edit":
      return true;
    case "hcps:delete":
      return role === "country_manager";
    case "hcps:assign":
      return mgr;
    case "institutions:create":
    case "institutions:edit":
      return mgr || senior;
    case "institutions:delete":
      return role === "country_manager";
    case "products:create":
    case "products:edit":
    case "products:delete":
      return ["country_manager", "sales_director", "regional_manager"].includes(role);
    case "samples:issue":
      return mgr;
    case "samples:distribute":
      return true;
    case "orders:create":
      return true;
    case "orders:manage":
      return mgr;
    case "events:create":
      return true;
    case "expenses:create":
      return true;
    case "expenses:approve":
      return mgr;
    case "visits:approve":
      return mgr;
    case "tour_plans:approve":
      return mgr;
    case "reports:export":
      return mgr;
    case "targets:edit":
      return mgr;
    case "compliance:manage":
      return mgr;
    case "permissions:manage":
      return false;
    default:
      return false;
  }
}

// Cache the current user's explicit overrides (cleared on auth change).
let cachedPerms: Map<string, boolean> | undefined;
export function clearPermsCache() {
  cachedPerms = undefined;
}

export type Can = (resource: string, action?: string) => boolean;

/** Effective permission check: explicit override (from the permissions table
 *  via get_my_permissions) wins, else the code default for the user's role. */
export function usePerms(): { can: Can; loading: boolean; role: string | null } {
  const { role, loading: roleLoading } = useRole();
  const [overrides, setOverrides] = useState<Map<string, boolean> | undefined>(cachedPerms);
  const [loading, setLoading] = useState(cachedPerms === undefined);

  useEffect(() => {
    let mounted = true;
    if (cachedPerms !== undefined) {
      setOverrides(cachedPerms);
      setLoading(false);
      return;
    }
    (async () => {
      const { data } = await supabase.rpc("get_my_permissions");
      const m = new Map<string, boolean>();
      for (const r of (data ?? []) as { resource: string; action: string; granted: boolean }[]) {
        m.set(`${r.resource}:${r.action}`, r.granted);
      }
      cachedPerms = m;
      if (mounted) {
        setOverrides(m);
        setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const can = useCallback<Can>(
    (resource, action = "view") => {
      if (role === "admin") return true;
      const ov = overrides?.get(`${resource}:${action}`);
      if (ov !== undefined) return ov;
      return defaultCan(role, resource, action);
    },
    [role, overrides]
  );

  return { can, loading: loading || roleLoading, role };
}

/** Page guard: redirect to /dashboard unless the user can `view` (or the given
 *  action on) the resource. */
export function useRequirePermission(
  resource: string,
  action = "view"
): { checking: boolean; allowed: boolean } {
  const router = useRouter();
  const { can, loading } = usePerms();
  const allowed = can(resource, action);
  useEffect(() => {
    if (!loading && !allowed) router.replace("/dashboard");
  }, [loading, allowed, router]);
  return { checking: loading || !allowed, allowed };
}

export { MANAGER_ROLES };
