"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRequirePermission, RESOURCES, ROLES, ROLE_LABELS, defaultCan } from "@/lib/permissions";
import { KeyRound, Loader2, RotateCcw, Check, X } from "lucide-react";

interface PermRow {
  id: string;
  resource: string;
  action: string;
  granted: boolean;
}
interface ProfileRow {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string;
}

export default function PermissionsPage() {
  const { checking } = useRequirePermission("permissions", "manage");

  const [targetType, setTargetType] = useState<"role" | "user">("role");
  const [roleTarget, setRoleTarget] = useState("medical_rep");
  const [userTarget, setUserTarget] = useState("");
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [rows, setRows] = useState<PermRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);

  const targetId = targetType === "role" ? roleTarget : userTarget;
  const targetRole =
    targetType === "role" ? roleTarget : profiles.find((p) => p.id === userTarget)?.role ?? null;

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, email, role")
        .order("role")
        .order("full_name");
      const list = (data ?? []) as ProfileRow[];
      setProfiles(list);
      if (list.length > 0) setUserTarget((u) => u || list[0].id);
    })();
  }, []);

  useEffect(() => {
    if (!targetId) {
      setRows([]);
      return;
    }
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("permissions")
        .select("id, resource, action, granted")
        .eq("target_type", targetType)
        .eq("target_id", targetId);
      setRows((data ?? []) as PermRow[]);
      setLoading(false);
    })();
  }, [targetType, targetId]);

  async function reload() {
    const { data } = await supabase
      .from("permissions")
      .select("id, resource, action, granted")
      .eq("target_type", targetType)
      .eq("target_id", targetId);
    setRows((data ?? []) as PermRow[]);
  }

  function effective(resource: string, action: string): boolean {
    const ov = rows.find((r) => r.resource === resource && r.action === action);
    if (ov) return ov.granted;
    return defaultCan(targetRole, resource, action);
  }
  function isOverridden(resource: string, action: string): boolean {
    return rows.some((r) => r.resource === resource && r.action === action);
  }

  async function toggle(resource: string, action: string) {
    if (!targetId) return;
    setSaving(`${resource}:${action}`);
    const next = !effective(resource, action);
    const existing = rows.find((r) => r.resource === resource && r.action === action);
    if (existing) {
      await supabase.from("permissions").update({ granted: next }).eq("id", existing.id);
    } else {
      await supabase.from("permissions").insert({
        target_type: targetType,
        target_id: targetId,
        resource,
        action,
        scope: "all",
        granted: next
      });
    }
    await reload();
    setSaving(null);
  }

  async function clearOverrides() {
    if (!targetId) return;
    if (!confirm("Reset all overrides for this target back to role defaults?")) return;
    await supabase.from("permissions").delete().eq("target_type", targetType).eq("target_id", targetId);
    await reload();
  }

  const groups = useMemo(() => {
    const g: Record<string, typeof RESOURCES> = {};
    for (const r of RESOURCES) (g[r.group] ??= []).push(r);
    return g;
  }, []);

  if (checking) {
    return <div className="max-w-4xl mx-auto p-12 text-center text-slate-500">Loading…</div>;
  }

  const isAdminTarget = targetRole === "admin";

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-2">
        <div className="p-2 rounded-lg bg-brand-50 text-brand-700">
          <KeyRound className="w-6 h-6" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900">Permissions</h1>
      </div>
      <p className="text-slate-500 mb-4">
        Control who can see and do what — per role, or override for a specific user. A colored
        chip = allowed; a dot marks a manual override of the role default.
      </p>

      {/* Target picker */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 mb-4">
        <div className="flex items-center gap-2 mb-3">
          <button
            onClick={() => setTargetType("role")}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium ${targetType === "role" ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-700"}`}
          >
            By role
          </button>
          <button
            onClick={() => setTargetType("user")}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium ${targetType === "user" ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-700"}`}
          >
            By user
          </button>
          <button
            onClick={clearOverrides}
            className="ml-auto text-xs px-3 py-1.5 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 inline-flex items-center gap-1"
          >
            <RotateCcw className="w-3 h-3" /> Reset to defaults
          </button>
        </div>
        {targetType === "role" ? (
          <select
            value={roleTarget}
            onChange={(e) => setRoleTarget(e.target.value)}
            className="w-full sm:w-72 p-2.5 border border-slate-300 rounded-lg text-sm"
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>{ROLE_LABELS[r] ?? r}</option>
            ))}
          </select>
        ) : (
          <select
            value={userTarget}
            onChange={(e) => setUserTarget(e.target.value)}
            className="w-full sm:w-96 p-2.5 border border-slate-300 rounded-lg text-sm"
          >
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {(p.full_name ?? p.email ?? "User")} — {ROLE_LABELS[p.role] ?? p.role}
              </option>
            ))}
          </select>
        )}
        {isAdminTarget && (
          <p className="text-[11px] text-amber-700 mt-2">
            Admins always have full access — overrides don&apos;t apply to them.
          </p>
        )}
      </div>

      {loading ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12 text-center text-slate-500">
          <Loader2 className="w-5 h-5 animate-spin mx-auto" />
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(groups).map(([groupName, resources]) => (
            <div key={groupName} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-4 py-2 border-b border-slate-100 text-xs font-bold uppercase tracking-wide text-slate-500">
                {groupName}
              </div>
              <div className="divide-y divide-slate-100">
                {resources.map((res) => (
                  <div key={res.key} className="p-3 flex items-center gap-3 flex-wrap">
                    <div className="w-40 shrink-0 text-sm font-medium text-slate-800">{res.label}</div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {res.actions.map((action) => {
                        const on = effective(res.key, action);
                        const overridden = isOverridden(res.key, action);
                        const busy = saving === `${res.key}:${action}`;
                        return (
                          <button
                            key={action}
                            onClick={() => toggle(res.key, action)}
                            disabled={busy || isAdminTarget}
                            className={`relative text-xs px-2.5 py-1 rounded-lg border inline-flex items-center gap-1 transition disabled:opacity-60 ${
                              on
                                ? "bg-brand-50 border-brand-300 text-brand-700"
                                : "bg-slate-50 border-slate-200 text-slate-400"
                            }`}
                            title={overridden ? "Manual override" : "Role default"}
                          >
                            {busy ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : on ? (
                              <Check className="w-3 h-3" />
                            ) : (
                              <X className="w-3 h-3" />
                            )}
                            {action}
                            {overridden && <span className="w-1.5 h-1.5 rounded-full bg-amber-500 ml-0.5" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-[11px] text-slate-400 mt-4">
        Note: changes take effect for a user on their next sign-in (permissions are cached per
        session). Row-level database security still applies regardless of these UI settings.
      </p>
    </div>
  );
}
