"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { offlineRpc, offlineUpload } from "@/lib/offlineQueue";
import {
  ArrowLeft,
  Package,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Pen,
  Plus,
  Minus
} from "lucide-react";
import SignaturePad, { type SignaturePadHandle } from "@/components/SignaturePad";

import { tr } from "@/lib/i18n";
interface InventoryRow {
  id: string;
  product_id: string;
  batch_number: string;
  expiry_date: string;
  quantity: number;
  products: {
    name: string;
    brand_name: string | null;
    pack_size: string | null;
    therapy_area: string | null;
  } | null;
}

interface VisitInfo {
  id: string;
  status: string;
  hcps: { full_name: string; phone: string | null } | null;
  institutions: { name: string } | null;
}

type Step = "pick-batch" | "pick-quantity" | "sign" | "submitting" | "done";

export default function GiveSamplePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const sigRef = useRef<SignaturePadHandle | null>(null);

  const [visit, setVisit] = useState<VisitInfo | null>(null);
  const [inventory, setInventory] = useState<InventoryRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [step, setStep] = useState<Step>("pick-batch");
  const [selectedBatch, setSelectedBatch] = useState<InventoryRow | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [queuedOffline, setQueuedOffline] = useState(false);

  useEffect(() => {
    if (!params.id) return;
    (async () => {
      setLoading(true);
      // getSession reads the phone's copy of the login, so this works offline
      const { data: sess } = await supabase.auth.getSession();
      const u = { user: sess.session?.user ?? null };

      const [visitRes, invRes] = await Promise.all([
        supabase
          .from("visits")
          .select("id, status, hcps(full_name, phone), institutions(name)")
          .eq("id", params.id)
          .single(),
        supabase
          .from("samples_inventory")
          .select(
            `id, product_id, batch_number, expiry_date, quantity,
             products(name, brand_name, pack_size, therapy_area)`
          )
          .eq("rep_id", u.user?.id ?? "")
          .gt("quantity", 0)
          .order("expiry_date", { ascending: true })
      ]);

      setVisit((visitRes.data ?? null) as unknown as VisitInfo | null);
      setInventory((invRes.data ?? []) as unknown as InventoryRow[]);
      setLoading(false);
    })();
  }, [params.id]);

  async function handleSubmit() {
    if (!selectedBatch || !visit) return;
    setError(null);
    setStep("submitting");

    try {
      const label = `Sample — ${selectedBatch.products?.name ?? "product"} ×${quantity} to ${visit.hcps?.full_name ?? "HCP"}`;
      // 1. Upload signature if present (kept on the phone when offline; its
      //    address is known in advance, so the hand-over can refer to it)
      let signature_url: string | null = null;
      const dataUrl = sigRef.current?.toDataURL();
      if (dataUrl) {
        const blob = await (await fetch(dataUrl)).blob();
        const filename = `sig-${visit.id}-${Date.now()}.png`;
        const { data: sess } = await supabase.auth.getSession();
        const path = `${sess.session?.user?.id ?? "anon"}/${filename}`;
        const up = await offlineUpload("signatures", path, blob, "image/png", `${label} — signature`);
        if (up.ok || up.queued) {
          signature_url = supabase.storage.from("signatures").getPublicUrl(path).data.publicUrl;
        } else {
          console.warn("Signature upload failed:", up.error);
        }
      }

      // 2. Call the atomic RPC
      const sent = await offlineRpc("give_sample_to_hcp", {
        _visit_id: visit.id,
        _product_id: selectedBatch.product_id,
        _batch_number: selectedBatch.batch_number,
        _quantity: quantity,
        _signature_url: signature_url
      }, label, true);

      if (sent.error) throw new Error(sent.error);
      if (sent.queued) {
        // Stock is checked again when it syncs; a refusal shows in the sync banner.
        setQueuedOffline(true);
        setStep("done");
        setTimeout(() => router.push(`/dashboard/visits/${visit.id}`), 3000);
        return;
      }
      const data = sent.data;

      type RpcResult = {
        success: boolean;
        error?: string;
        available?: number;
        remaining_stock?: number;
      };
      const result = data as RpcResult;
      if (!result.success) {
        throw new Error(
          result.error === "insufficient_stock"
            ? `Only ${result.available} units left in stock.`
            : result.error ?? "Sample handover failed"
        );
      }

      setStep("done");
      // Auto-redirect back to visit after 2s
      setTimeout(() => router.push(`/dashboard/visits/${visit.id}`), 2000);
    } catch (err) {
      const m = err instanceof Error ? err.message : "Unknown error";
      setError(m);
      setStep("sign");
    }
  }

  // ---------- Render -------------------------------------------------

  if (loading) {
    return (
      <div className="max-w-md mx-auto p-12 text-center text-slate-500">
        <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
        {tr("Loading…")}
      </div>
    );
  }

  if (!visit) {
    return (
      <div className="max-w-md mx-auto p-12 text-center">
        <p className="text-slate-700">{tr("Visit not found.")}</p>
        <Link href="/dashboard/visits" className="text-brand-700 underline text-sm">
          {tr("Back to visits")}
        </Link>
      </div>
    );
  }

  if (visit.status !== "in_progress" && visit.status !== "completed") {
    return (
      <div className="max-w-md mx-auto p-6">
        <Link
          href={`/dashboard/visits/${visit.id}`}
          className="inline-flex items-center gap-1 text-sm text-slate-500 mb-3"
        >
          <ArrowLeft className="w-4 h-4 rtl:-scale-x-100" /> {tr("Back")}
        </Link>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-900">
          {tr("You can only distribute samples during an active or completed visit.")}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto pb-24 md:pb-0">
      <Link
        href={`/dashboard/visits/${visit.id}`}
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-3"
      >
        <ArrowLeft className="w-4 h-4 rtl:-scale-x-100" /> {tr("Back to visit")}
      </Link>

      {/* Header */}
      <div className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 rounded-xl p-4 mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-white shadow-sm">
            <Package className="w-6 h-6 text-amber-700" />
          </div>
          <div>
            <h1 className="font-bold text-slate-900">{tr("Give Sample")}</h1>
            <p className="text-xs text-slate-600">
              {visit.hcps?.full_name ?? "—"} · {visit.institutions?.name ?? "—"}
            </p>
          </div>
        </div>
      </div>

      {/* Progress dots */}
      <div className="flex items-center justify-center gap-2 mb-4">
        {(["pick-batch", "pick-quantity", "sign", "done"] as Step[]).map((s, i) => {
          const stepIdx = ["pick-batch", "pick-quantity", "sign", "done"].indexOf(step);
          return (
            <div
              key={s}
              className={`h-1.5 rounded-full transition-all ${
                i < stepIdx
                  ? "w-6 bg-emerald-500"
                  : i === stepIdx
                  ? "w-10 bg-brand-600"
                  : "w-6 bg-slate-200"
              }`}
            />
          );
        })}
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* STEP: pick-batch */}
      {step === "pick-batch" && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-3 border-b border-slate-100 text-sm font-semibold text-slate-700">
            {tr("Pick a product batch")}
          </div>
          {inventory.length === 0 ? (
            <div className="p-8 text-center">
              <div className="text-5xl mb-2">📦</div>
              <p className="text-slate-700 font-medium">{tr("No samples in stock")}</p>
              <p className="text-xs text-slate-500 mt-1">
                {tr("Request restock from your warehouse via the Samples page.")}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 max-h-[60vh] overflow-y-auto">
              {inventory.map((row) => {
                const days = Math.floor(
                  (new Date(row.expiry_date).getTime() - Date.now()) / 86400_000
                );
                const expCls =
                  days < 30
                    ? "text-red-700 font-semibold"
                    : days < 60
                    ? "text-amber-700"
                    : "text-slate-500";
                return (
                  <button
                    key={row.id}
                    onClick={() => {
                      setSelectedBatch(row);
                      setQuantity(1);
                      setStep("pick-quantity");
                    }}
                    className="w-full p-3 text-start hover:bg-slate-50 transition flex items-center gap-3"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-slate-900">
                        {row.products?.brand_name ?? row.products?.name}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-2 flex-wrap">
                        <span>{row.products?.pack_size}</span>
                        <span>·</span>
                        <span className="font-mono">{row.batch_number}</span>
                        <span>·</span>
                        <span className={expCls}>
                          {tr("exp")} {row.expiry_date} ({days}d)
                        </span>
                      </div>
                    </div>
                    <div className="text-end shrink-0">
                      <div className="text-lg font-bold text-emerald-700">
                        {row.quantity}
                      </div>
                      <div className="text-[10px] text-slate-500">{tr("in stock")}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* STEP: pick-quantity */}
      {step === "pick-quantity" && selectedBatch && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
            <div className="text-xs text-slate-500 mb-1">{tr("Selected")}</div>
            <div className="font-semibold text-slate-900">
              {selectedBatch.products?.brand_name ?? selectedBatch.products?.name}
            </div>
            <div className="text-xs text-slate-500 mt-0.5">
              {tr("Batch")} {selectedBatch.batch_number} · {selectedBatch.quantity} {tr("in stock")}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
            <div className="text-center text-sm text-slate-700 mb-3">{tr("How many units?")}</div>
            <div className="flex items-center justify-center gap-4">
              <button
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                disabled={quantity <= 1}
                className="w-12 h-12 rounded-full bg-slate-100 hover:bg-slate-200 disabled:opacity-40 inline-flex items-center justify-center"
              >
                <Minus className="w-5 h-5" />
              </button>
              <input
                type="number"
                min={1}
                max={selectedBatch.quantity}
                value={quantity}
                onChange={(e) => {
                  const n = parseInt(e.target.value);
                  if (!isNaN(n) && n >= 1 && n <= selectedBatch.quantity) {
                    setQuantity(n);
                  }
                }}
                className="text-4xl font-bold text-center w-24 border-b-2 border-slate-200 focus:border-brand-500 outline-none"
              />
              <button
                onClick={() =>
                  setQuantity((q) => Math.min(selectedBatch.quantity, q + 1))
                }
                disabled={quantity >= selectedBatch.quantity}
                className="w-12 h-12 rounded-full bg-slate-100 hover:bg-slate-200 disabled:opacity-40 inline-flex items-center justify-center"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>
            <div className="flex justify-center gap-2 mt-4">
              {[1, 5, 10, 20].filter((v) => v <= selectedBatch.quantity).map((v) => (
                <button
                  key={v}
                  onClick={() => setQuantity(v)}
                  className={`text-xs px-3 py-1 rounded-full transition ${
                    quantity === v
                      ? "bg-brand-600 text-white"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-500 text-center mt-4">
              {tr("Stock after:")} {selectedBatch.quantity - quantity} {tr("unit")}
              {selectedBatch.quantity - quantity === 1 ? "" : "s"}
            </p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => {
                setSelectedBatch(null);
                setStep("pick-batch");
              }}
              className="px-4 py-3 rounded-lg border border-slate-300 text-slate-700 font-medium hover:bg-slate-50"
            >
              {tr("Back")}
            </button>
            <button
              onClick={() => setStep("sign")}
              className="flex-1 bg-brand-600 hover:bg-brand-700 text-white font-medium py-3 rounded-lg inline-flex items-center justify-center gap-2"
            >
              <Pen className="w-4 h-4" /> {tr("Get HCP signature")}
            </button>
          </div>
        </div>
      )}

      {/* STEP: sign */}
      {step === "sign" && selectedBatch && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
            <div className="text-xs text-slate-500 mb-1">{tr("Handing over")}</div>
            <div className="font-semibold text-slate-900">
              {quantity} × {selectedBatch.products?.brand_name ?? selectedBatch.products?.name}
            </div>
            <div className="text-xs text-slate-500 mt-0.5">
              {tr("to")} {visit.hcps?.full_name ?? "—"}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
            <div className="text-sm font-medium text-slate-700 mb-2">
              {tr("Doctor's signature")}
            </div>
            <SignaturePad ref={sigRef} height={200} />
            <p className="text-xs text-slate-500 mt-2">
              {tr("Hand the device to the doctor and have them sign with finger or stylus.")}
            </p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setStep("pick-quantity")}
              className="px-4 py-3 rounded-lg border border-slate-300 text-slate-700 font-medium hover:bg-slate-50"
            >
              {tr("Back")}
            </button>
            <button
              onClick={handleSubmit}
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-lg inline-flex items-center justify-center gap-2"
            >
              <CheckCircle2 className="w-5 h-5" /> {tr("Confirm handover")}
            </button>
          </div>
          <p className="text-[11px] text-slate-400 text-center">
            {tr("Signature is optional but recommended for audit compliance.")}
          </p>
        </div>
      )}

      {/* STEP: submitting */}
      {step === "submitting" && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12 text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-brand-600 mb-3" />
          <p className="font-medium text-slate-700">{tr("Recording handover…")}</p>
          <p className="text-xs text-slate-500 mt-1">
            {tr("Decrementing inventory, logging audit trail.")}
          </p>
        </div>
      )}

      {/* STEP: done */}
      {step === "done" && selectedBatch && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-12 text-center">
          <div className="text-6xl mb-2">✅</div>
          <h2 className="font-bold text-emerald-900">{tr("Sample handed over")}</h2>
          <p className="text-sm text-emerald-700 mt-1">
            {quantity} × {selectedBatch.products?.brand_name} {tr("given to")}{" "}
            {visit.hcps?.full_name}
          </p>
          <p className="text-xs text-slate-500 mt-3">
            {queuedOffline
              ? tr("You're offline — saved on this phone with the signature. Stock is updated when it syncs. Returning to visit…")
              : tr("Inventory updated. Returning to visit…")}
          </p>
        </div>
      )}
    </div>
  );
}
