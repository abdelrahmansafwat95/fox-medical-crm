"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Pill, ChevronDown, ChevronUp, Plus, Pencil, Download, MessageSquare, Save, X, Loader2, Trash2 } from "lucide-react";
import type { Product } from "@/lib/types";
import EditModal, { type FieldConfig } from "@/components/EditModal";
import { usePerms } from "@/lib/permissions";
import { downloadCsv } from "@/lib/csv";

const CATEGORY_COLORS: Record<string, string> = {
  Rx: "bg-red-50 text-red-700",
  OTC: "bg-emerald-50 text-emerald-700",
  OTX: "bg-blue-50 text-blue-700",
  medical_device: "bg-purple-50 text-purple-700",
  consumable: "bg-slate-100 text-slate-700"
};

const PRODUCT_FIELDS: FieldConfig[] = [
  { name: "name", label: "Name", type: "text", required: true, placeholder: "e.g. Cardia 5mg" },
  { name: "brand_name", label: "Brand name", type: "text", placeholder: "e.g. Cardia" },
  { name: "generic_name", label: "Generic name", type: "text", placeholder: "e.g. amlodipine" },
  { name: "name_ar", label: "Name (Arabic)", type: "text", rtl: true },
  {
    name: "category",
    label: "Category",
    type: "select",
    required: true,
    options: [
      { value: "Rx", label: "Rx (Prescription)" },
      { value: "OTC", label: "OTC (Over-the-counter)" },
      { value: "OTX", label: "OTX" },
      { value: "medical_device", label: "Medical device" },
      { value: "consumable", label: "Consumable" }
    ]
  },
  { name: "therapy_area", label: "Therapy area", type: "text", placeholder: "e.g. Cardiovascular" },
  { name: "product_line", label: "Product line", type: "text", placeholder: "e.g. Cardio, Endo, Antibiotic" },
  { name: "dosage_form", label: "Dosage form", type: "text", placeholder: "e.g. Tablet, Syrup, Injection" },
  { name: "strength", label: "Strength", type: "text", placeholder: "e.g. 5mg, 1g" },
  { name: "pack_size", label: "Pack size", type: "text", placeholder: "e.g. 30 tabs" },
  { name: "list_price", label: "List price", type: "number", min: 0, step: 0.5 },
  {
    name: "currency",
    label: "Currency",
    type: "select",
    options: [
      { value: "EGP", label: "EGP" },
      { value: "USD", label: "USD" },
      { value: "EUR", label: "EUR" },
      { value: "SAR", label: "SAR" },
      { value: "AED", label: "AED" }
    ]
  },
  { name: "sample_pack_size", label: "Sample pack size", type: "text", placeholder: "e.g. 7 tabs" },
  { name: "is_active", label: "Active", type: "checkbox" }
];

