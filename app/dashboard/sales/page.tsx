"use client";

// Sales vs field activity. Managers import distributor / pharmacy sales from
// Excel (any column layout — mapped on screen, checked before saving), then
// see sales per product and per customer next to the GPS-verified calls that
// supported them, and which e-detailing slides doctors actually spent time on.

import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "@/lib/supabase";
import { exportToExcel } from "@/lib/export";
import { isManager, useRole } from "@/lib/roles";
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, LineChart, Loader2, Presentation, Trash2, Upload, X } from "lucide-react";

interface VsRow { dimension: "product" | "customer"; key_id: string | null; label: string; units: number; value: number; verified_calls: number; value_per_call: number | null }
interface Insight { product_id: string; product_name: string; sessions: number; doctors: number; avg_seconds: number; slides: { title: string; position: number; avg_seconds: number; views: number }[] }
interface Named { id: string; name: string }

const ym = (d: Date) => d.toISOString().slice(0, 7);
const fmt = (n: number | null | undefined) => (n == null ? "—" : Math.round(Number(n)).toLocaleString("en-US"));
const FIELDS = [
  { key: "month", label: "Month or date", hints: ["month", "period", "date", "شهر", "تاريخ"] },
  { key: "product", label: "Product", hints: ["product", "item", "sku", "brand", "منتج", "صنف"] },
  { key: "customer", label: "Customer (pharmacy / hospital)", hints: ["customer", "pharmacy", "account", "institution", "hospital", "client", "عميل", "صيدلية"] },
  { key: "units", label: "Units", hints: ["units", "qty", "quantity", "boxes", "كمية", "وحدات"] },
  { key: "value", label: "Value", hints: ["value", "amount", "sales", "revenue", "total", "قيمة", "مبيعات"] },
] as const;
type FieldKey = (typeof FIELDS)[number]["key"];
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9؀-ۿ]+/g, " ").trim();

function toMonth(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") { // Excel date serial
    const d = XLSX.SSF.parse_date_code(v);
    return d ? `${d.y}-${String(d.m).padStart(2, "0")}` : null;
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})[-/.](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}`;
  m = s.match(/^(\d{1,2})[-/.](\d{4})$/);
  if (m) return `${m[2]}-${m[1].padStart(2, "0")}`;
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}`;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : ym(d);
}
const num = (v: unknown) => { const n = Number(String(v ?? "").replace(/[, ]/g, "")); return isFinite(n) ? n : NaN; };

