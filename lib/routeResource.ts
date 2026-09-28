/**
 * Which permission resource (lib/permissions.ts RESOURCES) guards each page.
 *
 * The dashboard layout checks can(resource, "view") for every route through
 * this map. Before, only 11 of the 36 pages called useRequirePermission, so an
 * admin switching a page off on the Permissions screen hid it from the menu but
 * the URL still opened — and the AI Assistant had no check at all.
 *
 * Longest prefix wins. /dashboard itself is not guarded (it is where denied
 * users are sent). /dashboard/admin/* are admin tools: `permissions` view is
 * granted to admins only.
 */
const ROUTE_RESOURCES: Array<[string, string]> = [
  ["/dashboard/my-day", "my_day"],
  ["/dashboard/visits/check-in", "check_in"],
  ["/dashboard/visits", "visits"],
  ["/dashboard/tour-plans", "tour_plans"],
  ["/dashboard/events", "events"],
  ["/dashboard/notifications", "notifications"],
  ["/dashboard/hcps", "hcps"],
  ["/dashboard/institutions", "institutions"],
  ["/dashboard/coverage", "coverage"],
  ["/dashboard/frequency", "frequency"],
  ["/dashboard/products", "products"],
  ["/dashboard/samples", "samples"],
  ["/dashboard/orders", "orders"],
  ["/dashboard/expenses", "expenses"],
  ["/dashboard/assistant", "assistant"],
  ["/dashboard/whatsapp", "whatsapp"],
  ["/dashboard/inbox", "inbox"],
  ["/dashboard/tracking", "tracking"],
  ["/dashboard/reports", "reports"],
  ["/dashboard/sales", "reports"],
  ["/dashboard/leaderboard", "leaderboard"],
  ["/dashboard/targets", "targets"],
  ["/dashboard/compliance", "compliance"],
  ["/dashboard/team", "team"],
  ["/dashboard/import", "import"],
  ["/dashboard/settings", "settings"],
  ["/dashboard/permissions", "permissions"],
  ["/dashboard/admin", "permissions"],
  // Managing keys and webhooks is admin-only in the database; managers may look.
  ["/dashboard/integrations", "team"],
];

export function resourceFor(pathname: string): string | null {
  let best: [string, string] | null = null;
  for (const entry of ROUTE_RESOURCES) {
    const [prefix] = entry;
    if ((pathname === prefix || pathname.startsWith(prefix + "/")) && (!best || prefix.length > best[0].length)) {
      best = entry;
    }
  }
  return best ? best[1] : null;
}
