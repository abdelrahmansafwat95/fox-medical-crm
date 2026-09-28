"use client";

// Tells the rep when they are offline, what is waiting on the phone to sync,
// and what the server refused when it did sync — nothing disappears silently.

import { useCallback, useEffect, useState } from "react";
import { CloudOff, RefreshCw, AlertTriangle, CheckCircle2, X } from "lucide-react";
import { clearFailed, failedItems, flushQueue, queuedLabels, type FailedItem } from "@/lib/offlineQueue";

import { tr, locale } from "@/lib/i18n";
export default function OfflineStatus() {
  const [offline, setOffline] = useState(false);
  const [waiting, setWaiting] = useState<string[]>([]);
  const [failed, setFailed] = useState<FailedItem[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [justSynced, setJustSynced] = useState(0);
  const [open, setOpen] = useState(false);

  const refresh = useCallback(async () => {
    setOffline(typeof navigator !== "undefined" && !navigator.onLine);
    setWaiting(await queuedLabels().catch(() => []));
    setFailed(await failedItems().catch(() => []));
  }, []);

  const sync = useCallback(async () => {
    setSyncing(true);
    const r = await flushQueue().catch(() => ({ flushed: 0, failed: 0 }));
    setSyncing(false);
    if (r.flushed) { setJustSynced(r.flushed); setTimeout(() => setJustSynced(0), 4000); }
    refresh();
  }, [refresh]);

  useEffect(() => {
    refresh();
    const on = () => { refresh(); sync(); };
    window.addEventListener("online", on);
    window.addEventListener("offline", refresh);
    window.addEventListener("foxmed:queue", refresh);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", refresh);
      window.removeEventListener("foxmed:queue", refresh);
    };
  }, [refresh, sync]);

  if (!offline && waiting.length === 0 && failed.length === 0 && !justSynced) return null;

  return (
    <div className="mb-4 space-y-2">
      {(offline || waiting.length > 0) && (
        <div className={`rounded-xl border px-4 py-3 text-sm ${offline ? "bg-amber-50 border-amber-200 text-amber-900 dark:bg-amber-950/40 dark:border-amber-800 dark:text-amber-200" : "bg-sky-50 border-sky-200 text-sky-900 dark:bg-sky-950/40 dark:border-sky-800 dark:text-sky-200"}`}>
          <div className="flex items-center gap-3 flex-wrap">
            <CloudOff className="w-4 h-4 shrink-0" />
            <span className="flex-1">
              {offline ? tr("You're offline. Keep working — everything you save stays on this phone and syncs when the signal is back.") : tr("Back online.")}
              {waiting.length > 0 && (
                <button onClick={() => setOpen((o) => !o)} className="ms-1 font-semibold underline underline-offset-2">
                  {waiting.length} {waiting.length === 1 ? "item" : "items"} {tr("waiting to sync")}
                </button>
              )}
            </span>
            {!offline && waiting.length > 0 && (
              <button onClick={sync} disabled={syncing} className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 text-white px-3 py-1.5 text-xs font-semibold disabled:opacity-60">
                <RefreshCw className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`} /> {tr("Sync now")}
              </button>
            )}
          </div>
          {open && waiting.length > 0 && (
            <ul className="mt-2 ms-7 list-disc text-xs opacity-80">{waiting.map((w, i) => <li key={i}>{w}</li>)}</ul>
          )}
        </div>
      )}
      {justSynced > 0 && (
        <div className="rounded-xl border border-cyan-200 bg-cyan-50 text-cyan-900 dark:bg-cyan-950/40 dark:border-cyan-800 dark:text-cyan-200 px-4 py-2.5 text-sm flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" /> {tr("Synced")} {justSynced} {tr("saved")} {justSynced === 1 ? "item" : "items"}.
        </div>
      )}
      {failed.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 text-red-900 dark:bg-red-950/40 dark:border-red-800 dark:text-red-200 px-4 py-3 text-sm">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="font-semibold">{failed.length === 1 ? tr("1 saved item could not be synced") : `${failed.length} saved items could not be synced`} {tr("— please enter again or ask your manager:")}</p>
              <ul className="mt-1 list-disc ms-4 text-xs">
                {failed.map((f) => (
                  <li key={f.id}>{tr(f.label)} ({new Date(f.created_at).toLocaleString(locale())}): {humanError(f.error)}</li>
                ))}
              </ul>
            </div>
            <button onClick={() => clearFailed()} aria-label={tr("Dismiss")} className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/40"><X className="w-4 h-4" /></button>
          </div>
        </div>
      )}
    </div>
  );
}

function humanError(e: string) {
  if (/insufficient_stock/.test(e)) return "not enough sample stock by the time it synced";
  if (/duplicate|already exists/i.test(e)) return "it was already saved";
  if (/row-level security|permission/i.test(e)) return "not allowed for your account";
  return e.length > 120 ? e.slice(0, 120) + "…" : e;
}
