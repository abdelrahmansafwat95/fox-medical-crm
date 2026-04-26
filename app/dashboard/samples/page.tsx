"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Package, AlertTriangle } from "lucide-react";

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
  const [inventory, setInventory] = useState<InventoryRow[]>([]);
  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"stock" | "history">("stock");

  useEffect(() => {
    (async () => {
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
    })();
  }, []);

  const expiringSoon = inventory.filter(
    (i) => new Date(i.expiry_date).getTime() - Date.now() < 60 * 86400_000 && i.quantity > 0
  );

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-2">
        <div className="p-2 rounded-lg bg-amber-50 text-amber-700">
          <Package className="w-6 h-6" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900">Samples</h1>
      </div>
      <p className="text-slate-500 mb-4">Track sample stock with full audit trail.</p>

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
    </div>
  );
}
