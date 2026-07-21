"use client";

import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { useRequirePermission } from "@/lib/permissions";
import { Users, Mail, Phone, Search } from "lucide-react";

interface ProfileRow {
  id: string;
  code: string | null;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  role: string;
  product_line: string | null;
  is_active: boolean;
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

export default function TeamPage() {
  const { checking } = useRequirePermission("team");
  const [team, setTeam] = useState<ProfileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .order("role")
        .order("code");
      setTeam((data ?? []) as ProfileRow[]);
      setLoading(false);
    })();
  }, []);

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
        Add new reps via Supabase Auth → Users, then update their role and product line in the profiles table.
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
            <div key={m.id} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
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
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">{m.product_line ?? "—"}</div>
                </div>
                <span
                  className={`text-[10px] font-bold px-2 py-1 rounded ${
                    ROLE_COLORS[m.role] ?? "bg-slate-100 text-slate-700"
                  } shrink-0`}
                >
                  {m.role.replaceAll("_", " ")}
                </span>
              </div>
              <div className="mt-2 space-y-1 text-xs text-slate-600">
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
    </div>
  );
}
