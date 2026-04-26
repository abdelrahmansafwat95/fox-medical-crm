"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Pill, ChevronDown, ChevronUp } from "lucide-react";
import type { Product } from "@/lib/types";

const CATEGORY_COLORS: Record<string, string> = {
  Rx: "bg-red-50 text-red-700",
  OTC: "bg-emerald-50 text-emerald-700",
  OTX: "bg-blue-50 text-blue-700",
  medical_device: "bg-purple-50 text-purple-700",
  consumable: "bg-slate-100 text-slate-700"
};

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("products")
        .select("*")
        .eq("is_active", true)
        .order("name");
      setProducts((data ?? []) as Product[]);
      setLoading(false);
    })();
  }, []);

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-2">
        <div className="p-2 rounded-lg bg-purple-50 text-purple-700">
          <Pill className="w-6 h-6" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900">Products</h1>
      </div>
      <p className="text-slate-500 mb-6">
        Drug & device catalog with key messages for detailing.
      </p>

      {loading ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12 text-center text-slate-500">
          Loading…
        </div>
      ) : (
        <div className="space-y-3">
          {products.map((p) => {
            const isOpen = expanded === p.id;
            return (
              <div key={p.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <button
                  onClick={() => setExpanded(isOpen ? null : p.id)}
                  className="w-full p-4 flex items-center gap-4 hover:bg-slate-50 transition text-left"
                >
                  <div className="w-12 h-12 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center shrink-0">
                    <Pill className="w-6 h-6" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-slate-900">{p.brand_name ?? p.name}</span>
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${CATEGORY_COLORS[p.category]}`}>
                        {p.category}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {p.generic_name} {p.strength && `· ${p.strength}`} {p.dosage_form && `· ${p.dosage_form}`}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    {p.list_price && (
                      <div className="font-semibold text-slate-900">
                        {p.list_price.toLocaleString()} {p.currency ?? "EGP"}
                      </div>
                    )}
                    <div className="text-xs text-slate-500">{p.pack_size}</div>
                  </div>
                  {isOpen ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
                </button>

                {isOpen && p.key_messages && p.key_messages.length > 0 && (
                  <div className="border-t border-slate-100 p-4 bg-slate-50/50">
                    <div className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2">
                      Key messages for detailing
                    </div>
                    <div className="space-y-2">
                      {p.key_messages.map((m, idx) => (
                        <div key={idx} className="bg-white border border-slate-200 rounded-lg p-3">
                          <div className="font-semibold text-sm text-slate-900">{m.title}</div>
                          <div className="text-sm text-slate-600 mt-0.5">{m.message}</div>
                          {m.evidence_label && (
                            <div className="mt-1 text-xs text-brand-700 font-medium">
                              📚 Evidence: {m.evidence_label}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
