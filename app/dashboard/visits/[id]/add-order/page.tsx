"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import {
  ArrowLeft,
  ShoppingCart,
  Plus,
  Trash2,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Package
} from "lucide-react";

// --- Types ------------------------------------------------------------

interface VisitInfo {
  id: string;
  status: string;
  hcp_id: string;
  institution_id: string;
  hcps: { full_name: string } | null;
  institutions: { name: string } | null;
}

interface ProductOption {
  id: string;
  name: string;
  brand_name: string | null;
  pack_size: string | null;
  list_price: number | null;
  currency: string | null;
}

interface LineItem {
  id: string; // local UUID for keying
  product_id: string;
  product_name: string;
  qty: number;
  unit_price: number;
  discount_pct: number;
  total: number;
}

// --- Helpers ----------------------------------------------------------

function lineTotal(qty: number, unit_price: number, discount_pct: number): number {
  const gross = qty * unit_price;
  const discount = gross * (discount_pct / 100);
  return Math.round((gross - discount) * 100) / 100;
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

// --- Page -------------------------------------------------------------

export default function AddOrderPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const [visit, setVisit] = useState<VisitInfo | null>(null);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [loading, setLoading] = useState(true);

  const [items, setItems] = useState<LineItem[]>([]);
  const [taxPct, setTaxPct] = useState<number>(14); // Egyptian VAT default
  const [paymentTerms, setPaymentTerms] = useState("");
  const [notes, setNotes] = useState("");
  const [showPicker, setShowPicker] = useState(false);
  const [submitting, setSubmitting] = useState<"draft" | "submit" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!params.id) return;
    (async () => {
      const [vRes, pRes] = await Promise.all([
        supabase
          .from("visits")
          .select("id, status, hcp_id, institution_id, hcps(full_name), institutions(name)")
          .eq("id", params.id)
          .single(),
        supabase
          .from("products")
          .select("id, name, brand_name, pack_size, list_price, currency")
          .eq("is_active", true)
          .order("name")
      ]);
      setVisit((vRes.data ?? null) as unknown as VisitInfo | null);
      setProducts((pRes.data ?? []) as ProductOption[]);
      setLoading(false);
    })();
  }, [params.id]);

  function addProduct(p: ProductOption) {
    if (items.some((it) => it.product_id === p.id)) {
      setError(`${p.brand_name ?? p.name} is already in the order. Update its quantity instead.`);
      setShowPicker(false);
      return;
    }
    const unit_price = p.list_price ?? 0;
    setItems((prev) => [
      ...prev,
      {
        id: uid(),
        product_id: p.id,
        product_name: p.brand_name ?? p.name,
        qty: 1,
        unit_price,
        discount_pct: 0,
        total: unit_price
      }
    ]);
    setShowPicker(false);
    setError(null);
  }

  function updateItem(id: string, patch: Partial<LineItem>) {
    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== id) return it;
        const merged = { ...it, ...patch };
        merged.total = lineTotal(merged.qty, merged.unit_price, merged.discount_pct);
        return merged;
      })
    );
  }

  function removeItem(id: string) {
    setItems((prev) => prev.filter((it) => it.id !== id));
  }

  // Totals
  const subtotal = items.reduce((s, it) => s + it.qty * it.unit_price, 0);
  const totalDiscount = items.reduce(
    (s, it) => s + it.qty * it.unit_price * (it.discount_pct / 100),
    0
  );
  const afterDiscount = subtotal - totalDiscount;
  const tax = Math.round(afterDiscount * (taxPct / 100) * 100) / 100;
  const grandTotal = Math.round((afterDiscount + tax) * 100) / 100;

  async function save(status: "draft" | "submitted") {
    if (!visit || items.length === 0) {
      setError("Add at least one product before saving.");
      return;
    }
    setSubmitting(status === "draft" ? "draft" : "submit");
    setError(null);

    const { data: u } = await supabase.auth.getUser();
    if (!u.user) {
      setError("Not authenticated.");
      setSubmitting(null);
      return;
    }

    const itemsPayload = items.map((it) => ({
      product_id: it.product_id,
      qty: it.qty,
      unit_price: it.unit_price,
      discount_pct: it.discount_pct,
      total: it.total
    }));

    const { data: orderRow, error: insErr } = await supabase
      .from("orders")
      .insert({
        institution_id: visit.institution_id,
        hcp_id: visit.hcp_id,
        rep_id: u.user.id,
        visit_id: visit.id,
        status,
        items: itemsPayload,
        subtotal: Math.round(subtotal * 100) / 100,
        discount: Math.round(totalDiscount * 100) / 100,
        tax,
        total: grandTotal,
        currency: "EGP",
        payment_terms: paymentTerms || null,
        notes: notes || null
      })
      .select("id, order_number")
      .single();

    setSubmitting(null);

    if (insErr) {
      setError(insErr.message);
      return;
    }

    // Mark visit as having an order
    await supabase.from("visits").update({ order_taken: true, order_id: orderRow.id }).eq("id", visit.id);

    router.push(`/dashboard/visits/${visit.id}`);
  }

  // ---------------- Render ----------------

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto p-12 text-center text-slate-500">
        <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
        Loading…
      </div>
    );
  }

  if (!visit) {
    return (
      <div className="max-w-md mx-auto p-12 text-center">
        <p className="text-slate-700">Visit not found.</p>
        <Link href="/dashboard/visits" className="text-brand-700 underline text-sm">
          Back to visits
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto pb-24">
      <Link
        href={`/dashboard/visits/${visit.id}`}
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-3"
      >
        <ArrowLeft className="w-4 h-4" /> Back to visit
      </Link>

      {/* Header */}
      <div className="bg-gradient-to-br from-emerald-50 to-blue-50 border border-emerald-200 rounded-xl p-4 mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-white shadow-sm">
            <ShoppingCart className="w-6 h-6 text-emerald-700" />
          </div>
          <div>
            <h1 className="font-bold text-slate-900">New order</h1>
            <p className="text-xs text-slate-600">
              {visit.hcps?.full_name ?? "—"} · {visit.institutions?.name ?? "—"}
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Items */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mb-4">
        <div className="p-3 border-b border-slate-100 flex items-center justify-between">
          <span className="font-semibold text-slate-700 text-sm">
            Line items {items.length > 0 && `(${items.length})`}
          </span>
          <button
            onClick={() => setShowPicker(true)}
            className="text-xs bg-brand-600 hover:bg-brand-700 text-white px-3 py-1.5 rounded-lg inline-flex items-center gap-1 font-medium"
          >
            <Plus className="w-3 h-3" /> Add product
          </button>
        </div>

        {items.length === 0 ? (
          <div className="p-8 text-center">
            <Package className="w-10 h-10 mx-auto text-slate-300 mb-2" />
            <p className="text-sm text-slate-500">No products yet</p>
            <p className="text-xs text-slate-400 mt-1">
              Tap &ldquo;Add product&rdquo; to begin.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {items.map((it) => (
              <div key={it.id} className="p-3">
                <div className="flex items-center gap-2 mb-2">
                  <div className="font-medium text-slate-900 text-sm flex-1 min-w-0 truncate">
                    {it.product_name}
                  </div>
                  <button
                    onClick={() => removeItem(it.id)}
                    className="p-1 text-slate-400 hover:text-red-600"
                    title="Remove"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <NumField
                    label="Qty"
                    value={it.qty}
                    min={1}
                    onChange={(v) => updateItem(it.id, { qty: v })}
                  />
                  <NumField
                    label="Unit price"
                    value={it.unit_price}
                    min={0}
                    step={0.5}
                    onChange={(v) => updateItem(it.id, { unit_price: v })}
                  />
                  <NumField
                    label="Discount %"
                    value={it.discount_pct}
                    min={0}
                    max={100}
                    onChange={(v) => updateItem(it.id, { discount_pct: v })}
                  />
                </div>
                <div className="text-right mt-2 text-sm">
                  <span className="text-slate-500">Line total: </span>
                  <span className="font-bold text-slate-900">
                    {it.total.toLocaleString()} EGP
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Tax + meta */}
      {items.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 mb-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Tax / VAT %
            </label>
            <input
              type="number"
              min={0}
              max={50}
              step={0.5}
              value={taxPct}
              onChange={(e) => setTaxPct(parseFloat(e.target.value) || 0)}
              className="w-24 p-2 border border-slate-300 rounded-lg text-sm"
            />
            <span className="text-xs text-slate-500 ml-2">Default 14% (Egypt VAT)</span>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Payment terms
            </label>
            <input
              type="text"
              value={paymentTerms}
              onChange={(e) => setPaymentTerms(e.target.value)}
              placeholder="e.g. Net 30"
              className="w-full p-2 border border-slate-300 rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Notes (optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Internal notes about this order"
              className="w-full p-2 border border-slate-300 rounded-lg text-sm"
            />
          </div>
        </div>
      )}

      {/* Totals */}
      {items.length > 0 && (
        <div className="bg-white rounded-xl border-2 border-slate-300 shadow-sm p-4 mb-4">
          <Row label="Subtotal" value={subtotal} />
          {totalDiscount > 0 && (
            <Row label="Discount" value={-totalDiscount} muted />
          )}
          <Row label={`Tax (${taxPct}%)`} value={tax} muted />
          <div className="border-t border-slate-200 mt-2 pt-2">
            <Row label="Grand total" value={grandTotal} bold />
          </div>
        </div>
      )}

      {/* Actions */}
      {items.length > 0 && (
        <div className="flex gap-2">
          <button
            onClick={() => save("draft")}
            disabled={submitting !== null}
            className="flex-1 px-4 py-3 rounded-lg border border-slate-300 text-slate-700 font-medium hover:bg-slate-50 disabled:opacity-50 inline-flex items-center justify-center gap-2"
          >
            {submitting === "draft" ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : null}
            Save as draft
          </button>
          <button
            onClick={() => save("submitted")}
            disabled={submitting !== null}
            className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white font-bold py-3 rounded-lg inline-flex items-center justify-center gap-2"
          >
            {submitting === "submit" ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <CheckCircle2 className="w-4 h-4" />
            )}
            Submit order
          </button>
        </div>
      )}

      {/* Product picker modal */}
      {showPicker && (
        <div
          className="fixed inset-0 bg-slate-900/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setShowPicker(false)}
        >
          <div
            className="bg-white rounded-t-2xl sm:rounded-xl shadow-2xl w-full sm:max-w-md max-h-[80vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-3 border-b border-slate-200 flex items-center justify-between">
              <span className="font-semibold text-slate-900">Pick a product</span>
              <button
                onClick={() => setShowPicker(false)}
                className="text-slate-400 hover:text-slate-700 text-xl leading-none px-2"
              >
                ×
              </button>
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
              {products.map((p) => (
                <button
                  key={p.id}
                  onClick={() => addProduct(p)}
                  className="w-full p-3 text-left hover:bg-slate-50 flex items-center gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-slate-900">
                      {p.brand_name ?? p.name}
                    </div>
                    <div className="text-xs text-slate-500">{p.pack_size ?? "—"}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-bold text-slate-900 text-sm">
                      {p.list_price?.toLocaleString() ?? "—"} {p.currency ?? ""}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function NumField({
  label,
  value,
  onChange,
  min,
  max,
  step
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <div>
      <label className="block text-[10px] font-medium text-slate-600 mb-0.5">{label}</label>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step ?? 1}
        onChange={(e) => {
          const n = parseFloat(e.target.value);
          if (!isNaN(n)) onChange(n);
        }}
        className="w-full p-1.5 border border-slate-300 rounded text-sm"
      />
    </div>
  );
}

function Row({
  label,
  value,
  muted,
  bold
}: {
  label: string;
  value: number;
  muted?: boolean;
  bold?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between text-sm ${muted ? "text-slate-500" : "text-slate-700"} ${bold ? "text-base" : ""}`}>
      <span className={bold ? "font-semibold" : ""}>{label}</span>
      <span className={bold ? "font-bold text-slate-900 text-lg" : ""}>
        {value.toLocaleString()} EGP
      </span>
    </div>
  );
}
