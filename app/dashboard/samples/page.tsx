"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRole, isManager } from "@/lib/roles";
import { Package, AlertTriangle, Plus, X, Loader2 } from "lucide-react";

interface InventoryRow {
  id: string;
  product_id: string;
  batch_number: string;
  expiry_date: string;
  quantity: number;
  warehouse_issued_qty: number;
  products: { name: string; brand_name: string | null; pack_size: string | null } | null;
}

interface TransactionRow {
  id: string;
  transaction_type: string;
  quantity: number;
  created_at: string;
  hcps: { full_name: string } | null;
  products: { name: string } | null;
}

export default function SamplesPage() {
  const { role } = useRole();
  const manager = isManager(role);

  const [inventory, setInventory] = useState<InventoryRow[]>([]);
  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"stock" | "history">("stock");

  // Manager-only: issue stock to a rep
  const [reps, setReps] = useState<{ id: string; full_name: string | null }[]>([]);
  const [products, setProducts] = useState<{ id: string; name: string; brand_name: string | null }[]>([]);
  const [showIssue, setShowIssue] = useState(false);
  const [issuing, setIssuing] = useState(false);
  const [issueErr, setIssueErr] = useState<string | null>(null);
  const [form, setForm] = useState({
    rep_id: "",
    product_id: "",
    batch_number: "",
    expiry_date: "",
    quantity: 50
  });

  async function load() {
    const [inv, tx] = await Promise.all([
      supabase
        .from("samples_inventory")
        .select(`id, product_id, batch_number, expiry_date, quantity, warehouse_issued_qty,
                 products(name, brand_name, pack_size)`)
        .order("expiry_date"),
      supabase
        .from("samples_transactions")
        .select(`id, transaction_type, quantity, created_at,
                 hcps(full_name), products(name)`)
        .order("created_at", { ascending: false })
        .limit(50)
    ]);
    setInventory((inv.data ?? []) as unknown as InventoryRow[]);
    setTransactions((tx.data ?? []) as unknown as TransactionRow[]);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!manager) return;
    (async () => {
      const [r, p] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, full_name")
          .in("role", ["medical_rep", "medical_rep_senior"])
          .eq("is_active", true)
          .order("full_name"),
        supabase
          .from("products")
          .select("id, name, brand_name")
          .eq("is_active", true)
          .order("name")
      ]);
      setReps((r.data ?? []) as { id: string; full_name: string | null }[]);
      setProducts((p.data ?? []) as { id: string; name: string; brand_name: string | null }[]);
    })();
  }, [manager]);

  async function issueStock() {
    setIssueErr(null);
    if (!form.rep_id || !form.product_id || !form.batch_number || !form.expiry_date || form.quantity <= 0) {
      setIssueErr("Fill in rep, product, batch, expiry, and a positive quantity.");
      return;
    }
    setIssuing(true);
    const { data: u } = await supabase.auth.getUser();

    const { error: invErr } = await supabase.from("samples_inventory").insert({
      rep_id: form.rep_id,
      product_id: form.product_id,
      batch_number: form.batch_number.trim(),
      expiry_date: form.expiry_date,
      quantity: form.quantity,
      warehouse_issued_qty: form.quantity
    });
    if (invErr) {
      setIssuing(false);
      setIssueErr(invErr.message);
      return;
    }
    // Audit trail
    await supabase.from("samples_transactions").insert({
      transaction_type: "issued_to_rep",
      product_id: form.product_id,
      rep_id: form.rep_id,
      quantity: form.quantity,
      batch_number: form.batch_number.trim(),
      expiry_date: form.expiry_date,
      created_by: u.user?.id
    });

    setIssuing(false);
    setShowIssue(false);
    setForm({ rep_id: "", product_id: "", batch_number: "", expiry_date: "", quantity: 50 });
    load();
  }

  const expiringSoon = inventory.filter(
    (i) => new Date(i.expiry_date).getTime() - Date.now() < 60 * 86400_000 && i.quantity > 0
  );

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-amber-50 text-amber-700">
            <Package className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Samples</h1>
        </div>
        {manager && (
          <button
            onClick={() => { setIssueErr(null); setShowIssue(true); }}
            className="bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-lg inline-flex items-center gap-2 font-medium"
          >
            <Plus className="w-4 h-4" /> Issue stock
          </button>
        )}
      </div>
      <p className="text-slate-500 mb-4">
        Track sample stock with full audit trail.
        {manager ? " Issue stock to a rep to replenish their bag." : ""}
      </p>

      {expiringSoon.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 flex items-center gap-2 text-sm text-amber-900">
          <AlertTriangle className="w-4 h-4" />
          <span><strong>{expiringSoon.length}</strong> batch{expiringSoon.length > 1 ? "es" : ""} expiring within 60 days.</span>
        </div>
      )}

      <div className="flex gap-2 mb-4 border-b border-slate-200">
        {(["stock", "history"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium ${
              tab === t ? "border-b-2 border-brand-600 text-brand-700" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {t === "stock" ? "Current stock" : "Transactions"}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12 text-slate-500">Loading…</div>
      ) : tab === "stock" ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          {inventory.length === 0 ? (
            <div className="p-12 text-center">
              <div className="text-5xl mb-2">📦</div>
              <p className="text-slate-700 font-medium">No samples in stock</p>
              <p className="text-sm text-slate-500 mt-1">Warehouse issuance comes from your supply team.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600 text-xs">
                <tr>
                  <th className="text-left p-3">Product</th>
                  <th className="text-left p-3">Batch</th>
                  <th className="text-left p-3">Expiry</th>
                  <th className="text-right p-3">Qty</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {inventory.map((row) => {
                  const days = Math.floor((new Date(row.expiry_date).getTime() - Date.now()) / 86400_000);
                  const cls = days < 30 ? "text-red-700" : days < 60 ? "text-amber-700" : "text-slate-700";
                  return (
                    <tr key={row.id} className="hover:bg-slate-50">
                      <td className="p-3 font-medium text-slate-900">
                        {row.products?.brand_name ?? row.products?.name}
                        <div className="text-xs text-slate-500">{row.products?.pack_size}</div>
                      </td>
                      <td className="p-3 text-slate-700 font-mono text-xs">{row.batch_number}</td>
                      <td className={`p-3 ${cls}`}>{row.expiry_date} <span className="text-xs">({days}d)</span></td>
                      <td className="p-3 text-right font-bold">{row.quantity}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm divide-y divide-slate-100">
          {transactions.length === 0 ? (
            <div className="p-12 text-center text-slate-500">No transactions yet.</div>
          ) : (
            transactions.map((tx) => (
              <div key={tx.id} className="p-3 flex items-center gap-3 text-sm">
                <span className={`text-[11px] font-bold px-2 py-1 rounded ${
                  tx.transaction_type === "given_to_hcp" ? "bg-emerald-100 text-emerald-700"
                  : tx.transaction_type === "issued_to_rep" ? "bg-blue-100 text-blue-700"
                  : "bg-slate-100 text-slate-700"
                }`}>
                  {tx.transaction_type.replaceAll("_", " ")}
                </span>
                <div className="flex-1">
                  <div className="font-medium text-slate-900">{tx.products?.name}</div>
                  {tx.hcps?.full_name && <div className="text-xs text-slate-500">→ {tx.hcps.full_name}</div>}
                </div>
                <div className="text-right">
                  <div className="font-bold">{tx.quantity}</div>
                  <div className="text-xs text-slate-500">{new Date(tx.created_at).toLocaleDateString()}</div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {showIssue && (
        <div
          className="fixed inset-0 bg-slate-900/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setShowIssue(false)}
        >
          <div
            className="bg-white rounded-t-2xl sm:rounded-xl shadow-2xl w-full sm:max-w-md max-h-[90vh] overflow-y-auto flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="font-semibold text-slate-900">Issue stock to rep</h2>
              <button onClick={() => setShowIssue(false)} className="p-1 text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              {issueErr && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{issueErr}</div>
              )}
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Rep</label>
                <select
                  value={form.rep_id}
                  onChange={(e) => setForm({ ...form, rep_id: e.target.value })}
                  className="w-full p-2.5 border border-slate-300 rounded-lg text-sm"
                >
                  <option value="">— pick a rep —</option>
                  {reps.map((r) => (
                    <option key={r.id} value={r.id}>{r.full_name ?? "Rep"}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Product</label>
                <select
                  value={form.product_id}
                  onChange={(e) => setForm({ ...form, product_id: e.target.value })}
                  className="w-full p-2.5 border border-slate-300 rounded-lg text-sm"
                >
                  <option value="">— pick a product —</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>{p.brand_name ?? p.name}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Batch #</label>
                  <input
                    value={form.batch_number}
                    onChange={(e) => setForm({ ...form, batch_number: e.target.value })}
                    placeholder="e.g. B-2401"
                    className="w-full p-2.5 border border-slate-300 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Quantity</label>
                  <input
                    type="number"
                    min={1}
                    value={form.quantity}
                    onChange={(e) => setForm({ ...form, quantity: parseInt(e.target.value) || 0 })}
                    className="w-full p-2.5 border border-slate-300 rounded-lg text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Expiry date</label>
                <input
                  type="date"
                  value={form.expiry_date}
                  onChange={(e) => setForm({ ...form, expiry_date: e.target.value })}
                  className="w-full p-2.5 border border-slate-300 rounded-lg text-sm"
                />
              </div>
            </div>
            <div className="p-4 border-t border-slate-200 flex gap-2">
              <button
                onClick={() => setShowIssue(false)}
                className="ml-auto px-4 py-2 rounded-lg border border-slate-300 text-slate-700 font-medium hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={issueStock}
                disabled={issuing}
                className="bg-brand-600 hover:bg-brand-700 disabled:bg-brand-400 text-white font-medium px-4 py-2 rounded-lg inline-flex items-center gap-2"
              >
                {issuing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Issue
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
