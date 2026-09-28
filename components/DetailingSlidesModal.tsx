"use client";

// Managers build a product's e-detailing deck: upload slide images (exported
// from PowerPoint as PNG/JPG), order them, title them, and add a talking
// point the rep sees privately while presenting.

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { ArrowDown, ArrowUp, ImagePlus, Loader2, Trash2, X, Presentation } from "lucide-react";

import { tr, trf } from "@/lib/i18n";
interface Slide {
  id: string;
  position: number;
  title: string | null;
  image_url: string;
  key_message: string | null;
}

export default function DetailingSlidesModal({ productId, productName, onClose }: {
  productId: string; productName: string; onClose: () => void;
}) {
  const [slides, setSlides] = useState<Slide[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const { data } = await supabase.from("detailing_slides")
      .select("id, position, title, image_url, key_message").eq("product_id", productId).order("position");
    setSlides((data ?? []) as Slide[]);
    setLoading(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [productId]);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setError(null);
    let pos = slides.reduce((m, s) => Math.max(m, s.position), 0);
    for (const f of Array.from(files)) {
      if (!/^image\/(png|jpe?g|webp)$/.test(f.type)) { setError(trf("{f}: use PNG, JPG or WebP (export the slides from PowerPoint as images).", { f: f.name })); continue; }
      if (f.size > 5 * 1024 * 1024) { setError(trf("{f}: larger than 5 MB.", { f: f.name })); continue; }
      const path = `${productId}/${crypto.randomUUID()}.${f.type.split("/")[1].replace("jpeg", "jpg")}`;
      const up = await supabase.storage.from("detailing").upload(path, f, { contentType: f.type });
      if (up.error) { setError(up.error.message); continue; }
      const url = supabase.storage.from("detailing").getPublicUrl(path).data.publicUrl;
      pos += 1;
      const ins = await supabase.from("detailing_slides").insert({
        product_id: productId, position: pos, title: f.name.replace(/\.[a-z]+$/i, ""), image_url: url
      });
      if (ins.error) setError(ins.error.message);
    }
    setBusy(false);
    load();
  }

  async function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= slides.length) return;
    const a = slides[i], b = slides[j];
    setSlides((s) => { const c = [...s]; c[i] = { ...b, position: a.position }; c[j] = { ...a, position: b.position }; return c; });
    await supabase.from("detailing_slides").update({ position: b.position }).eq("id", a.id);
    await supabase.from("detailing_slides").update({ position: a.position }).eq("id", b.id);
  }

  async function save(s: Slide, patch: Partial<Slide>) {
    setSlides((all) => all.map((x) => (x.id === s.id ? { ...x, ...patch } : x)));
    const { error: e } = await supabase.from("detailing_slides").update(patch).eq("id", s.id);
    if (e) setError(e.message);
  }

  async function remove(s: Slide) {
    if (!confirm(tr("Remove this slide from the deck?"))) return;
    const { error: e } = await supabase.from("detailing_slides").delete().eq("id", s.id);
    if (e) { setError(e.message); return; }
    const marker = "/storage/v1/object/public/detailing/";
    if (s.image_url.includes(marker)) await supabase.storage.from("detailing").remove([s.image_url.split(marker)[1]]);
    load();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 p-4 border-b border-slate-200">
          <Presentation className="w-5 h-5 text-brand-600" />
          <h2 className="font-semibold text-slate-900 flex-1">{tr("Detailing slides —")} {productName}</h2>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-700"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-4 overflow-y-auto flex-1 space-y-3">
          <p className="text-sm text-slate-500">{tr("Export your deck from PowerPoint as images (File → Export → PNG) and upload them here. The talking point is shown only to the rep, never to the doctor.")}</p>
          {loading ? <div className="text-center text-slate-500 py-8">{tr("Loading…")}</div> : slides.length === 0 ? (
            <div className="text-center text-slate-500 py-8 border border-dashed border-slate-300 rounded-lg">{tr("No slides yet.")}</div>
          ) : slides.map((s, i) => (
            <div key={s.id} className="flex gap-3 border border-slate-200 rounded-lg p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={s.image_url} alt="" className="w-40 h-24 object-cover rounded border border-slate-200 bg-slate-50 shrink-0" />
              <div className="flex-1 min-w-0 space-y-1.5">
                <input defaultValue={s.title ?? ""} onBlur={(e) => e.target.value !== (s.title ?? "") && save(s, { title: e.target.value })}
                  placeholder={tr("Slide title")} className="w-full text-sm font-medium border border-slate-200 rounded px-2 py-1" />
                <textarea defaultValue={s.key_message ?? ""} onBlur={(e) => e.target.value !== (s.key_message ?? "") && save(s, { key_message: e.target.value || null })}
                  placeholder={tr("Talking point for the rep (optional)")} rows={2} className="w-full text-xs border border-slate-200 rounded px-2 py-1" />
              </div>
              <div className="flex flex-col gap-1">
                <button onClick={() => move(i, -1)} disabled={i === 0} className="p-1 rounded hover:bg-slate-100 disabled:opacity-30" aria-label={tr("Move up")}><ArrowUp className="w-4 h-4" /></button>
                <button onClick={() => move(i, 1)} disabled={i === slides.length - 1} className="p-1 rounded hover:bg-slate-100 disabled:opacity-30" aria-label={tr("Move down")}><ArrowDown className="w-4 h-4" /></button>
                <button onClick={() => remove(s)} className="p-1 rounded text-slate-400 hover:text-red-600 hover:bg-red-50" aria-label={tr("Remove")}><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
          ))}
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        <div className="p-4 border-t border-slate-200">
          <label className={`w-full inline-flex items-center justify-center gap-2 rounded-lg py-2.5 font-medium cursor-pointer ${busy ? "bg-brand-300 text-white" : "bg-brand-600 hover:bg-brand-700 text-white"}`}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4" />}
            {busy ? tr("Uploading…") : tr("Upload slide images")}
            <input type="file" accept="image/png,image/jpeg,image/webp" multiple className="hidden" disabled={busy} onChange={(e) => { upload(e.target.files); e.target.value = ""; }} />
          </label>
        </div>
      </div>
    </div>
  );
}
