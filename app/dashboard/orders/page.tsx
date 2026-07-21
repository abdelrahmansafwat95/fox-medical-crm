"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { ShoppingCart, Filter } from "lucide-react";
import { usePerms } from "@/lib/permissions";

const ORDER_STATUSES = [
  "draft", "submitted", "approved", "dispatched", "delivered", "paid", "cancelled", "returned"
];

interface OrderRow {
  id: string;
  order_number: string | null;
  order_date: string;
  status: string;
  total: number;
  currency: string;
  institutions: { name: string } | null;
}

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700",
  submitted: "bg-blue-100 text-blue-700",
  approved: "bg-emerald-100 text-emerald-700",
  dispatched: "bg-purple-100 text-purple-700",
  delivered: "bg-emerald-100 text-emerald-700",
  paid: "bg-emerald-100 text-emerald-700",
  cancelled: "bg-red-100 text-red-700",
  returned: "bg-amber-100 text-amber-700"
};

export default function OrdersPage() {
  const { can } = usePerms();
  const canManage = can("orders", "manage");
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");

  async function load() {
    const { data } = await supabase
      .from("orders")
      .select(`id, order_number, order_date, status, total, currency, institutions(name)`)
      .order("order_date", { ascending: false })
      .limit(200);
    setOrders((data ?? []) as unknown as OrderRow[]);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function updateStatus(id: string, status: string) {
    setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, status } : o)));
    await supabase.from("orders").update({ status }).eq("id", id);
  }

  const shown = statusFilter === "all" ? orders : orders.filter((o) => o.status === statusFilter);

  const totalThisMonth = orders
    .filter((o) => new Date(o.order_date).getMonth() === new Date().getMonth())
    .reduce((s, o) => s + (o.total ?? 0), 0);

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-emerald-50 text-emerald-700">
            <ShoppingCart className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Orders</h1>
        </div>
        <div className="inline-flex items-center gap-1 bg-white border border-slate-200 rounded-lg px-2 py-1.5">
          <Filter className="w-3 h-3 text-slate-400" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-sm bg-transparent outline-none"
          >
            <option value="all">All statuses</option>
            {ORDER_STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>
      <p className="text-slate-500 mb-4">
        Pharmacy and institution orders.{canManage ? " Change an order's status inline." : ""}
      </p>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 mb-4">
        <div className="text-xs text-slate-500">Total this month</div>
        <div className="text-2xl font-bold text-slate-900">{totalThisMonth.toLocaleString()} EGP</div>
      </div>

      {loading ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12 text-center text-slate-500">Loading…</div>
      ) : shown.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12 text-center">
          <div className="text-5xl mb-2">🛒</div>
          <p className="text-slate-700 font-medium">No orders yet</p>
          <p className="text-sm text-slate-500 mt-1">Take orders from the visit detail page.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 text-xs">
              <tr>
                <th className="text-left p-3">Order #</th>
                <th className="text-left p-3">Institution</th>
                <th className="text-left p-3">Date</th>
                <th className="text-left p-3">Status</th>
                <th className="text-right p-3">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {shown.map((o) => (
                <tr key={o.id} className="hover:bg-slate-50">
                  <td className="p-3 font-mono text-xs">{o.order_number ?? "—"}</td>
                  <td className="p-3 font-medium text-slate-900">{o.institutions?.name ?? "—"}</td>
                  <td className="p-3 text-slate-700">{o.order_date}</td>
                  <td className="p-3">
                    {canManage ? (
                      <select
                        value={o.status}
                        onChange={(e) => updateStatus(o.id, e.target.value)}
                        className={`text-[11px] font-bold px-2 py-0.5 rounded border-0 outline-none cursor-pointer ${STATUS_COLORS[o.status] ?? "bg-slate-100 text-slate-700"}`}
                      >
                        {ORDER_STATUSES.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    ) : (
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${STATUS_COLORS[o.status] ?? "bg-slate-100 text-slate-700"}`}>
                        {o.status}
                      </span>
                    )}
                  </td>
                  <td className="p-3 text-right font-bold">{o.total.toLocaleString()} {o.currency}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