export default function ProductsPage() {
  const { can } = usePerms();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editing, setEditing] = useState<Product | null>(null);
  const [creating, setCreating] = useState(false);
  const [msgEditing, setMsgEditing] = useState<Product | null>(null);
  const [msgs, setMsgs] = useState<{ title: string; message: string; evidence_label?: string | null }[]>([]);
  const [msgSaving, setMsgSaving] = useState(false);

  function openMessages(p: Product) {
    setMsgEditing(p);
    setMsgs(((p.key_messages ?? []) as { title: string; message: string; evidence_label?: string | null }[]).map((m) => ({ ...m })));
  }
  async function saveMessages() {
    if (!msgEditing) return;
    setMsgSaving(true);
    const clean = msgs.filter((m) => m.title.trim() || m.message.trim());
    await supabase.from("products").update({ key_messages: clean }).eq("id", msgEditing.id);
    setMsgSaving(false);
    setMsgEditing(null);
    load();
  }

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("products")
      .select("*")
      .eq("is_active", true)
      .order("name");
    setProducts((data ?? []) as Product[]);
    setLoading(false);
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-purple-50 text-purple-700">
            <Pill className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Products</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() =>
              downloadCsv(
                "products",
                products.map((p) => ({
                  Name: p.name,
                  Brand: p.brand_name ?? "",
                  Generic: p.generic_name ?? "",
                  Category: p.category,
                  "Therapy Area": p.therapy_area ?? "",
                  Strength: p.strength ?? "",
                  "Pack Size": p.pack_size ?? "",
                  "List Price": p.list_price ?? "",
                  Currency: p.currency ?? ""
                }))
              )
            }
            className="border border-slate-300 text-slate-700 hover:bg-slate-50 px-3 py-2 rounded-lg inline-flex items-center gap-2 text-sm font-medium"
          >
            <Download className="w-4 h-4" /> Export
          </button>
          {can("products", "create") && (
            <button
              onClick={() => setCreating(true)}
              className="bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-lg inline-flex items-center gap-2 font-medium"
            >
              <Plus className="w-4 h-4" /> Add product
            </button>
          )}
        </div>
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
                <div className="w-full p-4 flex items-center gap-4">
                  <button
                    onClick={() => setExpanded(isOpen ? null : p.id)}
                    className="flex items-center gap-4 flex-1 min-w-0 text-left"
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
                  </button>
                  {can("products", "edit") && (
                    <button
                      onClick={() => openMessages(p)}
                      className="p-2 rounded-lg text-slate-500 hover:bg-slate-100"
                      title="Edit key messages"
                    >
                      <MessageSquare className="w-4 h-4" />
                    </button>
                  )}
                  {can("products", "edit") && (
                    <button
                      onClick={() => setEditing(p)}
                      className="p-2 rounded-lg text-slate-500 hover:bg-slate-100"
                      title="Edit"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    onClick={() => setExpanded(isOpen ? null : p.id)}
                    className="text-slate-400"
                  >
                    {isOpen ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                  </button>
                </div>

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

      {msgEditing && (
        <div
          className="fixed inset-0 bg-slate-900/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setMsgEditing(null)}
        >
          <div
            className="bg-white rounded-t-2xl sm:rounded-xl shadow-2xl w-full sm:max-w-lg max-h-[90vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="font-semibold text-slate-900">
                Key messages — {msgEditing.brand_name ?? msgEditing.name}
              </h2>
              <button onClick={() => setMsgEditing(null)} className="p-1 text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {msgs.length === 0 && (
                <p className="text-sm text-slate-400 text-center py-4">No messages yet. Add one below.</p>
              )}
              {msgs.map((m, idx) => (
                <div key={idx} className="border border-slate-200 rounded-lg p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      value={m.title}
                      onChange={(e) => setMsgs((a) => a.map((x, i) => (i === idx ? { ...x, title: e.target.value } : x)))}
                      placeholder="Title (e.g. Once-daily dosing)"
                      className="flex-1 p-2 border border-slate-300 rounded text-sm font-medium"
                    />
                    <button onClick={() => setMsgs((a) => a.filter((_, i) => i !== idx))} className="p-1 text-slate-400 hover:text-red-600">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <textarea
                    value={m.message}
                    onChange={(e) => setMsgs((a) => a.map((x, i) => (i === idx ? { ...x, message: e.target.value } : x)))}
                    placeholder="The detailing message"
                    rows={2}
                    className="w-full p-2 border border-slate-300 rounded text-sm"
                  />
                  <input
                    value={m.evidence_label ?? ""}
                    onChange={(e) => setMsgs((a) => a.map((x, i) => (i === idx ? { ...x, evidence_label: e.target.value } : x)))}
                    placeholder="Evidence label (optional, e.g. NEJM 2023)"
                    className="w-full p-2 border border-slate-300 rounded text-sm"
                  />
                </div>
              ))}
              <button
                onClick={() => setMsgs((a) => [...a, { title: "", message: "", evidence_label: "" }])}
                className="w-full border border-dashed border-slate-300 rounded-lg py-2 text-sm text-slate-600 hover:bg-slate-50 inline-flex items-center justify-center gap-1"
              >
                <Plus className="w-4 h-4" /> Add message
              </button>
            </div>
            <div className="p-4 border-t border-slate-200 flex gap-2">
              <button onClick={() => setMsgEditing(null)} className="ml-auto px-4 py-2 rounded-lg border border-slate-300 text-slate-700 font-medium hover:bg-slate-50">
                Cancel
              </button>
              <button
                onClick={saveMessages}
                disabled={msgSaving}
                className="bg-brand-600 hover:bg-brand-700 disabled:bg-brand-400 text-white font-medium px-4 py-2 rounded-lg inline-flex items-center gap-2"
              >
                {msgSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save
              </button>
            </div>
          </div>
        </div>
      )}

      <EditModal
        open={creating}
        title="Add product"
        table="products"
        fields={PRODUCT_FIELDS}
        initialValues={{ category: "Rx", currency: "EGP", is_active: true }}
        onClose={() => setCreating(false)}
        onSaved={() => { setCreating(false); load(); }}
      />

      <EditModal
        open={!!editing}
        title="Edit product"
        table="products"
        recordId={editing?.id}
        fields={PRODUCT_FIELDS}
        initialValues={editing ? (editing as unknown as Record<string, unknown>) : {}}
        onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); load(); }}
        onDeleted={() => { setEditing(null); load(); }}
        allowDelete={can("products", "delete")}
      />
    </div>
  );
}