export default function SalesPage() {
  const { role } = useRole();
  const manager = isManager(role);
  const now = new Date();
  const [from, setFrom] = useState(ym(new Date(now.getFullYear(), now.getMonth() - 2, 1)));
  const [to, setTo] = useState(ym(now));
  const [rows, setRows] = useState<VsRow[]>([]);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);

  async function load() {
    setLoading(true);
    const toEnd = new Date(Number(to.slice(0, 4)), Number(to.slice(5, 7)), 0).toISOString().slice(0, 10);
    const [vs, di] = await Promise.all([
      supabase.rpc("sales_vs_calls", { p_from: from, p_to: to }),
      supabase.rpc("detailing_insights", { p_from: `${from}-01`, p_to: toEnd })
    ]);
    setRows((vs.data ?? []) as VsRow[]);
    setInsights((di.data ?? []) as Insight[]);
    setLoading(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [from, to]);

  const products = rows.filter((r) => r.dimension === "product");
  const customers = rows.filter((r) => r.dimension === "customer");
  const totalValue = products.reduce((s, r) => s + Number(r.value), 0);
  const totalUnits = products.reduce((s, r) => s + Number(r.units), 0);
  const maxP = Math.max(1, ...products.map((r) => Number(r.value)));
  const maxC = Math.max(1, ...customers.map((r) => Number(r.value)));

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-cyan-50 text-cyan-700"><LineChart className="w-6 h-6" /></div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Sales vs Calls</h1>
            <p className="text-sm text-slate-500">Imported sales next to the GPS-verified calls that supported them.</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap text-sm">
          <input type="month" value={from} onChange={(e) => setFrom(e.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg" />
          <span className="text-slate-400">to</span>
          <input type="month" value={to} onChange={(e) => setTo(e.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg" />
          {manager && (
            <button onClick={() => setImporting(true)} className="bg-brand-600 hover:bg-brand-700 text-white px-3 py-2 rounded-lg inline-flex items-center gap-2 font-medium">
              <Upload className="w-4 h-4" /> Import sales
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[["Sales value", `${fmt(totalValue)} EGP`], ["Units", fmt(totalUnits)], ["Products", String(products.length)], ["Customers", String(customers.length)]].map(([k, v]) => (
          <div key={k} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
            <div className="text-xs text-slate-500">{k}</div>
            <div className="text-xl font-bold text-slate-900 mt-1">{v}</div>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12 text-center text-slate-500">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12 text-center text-slate-500">
          No sales imported for these months yet.{manager && " Use “Import sales” to upload a distributor or pharmacy sales file."}
        </div>
      ) : (
        <div className="grid lg:grid-cols-2 gap-4">
          <VsTable title="By product" note="Calls = verified visits where the product was detailed" rows={products} max={maxP} />
          <VsTable title="By customer" note="Calls = verified visits at that institution" rows={customers.slice(0, 25)} max={maxC} />
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <div className="flex items-center gap-2 mb-1">
          <Presentation className="w-5 h-5 text-brand-600" />
          <h2 className="font-semibold text-slate-900">E-detailing: what doctors spent time on</h2>
        </div>
        <p className="text-xs text-slate-500 mb-3">Average seconds per slide across all detailing sessions in the period. Slides doctors skip are the ones to rework.</p>
        {insights.length === 0 ? <p className="text-sm text-slate-500">No detailing sessions in this period.</p> : (
          <div className="grid md:grid-cols-2 gap-4">
            {insights.map((p) => {
              const top = Math.max(1, ...p.slides.map((s) => s.avg_seconds));
              return (
                <div key={p.product_id} className="border border-slate-200 rounded-lg p-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-semibold text-slate-900">{p.product_name}</span>
                    <span className="text-xs text-slate-500">{p.sessions} sessions · {p.doctors} doctors · avg {fmt(p.avg_seconds)}s</span>
                  </div>
                  <div className="mt-2 space-y-1.5">
                    {p.slides.map((s) => (
                      <div key={s.position} className="text-xs">
                        <div className="flex justify-between text-slate-600"><span>{s.position}. {s.title}</span><span>{s.avg_seconds}s</span></div>
                        <div className="h-1.5 bg-slate-100 rounded"><div className="h-1.5 rounded bg-brand-500" style={{ width: `${(100 * s.avg_seconds) / top}%` }} /></div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {importing && <ImportModal onClose={() => setImporting(false)} onDone={() => { setImporting(false); load(); }} />}
    </div>
  );
}

function VsTable({ title, note, rows, max }: { title: string; note: string; rows: VsRow[]; max: number }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold text-slate-900">{title}</h2>
        <button onClick={() => exportToExcel(rows.map((r) => ({ Name: r.label, Units: r.units, "Value (EGP)": r.value, "Verified calls": r.verified_calls, "Value per call": r.value_per_call ?? "" })), `sales-${title.replace(/\s+/g, "-").toLowerCase()}`)}
          className="text-xs text-brand-700 inline-flex items-center gap-1 hover:underline"><Download className="w-3.5 h-3.5" /> Excel</button>
      </div>
      <p className="text-xs text-slate-500 mb-2">{note}</p>
      <table className="w-full text-sm">
        <thead className="text-xs text-slate-500"><tr><th className="text-left py-1">Name</th><th className="text-right py-1">Value</th><th className="text-right py-1">Calls</th><th className="text-right py-1">Value / call</th></tr></thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r) => (
            <tr key={`${r.dimension}-${r.key_id ?? r.label}`}>
              <td className="py-1.5 pr-2">
                <div className="text-slate-900">{r.label}</div>
                <div className="h-1 bg-slate-100 rounded mt-1"><div className="h-1 rounded bg-cyan-500" style={{ width: `${(100 * Number(r.value)) / max}%` }} /></div>
              </td>
              <td className="py-1.5 text-right whitespace-nowrap">{fmt(r.value)}</td>
              <td className={`py-1.5 text-right ${r.verified_calls === 0 ? "text-amber-600 font-semibold" : ""}`}>{r.verified_calls}</td>
              <td className="py-1.5 text-right whitespace-nowrap">{fmt(r.value_per_call)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ImportModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [sheet, setSheet] = useState<Record<string, unknown>[] | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [map, setMap] = useState<Record<FieldKey, string>>({ month: "", product: "", customer: "", units: "", value: "" });
  const [fileName, setFileName] = useState("");
  const [products, setProducts] = useState<Named[]>([]);
  const [institutions, setInstitutions] = useState<Named[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [batches, setBatches] = useState<{ batch_id: string; source: string | null; n: number }[]>([]);

  useEffect(() => {
    (async () => {
      const [p, i, b] = await Promise.all([
        supabase.from("products").select("id, name, brand_name"),
        supabase.from("institutions").select("id, name"),
        supabase.from("sales_data").select("batch_id, source").order("created_at", { ascending: false }).limit(2000)
      ]);
      setProducts(((p.data ?? []) as { id: string; name: string; brand_name: string | null }[]).flatMap((x) => [{ id: x.id, name: x.name }, ...(x.brand_name ? [{ id: x.id, name: x.brand_name }] : [])]));
      setInstitutions((i.data ?? []) as Named[]);
      const counts = new Map<string, { batch_id: string; source: string | null; n: number }>();
      for (const r of (b.data ?? []) as { batch_id: string; source: string | null }[]) {
        const c = counts.get(r.batch_id) ?? { ...r, n: 0 }; c.n++; counts.set(r.batch_id, c);
      }
      setBatches(Array.from(counts.values()).slice(0, 5));
    })();
  }, []);

  async function readFile(f: File) {
    setError(null);
    const wb = XLSX.read(await f.arrayBuffer(), { cellDates: false });
    const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]], { defval: "" });
    if (!data.length) { setError("The first sheet is empty."); return; }
    const hs = Object.keys(data[0]);
    const guess = { ...map };
    for (const fd of FIELDS) guess[fd.key] = hs.find((h) => fd.hints.some((k) => norm(h).includes(k))) ?? "";
    setFileName(f.name); setHeaders(hs); setMap(guess); setSheet(data);
  }

  const match = (list: Named[], name: string) => {
    const n = norm(name);
    return list.find((x) => norm(x.name) === n) ?? list.find((x) => n && (norm(x.name).includes(n) || n.includes(norm(x.name))));
  };

  const parsed = useMemo(() => {
    if (!sheet) return [];
    return sheet.map((r) => {
      const product = String(r[map.product] ?? "").trim();
      const customer = map.customer ? String(r[map.customer] ?? "").trim() : "";
      const month = toMonth(r[map.month]);
      const units = map.units ? num(r[map.units]) : 0;
      const value = map.value ? num(r[map.value]) : 0;
      const p = product ? match(products, product) : undefined;
      const i = customer ? match(institutions, customer) : undefined;
      const problem = !month ? "month not recognised" : !product ? "no product" : (isNaN(units) || isNaN(value)) ? "units / value not a number" : null;
      return { month, product, customer, units: isNaN(units) ? 0 : units, value: isNaN(value) ? 0 : value, product_id: p?.id ?? null, institution_id: i?.id ?? null, problem };
    });
  }, [sheet, map, products, institutions]);
  const good = parsed.filter((r) => !r.problem);

  async function save() {
    setSaving(true);
    setError(null);
    const batch = crypto.randomUUID();
    const payload = good.map((r) => ({
      month: r.month, product_id: r.product_id, product_name: r.product, institution_id: r.institution_id, customer_name: r.customer || null,
      units: r.units, value: r.value, currency: "EGP", source: fileName, batch_id: batch
    }));
    for (let i = 0; i < payload.length; i += 500) {
      const { error: e } = await supabase.from("sales_data").insert(payload.slice(i, i + 500));
      if (e) { setError(e.message); setSaving(false); await supabase.from("sales_data").delete().eq("batch_id", batch); return; }
    }
    setSaving(false);
    onDone();
  }

  async function undo(batch: string) {
    if (!confirm("Remove every row from this import?")) return;
    await supabase.from("sales_data").delete().eq("batch_id", batch);
    setBatches((b) => b.filter((x) => x.batch_id !== batch));
  }

  function template() {
    const ws = XLSX.utils.json_to_sheet([
      { Month: "2026-09", Product: "Cardia 5mg", Customer: "El Ezaby Pharmacy — Nasr City", Units: 120, Value: 10200 },
      { Month: "2026-09", Product: "Glucova 500mg", Customer: "Cleopatra Hospital", Units: 80, Value: 5600 },
    ]);
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Sales");
    XLSX.writeFile(wb, "sales-import-template.xlsx");
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[92vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 p-4 border-b border-slate-200">
          <FileSpreadsheet className="w-5 h-5 text-brand-600" />
          <h2 className="font-semibold text-slate-900 flex-1">Import sales</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-slate-400" /></button>
        </div>
        <div className="p-4 overflow-y-auto flex-1 space-y-4 text-sm">
          {!sheet ? (
            <>
              <p className="text-slate-600">Upload the Excel or CSV file you get from your distributor or pharmacy chains. Any column layout works — you match the columns on the next step, and nothing is saved until you check the preview.</p>
              <div className="flex gap-2 flex-wrap">
                <label className="bg-brand-600 hover:bg-brand-700 text-white rounded-lg px-4 py-2.5 font-medium inline-flex items-center gap-2 cursor-pointer">
                  <Upload className="w-4 h-4" /> Choose file
                  <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => e.target.files?.[0] && readFile(e.target.files[0])} />
                </label>
                <button onClick={template} className="border border-slate-300 rounded-lg px-4 py-2.5 inline-flex items-center gap-2 hover:bg-slate-50"><Download className="w-4 h-4" /> Template</button>
              </div>
              {batches.length > 0 && (
                <div>
                  <div className="font-semibold text-slate-800 mb-1">Recent imports</div>
                  {batches.map((b) => (
                    <div key={b.batch_id} className="flex items-center justify-between border-b border-slate-100 py-1.5">
                      <span>{b.source ?? "Import"} <span className="text-slate-500">· {b.n}{b.n >= 2000 ? "+" : ""} rows</span></span>
                      <button onClick={() => undo(b.batch_id)} className="text-xs text-red-600 inline-flex items-center gap-1 hover:underline"><Trash2 className="w-3.5 h-3.5" /> Undo</button>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <>
              <div className="font-medium text-slate-800">{fileName} — {sheet.length} rows. Match the columns:</div>
              <div className="grid sm:grid-cols-2 md:grid-cols-5 gap-2">
                {FIELDS.map((fd) => (
                  <label key={fd.key} className="text-xs text-slate-600">{fd.label}
                    <select value={map[fd.key]} onChange={(e) => setMap({ ...map, [fd.key]: e.target.value })} className="mt-1 w-full border border-slate-300 rounded px-2 py-1.5 text-sm">
                      <option value="">—</option>
                      {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </label>
                ))}
              </div>
              <div className="flex gap-4 text-xs">
                <span className="inline-flex items-center gap-1 text-cyan-700"><CheckCircle2 className="w-3.5 h-3.5" /> {good.length} ready</span>
                <span className="text-slate-600">{good.filter((r) => r.product_id).length} matched to a product · {good.filter((r) => r.institution_id).length} to a customer</span>
                {parsed.length - good.length > 0 && <span className="inline-flex items-center gap-1 text-amber-700"><AlertTriangle className="w-3.5 h-3.5" /> {parsed.length - good.length} will be skipped</span>}
              </div>
              <div className="border border-slate-200 rounded-lg overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 text-slate-600"><tr><th className="text-left p-2">Month</th><th className="text-left p-2">Product</th><th className="text-left p-2">Customer</th><th className="text-right p-2">Units</th><th className="text-right p-2">Value</th><th className="text-left p-2">Check</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {parsed.slice(0, 12).map((r, i) => (
                      <tr key={i} className={r.problem ? "bg-amber-50" : ""}>
                        <td className="p-2">{r.month ?? "?"}</td>
                        <td className="p-2">{r.product}{r.product && !r.product_id && <span className="text-slate-400"> (new name)</span>}</td>
                        <td className="p-2">{r.customer}{r.customer && !r.institution_id && <span className="text-slate-400"> (not in CRM)</span>}</td>
                        <td className="p-2 text-right">{fmt(r.units)}</td>
                        <td className="p-2 text-right">{fmt(r.value)}</td>
                        <td className="p-2">{r.problem ?? "ok"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {parsed.length > 12 && <p className="text-xs text-slate-500">Showing the first 12 rows.</p>}
            </>
          )}
          {error && <p className="text-red-600">{error}</p>}
        </div>
        {sheet && (
          <div className="p-4 border-t border-slate-200 flex gap-2">
            <button onClick={() => setSheet(null)} className="border border-slate-300 rounded-lg px-4 py-2">Back</button>
            <button onClick={save} disabled={saving || !good.length || !map.month || !map.product}
              className="flex-1 bg-brand-600 hover:bg-brand-700 disabled:bg-brand-300 text-white rounded-lg py-2 font-medium inline-flex items-center justify-center gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} Import {good.length} rows
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
