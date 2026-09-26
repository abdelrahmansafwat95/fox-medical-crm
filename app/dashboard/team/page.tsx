"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useRequirePermission } from "@/lib/permissions";
import { useRole } from "@/lib/roles";
import EditModal, { type FieldConfig } from "@/components/EditModal";
import { Users, Mail, Phone, Search, Pencil, UserCheck } from "lucide-react";

interface ProfileRow {
  id: string;
  code: string | null;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  role: string;
  product_line: string | null;
  is_active: boolean;
  line_manager_id: string | null;
  branch_id: string | null;
  territory_id: string | null;
}

const ROLE_COLORS: Record<string, string> = {
  admin: "bg-red-100 text-red-700",
  country_manager: "bg-purple-100 text-purple-700",
  sales_director: "bg-purple-100 text-purple-700",
  regional_manager: "bg-blue-100 text-blue-700",
  district_manager: "bg-blue-100 text-blue-700",
  medical_rep_senior: "bg-amber-100 text-amber-700",
  medical_rep: "bg-emerald-100 text-emerald-700"
};

// Same set as the CHECK constraint on profiles.role.
const ROLE_OPTIONS = [
  { value: "medical_rep", label: "Medical rep" },
  { value: "medical_rep_senior", label: "Senior medical rep" },
  { value: "district_manager", label: "District manager" },
  { value: "regional_manager", label: "Regional manager" },
  { value: "sales_director", label: "Sales director" },
  { value: "country_manager", label: "Country manager" },
  { value: "admin", label: "Admin" }
];

type Option = { value: string; label: string };

export default function TeamPage() {
  const { checking } = useRequirePermission("team");
  const { role } = useRole();
  const isAdmin = role === "admin";
  const [team, setTeam] = useState<ProfileRow[]>([]);
  const [branches, setBranches] = useState<Option[]>([]);
  const [territories, setTerritories] = useState<Option[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<ProfileRow | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .order("role")
      .order("code");
    setTeam((data ?? []) as ProfileRow[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Only the admin's Edit dialog needs these.
  useEffect(() => {
    if (!isAdmin) return;
    (async () => {
      const [{ data: b }, { data: t }] = await Promise.all([
        supabase.from("branches").select("id, name").order("name"),
        supabase.from("territories").select("id, name").order("name")
      ]);
      setBranches((b ?? []).map((r) => ({ value: r.id, label: r.name })));
      setTerritories((t ?? []).map((r) => ({ value: r.id, label: r.name })));
    })();
  }, [isAdmin]);

  const nameById = useMemo(
    () => new Map(team.map((m) => [m.id, m.full_name ?? m.email ?? "Unknown"])),
    [team]
  );

  const filtered = useMemo(() => {
    if (!search) return team;
    const q = search.toLowerCase();
    return team.filter(
      (m) =>
        m.full_name?.toLowerCase().includes(q) ||
        m.email?.toLowerCase().includes(q) ||
        m.code?.toLowerCase().includes(q) ||
        m.product_line?.toLowerCase().includes(q)
    );
  }, [team, search]);

  // Built per person, so nobody is offered as their own manager.
  const editFields: FieldConfig[] = useMemo(() => {
    if (!editing) return [];
    const managers = team
      .filter((m) => m.id !== editing.id && m.is_active)
      .map((m) => ({
        value: m.id,
        label: `${m.full_name ?? m.email ?? "Unknown"} · ${m.role.replaceAll("_", " ")}`
      }));
    return [
      { name: "full_name", label: "Full name", type: "text", required: true },
      {
        name: "role", label: "Role", type: "select", required: true, options: ROLE_OPTIONS,
        helpText: "Managers approve visits, tour plans and expenses for the people who report to them."
      },
      {
        name: "line_manager_id", label: "Reports to", type: "select", options: managers,
        helpText: "Their manager sees their visits, orders and expenses."
      },
      {
        name: "branch_id", label: "Branch", type: "select", options: branches,
        helpText: branches.length ? undefined : "No branches have been created yet."
      },
      {
        name: "territory_id", label: "Territory", type: "select", options: territories,
        helpText: territories.length ? undefined : "No territories have been created yet."
      },
      { name: "product_line", label: "Product line", type: "text" },
      {
        name: "is_active", label: "Active", type: "checkbox",
        helpText: "Turning this off blocks them from signing in (an open session ends within the hour). Their records stay; turn it back on to restore access."
      }
    ];
  }, [editing, team, branches, territories]);

  // Memoised: EditModal resets its form whenever this object changes identity,
  // so an inline literal would wipe the admin's edits on any re-render.
  const editInitial = useMemo(
    () =>
      editing
        ? {
            full_name: editing.full_name ?? "",
            role: editing.role,
            line_manager_id: editing.line_manager_id ?? "",
            branch_id: editing.branch_id ?? "",
            territory_id: editing.territory_id ?? "",
            product_line: editing.product_line ?? "",
            is_active: editing.is_active
          }
        : undefined,
    [editing]
  );

  if (checking) {
    return <div className="max-w-5xl mx-auto p-12 text-center text-slate-500">Loading…</div>;
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-2">
        <div className="p-2 rounded-lg bg-purple-50 text-purple-700">
          <Users className="w-6 h-6" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900">Team</h1>
      </div>
      <p className="text-slate-500 mb-4">
        {isAdmin
          ? "Use Edit to change someone's role, manager, branch, territory or status. To add a new person, create their login in Supabase Auth → Users; they then appear here to set up."
          : "Your team and their contact details."}
      </p>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, code (R-0001), email, or product line…"
            className="w-full pl-10 pr-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
      </div>

      {loading ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12 text-center text-slate-500">
          Loading…
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12 text-center text-slate-500">
          {search ? "No team members match your search." : "No team members yet."}
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {filtered.map((m) => (
            <div
              key={m.id}
              className={`bg-white rounded-xl border border-slate-200 shadow-sm p-4 ${m.is_active ? "" : "opacity-60"}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="font-semibold text-slate-900 truncate">
                      {m.full_name ?? "Unknown"}
                    </div>
                    {m.code && (
                      <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                        {m.code}
                      </span>
                    )}
                    {!m.is_active && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-200 text-slate-600">
                        Inactive
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">{m.product_line ?? "—"}</div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span
                    className={`text-[10px] font-bold px-2 py-1 rounded ${
                      ROLE_COLORS[m.role] ?? "bg-slate-100 text-slate-700"
                    }`}
                  >
                    {m.role.replaceAll("_", " ")}
                  </span>
                  {isAdmin && (
                    <button
                      onClick={() => setEditing(m)}
                      className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                      aria-label={`Edit ${m.full_name ?? "team member"}`}
                      title="Edit role, manager and status"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
              <div className="mt-2 space-y-1 text-xs text-slate-600">
                {m.line_manager_id && (
                  <div className="flex items-center gap-1.5">
                    <UserCheck className="w-3 h-3" /> Reports to {nameById.get(m.line_manager_id) ?? "—"}
                  </div>
                )}
                {m.email && (
                  <div className="flex items-center gap-1.5">
                    <Mail className="w-3 h-3" /> {m.email}
                  </div>
                )}
                {m.phone && (
                  <div className="flex items-center gap-1.5">
                    <Phone className="w-3 h-3" /> {m.phone}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {isAdmin && (
        <EditModal
          open={!!editing}
          title={`Edit ${editing?.full_name ?? "team member"}`}
          table="profiles"
          recordId={editing?.id ?? null}
          fields={editFields}
          initialValues={editInitial}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </div>
  );
}
